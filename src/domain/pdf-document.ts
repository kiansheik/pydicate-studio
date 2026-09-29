import { getDocument, PDFDataRangeTransport, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import { pdfSupportOptions } from './pdf-assets';

const DATABASE = 'pydicate-studio-pdf-cache-v1';
const MAX_BYTES = 256 * 1024 * 1024;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const CHUNK_SIZE = 64 * 1024;
interface CachedDocument {
  key: string;
  expires: number;
  lastUsed: number;
  bytes: number;
}
interface CachedChunk {
  key: string;
  documentKey: string;
  data: ArrayBuffer;
  digest: string;
}
let database: Promise<IDBDatabase | null> | undefined;
let cacheDisabled = false;

async function cacheAttempt<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  if (cacheDisabled) return fallback;
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          cacheDisabled = true;
          resolve(fallback);
        }, 3000);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer!);
  }
}

function openCache(): Promise<IDBDatabase | null> {
  database ??= new Promise((resolve) => {
    let finished = false;
    const finish = (value: IDBDatabase | null) => {
      if (finished) {
        value?.close();
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 2000);
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('documents', { keyPath: 'key' });
        request.result
          .createObjectStore('chunks', { keyPath: 'key' })
          .createIndex('documentKey', 'documentKey');
      };
      request.onerror = () => finish(null);
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        finish(request.result);
      };
    } catch {
      finish(null);
    }
  });
  return database;
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}
async function digest(data: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
function removeDocument(transaction: IDBTransaction, key: string): Promise<void> {
  transaction.objectStore('documents').delete(key);
  return new Promise((resolve, reject) => {
    const cursor = transaction
      .objectStore('chunks')
      .index('documentKey')
      .openKeyCursor(IDBKeyRange.only(key));
    cursor.onerror = () => reject(cursor.error);
    cursor.onsuccess = () => {
      if (!cursor.result) {
        resolve();
        return;
      }
      transaction.objectStore('chunks').delete(cursor.result.primaryKey);
      cursor.result.continue();
    };
  });
}

async function cachedChunk(
  documentKey: string,
  begin: number,
  length: number,
): Promise<Uint8Array | null> {
  try {
    const db = await openCache();
    if (!db) return null;
    const transaction = db.transaction(['documents', 'chunks'], 'readwrite'),
      done = completed(transaction);
    // Handle transaction errors immediately, including when a request rejects first.
    void done.catch(() => {});
    const document = await result<CachedDocument | undefined>(
      transaction.objectStore('documents').get(documentKey),
    );
    let chunk: CachedChunk | undefined;
    if (document && document.expires > Date.now()) {
      chunk = await result(
        transaction.objectStore('chunks').get(JSON.stringify([documentKey, begin])),
      );
      document.lastUsed = Date.now();
      transaction.objectStore('documents').put(document);
    } else if (document) await removeDocument(transaction, documentKey);
    await done;
    if (
      chunk?.data instanceof ArrayBuffer &&
      chunk.data.byteLength === length &&
      (await digest(chunk.data)) === chunk.digest
    )
      return new Uint8Array(chunk.data);
  } catch {
    /* Private mode, corruption and storage failure fall back to network. */
  }
  return null;
}
async function storeChunk(documentKey: string, begin: number, bytes: Uint8Array) {
  try {
    const db = await openCache();
    if (!db) return;
    // Own the bytes before PDF.js transfers its copy to the worker.
    const data = new Uint8Array(bytes).buffer,
      checksum = await digest(data),
      now = Date.now();
    const transaction = db.transaction(['documents', 'chunks'], 'readwrite'),
      done = completed(transaction);
    void done.catch(() => {});
    const documents = await result<CachedDocument[]>(transaction.objectStore('documents').getAll());
    const retained = documents.filter((document) => document.expires > now);
    for (const document of documents)
      if (document.expires <= now) await removeDocument(transaction, document.key);
    let document = retained.find((item) => item.key === documentKey);
    if (!document) {
      document = { key: documentKey, expires: now + WEEK, lastUsed: now, bytes: 0 };
      retained.push(document);
    }
    const key = JSON.stringify([documentKey, begin]);
    const previous: CachedChunk | undefined = await result(
      transaction.objectStore('chunks').get(key),
    );
    const added = data.byteLength - (previous?.data.byteLength || 0);
    let total = retained.reduce((sum, item) => sum + item.bytes, 0) + added;
    for (const old of retained
      .filter((item) => item.key !== documentKey)
      .sort((a, b) => a.lastUsed - b.lastUsed)) {
      if (total <= MAX_BYTES) break;
      await removeDocument(transaction, old.key);
      total -= old.bytes;
    }
    if (total <= MAX_BYTES) {
      document.bytes += added;
      document.lastUsed = now;
      transaction.objectStore('documents').put(document);
      transaction
        .objectStore('chunks')
        .put({ key, documentKey, data, digest: checksum } satisfies CachedChunk);
    }
    await done;
  } catch {
    /* A cache/quota failure must never prevent reading the source. */
  }
}

export interface CachedPdfOptions {
  url: string;
  cacheScope: string;
  projectId: string;
  sourceId: string;
  assetId: string;
  length: number;
  onError?: (error: Error) => void;
}
export type PdfLoadingTask = Pick<PDFDocumentLoadingTask, 'promise' | 'destroy' | 'onProgress'>;

/** The caller first authenticates and reads current source evidence. Cached
 * original byte ranges are private to that account, project, source and SHA. */
export function createCachedPdfTask(options: CachedPdfOptions): PdfLoadingTask {
  const { length, assetId } = options;
  if (
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length > 100 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(assetId)
  )
    throw new Error('Identidade ou tamanho do PDF inválido.');
  const documentKey = JSON.stringify([
    options.cacheScope,
    options.projectId,
    options.sourceId,
    assetId,
    length,
  ]);
  const controller = new AbortController(),
    inflight = new Map<number, Promise<Uint8Array>>(),
    received = new Set<number>();
  let stopped = false,
    loaded = 0,
    rejectFailure: (reason: Error) => void;
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  // A range can fail after task.promise resolves, while rendering a later page.
  void failure.catch(() => {});
  let task: PDFDocumentLoadingTask;
  const stop = () => {
    stopped = true;
    controller.abort();
    inflight.clear();
  };
  async function chunk(begin: number): Promise<Uint8Array> {
    let pending = inflight.get(begin);
    if (!pending) {
      pending = (async () => {
        const end = Math.min(begin + CHUNK_SIZE, length),
          size = end - begin;
        let bytes = options.cacheScope
          ? await cacheAttempt(() => cachedChunk(documentKey, begin, size), null)
          : null;
        if (stopped) throw new DOMException('PDF cancelado.', 'AbortError');
        if (!bytes) {
          const response = await fetch(options.url, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Range: `bytes=${begin}-${end - 1}`, 'If-Range': `"sha256-${assetId}"` },
            signal: controller.signal,
          });
          if (
            response.status !== 206 ||
            response.headers.get('content-range') !== `bytes ${begin}-${end - 1}/${length}` ||
            response.headers.get('etag') !== `"sha256-${assetId}"` ||
            response.headers.get('content-length') !== String(size)
          ) {
            void response.body?.cancel();
            throw new Error(
              response.status === 401
                ? 'Sessão expirada. Entre novamente.'
                : 'O servidor não confirmou os bytes deste PDF. Atualize a fonte e tente novamente.',
            );
          }
          bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength !== size)
            throw new Error('A transferência do PDF ficou incompleta.');
          if (options.cacheScope)
            await cacheAttempt(() => storeChunk(documentKey, begin, bytes!), undefined);
        }
        if (!received.has(begin)) {
          received.add(begin);
          loaded += size;
          transport.onDataProgress(loaded, length);
        }
        return bytes;
      })().finally(() => inflight.delete(begin));
      inflight.set(begin, pending);
    }
    return pending;
  }
  class CachedTransport extends PDFDataRangeTransport {
    requestDataRange(begin: number, end: number) {
      void (async () => {
        end = Math.min(end, length);
        if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || begin >= end)
          throw new Error('Intervalo de bytes do PDF inválido.');
        const bytes = new Uint8Array(end - begin);
        for (
          let offset = Math.floor(begin / CHUNK_SIZE) * CHUNK_SIZE;
          offset < end;
          offset += CHUNK_SIZE
        ) {
          const part = await chunk(offset),
            from = Math.max(begin, offset),
            to = Math.min(end, offset + part.byteLength);
          bytes.set(part.subarray(from - offset, to - offset), from - begin);
        }
        if (!stopped) this.onDataRange(begin, bytes);
      })().catch((reason: unknown) => {
        if (stopped) return;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        stop();
        rejectFailure(error);
        options.onError?.(error);
        void task.destroy().catch(() => {});
      });
    }
    abort() {
      stop();
    }
  }
  const transport = new CachedTransport(length, null, true);
  task = getDocument({
    ...pdfSupportOptions(),
    range: transport,
    rangeChunkSize: CHUNK_SIZE,
    disableStream: true,
    disableAutoFetch: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  return {
    promise: Promise.race([task.promise, failure]),
    get onProgress() {
      return task.onProgress;
    },
    set onProgress(callback) {
      task.onProgress = callback;
    },
    destroy: () => {
      stop();
      return task.destroy();
    },
  };
}

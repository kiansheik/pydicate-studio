import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { makePdfFixture } = require('../runtime/tests/pdf-fixture.cjs') as {
  makePdfFixture: (options: { paddingBytes: number }) => Buffer;
};
const bytes = makePdfFixture({ paddingBytes: 2 * 1024 * 1024 });
const options = {
  url: '/cached-fixture.pdf',
  cacheScope: 'author:one',
  projectId: 'project:cache',
  sourceId: 'witness',
  assetId: createHash('sha256').update(bytes).digest('hex'),
  length: bytes.length,
};
const DB = 'pydicate-studio-pdf-cache-v1';

async function fixture(page: Page, valid = true) {
  const ranges: string[] = [];
  await page.route('**/cached-fixture.pdf', async (route) => {
    const range = route.request().headers().range;
    ranges.push(range);
    const match = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!match) throw new Error('A cache transport must never request the whole PDF.');
    const start = Number(match[1]),
      end = Number(match[2]),
      body = bytes.subarray(start, end + 1);
    await route.fulfill({
      status: 206,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(body.length),
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        ETag: `"sha256-${valid ? options.assetId : 'f'.repeat(64)}"`,
      },
      body,
    });
  });
  await page.goto('/tests/pdf-cache-harness.html');
  await page.waitForFunction(() => !!window.pdfCacheTest);
  return ranges;
}
async function load(page: Page, overrides = {}) {
  return page.evaluate((value) => window.pdfCacheTest(value), { ...options, ...overrides });
}
async function reload(page: Page) {
  await page.reload();
  await page.waitForFunction(() => !!window.pdfCacheTest);
}

test('original PDF chunks persist across reload, stay scoped to the account and expire after a week', async ({
  page,
}) => {
  const ranges = await fixture(page),
    first = await load(page);
  expect(ranges.length).toBeGreaterThan(0);
  expect(new Set(ranges).size).toBe(ranges.length);
  expect(ranges.length * 65536).toBeLessThan(bytes.length / 2);
  const count = ranges.length;
  await reload(page);
  await page.evaluate(() => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    Date.now = () => tomorrow;
  });
  expect(await load(page)).toBe(first);
  expect(ranges).toHaveLength(count);
  expect(await load(page, { cacheScope: 'author:two' })).toBe(first);
  expect(ranges.length).toBeGreaterThan(count);
  await page.evaluate(
    (dbName) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('documents', 'readwrite'),
            store = tx.objectStore('documents'),
            all = store.getAll();
          all.onsuccess = () => {
            for (const document of all.result) {
              document.expires = 0;
              store.put(document);
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    DB,
  );
  const beforeExpired = ranges.length;
  await reload(page);
  expect(await load(page)).toBe(first);
  expect(ranges.length).toBeGreaterThan(beforeExpired);
});

test('unavailable local storage falls back to exact range requests', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'indexedDB', {
      get: () => {
        throw new Error('Storage unavailable');
      },
    }),
  );
  const ranges = await fixture(page),
    pixels = await load(page),
    before = ranges.length;
  expect(pixels).toMatch(/^data:image\/png/);
  await reload(page);
  expect(await load(page)).toBe(pixels);
  expect(ranges.length).toBeGreaterThan(before);
});

test('mismatched server PDF identity fails explicitly without poisoning the cache', async ({
  page,
}) => {
  await fixture(page, false);
  const error = await page.evaluate(
    (value) =>
      window.pdfCacheTest(value).then(
        () => '',
        (error) => String(error),
      ),
    options,
  );
  expect(error).toContain('O servidor não confirmou os bytes deste PDF');
});

test('a damaged cached chunk is fetched again before rendering', async ({ page }) => {
  const ranges = await fixture(page),
    pixels = await load(page),
    before = ranges.length;
  await page.evaluate(
    (dbName) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('chunks', 'readwrite'),
            store = tx.objectStore('chunks'),
            all = store.getAll();
          all.onsuccess = () => {
            const chunk = all.result[0];
            new Uint8Array(chunk.data)[0] ^= 1;
            store.put(chunk);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    DB,
  );
  await reload(page);
  expect(await load(page)).toBe(pixels);
  expect(ranges).toHaveLength(before + 1);
});

test('cache evicts least recently used PDFs before exceeding its storage bound', async ({
  page,
}) => {
  await fixture(page);
  await load(page);
  await page.evaluate(
    (dbName) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('documents', 'readwrite');
          tx.objectStore('documents').put({
            key: 'old-unused-document',
            expires: Date.now() + 60000,
            lastUsed: 0,
            bytes: 256 * 1024 * 1024,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    DB,
  );
  await load(page, { cacheScope: 'author:two' });
  const documents = await page.evaluate(
    (dbName) =>
      new Promise<Array<{ key: string; bytes: number }>>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result,
            all = db.transaction('documents').objectStore('documents').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => reject(all.error);
        };
        request.onerror = () => reject(request.error);
      }),
    DB,
  );
  expect(documents.some((document) => document.key === 'old-unused-document')).toBe(false);
  expect(documents.reduce((sum, document) => sum + document.bytes, 0)).toBeLessThanOrEqual(
    256 * 1024 * 1024,
  );
});

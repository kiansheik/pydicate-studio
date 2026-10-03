'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { id } = require('./validation.cjs');
const MAX_BYTES = 64 * 1024 * 1024;
const statuses = new Set([
  'queued',
  'running',
  'cancelling',
  'needs-input',
  'ready-for-review',
  'blocked',
  'failed',
  'cancelled',
]);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const blank = (projectId) => ({
  version: 1,
  projectId,
  revision: 0,
  jobs: {},
  conversations: {},
  candidates: {},
  candidateRevisions: {},
  operations: {},
  decisions: [],
});
function validate(value, projectId, inputValidated = () => {}, trustedInput = () => null) {
  if (
    !value ||
    value.version !== 1 ||
    value.projectId !== projectId ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw new Error('Registro de análise inválido.');
  for (const key of ['jobs', 'conversations', 'candidates', 'candidateRevisions', 'operations']) {
    if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))
      throw new Error('Coleção de análise inválida: ' + key);
  }
  if (!Array.isArray(value.decisions)) throw new Error('Decisões de análise inválidas.');
  for (const [key, job] of Object.entries(value.jobs)) {
    id(key, 'análise');
    const trusted = trustedInput(job),
      input = trusted || job.input;
    if (
      job.id !== key ||
      job.projectId !== projectId ||
      !statuses.has(job.status) ||
      !input ||
      input.projectId !== projectId ||
      input.passageId !== job.passageId ||
      !Array.isArray(job.attempts) ||
      !Array.isArray(job.candidateIds) ||
      !Array.isArray(job.questions)
    )
      throw new Error('Análise persistida inválida.');
    if (!trusted) {
      const { digest: savedDigest, ...packet } = input;
      if (savedDigest !== digest(packet))
        throw new Error('O pacote de entrada da análise foi alterado.');
    }
    inputValidated(job, input);
  }
  for (const [key, candidate] of Object.entries(value.candidates)) {
    if (
      candidate.id !== key ||
      candidate.projectId !== projectId ||
      !value.jobs[candidate.jobId] ||
      typeof candidate.raw !== 'string' ||
      candidate.raw.length > 100000 ||
      !['scratch', 'proposed'].includes(candidate.status) ||
      !candidate.revisionId ||
      !Array.isArray(candidate.evidence) ||
      !Array.isArray(candidate.uncertainties) ||
      !Array.isArray(candidate.failures)
    )
      throw new Error('Proposta persistida inválida.');
  }
  for (const conversation of Object.values(value.conversations)) {
    if (
      conversation.projectId !== projectId ||
      !Number.isSafeInteger(conversation.revision) ||
      !Array.isArray(conversation.turns) ||
      typeof conversation.composer !== 'string'
    )
      throw new Error('Conversa persistida inválida.');
  }
  return value;
}
/** The server owner is the sole writer; external clients only call its commands. */
class AnalysisStore {
  constructor(directory, { maxBytes = MAX_BYTES, maxPayloadCacheBytes = MAX_BYTES } = {}) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.writes = new Map();
    this.payloadSlots = new WeakMap();
    this.payloadTexts = new Map();
    this.payloadReads = new Map();
    this.payloadCacheBytes = 0;
    this.maxPayloadCacheBytes = maxPayloadCacheBytes;
  }
  filename(projectId) {
    id(projectId, 'projeto');
    return path.join(this.directory, digest(projectId) + '.json');
  }
  async load(projectId) {
    const filename = this.filename(projectId);
    try {
      const stat = await fs.stat(filename);
      if (stat.size > this.maxBytes)
        throw new Error('Arquivo excede 64 MiB. Exporte/arquive análises antes de continuar.');
      const record = JSON.parse(await fs.readFile(filename, 'utf8'));
      try {
        // Input validation must not retain every historical grammar baseline.
        // The caller receives the same independent, mutable values on access.
        return validate(await this.inflate(record), projectId, (job, input) => {
          const slot = this.payloadSlots.get(job)?.get('input');
          if (slot) {
            slot.validatedInput = {
              projectId: input.projectId,
              passageId: input.passageId,
              digest: input.digest,
            };
            slot.release();
          }
        });
      } catch (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      if (error.code === 'ENOENT') return blank(projectId);
      throw new Error(
        `Não foi possível ler as análises. O arquivo foi preservado para recuperação: ${filename}. ${error.message}`,
      );
    }
  }
  async pack(state) {
    // Copy only the index containers we replace. A full project clone eagerly
    // hydrates and duplicates all historical payloads, even for a text delta.
    const packed = { ...state, jobs: {}, operations: {} },
      refs = [];
    delete packed.payloadStorage;
    const directory = path.join(this.directory, 'payloads');
    const saved = new Set();
    const save = async (source, location, parent, key) => {
      const slot = this.payloadSlots.get(source)?.get(key);
      if (slot?.untouched()) {
        refs.push({ path: location, hash: slot.hash, bytes: slot.bytes });
        parent[key] = null;
        return;
      }
      const value = source[key];
      if (value === undefined) return;
      const bytes = Buffer.from(JSON.stringify(value));
      if (bytes.length > MAX_BYTES)
        throw Object.assign(
          new Error('Payload de análise excede 64 MiB; os dados anteriores foram preservados.'),
          { code: 'ANALYSIS_STORAGE_LIMIT' },
        );
      if (bytes.length < 16 * 1024) {
        parent[key] = value;
        return;
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const filename = path.join(directory, hash + '.json');
      if (saved.has(hash)) {
        refs.push({ path: location, hash, bytes: bytes.length });
        parent[key] = null;
        return;
      }
      try {
        const existing = await fs.readFile(filename);
        if (!existing.equals(bytes))
          throw new Error('Payload de análise danificado; arquivo preservado.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const temporary = filename + '.' + randomUUID() + '.tmp';
        let file;
        try {
          file = await fs.open(temporary, 'wx', 0o600);
          await file.writeFile(bytes);
          await file.sync();
          await file.close();
          file = null;
          await fs.rename(temporary, filename);
          if (process.platform !== 'win32') {
            const folder = await fs.open(directory, 'r');
            try {
              await folder.sync();
            } finally {
              await folder.close();
            }
          }
        } finally {
          if (file) await file.close();
          await fs.rm(temporary, { force: true });
        }
      }
      saved.add(hash);
      refs.push({ path: location, hash, bytes: bytes.length });
      parent[key] = null;
    };
    const copyWithout = (value, omitted) =>
      Object.fromEntries(
        Object.keys(value)
          .filter((key) => !omitted.includes(key))
          .map((key) => [key, value[key]]),
      );
    for (const [id, original] of Object.entries(state.jobs)) {
      const job = copyWithout(original, ['input', 'events', 'attempts']);
      packed.jobs[id] = job;
      await save(original, ['jobs', id, 'input'], job, 'input');
      if (original.events !== undefined)
        job.events = original.events.map((event) => copyWithout(event, ['result', 'arguments']));
      job.attempts = original.attempts.map((attempt) =>
        copyWithout(attempt, ['checkpoint', 'followUpContext']),
      );
      for (let i = 0; i < (original.events ?? []).length; i++)
        for (const key of ['result', 'arguments'])
          await save(original.events[i], ['jobs', id, 'events', i, key], job.events[i], key);
      for (let i = 0; i < job.attempts.length; i++)
        for (const key of ['checkpoint', 'followUpContext'])
          await save(original.attempts[i], ['jobs', id, 'attempts', i, key], job.attempts[i], key);
    }
    for (const [id, original] of Object.entries(state.operations)) {
      const operation = copyWithout(original, ['result']);
      packed.operations[id] = operation;
      await save(original, ['operations', id, 'result'], operation, 'result');
    }
    if (
      refs.length > 100000 ||
      refs.reduce((total, ref) => total + ref.bytes, 0) > 256 * 1024 * 1024
    )
      throw new Error(
        'Payloads de análise excedem o limite de recuperação; os dados anteriores foram preservados.',
      );
    if (refs.length) packed.payloadStorage = { version: 1, refs };
    return packed;
  }
  async payloadText(ref) {
    const filename = path.join(this.directory, 'payloads', ref.hash + '.json');
    const info = await fs.stat(filename);
    if (info.size !== ref.bytes) throw new Error('Tamanho do payload de análise inválido.');
    const identity = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':');
    const cached = this.payloadTexts.get(ref.hash);
    if (cached?.identity === identity) {
      this.payloadTexts.delete(ref.hash);
      this.payloadTexts.set(ref.hash, cached);
      return cached.text;
    }
    const key = ref.hash + ':' + identity;
    if (this.payloadReads.has(key)) return this.payloadReads.get(key);
    const pending = (async () => {
      const bytes = await fs.readFile(filename);
      if (
        bytes.length !== ref.bytes ||
        createHash('sha256').update(bytes).digest('hex') !== ref.hash
      )
        throw new Error('Hash do payload de análise inválido.');
      const text = bytes.toString('utf8');
      // Fail on malformed JSON even if no caller inspects this historical field.
      JSON.parse(text);
      const previous = this.payloadTexts.get(ref.hash);
      if (previous) {
        this.payloadCacheBytes -= previous.bytes;
        this.payloadTexts.delete(ref.hash);
      }
      if (ref.bytes <= this.maxPayloadCacheBytes) {
        this.payloadTexts.set(ref.hash, { text, identity, bytes: ref.bytes });
        this.payloadCacheBytes += ref.bytes;
        while (this.payloadCacheBytes > this.maxPayloadCacheBytes) {
          const oldest = this.payloadTexts.keys().next().value;
          this.payloadCacheBytes -= this.payloadTexts.get(oldest).bytes;
          this.payloadTexts.delete(oldest);
        }
      }
      return text;
    })();
    this.payloadReads.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.payloadReads.get(key) === pending) this.payloadReads.delete(key);
    }
  }
  async inflate(state) {
    if (!state.payloadStorage) return state;
    const { version, refs } = state.payloadStorage;
    if (version !== 1 || !Array.isArray(refs) || refs.length > 100000)
      throw new Error('Índice de payloads de análise inválido.');
    const cache = new Map();
    let total = 0;
    for (const ref of refs) {
      if (
        !/^[a-f0-9]{64}$/.test(ref.hash) ||
        !Number.isSafeInteger(ref.bytes) ||
        ref.bytes < 0 ||
        ref.bytes > MAX_BYTES ||
        !Array.isArray(ref.path) ||
        ref.path.length < 3 ||
        ref.path.length > 6 ||
        !['jobs', 'operations'].includes(ref.path[0]) ||
        ref.path.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))
      )
        throw new Error('Referência de payload inválida.');
      total += ref.bytes;
      if (total > 256 * 1024 * 1024)
        throw new Error('Payloads de análise excedem o limite de recuperação.');
      let cached = cache.get(ref.hash);
      if (cached && cached.bytes !== ref.bytes)
        throw new Error('Tamanho do payload de análise inválido.');
      if (!cached) {
        cached = { text: await this.payloadText(ref), bytes: ref.bytes };
        cache.set(ref.hash, cached);
      }
      const text = cached.text;
      let parent = state;
      for (const key of ref.path.slice(0, -1)) {
        if (!Object.hasOwn(parent, key) || !parent[key] || typeof parent[key] !== 'object')
          throw new Error('Destino de payload de análise inválido.');
        parent = parent[key];
      }
      const key = ref.path.at(-1);
      if (!Object.hasOwn(parent, key) || parent[key] !== null)
        throw new Error('Destino de payload de análise alterado.');
      // Accessors are ordinary JSON/structuredClone-compatible properties.
      // Each occurrence parses independently, so editing one reference never
      // changes a sibling with the same content hash or a different read.
      let loaded = false,
        value;
      const get = () => {
        if (!loaded) {
          value = JSON.parse(text);
          loaded = true;
        }
        return value;
      };
      const slot = {
        hash: ref.hash,
        bytes: ref.bytes,
        untouched: () => !loaded && Object.getOwnPropertyDescriptor(parent, key)?.get === get,
        current: () => Object.getOwnPropertyDescriptor(parent, key)?.get === get,
        release: () => {
          loaded = false;
          value = undefined;
        },
      };
      Object.defineProperty(parent, key, {
        enumerable: true,
        configurable: true,
        get,
        set: (next) => {
          loaded = true;
          value = next;
        },
      });
      let slots = this.payloadSlots.get(parent);
      if (!slots) this.payloadSlots.set(parent, (slots = new Map()));
      slots.set(key, slot);
    }
    delete state.payloadStorage;
    return state;
  }
  async read(projectId) {
    // A rejected atomic write reports to its caller. Readers still observe the
    // last committed record; corruption/missing-payload errors still fail in load.
    await this.writes.get(projectId)?.catch(() => {});
    return this.load(projectId);
  }
  async transact(projectId, update) {
    const previous = this.writes.get(projectId) ?? Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(async () => {
        const state = await this.load(projectId);
        const result = await update(state);
        state.revision++;
        validate(
          state,
          projectId,
          (job, input) => {
            const slot = this.payloadSlots.get(job)?.get('input');
            // Inputs remain immutable. A fully checked unchanged input can return
            // to its original reference instead of keeping its baseline in memory.
            if (slot?.current() && slot.validatedInput?.digest === input.digest) slot.release();
          },
          (job) => {
            const slot = this.payloadSlots.get(job)?.get('input');
            return slot?.untouched() ? slot.validatedInput : null;
          },
        );
        // Large immutable/replayed payloads are stored once by content hash.
        // Never trim human text, baselines, tool receipts or resumable checkpoints.
        const contents = JSON.stringify(await this.pack(state));
        if (Buffer.byteLength(contents) > this.maxBytes)
          throw Object.assign(
            new Error('As análises excederam 64 MiB; os dados anteriores foram preservados.'),
            { code: 'ANALYSIS_STORAGE_LIMIT' },
          );
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const filename = this.filename(projectId),
          temporary = filename + '.' + randomUUID() + '.tmp';
        let file;
        try {
          file = await fs.open(temporary, 'wx', 0o600);
          await file.writeFile(contents);
          await file.sync();
          await file.close();
          file = null;
          await fs.rename(temporary, filename);
          // Persist the directory entry on POSIX. Windows does not expose
          // directory handles via fs.open; the file itself is already flushed.
          if (process.platform !== 'win32') {
            const directory = await fs.open(this.directory, 'r');
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
          }
        } finally {
          if (file) await file.close();
          await fs.rm(temporary, { force: true });
        }
        return structuredClone(result);
      });
    this.writes.set(projectId, pending);
    try {
      return await pending;
    } finally {
      if (this.writes.get(projectId) === pending) this.writes.delete(projectId);
    }
  }
  async close() {
    await Promise.allSettled([...this.writes.values()]);
    this.payloadTexts.clear();
    this.payloadCacheBytes = 0;
  }
}
module.exports = { AnalysisStore, digest, statuses };

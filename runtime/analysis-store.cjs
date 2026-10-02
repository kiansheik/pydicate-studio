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
function validate(value, projectId) {
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
    if (
      job.id !== key ||
      job.projectId !== projectId ||
      !statuses.has(job.status) ||
      !job.input ||
      job.input.projectId !== projectId ||
      job.input.passageId !== job.passageId ||
      !Array.isArray(job.attempts) ||
      !Array.isArray(job.candidateIds) ||
      !Array.isArray(job.questions)
    )
      throw new Error('Análise persistida inválida.');
    const { digest: savedDigest, ...packet } = job.input;
    if (savedDigest !== digest(packet))
      throw new Error('O pacote de entrada da análise foi alterado.');
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
  constructor(directory, { maxBytes = MAX_BYTES } = {}) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.writes = new Map();
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
        return validate(await this.inflate(record), projectId);
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
    const packed = structuredClone(state),
      refs = [];
    const directory = path.join(this.directory, 'payloads');
    const saved = new Set();
    const save = async (value, location, parent, key) => {
      if (value === undefined) return;
      const bytes = Buffer.from(JSON.stringify(value));
      if (bytes.length > MAX_BYTES)
        throw Object.assign(
          new Error('Payload de análise excede 64 MiB; os dados anteriores foram preservados.'),
          { code: 'ANALYSIS_STORAGE_LIMIT' },
        );
      if (bytes.length < 16 * 1024) return;
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
    for (const [id, job] of Object.entries(packed.jobs)) {
      await save(job.input, ['jobs', id, 'input'], job, 'input');
      for (let i = 0; i < (job.events ?? []).length; i++)
        for (const key of ['result', 'arguments'])
          await save(job.events[i][key], ['jobs', id, 'events', i, key], job.events[i], key);
      for (let i = 0; i < job.attempts.length; i++)
        for (const key of ['checkpoint', 'followUpContext'])
          await save(job.attempts[i][key], ['jobs', id, 'attempts', i, key], job.attempts[i], key);
    }
    for (const [id, operation] of Object.entries(packed.operations))
      await save(operation.result, ['operations', id, 'result'], operation, 'result');
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
      let value = cache.get(ref.hash);
      if (value === undefined) {
        const filename = path.join(this.directory, 'payloads', ref.hash + '.json');
        const stat = await fs.stat(filename);
        if (stat.size !== ref.bytes) throw new Error('Tamanho do payload de análise inválido.');
        const bytes = await fs.readFile(filename);
        if (createHash('sha256').update(bytes).digest('hex') !== ref.hash)
          throw new Error('Hash do payload de análise inválido.');
        value = JSON.parse(bytes.toString('utf8'));
        cache.set(ref.hash, value);
      }
      let parent = state;
      for (const key of ref.path.slice(0, -1)) {
        if (!Object.hasOwn(parent, key) || !parent[key] || typeof parent[key] !== 'object')
          throw new Error('Destino de payload de análise inválido.');
        parent = parent[key];
      }
      const key = ref.path.at(-1);
      if (!Object.hasOwn(parent, key) || parent[key] !== null)
        throw new Error('Destino de payload de análise alterado.');
      parent[key] = structuredClone(value);
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
        validate(state, projectId);
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
  }
}
module.exports = { AnalysisStore, digest, statuses };

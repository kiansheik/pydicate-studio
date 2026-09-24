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
/** The desktop owner is the sole writer; external clients only call its commands. */
class AnalysisStore {
  constructor(directory) {
    this.directory = directory;
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
      if (stat.size > MAX_BYTES)
        throw new Error('Arquivo excede 64 MiB. Exporte/arquive análises antes de continuar.');
      return validate(JSON.parse(await fs.readFile(filename, 'utf8')), projectId);
    } catch (error) {
      if (error.code === 'ENOENT') return blank(projectId);
      throw new Error(
        `Não foi possível ler as análises. O arquivo foi preservado para recuperação: ${filename}. ${error.message}`,
      );
    }
  }
  async read(projectId) {
    await this.writes.get(projectId);
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
        const contents = JSON.stringify(state);
        if (Buffer.byteLength(contents) > MAX_BYTES)
          throw new Error('As análises excederam 64 MiB; os dados anteriores foram preservados.');
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

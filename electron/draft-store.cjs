'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const validate = require('./validation.cjs');

class DraftStore {
  constructor(directory) {
    this.directory = directory;
    this.writes = new Map();
  }

  filename(projectId) {
    validate.id(projectId, 'projeto');
    const key = createHash('sha256').update(projectId, 'utf8').digest('hex');
    return path.join(this.directory, `${key}.json`);
  }

  async load(projectId) {
    const filename = this.filename(projectId);
    try {
      const stat = await fs.stat(filename);
      if (stat.size > validate.LIMITS.draftBytes) throw new Error('Arquivo excede o limite.');
      const value = validate.envelope(JSON.parse(await fs.readFile(filename, 'utf8')));
      if (value.projectId !== projectId) throw new Error('Projeto divergente.');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error(
        `Não foi possível ler os rascunhos. O arquivo foi preservado para recuperação: ${filename}. ${error.message}`,
      );
    }
  }

  async save(value) {
    validate.envelope(value);
    const projectId = value.projectId;
    // Serialize now so later edits cannot alter the pending write.
    const contents = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(contents, 'utf8') > validate.LIMITS.draftBytes)
      throw new Error('Os rascunhos excedem o limite de 4 MiB.');
    const previous = this.writes.get(projectId) || Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        // A damaged previous file must be recovered explicitly, never replaced by autosave.
        await this.load(projectId);
        const filename = this.filename(projectId);
        const temporary = `${filename}.${randomUUID()}.tmp`;
        let handle;
        try {
          handle = await fs.open(temporary, 'wx', 0o600);
          await handle.writeFile(contents, 'utf8');
          await handle.sync();
          await handle.close();
          handle = null;
          await fs.rename(temporary, filename);
        } finally {
          if (handle) await handle.close();
          await fs.unlink(temporary).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      });
    this.writes.set(projectId, pending);
    try {
      await pending;
    } finally {
      if (this.writes.get(projectId) === pending) this.writes.delete(projectId);
    }
  }
}

module.exports = { DraftStore };

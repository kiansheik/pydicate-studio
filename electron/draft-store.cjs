'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const validate = require('./validation.cjs');

function savedAcceptance(
  envelope,
  { passageId, expectedDraftRevision, operationId, jobId, candidateId, candidateRevision },
) {
  for (const draft of Object.values(envelope?.drafts ?? {})) {
    const decision = draft.aiAcceptances?.find((item) => item.operationId === operationId);
    if (!decision) continue;
    if (
      draft.passageId.replace(/^pending:/, 'passage:') !==
        passageId.replace(/^pending:/, 'passage:') ||
      decision.jobId !== jobId ||
      decision.candidateId !== candidateId ||
      decision.candidateRevision !== candidateRevision ||
      decision.baseRevisionId !== expectedDraftRevision
    )
      throw Object.assign(
        new Error('A identificação desta operação já pertence a outra aceitação.'),
        { code: 'OPERATION_CONFLICT' },
      );
    return { envelope, draft, decision };
  }
  return null;
}

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
    const snapshot = structuredClone(value);
    await this.transact(value.projectId, () => snapshot);
  }

  async saveChecked(value) {
    validate.envelope(value);
    const snapshot = structuredClone(value);
    const next = await this.transact(value.projectId, (current) => {
      if ((snapshot.storageRevision ?? 0) !== (current?.storageRevision ?? 0)) {
        const error = new Error(
          'O rascunho salvo mudou em outra janela. Suas edições foram preservadas; recarregue e compare antes de salvar.',
        );
        error.code = 'DRAFT_CONFLICT';
        throw error;
      }
      // Acceptance provenance is issued only by the authoritative command.
      // Autosave/undo may change content but cannot invent or erase receipts.
      for (const [id, draft] of Object.entries(snapshot.drafts)) {
        delete draft.aiAcceptances;
        if (current?.drafts[id]?.aiAcceptances)
          draft.aiAcceptances = structuredClone(current.drafts[id].aiAcceptances);
        else {
          const migrated = Object.values(current?.drafts ?? {}).find(
            (previous) =>
              previous.passageId.startsWith('pending:') &&
              id === previous.passageId.replace(/^pending:/, 'passage:'),
          );
          if (migrated?.aiAcceptances)
            draft.aiAcceptances = structuredClone(migrated.aiAcceptances);
        }
      }
      return { ...snapshot, storageRevision: (current?.storageRevision ?? 0) + 1 };
    });
    return { storageRevision: next.storageRevision };
  }

  async acceptCandidate({
    projectId,
    passageId,
    expectedDraftRevision,
    operationId,
    jobId,
    candidate,
    revalidation,
    assertCurrent,
  }) {
    for (const value of [
      passageId,
      expectedDraftRevision,
      operationId,
      jobId,
      candidate?.id,
      candidate?.revisionId,
    ])
      validate.id(value, 'aceitação');
    const command = {
      passageId,
      expectedDraftRevision,
      operationId,
      jobId,
      candidateId: candidate.id,
      candidateRevision: candidate.revisionId,
    };
    const envelope = await this.transact(projectId, (current) => {
      if (savedAcceptance(current, command)) return current;
      assertCurrent?.();
      if (!current?.drafts[passageId])
        throw new Error('Salve o rascunho antes de aceitar a proposta.');
      const draft = current.drafts[passageId];
      if (draft.revisionId !== expectedDraftRevision) {
        const error = new Error(
          'Seu rascunho mudou. Compare a proposta com a revisão atual antes de aceitar.',
        );
        error.code = 'DRAFT_CONFLICT';
        throw error;
      }
      const revisionId = randomUUID();
      const at = new Date().toISOString();
      const receipt = {
        operationId,
        jobId,
        candidateId: candidate.id,
        candidateRevision: candidate.revisionId,
        baseRevisionId: draft.revisionId,
        revisionId,
        at,
        ...(revalidation ? { revalidation: structuredClone(revalidation) } : {}),
      };
      return {
        ...current,
        storageRevision: (current.storageRevision ?? 0) + 1,
        drafts: {
          ...current.drafts,
          [passageId]: {
            ...draft,
            raw: candidate.raw,
            canvas: structuredClone(candidate.canvas),
            analysis: null,
            revisionId,
            updatedAt: at,
            aiAcceptances: [...(draft.aiAcceptances ?? []), receipt],
          },
        },
      };
    });
    return savedAcceptance(envelope, command);
  }

  async acceptanceReceipt({ projectId, ...command }) {
    for (const value of Object.values(command)) validate.id(value, 'aceitação');
    await this.writes.get(projectId);
    return savedAcceptance(await this.load(projectId), command);
  }

  async transact(projectId, update) {
    validate.id(projectId, 'projeto');
    const previous = this.writes.get(projectId) || Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        // A damaged previous file must be recovered explicitly, never replaced by autosave.
        const next = await update(await this.load(projectId));
        validate.envelope(next);
        if (next.projectId !== projectId) throw new Error('Projeto divergente.');
        const contents = JSON.stringify(next, null, 2);
        if (Buffer.byteLength(contents, 'utf8') > validate.LIMITS.draftBytes)
          throw new Error('Os rascunhos excedem o limite de 4 MiB.');
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
          // Windows cannot open directory handles through fs.open. The file
          // has already been flushed and renamed; sync its parent on POSIX.
          if (process.platform !== 'win32') {
            const directory = await fs.open(this.directory, 'r');
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
          }
          return next;
        } finally {
          if (handle) await handle.close();
          await fs.unlink(temporary).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      });
    this.writes.set(projectId, pending);
    try {
      return await pending;
    } finally {
      if (this.writes.get(projectId) === pending) this.writes.delete(projectId);
    }
  }
}

module.exports = { DraftStore };

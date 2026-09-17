'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const hash = (value) => createHash('sha256').update(value).digest('hex');
function text(value, name, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`Campo lexical inválido: ${name}.`);
  return value;
}
function identity(note) {
  if (!note || !['entry', 'occurrence'].includes(note.scope))
    throw new Error('Escolha notas da entrada ou desta ocorrência.');
  text(note.lexicalId, 'entrada');
  const parts = [note.scope, note.lexicalId];
  if (note.scope === 'occurrence')
    parts.push(
      text(note.sourceId, 'fonte'),
      text(note.passageId, 'passagem'),
      text(note.occurrenceId, 'ocorrência'),
    );
  return 'lexical-note:' + hash(JSON.stringify(parts));
}
function validateNote(note) {
  const id = identity(note);
  text(note.lexicalName, 'variável');
  text(note.revisionId, 'revisão');
  text(note.expressionFingerprint, 'expressão');
  if (
    !note.fields ||
    typeof note.fields !== 'object' ||
    Array.isArray(note.fields) ||
    Object.keys(note.fields).some((key) => !['meaning', 'grammar', 'note'].includes(key))
  )
    throw new Error('Campos das notas lexicais inválidos.');
  const fields = {};
  for (const key of ['meaning', 'grammar', 'note']) {
    const value = note.fields[key] ?? '';
    if (typeof value !== 'string' || value.length > 50_000)
      throw new Error('Nota lexical muito grande.');
    fields[key] = value;
  }
  const provenance = note.provenance ?? {};
  if (
    !provenance ||
    typeof provenance !== 'object' ||
    Array.isArray(provenance) ||
    JSON.stringify(provenance).length > 25_000
  )
    throw new Error('Proveniência lexical inválida.');
  return {
    id,
    scope: note.scope,
    lexicalId: note.lexicalId,
    lexicalName: note.lexicalName,
    ...(note.scope === 'occurrence'
      ? { sourceId: note.sourceId, passageId: note.passageId, occurrenceId: note.occurrenceId }
      : {}),
    revisionId: note.revisionId,
    expressionFingerprint: note.expressionFingerprint,
    provenance: structuredClone(provenance),
    fields,
  };
}

function createLexicalNotesService({ stateDirectory }) {
  let writes = Promise.resolve();
  const fileFor = (projectId) =>
    path.join(stateDirectory, hash(text(projectId, 'projeto')) + '.json');
  async function read(projectId) {
    let data;
    try {
      data = JSON.parse(await fs.readFile(fileFor(projectId), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, projectId, records: [] };
      throw new Error(
        'As notas lexicais estão ilegíveis. O arquivo foi preservado; recupere uma cópia antes de salvar.',
      );
    }
    if (
      data?.version !== 1 ||
      data.projectId !== projectId ||
      !Array.isArray(data.records) ||
      data.records.length > 10_000
    )
      throw new Error('Formato das notas lexicais inválido; o arquivo foi preservado.');
    const ids = new Set();
    for (const note of data.records) {
      const normalized = validateNote(note);
      if (
        note.id !== normalized.id ||
        ids.has(note.id) ||
        !Number.isInteger(note.version) ||
        note.version < 1 ||
        !Array.isArray(note.history) ||
        note.history.length !== note.version ||
        typeof note.createdAt !== 'string' ||
        typeof note.updatedAt !== 'string'
      )
        throw new Error('Histórico das notas lexicais inválido; o arquivo foi preservado.');
      ids.add(note.id);
      for (const item of note.history) {
        validateNote({ ...note, ...item });
        if (!Number.isInteger(item.version) || typeof item.savedAt !== 'string')
          throw new Error('Revisão lexical inválida; o arquivo foi preservado.');
      }
    }
    return data;
  }
  async function invoke(method, params = {}) {
    const projectId = text(params.projectId, 'projeto');
    if (method === 'lexical_notes_save') {
      const note = validateNote(params.note);
      if (!Number.isInteger(params.expectedVersion) || params.expectedVersion < 0)
        throw new Error('Revisão esperada da nota lexical ausente.');
      const action = async () => {
        const data = await read(projectId);
        const index = data.records.findIndex((item) => item.id === note.id);
        const previous = data.records[index];
        if ((previous?.version ?? 0) !== params.expectedVersion)
          throw new Error('Esta nota mudou em outra janela. Recarregue as notas antes de salvar.');
        if (!previous && data.records.length >= 10_000)
          throw new Error('Limite de notas atingido; exporte o arquivo para análise.');
        const now = new Date().toISOString();
        const version = (previous?.version ?? 0) + 1;
        const saved = {
          ...note,
          version,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
          history: [
            ...(previous?.history ?? []),
            {
              version,
              savedAt: now,
              revisionId: note.revisionId,
              expressionFingerprint: note.expressionFingerprint,
              provenance: note.provenance,
              fields: note.fields,
            },
          ],
        };
        if (index < 0) data.records.push(saved);
        else data.records[index] = saved;
        await fs.mkdir(stateDirectory, { recursive: true });
        const file = fileFor(projectId),
          temporary = file + '.' + randomUUID() + '.tmp';
        try {
          await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
          await fs.rename(temporary, file);
        } finally {
          await fs.rm(temporary, { force: true }).catch(() => {});
        }
        return saved;
      };
      const operation = writes.catch(() => {}).then(action);
      writes = operation;
      return operation;
    }
    await writes.catch(() => {});
    const data = await read(projectId);
    if (method === 'lexical_notes_list') return { version: 1, records: data.records };
    if (method === 'lexical_notes_export')
      return { format: 'pydicate-lexical-notes', ...data, exportedAt: new Date().toISOString() };
    throw new Error('Operação de notas lexicais indisponível.');
  }
  return { invoke };
}
module.exports = { createLexicalNotesService };

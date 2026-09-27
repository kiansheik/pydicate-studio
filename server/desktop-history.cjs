'use strict';
// Historical research reads deliberately bypass the desktop analysis service:
// its ordinary list/start paths may schedule or recover provider jobs.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fault } = require('./store.cjs');

const SHA = /^[a-f0-9]{64}$/;
const MAX_JSON = 64 * 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const canonical = (value) =>
  typeof value === 'string' ? value.replace(/^pending:/, 'passage:') : value;
function safePath(value) {
  return (
    typeof value === 'string' &&
    value.startsWith('files/') &&
    value.length <= 1000 &&
    !/[\\\x00-\x1f]/.test(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}
function kindOf(file) {
  const name = file.path;
  if (name.startsWith('files/drafts/')) return 'draft';
  if (name.startsWith('files/analysis/records/')) return 'analysis';
  if (name.startsWith('files/lexical-notes/')) return 'lexical-note';
  if (name.startsWith('files/ai/ai/') && name.endsWith('.json')) return 'legacy-ai';
  if (name.startsWith('files/analysis/images/')) return 'image';
  if (name.startsWith('files/analysis/grammar-edits/')) return 'grammar';
  if (name.startsWith('files/parser-lab/')) return 'parser-lab';
  if (name.startsWith('files/usage/')) return 'usage';
  return file.kind || 'archive';
}
const titles = {
  draft: 'Rascunho',
  job: 'Análise assistida',
  conversation: 'Conversa',
  candidate: 'Proposta de análise',
  'candidate-revision': 'Revisão de proposta',
  decision: 'Decisão registrada',
  'lexical-note': 'Nota de interpretação',
  'legacy-ai': 'Resposta de IA anterior',
  image: 'Imagem usada na análise',
  grammar: 'Histórico de reparo da gramática',
  'parser-lab': 'Laboratório de análise',
  usage: 'Registro de atividade',
  session: 'Seleção no desktop',
  preferences: 'Preferências e trabalho no navegador',
  'pdf-buffer': 'Regiões e página do PDF no navegador',
  'lexical-buffer': 'Nota de interpretação ainda não salva',
  'browser-draft': 'Rascunhos locais do navegador',
  learning: 'Prática e exercícios salvos',
  retry: 'Registro histórico de tentativa de envio',
};
function records(file, data) {
  const kind = kindOf(file);
  const values = (collection, section, recordKind) =>
    Object.entries(collection || {}).map(([recordId, value]) => ({
      section,
      recordId,
      kind: recordKind,
      value,
    }));
  if (kind === 'draft' && object(data?.drafts)) return values(data.drafts, 'drafts', 'draft');
  if (kind === 'analysis' && object(data)) {
    const rows = [
      ...values(data.jobs, 'jobs', 'job'),
      ...values(data.conversations, 'conversations', 'conversation'),
      ...values(data.candidates, 'candidates', 'candidate'),
      ...Object.entries(data.candidateRevisions || {}).flatMap(([id, revisions]) =>
        (Array.isArray(revisions) ? revisions : [revisions]).map((value, index) => ({
          section: 'candidateRevisions',
          recordId: JSON.stringify([id, index]),
          revisionNumber: index + 1,
          kind: 'candidate-revision',
          value,
        })),
      ),
      ...values(data.decisions, 'decisions', 'decision'),
    ];
    return rows.length ? rows : [{ kind, value: data }];
  }
  if (kind === 'lexical-note' && Array.isArray(data?.records))
    return values(data.records, 'records', kind);
  if (data?.format === 'pydicate-browser-storage' && Array.isArray(data.origins)) {
    return [
      { kind: 'preferences', value: data },
      ...data.origins.flatMap((origin, index) =>
        Object.entries(origin.entries || {}).map(([key, serialized]) => {
          let value = serialized,
            passageId,
            sourceId,
            recordKind = 'preferences';
          try {
            value = JSON.parse(serialized);
          } catch {
            /* Plain preferences remain exact strings. */
          }
          if (key.startsWith('pydicate-studio:evidence-draft:v1:')) {
            recordKind = 'pdf-buffer';
            try {
              [, sourceId, passageId] = JSON.parse(
                key.slice('pydicate-studio:evidence-draft:v1:'.length),
              );
            } catch {
              /* Keep malformed originals readable. */
            }
          } else if (key.startsWith('pydicate:lexical-note-buffer:')) recordKind = 'lexical-buffer';
          else if (key.startsWith('studio-learning:')) recordKind = 'learning';
          else if (key.startsWith('pydicate-studio:drafts:')) recordKind = 'browser-draft';
          else if (key.startsWith('pydicate-studio:submission:')) recordKind = 'retry';
          return {
            section: 'browserEntries',
            recordId: JSON.stringify([index, key]),
            kind: recordKind,
            value: {
              browserKey: key,
              origin: origin.origin,
              serialized,
              value,
              passageId,
              sourceId,
            },
          };
        }),
      ),
    ];
  }
  return [{ kind, value: data }];
}

function createDesktopHistory({ directory }) {
  const cache = new Map();
  const summaries = new Map();
  async function checkedFile(base, relative, expected, maximum = MAX_JSON) {
    const file = path.join(base, relative);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum)
      throw fault(422, 'DESKTOP_ARCHIVE_INVALID', 'Arquivo histórico inválido ou acima do limite.');
    const realBase = await fs.realpath(base),
      realFile = await fs.realpath(file);
    if (!realFile.startsWith(realBase + path.sep))
      throw fault(422, 'DESKTOP_ARCHIVE_INVALID', 'O arquivo não pertence à cópia histórica.');
    const bytes = await fs.readFile(file);
    if (expected && digest(bytes) !== expected)
      throw fault(
        422,
        'DESKTOP_ARCHIVE_CHANGED',
        'A cópia histórica mudou. Restaure o arquivo preservado.',
      );
    return bytes;
  }
  async function archive(snapshot, projectId) {
    if (!SHA.test(snapshot || ''))
      throw fault(400, 'DESKTOP_ARCHIVE_ID', 'Cópia histórica inválida.');
    const base = path.join(directory, snapshot);
    let manifest, receipt, receiptDigest;
    try {
      manifest = JSON.parse(await checkedFile(base, 'manifest.json'));
      const receiptBytes = await checkedFile(base, 'receipt.json');
      receipt = JSON.parse(receiptBytes);
      receiptDigest = digest(receiptBytes);
    } catch (error) {
      if (error.code === 'ENOENT')
        throw fault(404, 'DESKTOP_ARCHIVE_MISSING', 'Cópia histórica não encontrada.');
      throw error;
    }
    if (receipt.projectId !== projectId)
      throw fault(404, 'DESKTOP_ARCHIVE_MISSING', 'Cópia histórica não encontrada neste projeto.');
    if (
      manifest.version !== 1 ||
      !Array.isArray(manifest.files) ||
      manifest.files.length > 100000 ||
      manifest.files.some((file) => !safePath(file.path) || !SHA.test(file.sha256 || '')) ||
      new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length ||
      (receipt.snapshotSha256 && receipt.snapshotSha256 !== snapshot)
    )
      throw fault(
        422,
        'DESKTOP_ARCHIVE_INVALID',
        'Índice histórico inválido. A cópia foi preservada.',
      );
    return { snapshot, base, manifest, receipt, receiptDigest };
  }
  async function readData(item, file) {
    if (!/\.(json|jsonl|txt|md|log|py|patch|diff)$/.test(file.path)) return null;
    const key = item.snapshot + ':' + file.path + ':' + file.sha256;
    const stat = await fs.lstat(path.join(item.base, file.path));
    const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (cache.get(key)?.signature === signature) return cache.get(key).data;
    const bytes = await checkedFile(item.base, file.path, file.sha256);
    let data;
    if (file.path.endsWith('.json')) {
      try {
        data = JSON.parse(bytes.toString('utf8'));
      } catch {
        throw fault(422, 'DESKTOP_ARCHIVE_INVALID', 'O registro histórico não contém JSON válido.');
      }
    } else if (/\.(jsonl|txt|md|log|py|patch|diff)$/.test(file.path)) data = bytes.toString('utf8');
    else return null;
    // Retain only a few smaller decoded files. Large originals are always bounded reads.
    if (bytes.length <= 8 * 1024 * 1024) {
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(key, { data, signature });
    }
    return data;
  }
  function summary(item, file, record) {
    const value = object(record.value) ? record.value : {};
    const passageId = value.passageId ?? value.input?.passageId ?? file.passageId;
    const mapping = (values, id) =>
      object(values) && Object.hasOwn(values, id) && typeof values[id] === 'string'
        ? values[id]
        : null;
    const mapped =
      passageId &&
      (mapping(item.receipt.passageMappings, passageId) ??
        mapping(item.receipt.passageMappings, canonical(passageId)) ??
        mapping(item.receipt.archiveMappings, passageId));
    const original = item.manifest.project?.passages?.find((passage) => passage.id === passageId);
    return {
      snapshot: item.snapshot,
      path: file.path,
      kind: record.kind,
      ...(record.section ? { section: record.section, recordId: record.recordId } : {}),
      ...(record.revisionNumber ? { revisionNumber: record.revisionNumber } : {}),
      title: titles[record.kind] || file.kind || path.basename(file.path),
      label:
        value.lexicalName ||
        value.title ||
        value.browserKey?.slice(0, 150) ||
        value.input?.description?.slice(0, 180) ||
        value.description?.slice(0, 180) ||
        '',
      originalPassageId: passageId ?? null,
      passageId: mapped ?? null,
      sourceId: value.sourceId ?? value.input?.sourceId ?? original?.sourceId ?? null,
      ordinal: original?.ordinal ?? null,
      updatedAt: value.updatedAt ?? value.createdAt ?? value.at ?? null,
      status: value.workflow?.stage ?? value.status ?? null,
      sha256: file.sha256,
    };
  }
  async function summaryRows(item, file) {
    const kind = kindOf(file);
    // Most files are journals, images, source snapshots or parser artifacts.
    // Their contents are verified only when opened, not on every list/filter.
    if (
      !['draft', 'analysis', 'lexical-note', 'legacy-ai', 'preferences', 'session'].includes(kind)
    )
      return [summary(item, file, { kind, value: null })];
    const key = `${item.snapshot}:${file.path}:${file.sha256}:${item.receiptDigest}`;
    const stat = await fs.lstat(path.join(item.base, file.path));
    const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (summaries.get(key)?.signature === signature) return summaries.get(key).rows;
    const data = await readData(item, file);
    const rows = records(file, data).map((record) => summary(item, file, record));
    // Keep compact metadata for large analysis files, never their full decoded
    // histories. Opening a record revalidates its bytes against the manifest.
    if (summaries.size >= 512) summaries.delete(summaries.keys().next().value);
    summaries.set(key, { signature, rows });
    return rows;
  }
  async function list({ projectId, passageId, kind, cursor = 0, limit = 50 }) {
    cursor = Number(cursor);
    limit = Number(limit);
    if (
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw fault(400, 'DESKTOP_HISTORY_PAGE', 'Página histórica inválida.');
    let directories;
    try {
      directories = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { archives: [], entries: [], total: 0, nextCursor: null };
      throw error;
    }
    const entries = [],
      archives = [];
    for (const candidate of directories
      .filter((entry) => entry.isDirectory() && SHA.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))) {
      let item;
      try {
        item = await archive(candidate.name, projectId);
      } catch (error) {
        if (error.code === 'DESKTOP_ARCHIVE_MISSING') continue;
        throw error;
      }
      archives.push({
        snapshot: item.snapshot,
        originalProjectId: item.manifest.projectId,
        files: item.manifest.files.length,
        counts: item.receipt.counts ?? {},
        conflicts: item.receipt.conflicts ?? [],
        importedAt: item.receipt.importedAt ?? null,
      });
      for (const file of item.manifest.files) {
        for (const row of await summaryRows(item, file)) {
          if (kind && row.kind !== kind) continue;
          if (passageId && canonical(row.passageId) !== canonical(passageId)) continue;
          entries.push(row);
        }
      }
    }
    entries.sort(
      (a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) ||
        a.path.localeCompare(b.path),
    );
    return {
      archives,
      entries: entries.slice(cursor, cursor + limit),
      total: entries.length,
      nextCursor: cursor + limit < entries.length ? cursor + limit : null,
    };
  }
  async function get({ projectId, snapshot, path: relative, section, recordId }) {
    const item = await archive(snapshot, projectId);
    const file = item.manifest.files.find((entry) => entry.path === relative);
    if (!file) throw fault(404, 'DESKTOP_RECORD_MISSING', 'Registro histórico não encontrado.');
    const data = await readData(item, file);
    const record = section
      ? records(file, data).find(
          (entry) => entry.section === section && entry.recordId === recordId,
        )
      : { kind: kindOf(file), value: data };
    if (!record) throw fault(404, 'DESKTOP_RECORD_MISSING', 'Registro histórico não encontrado.');
    return {
      entry: summary(item, file, record),
      data: record.value,
      ...(data?.format === 'pydicate-browser-storage'
        ? {
            browserRestore: {
              projectId: item.receipt.projectId,
              sourceProjectId: item.manifest.projectId,
              passageMappings: item.receipt.passageMappings || {},
            },
          }
        : {}),
      relatedFiles: item.manifest.files
        .filter((entry) => ['image', 'grammar'].includes(kindOf(entry)))
        .map((entry) => ({ path: entry.path, kind: kindOf(entry), sha256: entry.sha256 })),
    };
  }
  async function file({ projectId, snapshot, path: relative }) {
    const item = await archive(snapshot, projectId);
    const selected = item.manifest.files.find((entry) => entry.path === relative);
    if (!selected) throw fault(404, 'DESKTOP_RECORD_MISSING', 'Arquivo histórico não encontrado.');
    const bytes = await checkedFile(item.base, selected.path, selected.sha256, 128 * 1024 * 1024);
    const extension = path.extname(selected.path).toLowerCase();
    const contentType =
      {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.json': 'application/json',
        '.jsonl': 'text/plain',
        '.txt': 'text/plain',
        '.md': 'text/plain',
      }[extension] || 'application/octet-stream';
    return { bytes, contentType, name: path.basename(selected.path) };
  }
  return { list, get, file };
}
module.exports = { createDesktopHistory, kindOf };

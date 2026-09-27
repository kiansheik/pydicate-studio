'use strict';
// Called by the stopped-server importer, never by a browser request. The raw
// notebook remains immutable; only unambiguous, nonconflicting notes become active.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { validateNotebook, identity } = require('../electron/lexical-notes-service.cjs');
const { same } = require('./store.cjs');
const hash = (value) => createHash('sha256').update(value).digest('hex');
function portableSource(value) {
  if (!value) return null;
  if (typeof value !== 'string') return '[invalid source]';
  const pieces = value.replaceAll('\\', '/').split('/');
  for (const marker of ['historic', 'python', 'pydicate', 'tupi']) {
    const index = pieces.indexOf(marker);
    if (index >= 0) return pieces.slice(index).join('/');
  }
  return value;
}
async function sameDeclaration(note, entry, inspectExpression) {
  if ((entry.lexicalName || entry.name) !== note.lexicalName) return false;
  const previous = note.provenance?.entry,
    current = entry.provenance;
  if (!previous || !current) return entry.id === note.lexicalId;
  if (
    portableSource(previous.sourcePath) !== portableSource(current.sourcePath) ||
    previous.runtimeModule !== current.runtimeModule
  )
    return false;
  if (
    previous.declarationFingerprint === current.declarationFingerprint &&
    previous.declarationFingerprint
  )
    return true;
  const originalExpression = note.provenance?.expression;
  if (
    !previous.declarationFingerprint &&
    !current.declarationFingerprint &&
    entry.expression === originalExpression
  )
    return true;
  // Older notes predate Black's formatting. Compare both declarations using the
  // same current parser; its fingerprint retains literals and human comments.
  if (
    inspectExpression &&
    typeof originalExpression === 'string' &&
    typeof entry.expression === 'string'
  ) {
    try {
      const before = await inspectExpression(originalExpression),
        after = await inspectExpression(entry.expression);
      return (
        typeof before?.expressionFingerprint === 'string' &&
        before.expressionFingerprint.length > 0 &&
        before.expressionFingerprint === after?.expressionFingerprint
      );
    } catch {
      return false;
    }
  }
  return false;
}
function sameImportedNote(saved, incoming) {
  if (same(saved, incoming)) return true;
  if (!saved.provenance?.desktopImport || !incoming.provenance?.desktopImport) return false;
  const comparison = structuredClone(incoming);
  comparison.provenance.desktopImport.snapshotSha256 =
    saved.provenance.desktopImport.snapshotSha256;
  // Identical research can appear in several snapshots. Keep the first active
  // provenance unchanged; all other content, identities and history must match.
  return same(saved, comparison);
}

async function importDesktopLexicalNotes({
  directory,
  manifest,
  receipt,
  stateDirectory,
  project,
  drafts,
  inspectLexicon,
  inspectExpression,
}) {
  if (
    manifest.version !== 1 ||
    manifest.projectId !== receipt.sourceProjectId ||
    project.id !== receipt.projectId
  )
    throw new Error('Lexical import project identity mismatch.');
  const relative = 'files/lexical-notes/' + hash(manifest.projectId) + '.json';
  const entries = manifest.files.filter((item) => item.path === relative);
  const counts = { inspected: 0, imported: 0, unchanged: 0, conflicts: 0 };
  const conflicts = [];
  if (!entries.length) return { counts, conflicts };
  if (entries.length !== 1 || !/^[a-f0-9]{64}$/.test(entries[0].sha256))
    throw new Error('Invalid lexical archive manifest.');
  const source = path.join(directory, relative),
    stat = await fs.lstat(source);
  const base = await fs.realpath(directory),
    real = await fs.realpath(source);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 64 * 1024 * 1024 ||
    !real.startsWith(base + path.sep)
  )
    throw new Error('Invalid lexical archive file.');
  const original = await fs.readFile(source);
  if (hash(original) !== entries[0].sha256) throw new Error('Lexical archive checksum mismatch.');
  const incoming = validateNotebook(JSON.parse(original), manifest.projectId);
  const targetDirectory = path.join(stateDirectory, 'lexical-notes');
  const target = path.join(targetDirectory, hash(project.id) + '.json');
  let before = null;
  try {
    const targetStat = await fs.lstat(target);
    if (!targetStat.isFile() || targetStat.isSymbolicLink() || targetStat.size > 64 * 1024 * 1024)
      throw new Error('Invalid active lexical notebook; preserved unchanged.');
    before = await fs.readFile(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const notebook = before
    ? validateNotebook(JSON.parse(before), project.id)
    : { version: 1, projectId: project.id, records: [] };
  const byId = new Map(notebook.records.map((note) => [note.id, note]));
  const inventories = new Map();
  function conflict(note, reason) {
    counts.conflicts++;
    conflicts.push({
      id: note.id,
      passageId: note.passageId || null,
      lexicalName: note.lexicalName,
      path: relative,
      reason,
    });
  }
  for (const note of incoming.records) {
    counts.inspected++;
    const next = structuredClone(note);
    let passage;
    if (note.scope === 'occurrence') {
      const mapped = Object.hasOwn(receipt.passageMappings || {}, note.passageId)
        ? receipt.passageMappings[note.passageId]
        : null;
      passage = project.passages.find((item) => item.id === mapped);
      if (!passage || passage.sourceId !== note.sourceId) {
        conflict(note, 'unresolved-passage');
        continue;
      }
      // A note tied to another syntax tree stays available in historical view.
      // Never invent a fresh fingerprint or attach it to a different reading.
      const previous = manifest.project?.passages?.find((item) => item.id === note.passageId);
      const knownExpression =
        note.expressionFingerprint === passage.expressionFingerprint ||
        (previous?.sourceExpression === passage.sourceExpression &&
          [previous.expressionFingerprint, previous.legacyExpressionFingerprint].includes(
            note.expressionFingerprint,
          ));
      if (
        !drafts ||
        !knownExpression ||
        (drafts[mapped]?.raw !== undefined && drafts[mapped].raw !== passage.sourceExpression)
      ) {
        conflict(note, 'changed-or-unverified-expression');
        continue;
      }
      next.passageId = mapped;
    }
    if (inspectLexicon) {
      const sourceId =
        passage?.sourceId ||
        project.sources?.find(
          (item) =>
            portableSource(note.provenance?.entry?.sourcePath) === 'historic/' + item.fileName,
        )?.id ||
        project.sources?.[0]?.id ||
        project.passages[0]?.sourceId;
      if (!sourceId) {
        conflict(note, 'unverified-lexical-source');
        continue;
      }
      const params = {
        projectId: project.id,
        sourceId,
        ...(passage ? { passageId: passage.id } : {}),
        raw: passage?.sourceExpression || note.lexicalName,
        revisionId: note.revisionId,
      };
      const key = JSON.stringify(params);
      let inventory;
      try {
        if (!inventories.has(key)) inventories.set(key, await inspectLexicon(params));
        inventory = inventories.get(key);
      } catch {
        conflict(note, 'lexical-inspection-failed');
        continue;
      }
      const entries = [];
      for (const entry of inventory?.entries || [])
        if (await sameDeclaration(note, entry, inspectExpression)) entries.push(entry);
      if (entries.length !== 1) {
        conflict(note, 'unresolved-lexical-identity');
        continue;
      }
      const entry = entries[0];
      let occurrence;
      if (note.scope === 'occurrence') {
        const original = note.provenance?.occurrence;
        const provenOriginal =
          original && [original.id, original.noteOccurrenceId].includes(note.occurrenceId);
        const candidates = (inventory.occurrences || []).filter(
          (item) =>
            item.lexicalId === entry.id &&
            (item.id === note.occurrenceId ||
              item.noteOccurrenceId === note.occurrenceId ||
              (provenOriginal &&
                original.sourceNodeId === item.sourceNodeId &&
                (!original.expression || original.expression === item.expression))),
        );
        if (candidates.length !== 1) {
          conflict(note, 'unresolved-lexical-occurrence');
          continue;
        }
        occurrence = candidates[0];
        next.occurrenceId = occurrence.noteOccurrenceId || occurrence.id;
        if (occurrence.nodeFingerprint) next.nodeFingerprint = occurrence.nodeFingerprint;
        else delete next.nodeFingerprint;
      }
      next.lexicalId = entry.id;
      next.expressionFingerprint = inventory.expressionFingerprint;
      next.provenance = {
        ...next.provenance,
        entry: structuredClone(entry.provenance || {}),
        ...(occurrence ? { occurrence: structuredClone(occurrence) } : {}),
        desktopImport: {
          snapshotSha256: receipt.snapshotSha256 || null,
          originalId: note.id,
          originalLexicalId: note.lexicalId,
          originalOccurrenceId: note.occurrenceId || null,
          originalExpressionFingerprint: note.expressionFingerprint,
          basis: passage ? 'same-source-expression-and-declaration-and-node' : 'same-declaration',
          engineFingerprint: inventory.engineFingerprint || null,
        },
      };
    } else if (passage && note.expressionFingerprint !== passage.expressionFingerprint) {
      conflict(note, 'lexical-inspection-required');
      continue;
    }
    next.id = identity(next);
    const saved = byId.get(next.id);
    if (saved) {
      if (sameImportedNote(saved, next)) counts.unchanged++;
      else conflict(note, 'existing-note-differs');
      continue;
    }
    if (notebook.records.length >= 10_000) {
      conflict(note, 'notebook-limit');
      continue;
    }
    notebook.records.push(next);
    byId.set(next.id, next);
    counts.imported++;
  }
  if (counts.imported) {
    validateNotebook(notebook, project.id);
    await fs.mkdir(targetDirectory, { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify(notebook, null, 2), { flag: 'wx', mode: 0o600 });
      let current = null;
      try {
        current = await fs.readFile(target);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (before === null ? current !== null : current === null || !before.equals(current))
        throw new Error(
          'Active lexical notes changed during import; stop the server before retrying.',
        );
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }
  return { counts, conflicts };
}
module.exports = { importDesktopLexicalNotes };

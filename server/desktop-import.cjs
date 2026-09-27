'use strict';
// Explicit, stopped-server recovery only. Nothing here publishes source text,
// approves a reference, runs contributor code or assigns invented authorship.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const validate = require('../electron/validation.cjs');
const { same, identifier } = require('./store.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const FILE_SHA = /^sha256:[a-f0-9]{64}$/;
const CONTENT_FIELDS = ['raw', 'diplomatic', 'normalized', 'translation', 'notes', 'analysis', 'locators', 'translations', 'canvas', 'workflow', 'aiInput', 'pending'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function passageMappings(incoming, current) {
  const result = Object.create(null);
  for (const item of incoming) {
    identifier(item.id); identifier(item.sourceId);
    const source = current.filter(p => p.sourceId === item.sourceId);
    const file = source.filter(p => Number.isSafeInteger(item.ordinal) && item.ordinal > 0 && FILE_SHA.test(item.sourceFileFingerprint || '') &&
      p.sourceFileFingerprint === item.sourceFileFingerprint && p.ordinal === item.ordinal);
    const candidates = source.filter(p => typeof item.sourceFingerprint === 'string' && item.sourceFingerprint.length > 0 && p.sourceFingerprint === item.sourceFingerprint);
    const exact = candidates.filter(p => p.id === item.id);
    const selected = file.length === 1 ? file : exact.length === 1 ? exact : candidates;
    if (selected.length === 1) result[item.id] = selected[0].id;
  }
  const counts = new Map();
  for (const id of Object.values(result)) counts.set(id, (counts.get(id) || 0) + 1);
  return Object.fromEntries(Object.entries(result).filter(([, id]) => counts.get(id) === 1));
}

function sourceDefaults(passage) {
  const witness = passage.witness || {};
  return { raw: passage.sourceExpression, diplomatic: passage.diplomatic, normalized: passage.normalized,
    translation: passage.translation, notes: passage.notes, analysis: passage.analysis ?? null,
    locators: { printedPage: witness.printedPage ?? '', folio: witness.folio ?? '',
      line: witness.textualLine == null ? '' : String(witness.textualLine), section: witness.section ?? '', subsection: witness.subsection ?? '',
      ...(witness.prayerName ? { prayerName: witness.prayerName } : {}) },
    ...(passage.translations ? { translations: passage.translations } : {}) };
}
function sameReading(draft, passage) {
  const source = sourceDefaults(passage);
  return ['diplomatic', 'normalized', 'translation', 'notes'].every(field => draft[field] === source[field]) &&
    same(draft.translations || {}, source.translations || {}) &&
    Object.keys(source.locators).every(field => (draft.locators?.[field] ?? source.locators[field]) === source.locators[field]);
}
function remapDraft(draft, oldPassage, target, id, mappings, report) {
  const next = structuredClone(draft); next.passageId = id;
  if (oldPassage && target) {
    const current = [oldPassage.sourceFingerprint, oldPassage.legacyEditorialFingerprint].filter(Boolean);
    if (current.includes(draft.sourceFingerprint) ||
        (draft.sourceFingerprint === oldPassage.legacyExpressionFingerprint && sameReading(draft, target)))
      next.sourceFingerprint = target.sourceFingerprint;
    else report.staleDrafts.push({ passageId: draft.passageId, mappedPassageId: id, sourceFingerprint: draft.sourceFingerprint });
  }
  if (next.pending) {
    for (const key of ['previousPassageId', 'beforePassageId']) {
      const original = next.pending[key];
      if (original && mappings[original]) next.pending[key] = mappings[original];
      else if (original && !original.startsWith('pending:')) report.unresolvedAnchors.push({ passageId: draft.passageId, field: key, anchor: original });
    }
  }
  return next;
}

function mergeDraft(before, incoming, baseline, pristine) {
  if (!before) return { draft: incoming, conflicts: [] };
  const merged = structuredClone(before), conflicts = [];
  const mergeField = (field, target, candidate, base, label = field) => {
    if (same(target[field], candidate[field])) return;
    if (pristine || same(target[field], base?.[field])) target[field] = structuredClone(candidate[field]);
    else conflicts.push(label);
  };
  for (const field of CONTENT_FIELDS) {
    if (!Object.hasOwn(incoming, field)) continue;
    // Canvas/analysis/completion belong to a reading. Never attach them to a
    // different server reading just because those optional fields were absent.
    if (['canvas', 'analysis', 'workflow'].includes(field) && incoming.raw !== undefined && merged.raw !== incoming.raw) {
      if (!same(before[field], incoming[field])) conflicts.push(field);
      continue;
    }
    if (['locators', 'translations', 'aiInput'].includes(field) && incoming[field] && typeof incoming[field] === 'object') {
      merged[field] ||= {};
      for (const key of Object.keys(incoming[field])) mergeField(key, merged[field], incoming[field], baseline?.[field], field + '.' + key);
    } else if (field === 'workflow' && before.workflow?.stage === incoming.workflow?.stage) {
      // Existing explicit completion keeps its own original timestamp.
    } else mergeField(field, merged, incoming, baseline);
  }
  // Desktop acceptance receipts are historical authoritative data in a private
  // archive, not browser-supplied approvals. Preserve both sets without editing.
  if (incoming.aiAcceptances) {
    const receipts = new Map((before.aiAcceptances || []).map(item => [item.operationId, structuredClone(item)]));
    for (const receipt of incoming.aiAcceptances) {
      if (!receipts.has(receipt.operationId)) receipts.set(receipt.operationId, structuredClone(receipt));
      else if (!same(receipts.get(receipt.operationId), receipt)) conflicts.push('aiAcceptances.' + receipt.operationId);
    }
    merged.aiAcceptances = [...receipts.values()];
  }
  if (pristine || same(before.raw, baseline?.raw)) merged.sourceFingerprint = incoming.sourceFingerprint;
  return { draft: merged, conflicts };
}

async function importDesktopDrafts(store, { snapshotSha256, archivePath, sourceProject, envelope, targetProject,
  selectedPassageId = null, ownerUserId = null, dryRun = false }) {
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256)) throw new Error('Invalid desktop snapshot SHA-256.');
  validate.envelope(envelope);
  if (envelope.projectId !== sourceProject.id) throw new Error('Desktop project/envelope mismatch.');
  if (!Array.isArray(sourceProject.passages) || !Array.isArray(targetProject.passages)) throw new Error('Project passages are required.');
  if (ownerUserId !== null) { identifier(ownerUserId); if (!await store.user(ownerUserId)) throw new Error('Unknown desktop owner.'); }
  return store.db.transaction(async () => {
    const prior = await store.db.prepare('SELECT receipt FROM desktop_imports WHERE snapshot_sha256=$1').get(snapshotSha256);
    if (prior) {
      if (prior.receipt.projectId !== targetProject.id) throw new Error('Desktop snapshot already belongs to another hosted project.');
      return { ...prior.receipt, alreadyImported: true };
    }
    const saved = await store.snapshot(targetProject.id);
    if (!saved.envelope) throw new Error('Open/seed the target project before importing desktop drafts.');
    const next = structuredClone(saved.envelope), targetIds = new Set(targetProject.passages.map(p => p.id));
    const byOldId = new Map(sourceProject.passages.map(p => [p.id, p])), byTargetId = new Map(targetProject.passages.map(p => [p.id, p]));
    const mappings = passageMappings(sourceProject.passages, targetProject.passages);
    const report = { version: 1, snapshotSha256, projectId: targetProject.id, sourceProjectId: sourceProject.id,
      archivePath, importedAt: new Date(store.now()).toISOString(), ownerUserId, origin: 'desktop',
      passageMappings: mappings, archiveMappings: {}, conflicts: [], staleDrafts: [], unresolvedAnchors: [],
      selectedPassageId: selectedPassageId ? mappings[selectedPassageId] || selectedPassageId : null,
      counts: { desktopDrafts: Object.keys(envelope.drafts).length, mappedDrafts: 0, pendingDrafts: 0,
        archivedDrafts: 0, changedDrafts: 0, desktopComplete: 0, mappedComplete: 0, restoredComplete: 0, conflictCopies: 0 },
      originalEnvelope: structuredClone(envelope) };
    const sourceIds = new Set([...(targetProject.sources || []).map(s => s.id), ...targetProject.passages.map(p => p.sourceId)]);
    const histories = await store.db.prepare('SELECT DISTINCT ON (passage_id) passage_id,before_json FROM revisions WHERE project_id=$1 ORDER BY passage_id,id').all(targetProject.id);
    const initial = new Map(histories.map(row => [row.passage_id, row.before_json === null ? null : JSON.parse(row.before_json)]));
    const previousImports = await store.db.prepare("SELECT receipt->'passageMappings' AS mappings FROM desktop_imports WHERE project_id=$1 AND receipt->>'sourceProjectId'=$2").all(targetProject.id, sourceProject.id);
    function archive(oldId, draft, forceCopy = false) {
      let id = oldId;
      if (forceCopy || targetIds.has(id) || id.startsWith('pending:') || next.drafts[id] && !same(next.drafts[id], draft) || (saved.versions[id] && !next.drafts[id]))
        id = 'archive:desktop:' + sha(JSON.stringify(canonical(draft))).slice(0, 40);
      const copy = structuredClone(draft); copy.passageId = id;
      // Pending context remains intact in originalEnvelope/raw archive. A
      // historical archive row cannot masquerade as a new publishable shell.
      if (!id.startsWith('pending:')) delete copy.pending;
      if (next.drafts[id] && !same(next.drafts[id], copy)) throw new Error('Desktop archive identity collision.');
      next.drafts[id] = copy;
      report.archiveMappings[oldId] = id;
      report.counts.archivedDrafts++;
    }
    // Map all pending IDs first so chains can refer to later imported shells.
    for (const [oldId, draft] of Object.entries(envelope.drafts))
      if (oldId.startsWith('pending:') && draft.pending && sourceIds.has(draft.pending.sourceId) &&
          (!saved.versions[oldId] || saved.envelope.drafts[oldId] && previousImports.some(row => row.mappings[oldId] === oldId))) mappings[oldId] = oldId;
    for (const [oldId, original] of Object.entries(envelope.drafts)) {
      if (original.workflow?.stage === 'complete') report.counts.desktopComplete++;
      const id = mappings[oldId], target = byTargetId.get(id);
      if (!id || (!target && !oldId.startsWith('pending:'))) { archive(oldId, original); continue; }
      const incoming = remapDraft(original, byOldId.get(oldId), target, id, mappings, report);
      if (target) { report.counts.mappedDrafts++; if (original.workflow?.stage === 'complete') report.counts.mappedComplete++; }
      else report.counts.pendingDrafts++;
      const before = next.drafts[id], version = saved.versions[id] || 0;
      if (!before && version) { archive(oldId, original, true); report.conflicts.push({ passageId: oldId, mappedPassageId: id, fields: ['deleted-on-server'] }); continue; }
      const pristine = !initial.has(id) && version <= 1;
      const baseline = initial.has(id) ? initial.get(id) : target ? sourceDefaults(target) : null;
      const merged = mergeDraft(before, incoming, baseline, pristine);
      if (merged.conflicts.length) {
        archive(oldId, original, true); report.counts.conflictCopies++;
        report.conflicts.push({ passageId: oldId, mappedPassageId: id, fields: merged.conflicts });
      }
      if (!same(before, merged.draft)) {
        // New server revision; original desktop revision and timestamps remain
        // exact in the receipt and immutable archive.
        merged.draft.revisionId = randomUUID();
        merged.draft.updatedAt = new Date(store.now()).toISOString();
      }
      next.drafts[id] = merged.draft;
      if (original.workflow?.stage === 'complete' && merged.draft.workflow?.stage === 'complete') report.counts.restoredComplete++;
    }
    validate.envelope(next);
    const changed = Object.keys(next.drafts).filter(id => !same(saved.envelope.drafts[id], next.drafts[id]));
    report.counts.changedDrafts = changed.length;
    if (dryRun) return { ...report, dryRun: true };
    for (const id of changed) {
      const before = saved.envelope.drafts[id] || null, after = next.drafts[id];
      await store.db.prepare('INSERT INTO drafts VALUES($1,$2,$3,$4) ON CONFLICT(project_id,passage_id) DO UPDATE SET version=excluded.version,data=excluded.data')
        .run(targetProject.id, id, (saved.versions[id] || 0) + 1, JSON.stringify(after));
      await store.db.prepare('INSERT INTO revisions(project_id,passage_id,user_id,at,before_json,after_json) VALUES($1,$2,$3,$4,$5,$6)')
        .run(targetProject.id, id, ownerUserId, store.now(), before ? JSON.stringify(before) : null, JSON.stringify(after));
      await store.audit(ownerUserId, 'desktop.import.draft', id, 'succeeded', null, 'server', { snapshotSha256, sourceProjectId: sourceProject.id });
    }
    if (changed.length) await store.db.prepare('UPDATE projects SET revision=revision+1 WHERE id=$1').run(targetProject.id);
    if (ownerUserId && report.selectedPassageId && next.drafts[report.selectedPassageId])
      await store.db.prepare('INSERT INTO selections VALUES($1,$2) ON CONFLICT DO NOTHING').run(ownerUserId, report.selectedPassageId);
    await store.db.prepare('INSERT INTO desktop_imports VALUES($1,$2,$3,$4)').run(snapshotSha256, targetProject.id, store.now(), report);
    await store.audit(ownerUserId, 'desktop.import', null, 'succeeded', null, 'server', { snapshotSha256, counts: report.counts });
    return report;
  }, { readOnly: dryRun });
}

async function readDesktopBundle(directory) {
  const base = await fs.realpath(directory), snapshotSha256 = path.basename(base);
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256)) throw new Error('Desktop import directory must use the archive SHA-256.');
  async function read(relative, expected, limit) {
    if (typeof relative !== 'string' || relative.includes('\\') || relative.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(relative)) throw new Error('Unsafe desktop import path.');
    const target = path.resolve(base, relative);
    if (await fs.realpath(target) !== target) throw new Error('Desktop import symlinks are forbidden.');
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid desktop import file.');
    const bytes = await fs.readFile(target);
    if (expected && sha(bytes) !== expected) throw new Error('Desktop import checksum mismatch.');
    return JSON.parse(bytes.toString('utf8'));
  }
  const manifest = await read('manifest.json', null, 32 * 1024 * 1024);
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.project?.id !== manifest.projectId) throw new Error('Invalid desktop manifest.');
  const rows = manifest.files.filter(file => file.kind === 'drafts' && (!file.projectId || file.projectId === manifest.projectId));
  if (rows.length !== 1) throw new Error('Expected exactly one selected desktop draft envelope.');
  if (!/^[a-f0-9]{64}$/.test(rows[0].sha256 || '')) throw new Error('Missing desktop draft checksum.');
  const envelope = await read(rows[0].path, rows[0].sha256, validate.LIMITS.draftBytes);
  return { snapshotSha256, archivePath: 'desktop-imports/' + snapshotSha256,
    sourceProject: manifest.project, selectedPassageId: manifest.selectedPassageId || null, envelope, manifest };
}

// Inspect with a disposable identity registry. Even its routine registry save
// must not modify server state during a dry run.
async function createReadOnlyInspector(settings) {
  const { PythonWorker } = require('../electron/python-worker.cjs');
  const temporary = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'studio-desktop-inspect-'));
  let worker;
  try {
    const registry = path.join(settings.stateDirectory, 'projects');
    for (const name of await fs.readdir(registry).catch(error => { if (error.code === 'ENOENT') return []; throw error; }))
      if (name.endsWith('.ids.json')) await fs.copyFile(path.join(registry, name), path.join(temporary, name));
    const workerEnv = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'VIRTUAL_ENV'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    worker = new PythonWorker({ executable: settings.python, script: path.join(settings.applicationDirectory, 'python/worker.py'), stateDirectory: temporary,
      spawnProcess: (file, args, options) => require('node:child_process').spawn(file, args, { ...options,
        env: { ...workerEnv, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' } }) });
    const project = validate.project(await worker.request('open_project', { parentPath: settings.parent }));
    return { project,
      inspectLexicon: params => {
        if (params.projectId !== project.id) throw new Error('Lexical inspection project mismatch.');
        return worker.request('passage_lexicon', params);
      },
      inspectExpression: raw => worker.request('parse_expression', { raw, revisionId: 'desktop-import-inspection' }),
      close: async () => { worker.close(); await fs.rm(temporary, { recursive: true, force: true }); } };
  } catch (error) { worker?.close(); await fs.rm(temporary, { recursive: true, force: true }); throw error; }
}

async function main() {
  const args = process.argv.slice(2), directoryIndex = args.indexOf('--directory');
  const dryRun = args.includes('--dry-run');
  if (directoryIndex < 0 || !args[directoryIndex + 1]) throw new Error('Use --directory <retained desktop snapshot> [--dry-run].');
  const { config } = require('./config.cjs'), { Store } = require('./store.cjs'), { createStudio } = require('./studio.cjs');
  const settings = config(), directory = path.resolve(args[directoryIndex + 1]);
  if (path.dirname(directory) !== path.join(settings.stateDirectory, 'desktop-imports')) throw new Error('Desktop snapshot must be retained inside the configured state directory.');
  const bundle = await readDesktopBundle(directory);
  // Opening normally applies migrations. Dry runs use the existing schema and
  // require a deployed database, without seeding drafts or writing a receipt.
  const store = dryRun ? new Store(settings.stateDirectory, { validateEnvelope: validate.envelope }) :
    await Store.open(settings.stateDirectory, { validateEnvelope: validate.envelope });
  let runtime, inspector;
  try {
    if (!dryRun) { await store.db.ownWorkspace(); runtime = await createStudio(settings, store); }
    inspector = await createReadOnlyInspector(settings);
    const project = dryRun ? inspector.project : runtime.project;
    if (inspector.project.id !== project.id) throw new Error('Current project identity changed during desktop import.');
    const report = await importDesktopDrafts(store, { ...bundle, targetProject: project, dryRun });
    const receipt = { ...report }; delete receipt.originalEnvelope;
    const { importDesktopEvidence } = require('./desktop-evidence-import.cjs');
    receipt.evidence = await importDesktopEvidence({ directory, manifest: bundle.manifest, receipt,
      project, stateDirectory: settings.stateDirectory, dryRun });
    if (!dryRun) {
      const { importDesktopLexicalNotes } = require('./desktop-lexical-import.cjs');
      receipt.lexicalNotes = await importDesktopLexicalNotes({ directory, manifest: bundle.manifest, receipt,
        stateDirectory: settings.stateDirectory, project, drafts: (await store.snapshot(project.id)).envelope.drafts,
        inspectLexicon: inspector.inspectLexicon, inspectExpression: inspector.inspectExpression });
      const target = path.join(directory, 'receipt.json'), temporary = target + '.' + randomUUID() + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, target);
    }
    console.log(JSON.stringify({ snapshotSha256: report.snapshotSha256, projectId: report.projectId, counts: report.counts,
      conflicts: report.conflicts.length, staleDrafts: report.staleDrafts.length, lexicalNotes: receipt.lexicalNotes?.counts,
      evidence: receipt.evidence,
      alreadyImported: !!report.alreadyImported, dryRun }));
  } finally { await inspector?.close(); await runtime?.close(); await store.close(); }
}

module.exports = { passageMappings, importDesktopDrafts, readDesktopBundle, createReadOnlyInspector };
if (require.main === module) main().catch(error => { console.error('Desktop import failed: ' + error.message); process.exitCode = 1; });

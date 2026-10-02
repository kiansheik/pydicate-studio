'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto');
const { createTestStore } = require('./helpers.cjs');
const validate = require('../../runtime/validation.cjs');
const { passageMappings, importDesktopDrafts, readDesktopBundle } = require('../desktop-import.cjs');
const at = '2026-09-26T12:00:00.000Z', digest = 'a'.repeat(64), file = 'sha256:' + 'f'.repeat(64);
function passage(id, ordinal = 1, overrides = {}) {
  return { id, ordinal, sourceId: 'araujo', sourceFingerprint: 'editorial:' + id,
    sourceFileFingerprint: file, legacyExpressionFingerprint: 'legacy:' + id,
    sourceExpression: 'N("amen")', diplomatic: 'Amen', normalized: 'amen', translation: '', notes: '',
    analysis: null, witness: {}, ...overrides };
}
function draft(p, overrides = {}) {
  return { passageId: p.id, revisionId: 'revision:' + p.id, sourceFingerprint: p.sourceFingerprint,
    raw: p.sourceExpression, diplomatic: p.diplomatic, normalized: p.normalized, translation: p.translation,
    notes: p.notes, analysis: null, updatedAt: at, ...overrides };
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-desktop-import-'));
  const store = await createTestStore(directory, { validateEnvelope: validate.envelope, now: () => Date.parse(at) + 1000 });
  t.after(async () => { await store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const sourceProject = { id: 'desktop:project', sources: [{ id: 'araujo' }], passages: [passage('desktop:a'), passage('desktop:b', 2)] };
  const targetProject = { id: 'hosted:project', sources: sourceProject.sources, passages: [passage('hosted:a'), passage('hosted:b', 2)] };
  await store.seed(targetProject);
  const envelope = { version: 1, projectId: sourceProject.id, drafts: Object.fromEntries(sourceProject.passages.map(p => [p.id, draft(p)])) };
  const options = { snapshotSha256: digest, archivePath: 'desktop-imports/' + digest, sourceProject, targetProject, envelope };
  return { store, options, sourceProject, targetProject, envelope };
}
test('portable identity requires unique exact file and ordinal or editorial identity', () => {
  assert.deepEqual(passageMappings([passage('old')], [passage('new')]), { old: 'new' });
  assert.deepEqual(passageMappings([passage('old')], [passage('new', 1, { sourceFileFingerprint: 'sha256:' + 'e'.repeat(64) })]), {});
  assert.deepEqual(passageMappings([passage('old'), passage('duplicate')], [passage('new')]), {});
  assert.deepEqual(passageMappings([passage('old')], [passage('new'), passage('duplicate')]), {});
  assert.deepEqual(passageMappings([passage('old', undefined, { ordinal: undefined, sourceFingerprint: undefined })], [passage('new', undefined, { ordinal: undefined, sourceFingerprint: undefined })]), {});
});
test('restores complete workflow, raw work, canvas, pending anchors and orphan history atomically', async t => {
  const { store, options, envelope } = await fixture(t);
  Object.assign(envelope.drafts['desktop:a'], {
    workflow: { stage: 'complete', updatedAt: at }, raw: 'N("saved work")', notes: 'Desktop annotation',
    translations: { pt: 'Tradução', en: 'Translation' },
    canvas: { fragments: [{ id: 'draft1', raw: 'N("part")', x: 14, y: 28 }], positions: { 'main:root': { x: 9, y: 7 } }, layout: 'horizontal' },
    aiInput: { tentativeReading: 'reading', meaning: 'meaning', constraints: 'constraints' },
    aiAcceptances: [{ operationId: 'receipt:1', jobId: 'job:1', candidateId: 'candidate:1', candidateRevision: 'candidate:2', baseRevisionId: 'revision:0', revisionId: 'revision:1', at }],
  });
  envelope.drafts['desktop:b'].sourceFingerprint = 'stale:original';
  envelope.drafts['desktop:b'].workflow = { stage: 'complete', updatedAt: at };
  envelope.drafts['orphan:old'] = draft(passage('orphan:old'), { raw: 'unrecognized historical syntax', workflow: { stage: 'complete', updatedAt: at } });
  envelope.drafts['pending:new'] = draft(passage('pending:new'), { pending: { sourceId: 'araujo', ordinal: 3, previousPassageId: 'desktop:a', beforePassageId: 'desktop:b' } });
  const original = structuredClone(envelope), report = await importDesktopDrafts(store, { ...options, selectedPassageId: 'desktop:a' });
  const saved = (await store.snapshot(options.targetProject.id)).envelope.drafts;
  assert.equal(saved['hosted:a'].sourceFingerprint, 'editorial:hosted:a');
  for (const field of ['raw', 'notes', 'translations', 'canvas', 'workflow', 'aiInput', 'aiAcceptances'])
    assert.deepEqual(saved['hosted:a'][field], original.drafts['desktop:a'][field]);
  assert.equal(saved['hosted:b'].sourceFingerprint, 'stale:original');
  assert.deepEqual(saved['hosted:b'].workflow, original.drafts['desktop:b'].workflow);
  assert.deepEqual(saved['orphan:old'], original.drafts['orphan:old']);
  assert.deepEqual(saved['pending:new'].pending, { sourceId: 'araujo', ordinal: 3, previousPassageId: 'hosted:a', beforePassageId: 'hosted:b' });
  assert.deepEqual(report.originalEnvelope, original);
  assert.deepEqual(envelope, original);
  assert.equal(report.selectedPassageId, 'hosted:a');
  assert.equal(report.counts.desktopComplete, 3);
  assert.equal(report.counts.restoredComplete, 2);
  assert.equal(report.counts.archivedDrafts, 1);
  assert.equal(report.staleDrafts.length, 1);
  const revisions = await store.db.prepare('SELECT user_id FROM revisions').all();
  assert.equal(revisions.length, 4);
  assert.ok(revisions.every(row => row.user_id === null));
  assert.equal((await store.db.prepare('SELECT count(*) n FROM migration_receipts').get()).n, 0);
  await assert.rejects(store.db.query('DELETE FROM desktop_imports'), /append-only/);
  const repeat = await importDesktopDrafts(store, options);
  assert.equal(repeat.alreadyImported, true);
  assert.equal((await store.db.prepare('SELECT count(*) n FROM revisions').get()).n, 4);
  assert.deepEqual((await store.snapshot(options.targetProject.id)).envelope.drafts, saved);
});
test('server edits survive, empty untouched fields merge, conflicting reading gets a visible archive copy', async t => {
  const { store, options, envelope } = await fixture(t);
  await store.db.prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)').run('editor', 'editor@example.org', 'Editor', 'contributor', 'test-only', 1);
  const user = store.publicUser(await store.user('editor')), before = await store.snapshot(options.targetProject.id);
  const changed = { ...before.envelope.drafts['hosted:a'], raw: 'N("server work")', notes: 'Server notes', revisionId: 'server:revision' };
  await store.patch(options.targetProject.id, [{ id: 'hosted:a', version: 1, draft: changed }], user, 'test-tab');
  Object.assign(envelope.drafts['desktop:a'], { raw: 'N("desktop work")', notes: 'Desktop notes', translations: { en: 'Preserved extra translation' }, workflow: { stage: 'complete', updatedAt: at } });
  const report = await importDesktopDrafts(store, options), saved = (await store.snapshot(options.targetProject.id)).envelope.drafts;
  assert.equal(saved['hosted:a'].raw, changed.raw);
  assert.equal(saved['hosted:a'].notes, changed.notes);
  assert.equal(saved['hosted:a'].workflow, undefined);
  assert.equal(saved['hosted:a'].translations.en, 'Preserved extra translation');
  assert.equal(report.conflicts.length, 1);
  assert.deepEqual(report.conflicts[0].fields.sort(), ['notes', 'raw', 'workflow']);
  const archiveId = report.archiveMappings['desktop:a'];
  assert.match(archiveId, /^archive:desktop:/);
  assert.equal(saved[archiveId].raw, envelope.drafts['desktop:a'].raw);
  assert.equal(saved[archiveId].workflow.stage, 'complete');
  const differentArchive = await importDesktopDrafts(store, { ...options, snapshotSha256: 'b'.repeat(64) });
  assert.equal(differentArchive.archiveMappings['desktop:a'], archiveId);
  assert.equal(differentArchive.counts.changedDrafts, 0);
  assert.deepEqual((await store.snapshot(options.targetProject.id)).envelope.drafts, saved);
});
test('a changed archive with identical drafts does not duplicate the restored pending draft', async t => {
  const { store, options, envelope } = await fixture(t);
  envelope.drafts['pending:new'] = draft(passage('pending:new'), { pending: { sourceId: 'araujo', ordinal: 3, previousPassageId: 'desktop:a' } });
  await importDesktopDrafts(store, options);
  const before = await store.snapshot(options.targetProject.id);
  const report = await importDesktopDrafts(store, { ...options, snapshotSha256: 'b'.repeat(64) });
  assert.equal(report.counts.pendingDrafts, 1);
  assert.equal(report.counts.archivedDrafts, 0);
  assert.equal(report.counts.changedDrafts, 0);
  assert.deepEqual(await store.snapshot(options.targetProject.id), before);
});
test('dry run has no effects, tombstones survive and unknown pending context remains in the immutable original', async t => {
  const { store, options, envelope } = await fixture(t);
  const pending = draft(passage('pending:old'), { pending: { sourceId: 'absent', ordinal: 1, previousPassageId: 'orphan:missing' } });
  envelope.drafts[pending.passageId] = pending;
  await store.db.prepare('INSERT INTO drafts VALUES($1,$2,2,NULL)').run(options.targetProject.id, 'orphan:deleted');
  envelope.drafts['orphan:deleted'] = draft(passage('orphan:deleted'));
  const before = await store.snapshot(options.targetProject.id);
  const preview = await importDesktopDrafts(store, { ...options, dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.deepEqual(await store.snapshot(options.targetProject.id), before);
  assert.equal((await store.db.prepare('SELECT count(*) n FROM desktop_imports').get()).n, 0);
  const report = await importDesktopDrafts(store, options), after = await store.snapshot(options.targetProject.id);
  assert.equal(after.versions['orphan:deleted'], 2);
  assert.equal(after.envelope.drafts['orphan:deleted'], undefined);
  assert.equal(after.envelope.drafts[report.archiveMappings['pending:old']].pending, undefined);
  assert.deepEqual(report.originalEnvelope.drafts['pending:old'].pending, pending.pending);
});
test('drafts, revision history and import receipt roll back together if an insert fails', async t => {
  const { store, options, envelope } = await fixture(t);
  envelope.drafts['desktop:a'].workflow = { stage: 'complete', updatedAt: at };
  await store.db.query("CREATE FUNCTION reject_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic import failure'; END $$");
  await store.db.query('CREATE TRIGGER reject_import BEFORE INSERT ON desktop_imports FOR EACH ROW EXECUTE FUNCTION reject_import()');
  const before = await store.snapshot(options.targetProject.id);
  await assert.rejects(importDesktopDrafts(store, options), /synthetic import failure/);
  assert.deepEqual(await store.snapshot(options.targetProject.id), before);
  assert.equal((await store.db.prepare('SELECT count(*) n FROM revisions').get()).n, 0);
  assert.equal((await store.db.prepare('SELECT count(*) n FROM audit').get()).n, 0);
});
test('bundle reader checks selected project, checksum and relative paths without changing archived bytes', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-desktop-bundle-')), directory = path.join(base, digest);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'files'), { recursive: true });
  const project = { id: 'desktop:test', passages: [passage('old')] };
  const envelope = { version: 1, projectId: project.id, drafts: { old: draft(project.passages[0]) } };
  const bytes = JSON.stringify(envelope, null, 2) + '\n';
  const row = { path: 'files/drafts.json', kind: 'drafts', projectId: project.id, sha256: createHash('sha256').update(bytes).digest('hex') };
  const manifest = { version: 1, projectId: project.id, project, selectedPassageId: 'old', files: [row] };
  await fs.writeFile(path.join(directory, row.path), bytes);
  const save = () => fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  await save();
  assert.deepEqual((await readDesktopBundle(directory)).envelope, envelope);
  assert.equal(await fs.readFile(path.join(directory, row.path), 'utf8'), bytes);
  row.sha256 = '0'.repeat(64); await save();
  await assert.rejects(readDesktopBundle(directory), /checksum mismatch/);
  row.path = '../drafts.json'; await save();
  await assert.rejects(readDesktopBundle(directory), /Unsafe desktop import path/);
});

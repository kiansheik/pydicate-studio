'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createTestStore } = require('./helpers.cjs');
const { createStudio } = require('../studio.cjs');

test('hosted contributor creates an empty source, attaches a PDF and restores its first pending passage', {
  skip: !process.env.COLLAB_REAL_PROJECT, timeout: 120000,
}, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-sources-'));
  const corpus = path.join(directory, 'oldtupicorpus');
  fs.mkdirSync(corpus);
  for (const name of ['historic', 'authoring', 'ground_truth'])
    fs.cpSync(path.join(process.env.COLLAB_REAL_PROJECT, 'oldtupicorpus', name), path.join(corpus, name), { recursive: true });
  fs.symlinkSync(path.join(process.env.COLLAB_REAL_PROJECT, 'nhe-enga'), path.join(directory, 'nhe-enga'), 'dir');
  execFileSync('git', ['init', '--quiet', corpus]);
  execFileSync('git', ['-C', corpus, 'add', '.']);
  execFileSync('git', ['-C', corpus, '-c', 'user.name=Studio Test', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'disposable fixture']);
  const stateDirectory = path.join(directory, 'state');
  const store = await createTestStore(stateDirectory, { validateEnvelope: require('../../runtime/validation.cjs').envelope });
  await store.db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)', ['source-author', 'author@example.invalid', 'Author', 'contributor', 'fixture', Date.now()]);
  const context = { user: store.publicUser(await store.user('source-author')), clientId: 'source-tab' };
  const config = { stateDirectory, applicationDirectory: path.resolve(__dirname, '../..'), parent: directory, python: process.env.PYDICATE_PYTHON || 'python3' };
  let runtime;
  t.after(async () => { await runtime?.close(); await store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  runtime = await createStudio(config, store);
  const original = runtime.project.passages.length;
  const created = await runtime.invoke('source_create', { sourceId: 'new_witness', title: 'Novo testemunho', year: '1700' }, context);
  assert.equal(created.passages.length, original);
  assert.equal(created.sources.find(s => s.id === 'new_witness').passageCount, 0);
  const pendingId = 'pending:' + randomUUID(), evidenceId = pendingId.replace('pending:', 'passage:');
  const evidence = { sourceId: 'new_witness', passageId: evidenceId, expectedRevision: 0 };
  // Evidence loads before the first autosave, with the permanent reserved UUID.
  await runtime.invoke('evidence_status', evidence, context);
  const draft = { passageId: pendingId, revisionId: randomUUID(), sourceFingerprint: 'pending', raw: 'amen', analysis: null,
    diplomatic: 'Amen', normalized: '', translation: '', notes: '', updatedAt: new Date().toISOString(), pending: { sourceId: 'new_witness', ordinal: 1 } };
  await runtime.validateChanges([{ id: pendingId, version: 0, draft }]);
  await store.patch(created.id, [{ id: pendingId, version: 0, draft }], context.user, context.clientId);
  const pdf = path.join(directory, 'witness.pdf'); fs.writeFileSync(pdf, '%PDF-1.4\n% isolated managed-byte fixture\n%%EOF\n');
  const attached = await runtime.upload(pdf, evidence, context);
  assert.ok(attached.asset.id);
  const pdfParams = { projectId: runtime.project.id, sourceId: evidence.sourceId, assetId: attached.asset.id };
  const opened = await runtime.openPdf(pdfParams, context);
  assert.deepEqual(await opened.handle.readFile(), fs.readFileSync(pdf));
  await opened.handle.close();
  await assert.rejects(runtime.openPdf({ ...pdfParams, projectId: 'project:another' }, context), { code: 'PROJECT_MISMATCH' });
  await assert.rejects(runtime.openPdf({ ...pdfParams, sourceId: 'absent' }, context), { code: 'SOURCE_MISSING' });
  await assert.rejects(runtime.openPdf({ ...pdfParams, sourceId: created.passages[0].sourceId }, context), /PDF selecionado mudou/);
  await assert.rejects(runtime.upload(pdf, { ...evidence, replace: true }, context), { code: 'REVIEWER_REQUIRED' });
  await assert.rejects(runtime.upload(pdf, { ...evidence, sourceId: created.passages[0].sourceId }, context), { code: 'SOURCE_MISMATCH' });
  await assert.rejects(runtime.invoke('source_apply', { previewId: 'none' }, context), { code: 'REVIEWER_REQUIRED' });
  const evaluated = await runtime.invoke('evaluate_expression', { passageId: pendingId, sourceId: 'new_witness', raw: 'amen', revisionId: draft.revisionId }, context);
  assert.equal(evaluated.evaluationStatus, 'complete');
  await runtime.close(); runtime = await createStudio(config, store);
  assert.equal(runtime.project.sources.find(s => s.id === 'new_witness').title, 'Novo testemunho');
  assert.equal((await runtime.invoke('evidence_status', evidence, context)).asset.id, attached.asset.id);
  assert.equal((await store.snapshot(runtime.project.id)).envelope.drafts[pendingId].raw, 'amen');
  assert.equal(fs.existsSync(path.join(corpus, 'ground_truth/records/historic/new_witness.jsonl')), false);
});

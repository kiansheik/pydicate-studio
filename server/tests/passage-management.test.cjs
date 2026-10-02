'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createTestStore } = require('./helpers.cjs');
const { managePassages } = require('../passage-management.cjs');
const { envelope } = require('../../runtime/validation.cjs');

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-organize-'));
  const store = await createTestStore(directory, { passageClaims: false, validateEnvelope: envelope });
  t.after(async () => { await store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const project = { id: 'project:test', passages: ['passage:a', 'passage:b', 'passage:c'].map(id => ({
    id, sourceId: 'araujo', sourceFingerprint: 'source:1', sourceExpression: 'mo.var(2) * pyta',
    diplomatic: 'Mombytá', normalized: 'mombytá', translation: 'fazer ficar', notes: 'notes', witness: {},
  })) };
  await store.seed(project);
  for (const [id, role] of [['admin', 'admin'], ['other', 'contributor']])
    await store.db.prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)').run(id, id + '@example.org', id, role, 'test-only', 1);
  const admin = store.publicUser(await store.user('admin'));
  const run = async (action, passageId, orderedIds, user = admin, revision) => managePassages(store, project, {
    projectId: project.id, sourceId: 'araujo', action, passageId, orderedIds,
    storageRevision: revision ?? (await store.snapshot(project.id)).envelope.storageRevision,
  }, user, 'tab');
  return { store, project, admin, run };
}
test('admin reorder, duplicate, delete and restore preserve source and immutable history', async t => {
  const { store, project, admin, run } = await fixture(t);
  const ids = project.passages.map(p => p.id);
  const before = JSON.stringify(project);
  const initial = await store.snapshot(project.id);
  const original = initial.envelope.drafts[ids[0]];
  original.workflow = { stage: 'complete', updatedAt: original.updatedAt };
  original.aiAcceptances = [{ operationId: 'op', jobId: 'job', candidateId: 'c', candidateRevision: 'r', baseRevisionId: 'r0', revisionId: 'r1', at: original.updatedAt }];
  await store.patch(project.id, [{ id: ids[0], version: initial.versions[ids[0]], draft: original }], admin, 'tab', true);
  let saved = await run('reorder', ids[0], [ids[2], ids[0], ids[1]]);
  assert.equal(saved.envelope.drafts[ids[2]].organization.position, 0);
  saved = await run('duplicate', ids[0], [ids[2], ids[0], ids[1]]);
  const copy = saved.envelope.drafts[saved.selectedId];
  assert.equal(copy.raw, original.raw);
  assert.equal(copy.translation, original.translation);
  assert.equal(copy.workflow, undefined);
  assert.equal(copy.aiAcceptances, undefined);
  assert.equal(copy.sourceFingerprint, 'pending');
  assert.equal(copy.organization.position, 2);
  const copyId = copy.passageId;
  saved = await run('delete', copyId, [ids[2], ids[0], copyId, ids[1]]);
  assert.equal(saved.envelope.drafts[copyId].organization.deleted, true);
  saved = await run('restore', copyId, [ids[2], ids[0], ids[1]]);
  assert.equal(saved.envelope.drafts[copyId].organization.deleted, false);
  assert.equal(saved.envelope.drafts[copyId].organization.position, 2);
  assert.equal(saved.envelope.drafts[ids[0]].aiAcceptances.length, 1);
  assert.equal(JSON.stringify(project), before);
  const history = await store.db.prepare('SELECT before_json,after_json FROM revisions WHERE passage_id=$1 ORDER BY id').all(copyId);
  assert.equal(history.length, 3);
  assert.equal(JSON.parse(history[1].after_json).organization.deleted, true);
});
test('authorization, stale retries, source membership and autosave cannot corrupt organization', async t => {
  const { store, project, run } = await fixture(t);
  const ids = project.passages.map(p => p.id);
  const user = store.publicUser(await store.user('other'));
  const first = await store.snapshot(project.id);
  await assert.rejects(run('delete', ids[0], ids, user), { code: 'ADMIN_REQUIRED' });
  await assert.rejects(run('reorder', ids[0], [ids[0], ids[0], ids[2]]), { code: 'INVALID_ORDER' });
  let saved = await run('delete', ids[0], ids);
  await assert.rejects(run('delete', ids[0], ids, undefined, first.envelope.storageRevision), { code: 'DRAFT_CONFLICT' });
  await assert.rejects(store.patch(project.id, [{id: ids[0], version: saved.versions[ids[0]], draft: { ...saved.envelope.drafts[ids[0]], raw: 'lost' }}], user, 'other-tab'), { code: 'PASSAGE_DELETED' });
  const edit = { ...saved.envelope.drafts[ids[1]], raw: 'new', organization: { sourceId: 'evil', position: 100, deleted: true } };
  await store.patch(project.id, [{ id: ids[1], version: saved.versions[ids[1]], draft: edit }], user, 'other-tab');
  saved = await store.snapshot(project.id);
  assert.equal(saved.envelope.drafts[ids[1]].raw, 'new');
  assert.deepEqual(saved.envelope.drafts[ids[1]].organization, {sourceId: 'araujo', position: 0, deleted: false});
  await run('delete', ids[1], [ids[1], ids[2]]);
  await assert.rejects(run('delete', ids[2], [ids[2]]), { code: 'LAST_PASSAGE' });
});

'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestStore } = require('./helpers.cjs');
const { Submissions } = require('../submissions.cjs');
const { createSubmissionReview } = require('../submission-review.cjs');
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-review-'));
  const store = await createTestStore(dir, { passageClaims: false });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (const [id, role] of [
    ['author', 'contributor'],
    ['admin', 'admin'],
  ])
    await store.db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)', [
      id,
      id + '@example.invalid',
      id,
      role,
      'test',
      Date.now(),
    ]);
  const author = store.publicUser(await store.user('author')),
    admin = store.publicUser(await store.user('admin'));
  const project = {
    id: 'project:test',
    engineFingerprint: 'engine:test',
    passages: ['a', 'b'].map((id) => ({
      id: 'passage:' + id,
      sourceId: 'source',
      sourceExpression: 'old',
      sourceFingerprint: 'old',
      diplomatic: 'Old',
      normalized: '',
      translation: '',
      notes: '',
      witness: {},
    })),
  };
  await store.seed(project);
  const submissions = new Submissions(store),
    ids = [];
  for (const p of project.passages) {
    const saved = await store.snapshot(project.id),
      draft = { ...saved.envelope.drafts[p.id], raw: 'new', revisionId: randomUUID() };
    await store.patch(project.id, [{ id: p.id, version: 1, draft }], author, 'author-tab');
    ids.push(
      (await submissions.submit(author, { passageId: p.id, revisionId: draft.revisionId }, project))
        .id,
    );
  }
  const evidence = {
    projectId: project.id,
    sourceId: 'source',
    asset: { id: 'asset', managedState: 'ok' },
    passage: {
      regions: [{ id: 'crop', assetId: 'asset', pageIndex: 0, rect: [0, 0, 100, 50] }],
      view: { pageIndex: 0, rotation: 0 },
    },
  };
  const state = { surface: 'new form', approvalError: false, applied: [], approved: [] };
  const previews = new Map();
  const invoke = async (method, params) => {
    if (method === 'evaluate_expression')
      return {
        origin: 'engine',
        surface: state.surface,
        annotated: state.surface,
        expression: params.raw,
        revisionId: params.revisionId,
        engineFingerprint: project.engineFingerprint,
      };
    if (method === 'evidence_status') return structuredClone(evidence);
    if (method === 'source_preview' || method === 'source_new_preview') {
      const previewId = randomUUID();
      previews.set(previewId, params.newPassageId || params.passageId);
      return { previewId, diff: '+new', sourceFingerprint: 'file', raw: 'new' };
    }
    if (method === 'source_apply') {
      const id = previews.get(params.previewId);
      state.applied.push(id);
      let target = project.passages.find((p) => p.id === id);
      if (!target) {
        target = { id, sourceId: 'source', sourceExpression: 'new', sourceFingerprint: 'new' };
        project.passages.push(target);
      }
      Object.assign(target, { sourceExpression: 'new', sourceFingerprint: 'new' });
      return project;
    }
    if (method === 'reference_approve') {
      if (state.approvalError) throw new Error('reference failed');
      state.approved.push(params.passageId);
      return { project };
    }
    throw new Error(method);
  };
  const service = createSubmissionReview({ store, getProject: () => project, invoke }),
    context = { user: admin, clientId: 'admin-tab' };
  return { store, submissions, service, context, ids, state, evidence, project, author };
}
test('review previews are read-only; only explicitly published rows are incorporated, retry is idempotent', async (t) => {
  const f = await setup(t);
  const a = await f.service.prepare({ id: f.ids[0] }, f.context);
  await f.service.prepare({ id: f.ids[1] }, f.context);
  assert.equal(f.state.applied.length, 0);
  assert.equal(a.evaluation.surface, 'new form');
  assert.equal(a.evidence.passage.regions.length, 1);
  const result = await f.service.publish({ token: a.token }, f.context);
  assert.equal(result.approved, true);
  await f.service.publish({ token: a.token }, f.context);
  assert.deepEqual(f.state.applied, ['passage:a']);
  assert.deepEqual(f.state.approved, ['passage:a']);
  const rows = (await f.submissions.list(f.context.user, 0, f.project.id)).submissions;
  assert.equal(rows.find((r) => r.id === f.ids[0]).status, 'imported');
  assert.equal(rows.find((r) => r.id === f.ids[1]).status, 'submitted');
  assert.ok(rows[0].revisionId);
  assert.equal(rows[0].projectId, f.project.id);
});
test('changed output or PDF evidence invalidates the checked receipt before any write', async (t) => {
  const f = await setup(t),
    a = await f.service.prepare({ id: f.ids[0] }, f.context);
  f.state.surface = 'changed';
  await assert.rejects(f.service.publish({ token: a.token }, f.context), {
    code: 'REVIEW_CHANGED',
  });
  f.state.surface = 'new form';
  f.evidence.passage.regions[0].rect[0] = 2;
  await assert.rejects(f.service.publish({ token: a.token }, f.context), {
    code: 'REVIEW_CHANGED',
  });
  assert.equal(f.state.applied.length, 0);
});
test('later draft edits, other tabs, and non-admins cannot reuse a review', async (t) => {
  const f = await setup(t),
    a = await f.service.prepare({ id: f.ids[0] }, f.context);
  await assert.rejects(
    f.service.publish({ token: a.token }, { ...f.context, clientId: 'other-tab' }),
    { code: 'REVIEW_EXPIRED' },
  );
  await assert.rejects(
    f.service.prepare({ id: f.ids[0] }, { user: f.author, clientId: 'author-tab' }),
    { code: 'ADMIN_REQUIRED' },
  );
  const saved = await f.store.snapshot(f.project.id),
    draft = { ...saved.envelope.drafts['passage:a'], raw: 'later', revisionId: randomUUID() };
  await f.store.patch(
    f.project.id,
    [{ id: 'passage:a', version: saved.versions['passage:a'], draft }],
    f.author,
    'author-tab',
  );
  await assert.rejects(f.service.publish({ token: a.token }, f.context), { code: 'DRAFT_CHANGED' });
  assert.equal(f.state.applied.length, 0);
});
test('reference failure retains the applied source draft but does not mark the submission incorporated', async (t) => {
  const f = await setup(t),
    a = await f.service.prepare({ id: f.ids[0] }, f.context);
  f.state.approvalError = true;
  const result = await f.service.publish({ token: a.token }, f.context);
  assert.equal(result.approved, false);
  assert.equal(result.sourceApplied, true);
  assert.equal(result.error, 'reference failed');
  assert.equal(result.envelope.drafts['passage:a'].sourceFingerprint, 'new');
  assert.equal((await f.submissions.list(f.context.user)).submissions[0].status, 'submitted');
});
test('a chosen physical page can be reviewed without inventing saved crop evidence', async (t) => {
  const f = await setup(t);
  f.evidence.passage = null;
  await assert.rejects(f.service.prepare({ id: f.ids[0] }, f.context), {
    code: 'PDF_PAGE_REQUIRED',
  });
  const a = await f.service.prepare({ id: f.ids[0], pageIndex: 4 }, f.context);
  assert.deepEqual(a.evidence.passage.regions, []);
  assert.equal(a.evidence.passage.view.pageIndex, 4);
  const result = await f.service.publish({ token: a.token }, f.context);
  assert.equal(result.approved, true);
  assert.equal(f.evidence.passage, null);
});

test('publishing a pending passage adopts its canonical identity and preserves sibling insertion links', async (t) => {
  const f = await setup(t),
    id = 'pending:' + randomUUID(),
    sibling = 'pending:' + randomUUID();
  const base = (await f.store.snapshot(f.project.id)).envelope.drafts['passage:a'];
  const draft = {
    ...base,
    passageId: id,
    sourceFingerprint: 'pending',
    revisionId: randomUUID(),
    pending: { sourceId: 'source', ordinal: 3 },
  };
  await f.store.patch(
    f.project.id,
    [
      { id, version: 0, draft },
      {
        id: sibling,
        version: 0,
        draft: {
          ...draft,
          passageId: sibling,
          revisionId: randomUUID(),
          pending: { sourceId: 'source', ordinal: 4, previousPassageId: id },
        },
      },
    ],
    f.author,
    'author-tab',
  );
  const sent = await f.submissions.submit(
    f.author,
    { passageId: id, revisionId: draft.revisionId },
    f.project,
  );
  const review = await f.service.prepare({ id: sent.id }, f.context),
    result = await f.service.publish({ token: review.token }, f.context);
  assert.equal(result.approved, true);
  const canonical = id.replace('pending:', 'passage:');
  assert.equal(result.envelope.drafts[id], undefined);
  assert.equal(result.envelope.drafts[canonical].pending, undefined);
  assert.equal(result.envelope.drafts[sibling].pending.previousPassageId, canonical);
});

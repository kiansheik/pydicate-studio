'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestStore } = require('./helpers.cjs');
const { sourceDraft } = require('../store.cjs');
const { capturePublication, finalizePublication, recoverPublishedPassage, visibleIds, digest } = require('../publication-finalization.cjs');

async function setup(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-publication-'));
    const store = await createTestStore(directory, { passageClaims: false });
    t.after(async () => { await store.close(); await fs.rm(directory, { recursive: true, force: true }); });
    for (const [id, role] of [['admin', 'admin'], ['other', 'contributor']])
        await store.db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)', [id, id + '@example.invalid', id, role, 'test', Date.now()]);
    const user = store.publicUser(await store.user('admin'));
    const project = { id: 'project:test', engineFingerprint: 'engine', passages: ['a', 'b'].map(id => ({
        id: 'passage:' + id, sourceId: 'source', sourceExpression: id, sourceFingerprint: 'fp:' + id,
        diplomatic: id, normalized: '', translation: '', notes: '', witness: {},
    })) };
    await store.seed(project);
    const pendingId = 'pending:' + randomUUID(), canonicalId = pendingId.replace('pending:', 'passage:');
    const pending = { ...sourceDraft(project.passages[0]), passageId: pendingId, raw: 'new_tree', sourceFingerprint: 'pending',
        notes: 'author notes', revisionId: randomUUID(), canvas: { fragments: [], positions: { root: { x: 12, y: 28 } } },
        aiAcceptances: [{ id: 'retained-evidence' }],
        pending: { sourceId: 'source', ordinal: 2, previousPassageId: 'passage:a', beforePassageId: 'passage:b' } };
    await store.patch(project.id, [{ id: pendingId, version: 0, draft: pending }], user, 'publisher', true);
    const params = { passageId: pendingId, sourceId: 'source', newPassageId: canonicalId, raw: pending.raw };
    const receipt = await capturePublication(store, project, params);
    const target = { ...project.passages[0], id: canonicalId, sourceExpression: 'named_tree', sourceFingerprint: 'fp:new' };
    const nextProject = { ...project, engineFingerprint: 'engine:new', passages: [...project.passages.slice(0, 1), target, ...project.passages.slice(1)] };
    const run = (apply = async () => nextProject) => finalizePublication({ store, project, receipt, publishedRaw: 'named_tree', apply, user, clientId: 'publisher' });
    return { store, user, project, nextProject, target, pendingId, canonicalId, pending, params, receipt, run };
}

test('publication preserves authored metadata, retires pending identity, freezes visible order and records immutable history', async t => {
    const f = await setup(t), result = await f.run();
    const saved = await f.store.snapshot(f.project.id), canonical = saved.envelope.drafts[f.canonicalId];
    assert.equal(saved.envelope.drafts[f.pendingId], undefined);
    assert.equal(canonical.revisionId, f.pending.revisionId);
    assert.deepEqual(canonical.canvas, f.pending.canvas);
    assert.deepEqual(canonical.aiAcceptances, f.pending.aiAcceptances);
    assert.equal(canonical.notes, f.pending.notes);
    assert.equal(canonical.raw, f.target.sourceExpression);
    assert.equal(canonical.sourceFingerprint, f.target.sourceFingerprint);
    assert.equal(canonical.pending, undefined);
    assert.deepEqual(visibleIds(result, saved.envelope.drafts, 'source'), ['passage:a', f.canonicalId, 'passage:b']);
    assert.equal(result.draftPublication.storageRevision, saved.envelope.storageRevision);
    assert.ok(result.draftPublication.changes.some(c => c.id === f.pendingId && c.draft === null && c.version === 2));
    const revisions = await f.store.db.prepare('SELECT before_json,after_json FROM revisions WHERE passage_id=$1 ORDER BY id').all(f.pendingId);
    assert.equal(revisions.length, 2);
    assert.equal(revisions[1].after_json, null);
    assert.equal(JSON.parse(revisions[1].before_json).revisionId, f.pending.revisionId);
    await assert.rejects(f.store.patch(f.project.id, [{ id: f.pendingId, version: saved.versions[f.pendingId], draft: f.pending }], f.user, 'stale-tab'), { code: 'PASSAGE_PUBLISHED' });
});

test('a concurrent browser canonical save waits for finalization, then fails its stale version without duplicating the passage', async t => {
    const f = await setup(t);
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const publishing = f.run(async () => { enter(); await gate; return f.nextProject; });
    await entered;
    const autosave = assert.rejects(f.store.patch(f.project.id,
        [{ id: f.canonicalId, version: 0, draft: sourceDraft(f.target) }], f.user, 'other-tab'), { code: 'DRAFT_CONFLICT' });
    release();
    await publishing;
    await autosave;
    const saved = await f.store.snapshot(f.project.id);
    assert.equal(saved.envelope.drafts[f.pendingId], undefined);
    assert.equal(saved.envelope.drafts[f.canonicalId].revisionId, f.pending.revisionId);
});

test('a pending edit after preview prevents any source write and preserves both revisions', async t => {
    const f = await setup(t); let applied = false;
    await f.store.patch(f.project.id, [{ id: f.pendingId, version: 1, draft: { ...f.pending, notes: 'newer work' } }], f.user, 'other-tab', true);
    await assert.rejects(f.run(async () => { applied = true; return f.nextProject; }), { code: 'DRAFT_CONFLICT' });
    assert.equal(applied, false);
    assert.equal((await f.store.snapshot(f.project.id)).envelope.drafts[f.pendingId].notes, 'newer work');
});

test('publication accepts source-reader whitespace and the exact multiline serialization wrapper', async t => {
    for (const [publishedRaw, sourceExpression] of [
        ['  named_tree  ', 'named_tree'],
        ['(named_tree\n .copy())', '((named_tree\n .copy())\n)'],
        ['(named_tree\n .copy())', '((named_tree\n .copy())\n    )'],
    ]) await t.test(JSON.stringify(publishedRaw), async t => {
        const f = await setup(t);
        const next = { ...f.nextProject, passages: f.nextProject.passages.map(p =>
            p.id === f.canonicalId ? { ...p, sourceExpression } : p) };
        await finalizePublication({ ...f, receipt: f.receipt, publishedRaw, apply: async () => next, clientId: 'publisher' });
        const saved = await f.store.snapshot(f.project.id);
        assert.equal(saved.envelope.drafts[f.canonicalId].raw, sourceExpression);
        assert.equal(saved.envelope.drafts[f.pendingId], undefined);
    });
    await t.test('different inner expression still fails', async t => {
        const f = await setup(t);
        await assert.rejects(finalizePublication({ ...f, receipt: f.receipt,
            publishedRaw: '(different_tree\n .copy())', apply: async () => f.nextProject, clientId: 'publisher' }),
        { code: 'PUBLISHED_PASSAGE_MISSING' });
        assert.ok((await f.store.snapshot(f.project.id)).envelope.drafts[f.pendingId]);
    });
});

test('preview capture refuses mismatched identities, unsaved raw and preexisting canonical metadata', async t => {
    const f = await setup(t);
    for (const params of [{ ...f.params, raw: 'unsaved' }, { ...f.params, newPassageId: 'passage:other' }, { ...f.params, sourceId: 'other' }])
        await assert.rejects(capturePublication(f.store, f.project, params), { code: 'DRAFT_CONFLICT' });
    await f.store.patch(f.project.id, [{ id: f.canonicalId, version: 0, draft: sourceDraft(f.target) }], f.user, 'other-tab');
    await assert.rejects(f.run(), { code: 'PASSAGE_ALREADY_PUBLISHED' });
});

test('publishing the final pending row keeps earlier unpublished rows ahead of it and preserves administrator rank', async t => {
    const f = await setup(t);
    const earlierId = 'pending:' + randomUUID();
    const earlier = { ...f.pending, passageId: earlierId, revisionId: randomUUID(), raw: 'earlier', pending: {
        sourceId: 'source', ordinal: 3, previousPassageId: 'passage:b', beforePassageId: null,
    } };
    const last = { ...f.pending, pending: { ...f.pending.pending, ordinal: 4, previousPassageId: earlierId, beforePassageId: null } };
    await f.store.patch(f.project.id, [
        { id: earlierId, version: 0, draft: earlier },
        { id: f.pendingId, version: 1, draft: last },
    ], f.user, 'publisher', true);
    const saved = await f.store.snapshot(f.project.id);
    await f.store.patch(f.project.id, ['passage:b', 'passage:a'].map((id, position) => ({ id, version: saved.versions[id],
        draft: { ...saved.envelope.drafts[id], organization: { sourceId: 'source', position, deleted: false } } })), f.user, 'publisher', false, true);
    const before = await f.store.snapshot(f.project.id);
    const order = visibleIds(f.project, before.envelope.drafts, 'source');
    const receipt = await capturePublication(f.store, f.project, f.params);
    const result = await finalizePublication({ ...f, receipt, publishedRaw: 'named_tree', apply: async () => f.nextProject, clientId: 'publisher' });
    const after = await f.store.snapshot(f.project.id);
    assert.deepEqual(visibleIds(result, after.envelope.drafts, 'source'), order.map(id => id === f.pendingId ? f.canonicalId : id));
    assert.equal(after.envelope.drafts[earlierId].pending.beforePassageId, f.canonicalId);
    assert.equal(after.envelope.drafts[earlierId].revisionId, earlier.revisionId);
});

test('an unrelated hidden pending alias cannot hide its visible ranked canonical row during publication', async t => {
    const f = await setup(t), saved = await f.store.snapshot(f.project.id);
    const oldAlias = { ...saved.envelope.drafts['passage:a'], passageId: 'pending:a', sourceFingerprint: 'pending',
        pending: { sourceId: 'source', ordinal: 1, beforePassageId: 'pending:missing' },
        organization: { sourceId: 'source', position: 1, deleted: true } };
    await f.store.patch(f.project.id, [
        { id: 'pending:a', version: 0, draft: oldAlias },
        ...['passage:a', 'passage:b'].map((id, index) => ({ id, version: saved.versions[id],
            draft: { ...saved.envelope.drafts[id], organization: { sourceId: 'source', position: index * 2, deleted: false } } })),
    ], f.user, 'publisher', true, true);
    const before = await f.store.snapshot(f.project.id);
    assert.deepEqual(visibleIds(f.project, before.envelope.drafts, 'source'), ['passage:a', f.pendingId, 'passage:b']);
    const result = await f.run(), after = await f.store.snapshot(f.project.id);
    assert.deepEqual(visibleIds(result, after.envelope.drafts, 'source'), ['passage:a', f.canonicalId, 'passage:b']);
    assert.deepEqual(after.envelope.drafts['pending:a'], oldAlias, 'Unrelated hidden alias must remain untouched.');
    assert.equal(after.envelope.drafts['passage:a'].organization.deleted, false);
});

test('ranked rows, unranked canonical rows and anchored pending chains keep frontend ordering', () => {
    const project = { passages: ['a', 'b', 'c'].map(id => ({ id: 'passage:' + id, sourceId: 'source' })) };
    const drafts = {
        'passage:a': { passageId: 'passage:a', organization: { sourceId: 'source', position: 1, deleted: false } },
        'passage:b': { passageId: 'passage:b' },
        'passage:c': { passageId: 'passage:c', organization: { sourceId: 'source', position: 0, deleted: false } },
        'pending:first': { passageId: 'pending:first', pending: { sourceId: 'source', ordinal: 3, beforePassageId: 'pending:second' } },
        'pending:second': { passageId: 'pending:second', pending: { sourceId: 'source', ordinal: 4, beforePassageId: 'passage:b' } },
    };
    assert.deepEqual(visibleIds(project, drafts, 'source'), ['passage:c', 'passage:a', 'pending:first', 'pending:second', 'passage:b']);
});

test('source failure leaves metadata untouched; exact-pair recovery after a cross-resource failure remains explicit and guarded', async t => {
    const f = await setup(t), before = await f.store.snapshot(f.project.id);
    await assert.rejects(f.run(async () => { throw new Error('source failed'); }), /source failed/);
    assert.deepEqual(await f.store.snapshot(f.project.id), before);
    const canonical = { ...f.pending, passageId: f.canonicalId, raw: f.target.sourceExpression, sourceFingerprint: f.target.sourceFingerprint,
        revisionId: randomUUID(), canvas: { fragments: [], positions: {} } };
    delete canonical.pending;
    await f.store.patch(f.project.id, [{ id: f.canonicalId, version: 0, draft: canonical }], f.user, 'other-tab', true);
    const saved = await f.store.snapshot(f.project.id);
    const recovery = { store: f.store, project: f.nextProject, pendingId: f.pendingId, pendingVersion: saved.versions[f.pendingId],
        canonicalVersion: saved.versions[f.canonicalId], pendingDigest: digest(saved.envelope.drafts[f.pendingId]),
        canonicalDigest: digest(saved.envelope.drafts[f.canonicalId]), user: f.user, clientId: 'recovery' };
    await assert.rejects(recoverPublishedPassage({ ...recovery, pendingVersion: 0 }), { code: 'DRAFT_CONFLICT' });
    await assert.rejects(recoverPublishedPassage({ ...recovery, canonicalDigest: 'stale' }), { code: 'DRAFT_CONFLICT' });
    const patch = await recoverPublishedPassage(recovery);
    const recovered = await f.store.snapshot(f.project.id);
    assert.equal(recovered.envelope.drafts[f.pendingId], undefined);
    assert.equal(recovered.envelope.drafts[f.canonicalId].revisionId, f.pending.revisionId);
    assert.equal(patch.changes.find(c => c.id === f.canonicalId).draft.canvas.positions.root.x, 12);
    assert.deepEqual(visibleIds(f.nextProject, recovered.envelope.drafts, 'source'), ['passage:a', f.canonicalId, 'passage:b']);
});

test('recovery rejects meaningful canonical edits instead of overwriting a newer browser', async t => {
    const f = await setup(t);
    const canonical = { ...f.pending, passageId: f.canonicalId, raw: f.target.sourceExpression, sourceFingerprint: f.target.sourceFingerprint, notes: 'new canonical edit' };
    delete canonical.pending;
    await f.store.patch(f.project.id, [{ id: f.canonicalId, version: 0, draft: canonical }], f.user, 'other-tab', true);
    await assert.rejects(recoverPublishedPassage({ store: f.store, project: f.nextProject, pendingId: f.pendingId,
        pendingVersion: 1, canonicalVersion: 1, pendingDigest: digest(f.pending), canonicalDigest: digest(canonical), user: f.user, clientId: 'recovery' }), { code: 'DRAFT_CONFLICT' });
    assert.equal((await f.store.snapshot(f.project.id)).envelope.drafts[f.canonicalId].notes, 'new canonical edit');
    const cleared = { ...canonical, notes: '' };
    await f.store.patch(f.project.id, [{ id: f.canonicalId, version: 1, draft: cleared }], f.user, 'other-tab', true);
    await assert.rejects(recoverPublishedPassage({ store: f.store, project: f.nextProject, pendingId: f.pendingId,
        pendingVersion: 1, canonicalVersion: 2, pendingDigest: digest(f.pending), canonicalDigest: digest(cleared), user: f.user, clientId: 'recovery' }), { code: 'DRAFT_CONFLICT' });
    assert.equal((await f.store.snapshot(f.project.id)).envelope.drafts[f.canonicalId].notes, '');
});

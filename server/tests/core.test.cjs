const {createTestStore}=require('./helpers.cjs');
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Store } = require('../store.cjs');
const { Auth, hashPassword, checkPassword, IDLE_MS } = require('../auth.cjs');
const { config } = require('../config.cjs');
const { authorizeMethod, Queue } = require('../studio.cjs');
const secret = 'uma senha longa para teste';
async function fixture(t, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-collab-test-'));
    let now = 1000000;
    const store = await createTestStore(directory, { now: () => now, ...options });
    t.after(async () => { await store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    const project = { id: 'project:test', passages: ['passage:a', 'passage:b'].map(id => ({ id, sourceId: 'araujo', sourceFingerprint: 'source:1', sourceExpression: 'amen', diplomatic: 'Amen', normalized: 'amém', translation: '', notes: '', witness: {} })) };
    await store.seed(project);
    async function user(id, role = 'contributor') { await store.db.prepare("INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)").run(id, id + '@example.org', id, role, 'test-only-hash', now); return store.publicUser(await store.user(id)); }
    return { store, project, user, advance: ms => { now += ms; } };
}
function changed(snapshot, id, raw) { return { id, version: snapshot.versions[id] ?? 0, draft: { ...snapshot.envelope.drafts[id], raw, revisionId: 'revision:' + raw } }; }
test('configuration fails closed for plaintext or paths and permits explicit loopback development', () => {
    assert.throws(() => config({ COLLAB_PUBLIC_URL: 'http://example.org', COLLAB_ALLOW_HTTP: '1' }));
    assert.throws(() => config({ COLLAB_PUBLIC_URL: 'https://example.org/studio' }));
    assert.throws(() => config({ COLLAB_PUBLIC_URL: 'http://localhost', COLLAB_ALLOW_HTTP: '1', COLLAB_HOST: '0.0.0.0' }));
    assert.equal(config({ COLLAB_PUBLIC_URL: 'http://localhost', COLLAB_ALLOW_HTTP: '1' }).secure, false);
    assert.equal(config({}).secure, true);
});
test('independent passage edits merge, stale same-passage saves never overwrite', async (t) => {
    const { store, user, advance } = await fixture(t), alice = await user('alice'), bob = await user('bob');
    const first = await store.snapshot('project:test');
    await store.patch('project:test', [changed(first, 'passage:a', 'one')], alice, 'alice-tab');
    await store.patch('project:test', [changed(first, 'passage:b', 'two')], bob, 'bob-tab');
    assert.equal((await store.snapshot('project:test')).envelope.drafts['passage:a'].raw, 'one');
    advance(121000);
    await assert.rejects(async () => await store.patch('project:test', [changed(first, 'passage:a', 'lost')], bob, 'bob-tab'), { code: 'DRAFT_CONFLICT' });
    assert.equal((await store.snapshot('project:test')).envelope.drafts['passage:a'].raw, 'one');
});
test('claims isolate users and tabs, expire and can be released only by their owner', async (t) => {
    const { store, user, advance } = await fixture(t), a = await user('a'), b = await user('b');
    await store.assertClaim('passage:a', a, 'first-tab', true);
    await assert.rejects(async () => await store.assertClaim('passage:a', a, 'second-tab', true), { code: 'PASSAGE_BUSY' });
    await store.release('passage:a', b, 'first-tab');
    await assert.rejects(async () => await store.assertClaim('passage:a', b, 'first-tab', true));
    advance(120001);
    await store.assertClaim('passage:a', b, 'second-tab', true);
    assert.equal((await store.claimList())[0].userId, 'b');
});
test('atomic patches roll back every passage and strip forged AI receipts', async (t) => {
    const { store, user } = await fixture(t), a = await user('a'), base = await store.snapshot('project:test');
    const edit = changed(base, 'passage:a', 'valid');
    edit.draft.aiAcceptances = [{ fake: true }];
    await assert.rejects(async () => await store.patch('project:test', [edit, { id: 'passage:b', version: 88, draft: {} }], a, 'test-tab'));
    assert.equal((await store.snapshot('project:test')).envelope.drafts['passage:a'].raw, 'amen');
    await store.patch('project:test', [edit], a, 'test-tab');
    assert.equal((await store.snapshot('project:test')).envelope.drafts['passage:a'].aiAcceptances, undefined);
    assert.equal((await store.db.prepare("SELECT user_id FROM revisions").get()).user_id, 'a');
});
test('tombstones retain versions and canonical source drafts cannot be deleted', async (t) => {
    const { store, user } = await fixture(t), a = await user('a'), base = await store.snapshot('project:test'), id = 'pending:123';
    const draft = { ...base.envelope.drafts['passage:a'], passageId: id };
    await store.patch('project:test', [{ id, version: 0, draft }], a, 'test-tab');
    await store.patch('project:test', [{ id, version: 1, draft: null }], a, 'test-tab');
    assert.equal((await store.snapshot('project:test')).versions[id], 2);
    await assert.rejects(async () => await store.patch('project:test', [{ id, version: 0, draft }], a, 'test-tab'), { code: 'DRAFT_CONFLICT' });
    await assert.rejects(async () => await store.patch('project:test', [{ id: 'passage:a', version: 1, draft: null }], a, 'test-tab'), { code: 'DRAFT_DELETE' });
});
test('every acknowledged draft revision is preserved with before/after attribution', async (t) => {
    const { store, user, advance } = await fixture(t), a = await user('a');
    await store.patch('project:test', [changed(await store.snapshot('project:test'), 'passage:a', 'first')], a, 'test-tab');
    advance(500);
    await store.patch('project:test', [changed(await store.snapshot('project:test'), 'passage:a', 'second')], a, 'test-tab');
    let rows = await store.db.prepare("SELECT * FROM revisions").all();
    assert.equal(rows.length, 2);
    assert.equal(JSON.parse(rows[0].before_json).raw, 'amen');
    assert.equal(JSON.parse(rows[0].after_json).raw, 'first');
    assert.equal(JSON.parse(rows[1].after_json).raw, 'second');
    advance(31000);
    await store.patch('project:test', [changed(await store.snapshot('project:test'), 'passage:a', 'third')], a, 'test-tab');
    assert.equal((await store.db.prepare("SELECT count(*) n FROM revisions").get()).n, 3);
});
test('comments have server authors, bounded threads and reviewer resolution', async (t) => {
    const { store, user } = await fixture(t), a = await user('a'), b = await user('b'), reviewer = await user('r', 'reviewer');
    const root = await store.addComment(a, { passageId: 'passage:a', body: '<script>not executed</script>' });
    await store.addComment(b, { passageId: 'passage:a', body: 'Resposta', parentId: root.id });
    await assert.rejects(async () => await store.addComment(b, { passageId: 'passage:b', body: 'wrong thread', parentId: root.id }), { code: 'INVALID_THREAD' });
    await assert.rejects(async () => await store.resolveComment(b, root.id, true), { code: 'FORBIDDEN' });
    await store.resolveComment(reviewer, root.id, true);
    assert.equal((await store.comments('passage:a')).comments[0].resolvedBy, 'r');
});
test('years of elapsed time never purge usage or scholarly history', async (t) => {
    const { store, user, advance } = await fixture(t), a = await user('a');
    await store.patch('project:test', [changed(await store.snapshot('project:test'), 'passage:a', 'text')], a, 'test-tab');
    advance(91 * 86400000);
    await store.cleanup(90);
    assert.equal((await store.db.prepare("SELECT count(*) n FROM audit").get()).n, 1);
    assert.equal((await store.db.prepare("SELECT count(*) n FROM revisions").get()).n, 1);
});
test('password KDF is salted, rejects short passwords and supports Unicode', async () => {
    await assert.rejects(hashPassword('short'));
    const a = await hashPassword(secret), b = await hashPassword(secret);
    assert.notEqual(a, b);
    assert.match(a, /^scrypt\$131072\$8\$1\$/);
    assert.equal(await checkPassword(secret, a), true);
    assert.equal(await checkPassword('incorrect', a), false);
    assert.equal(await checkPassword(secret, null), false);
});
test('invitation, reset single-use, revocation and last-admin protection', async (t) => {
    const { store, advance } = await fixture(t), mail = [];
    const auth = new Auth(store, { origin: 'https://studio.example.org', sendMail: async (message) => mail.push(message) });
    const adminId = await auth.createAdmin('owner@example.org', 'Owner', secret), admin = store.publicUser(await store.user(adminId));
    const invited = await auth.invite(admin, { email: 'student@example.org', name: 'Student' });
    assert.equal((await store.user(invited.id)).password_hash, null);
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail[0].body)[1];
    assert.equal((await store.db.prepare("SELECT hash FROM password_tokens").get()).hash.includes(token), false);
    await auth.reset({ token, password: secret });
    await assert.rejects(auth.reset({ token, password: secret }), { code: 'INVALID_TOKEN' });
    const login = await auth.login({ email: 'student@example.org', password: secret }, '127.0.0.1');
    assert.match(login.cookie, /HttpOnly; SameSite=Strict/);
    assert.match(login.cookie, /; Secure/);
    const session = await auth.session(login.cookie);
    assert.equal(session.user.id, invited.id);
    assert.equal(await auth.session(login.cookie + '; ' + login.cookie), null);
    await auth.updateUser(admin, { id: invited.id, role: 'contributor', disabled: true });
    assert.equal(await auth.session(login.cookie), null);
    await assert.rejects(async () => await auth.updateUser(admin, { id: admin.id, role: 'contributor', disabled: false }), { code: 'LAST_ADMIN' });
    const ownerLogin = await auth.login({ email: admin.email, password: secret }, '127.0.0.2');
    advance(IDLE_MS + 1);
    assert.equal(await auth.session(ownerLogin.cookie), null);
});
test('hosted method policy denies new, paid, path and grammar operations', () => {
    for (const method of ['source_apply', 'reference_approve', 'contribution_prepare'])
        assert.throws(() => authorizeMethod(method, 'contributor'), { code: 'REVIEWER_REQUIRED' });
    for (const method of ['ai_submit', 'analysis_submit', 'parser_lab_prepare', 'source_recover', 'open_project', 'future_new_desktop_method'])
        assert.throws(() => authorizeMethod(method, 'admin'), { code: 'HOSTED_UNAVAILABLE' });
    authorizeMethod('evaluate_expression', 'contributor');
    authorizeMethod('source_apply', 'reviewer');
});
test('worker queue serializes operations and bounds per-user backlog', async () => {
    const queue = new Queue();
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const tasks = [queue.run('one', () => wait)];
    for (let i = 0; i < 7; i++)
        tasks.push(queue.run('one', () => i));
    await assert.rejects(queue.run('one', () => 99), { code: 'ENGINE_BUSY' });
    release();
    await Promise.all(tasks);
    assert.equal(queue.count, 0);
});
module.exports = { fixture, secret };
test('pending comments and reservations survive publication identity and report checkpoints', async (t) => {
    const { store, user } = await fixture(t), a = await user('a'), b = await user('b');
    await store.addComment(a, { passageId: 'pending:line-id', body: 'Before publication' });
    assert.equal((await store.comments('passage:line-id')).comments.length, 1);
    await store.assertClaim('pending:line-id', a, 'a-tab', true);
    await assert.rejects(async () => await store.assertClaim('passage:line-id', b, 'b-tab', true), { code: 'PASSAGE_BUSY' });
    await store.patch('project:test', [changed(await store.snapshot('project:test'), 'passage:a', 'report')], a, 'a-tab');
    assert.equal((await store.report(7)).contributions[0].checkpoints, 1);
});

test('disabled reservations ignore old claims but preserve authentication, versions and history', async (t) => {
    const { store, user } = await fixture(t, { passageClaims: false });
    const alice = await user('alice'), bob = await user('bob');
    store.passageClaims = true;
    await store.assertClaim('passage:a', alice, 'old-tab', true);
    store.passageClaims = false;
    await store.assertClaim('passage:a', bob, 'bob-tab', true);
    assert.deepEqual(await store.claimList(), []);
    const first = await store.snapshot('project:test');
    await store.patch('project:test', [changed(first, 'passage:a', 'alice-edit')], alice, 'another-tab');
    await assert.rejects(store.patch('project:test', [changed(first, 'passage:a', 'stale')], bob, 'bob-tab'), { code: 'DRAFT_CONFLICT' });
    const next = await store.snapshot('project:test');
    await store.patch('project:test', [changed(next, 'passage:a', 'bob-edit')], bob, 'bob-tab');
    assert.equal((await store.snapshot('project:test')).envelope.drafts['passage:a'].raw, 'bob-edit');
    assert.equal((await store.db.query('SELECT id FROM revisions')).rows.length, 2);
    await store.db.query('UPDATE users SET disabled=1 WHERE id=$1', [bob.id]);
    await assert.rejects(store.assertClaim('passage:a', bob, 'bob-tab', true), { code: 'SESSION_EXPIRED' });
});

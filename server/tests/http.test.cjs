const {createTestStore}=require('./helpers.cjs');
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Store } = require('../store.cjs'), { Auth, hashPassword } = require('../auth.cjs'), { createHttp } = require('../http.cjs'), { authorizeMethod } = require('../studio.cjs');
test('authenticated HTTP transport: CSRF, roles, drafts, telemetry, comments, PDFs and static boundary', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-http-')), store = await createTestStore(root), password = 'senha de integração longa';
    const project = { id: 'project:test', passages: [{ id: 'passage:a', sourceId: 'araujo', sourceFingerprint: 'source:1', sourceExpression: 'amen', diplomatic: 'Amen', normalized: 'amém', translation: '', notes: '', witness: {} }] };
    await store.seed(project);
    const hash = await hashPassword(password);
    for (const role of ['admin', 'contributor'])
        await store.db.prepare("INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)").run(role, role + '@example.org', role, role, hash, Date.now());
    const settings = { origin: 'http://127.0.0.1', secure: false, telemetryDays: 90, stateDirectory: root, distDirectory: path.join(root, 'dist') };
    fs.mkdirSync(settings.distDirectory);
    fs.writeFileSync(path.join(settings.distDirectory, 'index.html'), '<!doctype html><html><head></head><body>actual app slot</body></html>');
    const pdfFile = path.join(root, 'managed.pdf'), pdfBytes = Buffer.from('%PDF-1.4\noriginal scan bytes\n%%EOF\n'), assetId = 'a'.repeat(64);
    fs.writeFileSync(pdfFile, pdfBytes);
    const runtime = { project, hasPassage: id => id === 'passage:a', passage: id => { if (id !== 'passage:a')
            throw Object.assign(new Error('Missing'), { status: 404 }); return id; }, validateChanges: () => { }, refresh: async () => project,
        upload: async (filename, params, ctx) => { assert.equal(ctx.user.role,'contributor'); assert.equal(params.expectedRevision,4); assert.match(fs.readFileSync(filename,'utf8'),/^%PDF-/); return {uploaded:true}; },
        openPdf: async (params, ctx) => {
            assert.equal(ctx.user.role, 'contributor');
            assert.deepEqual(params, { projectId: project.id, sourceId: 'araujo', assetId });
            return { handle: await fs.promises.open(pdfFile, 'r'), size: pdfBytes.length, id: assetId };
        },
        invoke: async (method, params, ctx) => { authorizeMethod(method, ctx.user.role); if (method === 'evidence_bytes')
            return new TextEncoder().encode('%PDF-test').buffer; return { method, projectId: project.id }; } };
    const auth = new Auth(store, settings), app = createHttp({ config: settings, store, auth, runtime });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    settings.origin = 'http://127.0.0.1:' + app.server.address().port;
    auth.origin = settings.origin;
    t.after(async () => { await app.close(); await store.close(); fs.rmSync(root, { recursive: true, force: true }); });
    async function post(route, value, session, headers = {}) { return fetch(settings.origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: settings.origin, 'X-Studio-Client': 'integration-tab', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...headers }, body: JSON.stringify(value) }); }
    async function login(role) { const response = await post('/api/login', { email: role + '@example.org', password }); assert.equal(response.status, 200); const value = await response.json(); return { ...value, cookie: response.headers.get('set-cookie').split(';')[0] }; }
    assert.equal((await fetch(settings.origin + '/api/me')).status, 401);
    assert.equal((await fetch(settings.origin + '/', { redirect: 'manual' })).status, 303);
    assert.equal((await post('/api/login', { email: 'admin@example.org', password }, null, { Origin: 'https://evil.example' })).status, 403);
    const admin = await login('admin'), user = await login('contributor');
    const page = await fetch(settings.origin + '/', { headers: { Cookie: user.cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /collab\/bridge.js/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal((await fetch(settings.origin + '/server/auth.cjs', { headers: { Cookie: user.cookie } })).status, 404);
    assert.equal((await post('/api/drafts/load', { projectId: project.id }, user, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await post('/api/invoke', { method: 'reference_approve', params: {} }, user)).status, 403);
    assert.equal((await post('/api/invoke', { method: 'analysis_submit', params: {} }, admin)).status, 403);
    assert.equal((await fetch(settings.origin + '/api/admin/report', { headers: { Cookie: user.cookie } })).status, 403);
    for (const route of ['/api/desktop-history', '/api/desktop-history/item', '/api/desktop-history/file']) {
        assert.equal((await fetch(settings.origin + route)).status, 401);
        assert.equal((await fetch(settings.origin + route, { headers: { Cookie: user.cookie } })).status, 403);
    }
    const desktopHistory = await fetch(settings.origin + '/api/desktop-history', { headers: { Cookie: admin.cookie } });
    assert.equal(desktopHistory.status, 200);
    assert.deepEqual((await desktopHistory.json()).entries, []);
    assert.equal((await fetch(settings.origin + '/api/upstream-status')).status, 401);
    const beforeStatus = await store.db.prepare("SELECT last_seen FROM sessions WHERE user_id=$1").get('contributor');
    const upstreamStatus = await fetch(settings.origin + '/api/upstream-status', { headers: { Cookie: user.cookie } });
    assert.equal(upstreamStatus.status, 200);
    assert.equal((await upstreamStatus.json()).idleMinutes, 10);
    assert.deepEqual(await store.db.prepare("SELECT last_seen FROM sessions WHERE user_id=$1").get('contributor'), beforeStatus, 'passive update polling does not extend login idle time');
    const loaded = await (await post('/api/drafts/load', { projectId: project.id }, user)).json();
    const draft = { ...loaded.envelope.drafts['passage:a'], raw: 'changed by student' };
    const save = await post('/api/drafts', { projectId: project.id, changes: [{ id: 'passage:a', version: 1, draft }], userId: 'admin' }, user);
    assert.equal(save.status, 200);
    assert.equal((await store.db.prepare("SELECT user_id FROM revisions").get()).user_id, 'contributor');
    const stale = await post('/api/drafts', { projectId: project.id, changes: [{ id: 'passage:a', version: 1, draft }] }, user);
    assert.equal(stale.status, 409);
    await post('/api/usage', { event: 'editor.batch', passageId: 'passage:a', userId: 'admin', details: { password: 'never store this', text: 'private text' } }, user);
    const telemetry = await store.db.prepare("SELECT * FROM audit WHERE origin='browser'").get();
    assert.equal(telemetry.user_id, 'contributor');
    assert.equal(JSON.stringify(telemetry).includes('private text'), false);
    assert.equal((await post('/api/usage', { event: 'auth.password-reset' }, user)).status, 400);
    await post('/api/comment', { passageId: 'passage:a', body: 'A minha dúvida', authorId: 'admin' }, user);
    const comments = await (await fetch(settings.origin + '/api/comments?passageId=passage:a', { headers: { Cookie: admin.cookie } })).json();
    assert.equal(comments.comments[0].authorId, 'contributor');
    const pdf = await post('/api/invoke', { method: 'evidence_bytes', params: { passageId: 'passage:a' } }, user);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(await pdf.text(), '%PDF-test');
    const pdfUrl = settings.origin + '/api/pdf?' + new URLSearchParams({ projectId: project.id, sourceId: 'araujo', assetId });
    const pdfRequest = (headers = {}, method = 'GET') => fetch(pdfUrl, { method, headers: { Cookie: user.cookie, ...headers } });
    assert.equal((await fetch(pdfUrl)).status, 401);
    const whole = await pdfRequest();
    assert.equal(whole.headers.get('accept-ranges'), 'bytes');
    assert.equal(whole.headers.get('content-length'), String(pdfBytes.length));
    assert.match(whole.headers.get('cache-control'), /no-store/);
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), pdfBytes);
    const etag = whole.headers.get('etag');
    for (const [range, start, end] of [['bytes=0-4', 0, 4], ['bytes=5-', 5, pdfBytes.length - 1], ['bytes=-6', pdfBytes.length - 6, pdfBytes.length - 1], ['bytes=5-9999', 5, pdfBytes.length - 1]]) {
        const part = await pdfRequest({ Range: range, 'If-Range': etag });
        assert.equal(part.status, 206);
        assert.equal(part.headers.get('content-range'), `bytes ${start}-${end}/${pdfBytes.length}`);
        assert.deepEqual(Buffer.from(await part.arrayBuffer()), pdfBytes.subarray(start, end + 1));
    }
    for (const range of ['bytes=9999-', 'bytes=2-1', 'bytes=-0', 'bytes=0-2,5-9', 'bytes=-', 'items=0-1']) {
        const bad = await pdfRequest({ Range: range });
        assert.equal(bad.status, 416);
        assert.equal(bad.headers.get('content-range'), 'bytes */' + pdfBytes.length);
        assert.equal((await bad.arrayBuffer()).byteLength, 0);
    }
    const staleRange = await pdfRequest({ Range: 'bytes=0-4', 'If-Range': '"old"' });
    assert.equal(staleRange.status, 200);
    assert.deepEqual(Buffer.from(await staleRange.arrayBuffer()), pdfBytes);
    const head = await pdfRequest({}, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(pdfBytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(pdfUrl.replace(assetId, '../secret'), { headers: { Cookie: user.cookie } })).status, 400);
    assert.equal((await post('/api/pdf', {}, user)).status, 400);
    const uploaded=await fetch(settings.origin+'/api/pdf',{method:'POST',headers:{'Content-Type':'application/pdf',Origin:settings.origin,
        'X-Studio-Client':'integration-tab',Cookie:user.cookie,'X-CSRF-Token':user.csrf,
        'X-Studio-Evidence':JSON.stringify({sourceId:'araujo',passageId:'passage:a',expectedRevision:4})},body:'%PDF-fixture'});
    assert.equal(uploaded.status,200);assert.deepEqual(await uploaded.json(),{uploaded:true});
    await post('/api/admin/user', { id: 'contributor', role: 'contributor', disabled: true }, admin);
    assert.equal((await pdfRequest({ Range: 'bytes=0-4' })).status, 401, 'each range rechecks a revoked session');
    assert.equal((await post('/api/drafts/load', { projectId: project.id }, user)).status, 401);
});

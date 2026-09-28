const {createTestStore}=require('./helpers.cjs');
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Store } = require('../store.cjs'), { Auth, hashPassword } = require('../auth.cjs');
const { createStudio } = require('../studio.cjs'), { createHttp } = require('../http.cjs');
test('compiled React editor uses real hosted corpus, saves a draft and retains authenticated comments', {
    skip: process.env.COLLAB_FULL_EDITOR !== '1' || !process.env.COLLAB_REAL_PROJECT,
    timeout: 180000,
}, async (t) => {
    const { chromium } = require('@playwright/test');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-full-editor-'));
    const validate = require('../../electron/validation.cjs');
    const store = await createTestStore(directory, { validateEnvelope: validate.envelope });
    const password = 'isolated full editor fixture password';
    await store.db.prepare("INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)").run('fixture', 'fixture@example.org', 'Hosted reviewer', 'reviewer', await hashPassword(password), Date.now());
    const settings = { aiEnabled: true, origin: 'http://127.0.0.1', secure: false, telemetryDays: 90, stateDirectory: directory,
        applicationDirectory: path.resolve(__dirname, '../..'), distDirectory: path.resolve(__dirname, '../../dist'),
        parent: process.env.COLLAB_REAL_PROJECT, python: process.env.PYDICATE_PYTHON || 'python3' };
    let app, runtime, browser, page;
    t.after(async () => { if (page) {
        const evidence = path.resolve(__dirname, '../../test-results/collab');
        fs.mkdirSync(evidence, { recursive: true });
        await page.screenshot({ path: path.join(evidence, 'hosted-react-editor.png'), fullPage: true }).catch(() => { });
    } await browser?.close(); await app?.close(); await runtime?.close(); await store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    runtime = await createStudio(settings, store, event => app?.emit(event));
    const auth = new Auth(store, settings);
    app = createHttp({ config: settings, store, auth, runtime });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    settings.origin = 'http://127.0.0.1:' + app.server.address().port;
    auth.origin = settings.origin;
    browser = await chromium.launch({ headless: true, ...(process.env.COLLAB_CHROMIUM ? { executablePath: process.env.COLLAB_CHROMIUM } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(settings.origin + '/login');
    await page.locator('#email').fill('fixture@example.org');
    await page.locator('#password').fill(password);
    await page.locator('#submit').click();
    await page.waitForURL(settings.origin + '/');
    await page.waitForFunction(() => window.collab?.state().projectId && !window.collab.state().projectId.startsWith('example:'), null, { timeout: 60000 });
    await page.getByRole('button', { name: 'Mais ferramentas', exact: true }).click();
    await page.getByRole('menu', { name: 'Mais ferramentas' }).getByRole('checkbox', { name: 'Ferramentas avançadas' }).check();
    await page.getByRole('button', { name: 'Fechar mais ferramentas', exact: true }).click();
    await page.getByRole('tab', { name: 'Código', exact: true }).click();
    const editor = page.getByLabel('Pydicate editável', { exact: true });
    await editor.waitFor({ timeout: 60000 });
    const id = await page.evaluate(() => window.collab.state().selected);
    const original = (await store.snapshot(runtime.project.id)).envelope.drafts[id].raw;
    assert.ok(original.trim());
    assert.equal(await editor.inputValue(), original);
    // Whitespace-only draft change: exercise the real React autosave without publishing source.
    const edited = original + '\n';
    const evaluationResponse = page.waitForResponse(response => {
        if (!response.url().endsWith('/api/invoke') || response.request().method() !== 'POST')
            return false;
        const request = response.request().postDataJSON();
        return request.method === 'evaluate_expression' && request.params?.raw === edited;
    }, { timeout: 60000 });
    await editor.fill(edited);
    const evaluated = await evaluationResponse;
    assert.equal(evaluated.status(), 200);
    assert.equal((await evaluated.json()).engineFingerprint, runtime.project.engineFingerprint);
    const until = Date.now() + 60000;
    while ((await store.snapshot(runtime.project.id)).envelope.drafts[id].raw !== edited && Date.now() < until)
        await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await store.snapshot(runtime.project.id)).envelope.drafts[id].raw, edited);
    assert.equal((await store.db.prepare("SELECT user_id FROM revisions ORDER BY id DESC LIMIT 1").get()).user_id, 'fixture');
    await page.locator('#collab-toggle').click();
    await page.locator('#collab-panel textarea').fill('Comentário do teste integrado, sem publicação.');
    await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
    await page.getByText('Comentário do teste integrado, sem publicação.', { exact: true }).waitFor();
    assert.equal((await store.comments(id)).comments[0].authorId, 'fixture');
    assert.deepEqual(failures, [], 'Unhandled browser exceptions');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#root img')].every(image => image.complete && image.naturalWidth > 0)), true, 'Public branding images load through the hosted static boundary');
    assert.equal(await page.evaluate(() => window.studio.capabilities.analysis), true);
    await page.getByRole('button', {name:'Corrigir gramática / árvore',exact:true}).first().waitFor();
    const preparation = await page.evaluate(async () => window.studio.invoke('structure_prepare', {projectId:window.collab.state().projectId}));
    assert.equal(typeof preparation.preparing, 'boolean');
    const listing = await page.evaluate(async () => window.studio.invoke('analysis_list', {projectId:window.collab.state().projectId}));
    assert.ok(Array.isArray(listing.jobs));
    await page.getByRole('button', {name:'Dicionário',exact:true}).click();
    const dictionary = page.frameLocator('iframe[title="Dicionário de tupi antigo"]');
    const search = dictionary.getByPlaceholder('Digite a palavra a ser pesquisada');
    await search.waitFor({timeout:30000});
    await search.fill('pysyrõ');
    await dictionary.getByRole('button',{name:'Pesquisar',exact:true}).click();
    await dictionary.locator('#results > .entry').first().waitFor();
    assert.ok(await dictionary.locator('#results > .entry').count() > 0);
    assert.deepEqual(failures, [], 'Hosted dictionary and AI controls have no browser exceptions');
    const evidence = path.resolve(__dirname, '../../test-results/collab');
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, 'hosted-react-editor.png'), fullPage: true });
});

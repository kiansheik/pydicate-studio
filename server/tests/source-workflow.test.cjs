'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTestStore } = require('./helpers.cjs');
const { Auth, hashPassword } = require('../auth.cjs');
const { createStudio } = require('../studio.cjs'), { createHttp } = require('../http.cjs');
const { makeScanPdfFixture } = require('../../electron/tests/pdf-scan-fixture.cjs');
// The share of drawn pixels on the rendered page, read from the real canvas.
const inkedFraction = canvas => canvas.evaluate(node => {
    const { data } = node.getContext('2d').getImageData(0, 0, node.width, node.height);
    let inked = 0;
    for (let index = 0; index < data.length; index += 4)
        if (data[index] < 210 || data[index + 1] < 210 || data[index + 2] < 210) inked++;
    return inked / (data.length / 4);
});

test('contributor creates a source, uploads a scanned PDF that renders without a reload, saves regions and submits its first reading through the real editor', {
  skip: process.env.COLLAB_FULL_EDITOR !== '1' || !process.env.COLLAB_REAL_PROJECT,
  timeout: 180000,
}, async (t) => {
  const { chromium, expect } = require('@playwright/test');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-source-browser-'));
  const parent = path.join(directory, 'workspace'), corpus = path.join(parent, 'oldtupicorpus');
  fs.mkdirSync(parent);
  fs.cpSync(path.join(process.env.COLLAB_REAL_PROJECT, 'oldtupicorpus'), corpus, {
    recursive: true, filter: filename => !['.git', '__pycache__', '.venv'].includes(path.basename(filename)),
  });
  fs.symlinkSync(path.join(process.env.COLLAB_REAL_PROJECT, 'nhe-enga'), path.join(parent, 'nhe-enga'), 'dir');
  execFileSync('git', ['init', '--quiet', corpus]);
  execFileSync('git', ['-C', corpus, 'add', '.']);
  execFileSync('git', ['-C', corpus, '-c', 'user.name=Studio Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'Disposable source workflow']);
  const store = await createTestStore(path.join(directory, 'state'), { validateEnvelope: require('../../electron/validation.cjs').envelope });
  const password = 'source workflow isolated test password';
  await store.db.prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)').run('contributor', 'contributor@example.org', 'Source contributor', 'contributor', await hashPassword(password), Date.now());
  const config = { origin: 'http://127.0.0.1', secure: false, telemetryDays: 90,
    stateDirectory: path.join(directory, 'state'), applicationDirectory: path.resolve(__dirname, '../..'),
    distDirectory: path.resolve(__dirname, '../../dist'), parent, python: process.env.PYDICATE_PYTHON || 'python3' };
  let app, runtime, browser, page;
  t.after(async () => {
    if (page) {
      const evidence = path.resolve(__dirname, '../../test-results/collab');
      fs.mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, 'source-workflow.png'), fullPage: true }).catch(() => {});
    }
    await browser?.close(); await app?.close(); await runtime?.close(); await store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  runtime = await createStudio(config, store, event => app?.emit(event));
  const upload = runtime.upload;
  runtime.upload = async (...args) => { try { return await upload(...args); } catch (error) { t.diagnostic(error.stack); throw error; } };
  const auth = new Auth(store, config);
  app = createHttp({ config, store, auth, runtime });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  config.origin = 'http://127.0.0.1:' + app.server.address().port;
  auth.origin = config.origin;
  browser = await chromium.launch({ headless: true, ...(process.env.COLLAB_CHROMIUM ? { executablePath: process.env.COLLAB_CHROMIUM } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], blocked = [], decoding = [];
  page.on('pageerror', error => errors.push(error.message));
  // A scan is one image per page, and PDF.js skips a picture whose decoder it
  // cannot load: the page then arrives white with nothing else reported.
  page.on('console', entry => { if (/Unable to decode image|failed to initialize|wasm/i.test(entry.text())) decoding.push(entry.text()); });
  page.on('response', async response => { if (response.url().includes('/api/') && response.status() >= 400) { const body=await response.json().catch(()=>({})); blocked.push(`${response.status()} ${response.url()} ${response.request().postDataJSON()?.method || ''} ${body.error?.code || ''} ${body.error?.message || ''}`); } });
  await page.goto(config.origin + '/login');
  await page.locator('#email').fill('contributor@example.org');
  await page.locator('#password').fill(password);
  await page.locator('#submit').click();
  await page.waitForURL(config.origin + '/');
  await page.getByRole('button', { name: 'Nova fonte', exact: true }).click({ timeout: 60000 });
  const dialog = page.getByRole('dialog', { name: 'Nova fonte', exact: true });
  await dialog.getByLabel('Título da fonte').fill('Manuscrito do colaborador');
  await dialog.getByLabel('Ano (opcional)').fill('1750');
  await dialog.getByRole('button', { name: 'Criar fonte', exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60000 });
  const selection = page.getByRole('combobox', { name: 'Fonte', exact: true });
  await expect(selection).toHaveValue('manuscrito_do_colaborador');
  const pdf = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Vincular PDF à fonte', exact: true }).click();
  await (await pdf).setFiles({ name: 'meu-manuscrito.pdf', mimeType: 'application/pdf', buffer: makeScanPdfFixture() });
  const canvas = page.getByTestId('pdf-canvas');
  await expect(canvas).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Vincular outro testemunho', exact: true })).toHaveCount(0);
  const mark = page.getByRole('button', { name: 'Marcar região', exact: true });
  await expect(mark).toBeEnabled({ timeout: 60000 });
  await expect(page.getByRole('status').filter({ hasText: 'Renderizando' })).toHaveCount(0);
  if (await mark.getAttribute('aria-pressed') !== 'true') await mark.click();
  await canvas.scrollIntoViewIfNeeded();
  await expect(mark).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Renderizando' })).toHaveCount(0);
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'Rendered PDF has drawable dimensions');
  // Never again a PDF that loads, reports itself ready and shows white pages.
  await expect.poll(() => inkedFraction(canvas), { timeout: 60000, message: 'The uploaded scan is drawn in the same session, without a reload' }).toBeGreaterThan(0.4);
  assert.deepEqual(decoding, [], 'Every image decoder the scan needs is available to the hosted page');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .4, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('pdf-region')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
  await expect(page.getByText('Evidência salva no servidor.', { exact: false })).toBeVisible();
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Leitura do manuscrito');
  await page.getByRole('button', { name: 'Mais ferramentas', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Ferramentas avançadas' }).check();
  await page.getByRole('button', { name: 'Fechar mais ferramentas', exact: true }).click();
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await page.getByLabel('Pydicate editável', { exact: true }).fill('Noun("abá", definition="pessoa")');
  const id = await page.evaluate(() => window.collab.state().selected);
  await expect.poll(async () => (await store.snapshot(runtime.project.id)).envelope.drafts[id]?.raw, { timeout: 60000 }).toBe('Noun("abá", definition="pessoa")');
  await page.reload();
  await expect(selection).toHaveValue('manuscrito_do_colaborador', { timeout: 60000 });
  await expect(page.getByTestId('pdf-canvas')).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Região 1 · PDF 1', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Renderizando' })).toHaveCount(0);
  // A visible canvas can precede the asynchronous PDF render after reload.
  await expect.poll(() => inkedFraction(canvas), { timeout: 60000, message: 'The saved scan is drawn again after reopening the source' }).toBeGreaterThan(0.4);
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue('Leitura do manuscrito');
  await expect(page.getByTestId('generated-surface')).toHaveText('abá', { timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Salvar como referência', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Enviar para revisão', exact: true }).click();
  await expect(page.getByText('Contribuição enviada para revisão.', { exact: false })).toBeVisible();
  const submission = await store.db.prepare('SELECT snapshot FROM submissions WHERE author_id=$1').get('contributor');
  const snapshot = JSON.parse(submission.snapshot);
  assert.equal(snapshot.source.id, 'manuscrito_do_colaborador');
  assert.equal(snapshot.source.title, 'Manuscrito do colaborador');
  assert.equal(snapshot.draft.diplomatic, 'Leitura do manuscrito');
  assert.equal(snapshot.evidence.regions.length, 1);
  assert.equal(snapshot.original, null);
  assert.equal(fs.existsSync(path.join(corpus, 'historic/manuscrito_do_colaborador.tu.py')), true);
  assert.equal(fs.existsSync(path.join(corpus, 'ground_truth/records/historic/manuscrito_do_colaborador.jsonl')), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(decoding, []);
  assert.deepEqual(blocked, [], 'Normal contributor source workflow must not request unsupported endpoints');
});

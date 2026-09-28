'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTestStore } = require('./helpers.cjs');

test(
  'hosted reference publication saves the reviewed source without reloading its own returned project',
  {
    skip: process.env.COLLAB_FULL_EDITOR !== '1' || !process.env.COLLAB_REAL_PROJECT,
    timeout: 180000,
  },
  async (t) => {
    const { chromium, expect } = require('@playwright/test');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-reference-publication-'));
    const parent = path.join(directory, 'workspace');
    const corpus = path.join(parent, 'oldtupicorpus');
    const engine = path.join(parent, 'nhe-enga');
    const stateDirectory = path.join(directory, 'state');
    let runtime, store, app, browser;
    t.after(async () => {
      await browser?.close();
      await app?.close();
      await runtime?.close();
      await store?.close();
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    });
    await fs.mkdir(path.join(corpus, 'historic'), { recursive: true });
    await fs.mkdir(path.join(corpus, 'ground_truth/records/historic'), { recursive: true });
    await fs.cp(
      path.join(process.env.COLLAB_REAL_PROJECT, 'oldtupicorpus/authoring'),
      path.join(corpus, 'authoring'),
      {
        recursive: true,
        filter: (filename) => path.basename(filename) !== '__pycache__',
      },
    );
    for (const folder of ['pydicate', 'tupi']) {
      await fs.cp(
        path.join(process.env.COLLAB_REAL_PROJECT, 'nhe-enga', folder),
        path.join(engine, folder),
        {
          recursive: true,
          filter: (filename) => !['.git', '__pycache__', '.venv'].includes(path.basename(filename)),
        },
      );
    }
    await fs.writeFile(
      path.join(corpus, 'historic/lexicon.py'),
      'from pydicate.lang.tupilang.pos import Noun\ndef load_lexicon():\n    return {"aba": Noun("abá", definition="pessoa"), "kunha": Noun("kunhã", definition="mulher")}\n',
    );
    const lexicon = path.join(corpus, 'historic/lexicon.tu.py');
    const lexiconBytes = '# Fixture lexical namespace is loaded by lexicon.py.\n';
    await fs.writeFile(lexicon, lexiconBytes);
    const source = path.join(corpus, 'historic/example.tu.py');
    const sourceBytes = 'l = []\nl += aba\n';
    await fs.writeFile(source, sourceBytes);
    const otherSource = path.join(corpus, 'historic/untouched.tu.py');
    const otherSourceBytes = 'l = []\nl += kunha\n';
    await fs.writeFile(otherSource, otherSourceBytes);
    for (const repository of [corpus, engine]) {
      execFileSync('git', ['init', '--quiet', repository]);
      execFileSync('git', ['-C', repository, 'add', '.']);
      execFileSync('git', [
        '-C',
        repository,
        '-c',
        'user.name=Studio Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Disposable reference publication fixture',
      ]);
    }
    store = await createTestStore(stateDirectory, {
      validateEnvelope: require('../../electron/validation.cjs').envelope,
    });
    const { Auth, hashPassword } = require('../auth.cjs');
    const password = 'disposable reference publication password';
    await store.db
      .prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)')
      .run(
        'fixture',
        'fixture@example.org',
        'Fixture reviewer',
        'reviewer',
        await hashPassword(password),
        Date.now(),
      );
    const config = {
      stateDirectory,
      parent,
      origin: 'http://127.0.0.1',
      secure: false,
      distDirectory: path.resolve(__dirname, '../../dist'),
      applicationDirectory: path.resolve(__dirname, '../..'),
      python: process.env.PYDICATE_PYTHON || 'python3',
    };
    const events = [];
    runtime = await require('../studio.cjs').createStudio(config, store, (event) => {
      events.push(event);
      app?.emit(event);
    });
    const original = structuredClone(runtime.project);
    assert.equal(original.passages.length, 2);
    const selected = original.passages.find((passage) => passage.sourceId === 'example');
    const untouched = original.passages.find((passage) => passage.sourceId === 'untouched');
    assert.ok(selected && untouched);
    const auth = new Auth(store, config);
    app = require('../http.cjs').createHttp({ config, store, auth, runtime });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    config.origin = auth.origin = 'http://127.0.0.1:' + app.server.address().port;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.COLLAB_CHROMIUM ? { executablePath: process.env.COLLAB_CHROMIUM } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const browserErrors = [],
      apiFailures = [],
      refreshRequests = [],
      publicationMethods = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });
    await page.addInitScript(() => {
      window.__publicationEvents = [];
      window.addEventListener('collab-status', (event) => {
        if (event.detail?.type === 'source-change') window.__publicationEvents.push(event.detail);
      });
    });
    await page.goto(config.origin + '/login');
    await page.locator('#email').fill('fixture@example.org');
    await page.locator('#password').fill(password);
    await page.locator('#submit').click();
    await page.waitForURL(config.origin + '/');
    await expect(page.getByTestId('generated-surface')).toHaveText('abá', { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.collab.state().selected), selected.id);
    const before = await store.snapshot(original.id);
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/refresh') refreshRequests.push(request.url());
    });
    // Make the real SSE arrive while each publication response is still pending.
    // React must defer it, then recognize the project returned by that response.
    let publicationEventCount = 0;
    await page.route('**/api/invoke', async (route) => {
      const method = route.request().postDataJSON()?.method;
      if (!['source_apply', 'reference_approve'].includes(method)) return route.continue();
      publicationMethods.push(method);
      const response = await route.fetch({ timeout: 60000 });
      if (response.status() === 200) {
        publicationEventCount++;
        await page.waitForFunction(
          (count) => window.__publicationEvents.length >= count,
          publicationEventCount,
          { timeout: 60000 },
        );
      }
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Mais ferramentas', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Ferramentas avançadas' }).check();
    await page.getByRole('button', { name: 'Fechar mais ferramentas', exact: true }).click();
    await page.getByRole('tab', { name: 'Código', exact: true }).click();
    const editor = page.getByLabel('Pydicate editável', { exact: true });
    // Autosave can finish before the serialized real Python evaluation. Wait
    // for this exact edited expression, not the previous identical surface.
    const evaluationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/invoke') &&
        response.request().postDataJSON()?.method === 'evaluate_expression' &&
        response.request().postDataJSON()?.params?.raw === 'aba.copy()',
      { timeout: 60000 },
    );
    await editor.fill('aba.copy()');
    const evaluated = await evaluationResponse;
    assert.equal(evaluated.status(), 200, await evaluated.text());
    assert.equal((await evaluated.json()).surface, 'abá');
    await expect(page.getByTestId('generated-surface')).toHaveText('abá', { timeout: 60000 });
    await expect
      .poll(async () => (await store.snapshot(original.id)).envelope.drafts[selected.id].raw, {
        timeout: 60000,
      })
      .toBe('aba.copy()');
    const save = page
      .locator('.workspace-footer')
      .getByRole('button', { name: 'Salvar como referência', exact: true });
    await expect(save).toBeEnabled();
    // Full source regression is asynchronous and shares CI capacity with the
    // other compiled editor tests. Diagnose its response before inspecting UI.
    const previewResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/invoke') &&
        response.request().postDataJSON()?.method === 'source_preview',
      { timeout: 60000 },
    );
    await save.click();
    const preview = await previewResponse;
    assert.equal(preview.status(), 200, await preview.text());
    const dialog = page.getByRole('dialog', { name: /^Revisar/ });
    await expect(dialog).toBeVisible({ timeout: 60000 });
    await expect(
      dialog.getByRole('checkbox', { name: 'Registrar também como referência', exact: true }),
    ).toBeChecked();
    await expect(
      dialog.getByRole('region', { name: 'Resultado atual do rascunho', exact: true }),
    ).toContainText('abá');
    const approved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/invoke') &&
        response.request().postDataJSON()?.method === 'reference_approve',
      { timeout: 60000 },
    );
    await dialog.getByRole('button', { name: 'Salvar fonte e referência', exact: true }).click();
    const response = await approved;
    assert.equal(response.status(), 200, await response.text());
    const result = await response.json();
    assert.equal(
      result.project.passages.find((passage) => passage.id === selected.id).acceptedReference,
      'abá',
    );
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Passagem e referência salvas:', { exact: false })).toBeVisible();
    await expect(save).toBeEnabled();
    await expect(page.getByTestId('generated-surface')).toHaveText('abá');
    await page.evaluate(async () => {
      for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
    });
    assert.deepEqual(
      refreshRequests,
      [],
      'The publishing tab must adopt the returned project instead of opening another Python worker',
    );
    assert.deepEqual(publicationMethods, ['source_apply', 'reference_approve']);
    const sourceEvents = events.filter((event) => event.type === 'source-change');
    assert.equal(sourceEvents.length, 2);
    assert.ok(
      sourceEvents.every(
        (event) => typeof event.engineFingerprint === 'string' && event.engineFingerprint.length,
      ),
    );
    assert.equal(sourceEvents.at(-1).engineFingerprint, result.project.engineFingerprint);
    assert.notEqual(await fs.readFile(source, 'utf8'), sourceBytes);
    assert.ok((await fs.readFile(source, 'utf8')).includes('aba.copy()'));
    const records = (
      await fs.readFile(path.join(corpus, 'ground_truth/records/historic/example.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.equal(records.length, 1);
    assert.equal(records[0].surface, 'abá');
    assert.equal(records[0].status, 'approved');
    const after = await store.snapshot(original.id);
    assert.deepEqual(after.envelope.drafts[untouched.id], before.envelope.drafts[untouched.id]);
    assert.equal(after.versions[untouched.id], before.versions[untouched.id]);
    assert.equal(after.envelope.drafts[selected.id].workflow.stage, 'complete');
    assert.equal(await fs.readFile(otherSource, 'utf8'), otherSourceBytes);
    assert.equal(await fs.readFile(lexicon, 'utf8'), lexiconBytes);
    assert.equal(
      runtime.project.passages.find((passage) => passage.id === untouched.id).acceptedReference,
      null,
    );
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(apiFailures, []);
  },
);

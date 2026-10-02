'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTestStore } = require('./helpers.cjs');

test(
  'admin compares PDF pages and publishes only checked submissions across a shared source',
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
    const sourceBytes = 'l = []\nl += aba\nl += kunha\n';
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
      validateEnvelope: require('../../runtime/validation.cjs').envelope,
    });
    const { Auth, hashPassword } = require('../auth.cjs');
    const password = 'disposable reference publication password';
    await store.db
      .prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)')
      .run(
        'fixture',
        'fixture@example.org',
        'Fixture reviewer',
        'admin',
        await hashPassword(password),
        Date.now(),
      );
    let finishMail;
    let sentMail = 0;
    const config = {
      sendMail: () =>
        new Promise((resolve) => {
          sentMail++;
          finishMail = resolve;
        }),
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
    assert.equal(original.passages.length, 3);
    const selected = original.passages.find((passage) => passage.sourceId === 'example');
    const untouched = original.passages.find((passage) => passage.sourceId === 'untouched');
    assert.ok(selected && untouched);
    const user = store.publicUser(await store.user('fixture')),
      context = { user, clientId: 'fixture-admin-tab' };
    const pdf = path.join(directory, 'scan.pdf');
    await fs.writeFile(pdf, require('../../runtime/tests/pdf-fixture.cjs').makePdfFixture());
    const submissions = new (require('../submissions.cjs').Submissions)(store);
    const submitted = [];
    for (const passage of original.passages) {
      if (!submitted.some((row) => row.sourceId === passage.sourceId))
        await runtime.upload(
          pdf,
          { sourceId: passage.sourceId, passageId: passage.id, expectedRevision: 0 },
          context,
        );
      const saved = await store.snapshot(original.id),
        draft = {
          ...saved.envelope.drafts[passage.id],
          raw: passage.sourceExpression + '.copy()',
          revisionId: require('node:crypto').randomUUID(),
        };
      await store.patch(
        original.id,
        [{ id: passage.id, version: saved.versions[passage.id], draft }],
        user,
        context.clientId,
      );
      const sent = await submissions.submit(
        user,
        { passageId: passage.id, revisionId: draft.revisionId },
        original,
      );
      submitted.push({ ...sent, sourceId: passage.sourceId, passageId: passage.id });
    }
    const before = await store.snapshot(original.id);
    const auth = new Auth(store, config);
    app = require('../http.cjs').createHttp({ config, store, auth, runtime });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    config.origin = auth.origin = 'http://127.0.0.1:' + app.server.address().port;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.COLLAB_CHROMIUM ? { executablePath: process.env.COLLAB_CHROMIUM } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.setDefaultTimeout(60000);
    let listingBlocked = true;
    const listingWaiters = [];
    await page.route('**/api/submissions?**', async (route) => {
      if (
        listingBlocked &&
        new URL(route.request().url()).searchParams.get('projectId') === original.id
      )
        await new Promise((resolve) => listingWaiters.push(resolve));
      await route.continue();
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('studio-theme', 'dark'));
    await page.goto(config.origin + '/login');
    await page.locator('#email').fill('fixture@example.org');
    await page.locator('#password').fill(password);
    await page.locator('#submit').click();
    await page.waitForURL(config.origin + '/');
    await page
      .getByRole('navigation', { name: 'Navegar entre janelas' })
      .getByRole('button', { name: 'Passagens', exact: true })
      .click();
    await expect.poll(() => listingWaiters.length).toBeGreaterThan(0);
    await expect(
      page.getByRole('button', { name: 'Revisar envios em lote', exact: true }),
    ).toBeDisabled();
    listingBlocked = false;
    listingWaiters.forEach((resolve) => resolve());
    await expect(
      page.getByRole('button', { name: 'Revisar envios em lote', exact: true }),
    ).toBeEnabled();
    await page
      .getByRole('navigation', { name: 'Navegar entre janelas' })
      .getByRole('button', { name: 'Editor', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Enviada para revisão ✓', exact: true }),
    ).toBeDisabled({ timeout: 60000 });
    await page.getByRole('button', { name: 'Equipe e comentários', exact: true }).click();
    const panel = page.locator('#collab-panel');
    await panel.getByText('Administração', { exact: true }).click();
    await panel.getByLabel('E-mail do convite', { exact: true }).fill('invited@example.invalid');
    await panel.getByLabel('Nome', { exact: true }).fill('Invited fixture');
    await panel.getByRole('button', { name: 'Enviar convite', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Enviando…', exact: true })).toBeDisabled();
    await expect.poll(() => sentMail).toBe(1);
    finishMail();
    await expect(
      panel.getByText('Convite enviado para invited@example.invalid.', { exact: false }),
    ).toBeVisible();
    await panel
      .getByRole('button', { name: 'Enviar última versão salva para revisão', exact: true })
      .click();
    await expect(
      panel.getByText(
        'Enviada. A passagem está aguardando revisão; a versão enviada foi preservada.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('collab-status', { detail: { type: 'saved' } })),
    );
    await expect(
      panel.getByText('Convite enviado para invited@example.invalid.', { exact: false }),
    ).toBeVisible();
    await expect(
      panel.getByText(
        'Enviada. A passagem está aguardando revisão; a versão enviada foi preservada.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Equipe e comentários', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Navegar entre janelas' })
      .getByRole('button', { name: 'Passagens', exact: true })
      .click();
    await page.getByLabel('Filtrar envios para revisão').selectOption('submitted');
    await expect(page.locator('.passage-item')).toHaveCount(3);
    await page.getByRole('button', { name: 'Revisar envios em lote', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisar envios em lote' });
    await expect(dialog.locator('.submission-review-line')).toHaveCount(3);
    for (const item of submitted) {
      const row = dialog.locator('[data-submission-id="' + item.id + '"]');
      await row.getByRole('button', { name: 'Conferir esta linha', exact: true }).click();
      await expect(row.locator('.submission-pdf img').first()).toBeVisible({ timeout: 60000 });
      const checkbox = row.getByRole('checkbox');
      await expect(checkbox).toBeEnabled({ timeout: 60000 });
      const ink = await row
        .locator('.submission-pdf img')
        .first()
        .evaluate((img) => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const x = c.getContext('2d');
          x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let blue = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 2] > d[i] + 50) blue++;
          return blue;
        });
      assert.ok(ink > 100, 'Actual PDF landmark pixels rendered');
      if (item.sourceId === 'example') await checkbox.check();
    }
    await fs.mkdir(path.resolve('test-results/collab'), { recursive: true });
    await page.screenshot({ path: path.resolve('test-results/collab/bulk-review.png') });
    await dialog.getByRole('button', { name: 'Incorporar 2 selecionada(s)', exact: true }).click();
    await expect(
      dialog.getByText('Incorporada ao corpus; referência aprovada.', { exact: true }),
    ).toHaveCount(2, { timeout: 60000 });
    const after = await store.snapshot(original.id);
    assert.deepEqual(after.envelope.drafts[untouched.id], before.envelope.drafts[untouched.id]);
    assert.equal(await fs.readFile(otherSource, 'utf8'), otherSourceBytes);
    const rows = (await submissions.list(user)).submissions;
    assert.equal(rows.filter((row) => row.status === 'imported').length, 2);
    assert.equal(rows.filter((row) => row.status === 'submitted').length, 1);
    for (const passage of runtime.project.passages.filter((p) => p.sourceId === 'example'))
      assert.ok(passage.acceptedReference);
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(page.locator('.passage-item')).toHaveCount(1);
    assert.deepEqual(errors, []);
  },
);

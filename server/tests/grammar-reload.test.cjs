'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTestStore } = require('./helpers.cjs');

test('hosted grammar repair reloads the real engine and keeps its job and saved research intact', {
  skip: !process.env.COLLAB_REAL_PROJECT, timeout: 180000,
}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-grammar-reload-'));
  const parent = path.join(directory, 'workspace'), corpus = path.join(parent, 'oldtupicorpus');
  const engine = path.join(parent, 'nhe-enga'), stateDirectory = path.join(directory, 'state');
  let runtime, store, releaseRunner, app, browser, page;
  t.after(async () => { releaseRunner?.(); await browser?.close(); await app?.close(); await runtime?.close(); await store?.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await fs.mkdir(path.join(corpus, 'historic'), { recursive: true });
  await fs.mkdir(path.join(corpus, 'ground_truth/records/historic'), { recursive: true });
  await fs.cp(path.join(process.env.COLLAB_REAL_PROJECT, 'oldtupicorpus/authoring'), path.join(corpus, 'authoring'), {
    recursive: true, filter: filename => path.basename(filename) !== '__pycache__',
  });
  for (const folder of ['pydicate', 'tupi']) await fs.cp(path.join(process.env.COLLAB_REAL_PROJECT, 'nhe-enga', folder), path.join(engine, folder), {
    recursive: true, filter: filename => !['.git', '__pycache__', '.venv'].includes(path.basename(filename)),
  });
  // A tiny corpus uses the real grammar with one isolated editable rule. Never
  // rewrite the selected checkout or depend on a model's linguistic decision.
  const rule = path.join(engine, 'pydicate/pydicate/hosted_fixture.py');
  await fs.writeFile(rule, 'FORM = "abá"\n');
  await fs.writeFile(path.join(corpus, 'historic/lexicon.py'), 'from pydicate.lang.tupilang.pos import Noun\nfrom pydicate.hosted_fixture import FORM\ndef load_lexicon():\n    return {"aba": Noun(FORM, definition="pessoa")}\n');
  await fs.writeFile(path.join(corpus, 'historic/lexicon.tu.py'), '# Fixture lexical namespace is loaded by lexicon.py.\n');
  const source = path.join(corpus, 'historic/example.tu.py');
  const sourceBytes = 'l = []\nl += aba\n';
  await fs.writeFile(source, sourceBytes);
  for (const repository of [corpus, engine]) {
    execFileSync('git', ['init', '--quiet', repository]);
    execFileSync('git', ['-C', repository, 'add', '.']);
    execFileSync('git', ['-C', repository, '-c', 'user.name=Studio Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'Disposable hosted grammar fixture']);
  }
  const analysisModule = require('../../electron/analysis-service.cjs');
  const createAnalysis = analysisModule.createAnalysisService;
  let toolResult;
  const runnerPaused = new Promise(resolve => { releaseRunner = resolve; });
  let edited;
  const editFinished = new Promise(resolve => { edited = resolve; });
  t.mock.method(analysisModule, 'createAnalysisService', options => createAnalysis({ ...options,
    runner: async tools => {
      const file = await tools.callTool('grammar_read', { path: 'pydicate/pydicate/hosted_fixture.py' }, { operationId: 'fixture:read' });
      toolResult = await tools.callTool('grammar_edit', { path: file.path, expectedHash: file.hash, oldText: '"abá"', newText: '"kunhã"' }, { operationId: 'fixture:edit' });
      edited();
      await runnerPaused;
      return { text: 'Fixture rule updated and checked.' };
    },
  }));
  store = await createTestStore(stateDirectory, { validateEnvelope: require('../../electron/validation.cjs').envelope });
  const { Auth, hashPassword } = require('../auth.cjs');
  const password = 'disposable grammar fixture password';
  await store.db.prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)').run('fixture', 'fixture@example.org', 'Fixture contributor', 'contributor', await hashPassword(password), Date.now());
  const { createStudio } = require('../studio.cjs');
  const events = [];
  const config = { aiEnabled: true, stateDirectory, parent, origin: 'http://127.0.0.1', secure: false,
    distDirectory: path.resolve(__dirname, '../../dist'),
    applicationDirectory: path.resolve(__dirname, '../..'), python: process.env.PYDICATE_PYTHON || 'python3',
  };
  runtime = await createStudio(config, store, event => { events.push(event); app?.emit(event); });
  const browserErrors = [];
  if (process.env.COLLAB_FULL_EDITOR === '1') {
    const { chromium, expect } = require('@playwright/test');
    const auth = new Auth(store, config);
    app = require('../http.cjs').createHttp({ config, store, auth, runtime });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    config.origin = auth.origin = 'http://127.0.0.1:' + app.server.address().port;
    browser = await chromium.launch({ headless: true, ...(process.env.COLLAB_CHROMIUM ? { executablePath: process.env.COLLAB_CHROMIUM } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(config.origin + '/login');
    await page.locator('#email').fill('fixture@example.org');
    await page.locator('#password').fill(password);
    await page.locator('#submit').click();
    await page.waitForURL(config.origin + '/');
    await expect(page.getByTestId('generated-surface')).toHaveText('abá', { timeout: 60000 });
    await page.getByRole('button', { name: 'Mais ferramentas', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Ferramentas avançadas' }).check();
    await page.getByRole('button', { name: 'Fechar mais ferramentas', exact: true }).click();
  }
  const original = structuredClone(runtime.project);
  const snapshot = await store.snapshot(original.id), draft = snapshot.envelope.drafts[original.passages[0].id];
  const context = { user: store.publicUser(await store.user('fixture')), clientId: page ? await page.evaluate(() => window.collab.clientId) : 'grammar-tab' };
  const submit = { projectId: original.id, passageId: draft.passageId,
    revisionId: draft.revisionId, operationId: 'fixture:submit', task: 'grammar-repair', scope: 'passage',
    grammarRepair: { mode: 'engine', raw: draft.raw, revisionId: draft.revisionId, intendedSurface: 'kunhã', explanation: 'Disposable reload fixture.' },
  };
  let job;
  if (page) {
    await page.getByRole('button', { name: 'Corrigir gramática / árvore', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Diagnóstico para corrigir a gramática', exact: true });
    await dialog.getByLabel('Forma pretendida', { exact: true }).fill('kunhã');
    await dialog.getByLabel('Explicação linguística', { exact: true }).fill('Disposable reload fixture.');
    const submitted = page.waitForResponse(response => response.url().endsWith('/api/invoke') && response.request().postDataJSON()?.method === 'analysis_submit');
    await dialog.getByRole('button', { name: 'Enviar ao Codex', exact: true }).click();
    const response = await submitted;
    assert.equal(response.status(), 200, await response.text());
    job = await response.json();
  } else job = await runtime.invoke('analysis_submit', submit, context);
  await Promise.race([editFinished, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Grammar edit did not finish')), 45000); timer.unref(); })]);
  assert.equal(toolResult.verification?.matches, true, JSON.stringify(toolResult));
  assert.equal(toolResult.verification.surface, 'kunhã');
  assert.equal(toolResult.verification.comparison.changed.length, 1);
  assert.notEqual(runtime.project.engineFingerprint, original.engineFingerprint);
  assert.ok(events.some(event => event.type === 'source-change' && event.projectId === original.id));
  assert.equal(runtime.hasWork(), true, 'Reload must keep the active repair and maintenance guard alive');
  if (page) await require('@playwright/test').expect(page.getByTestId('generated-surface')).toHaveText('kunhã', { timeout: 60000 });
  const refreshed = await runtime.refresh(context);
  assert.equal(refreshed.engineFingerprint, runtime.project.engineFingerprint);
  const evaluated = await runtime.invoke('evaluate_expression', { projectId: original.id, passageId: draft.passageId,
    sourceId: original.passages[0].sourceId, raw: draft.raw, revisionId: draft.revisionId, engineFingerprint: refreshed.engineFingerprint,
  }, context);
  assert.equal(evaluated.surface, 'kunhã');
  assert.equal(evaluated.engineFingerprint, refreshed.engineFingerprint);
  assert.equal((await runtime.invoke('analysis_get', { jobId: job.id }, context)).job.id, job.id);
  releaseRunner();
  let detail;
  for (let attempt = 0; attempt < 400; attempt++) {
    detail = await runtime.invoke('analysis_get', { jobId: job.id }, context);
    if (['ready-for-review', 'needs-input', 'failed'].includes(detail.job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(detail.job.status, 'ready-for-review', JSON.stringify(detail.job));
  assert.equal(detail.job.grammarEdits.length, 1);
  assert.equal(detail.job.grammarVerification.matches, true);
  assert.deepEqual(await store.snapshot(original.id), snapshot, 'A grammar correction must not rewrite any human draft or grant approval');
  assert.equal(await fs.readFile(source, 'utf8'), sourceBytes);
  assert.equal(await fs.readFile(rule, 'utf8'), 'FORM = "kunhã"\n');
  assert.deepEqual(browserErrors, []);
});

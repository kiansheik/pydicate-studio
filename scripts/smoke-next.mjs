import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

// Production Electron integration, with disposable source writes. It never commits,
// writes, approves, or regenerates data in the user's corpus or engine repository.
const require = createRequire(import.meta.url);
const { makePdfFixture } = require('../electron/tests/pdf-fixture.cjs');
const { PythonWorker } = require('../electron/python-worker.cjs');
const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originals = path.resolve(process.argv[2] || path.join(root, '..'));
const reportPath = path.join(root, 'docs/coverage/native-workflows.json');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pydicate-native-next-'));
const parent = path.join(temporary, 'projects');
const corpus = path.join(parent, 'oldtupicorpus');
const sourcePath = path.join(corpus, 'historic/araujo_catecismo_1686.tu.py');
const userData = path.join(temporary, 'user-data');
const evidenceDirectory = path.join(root, 'docs/coverage/native-screenshots');
const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  productionOrigin: 'studio://app/index.html',
  temporaryDirectory: temporary,
  sourcePolicy:
    'User corpus copied with dirty content; all writes target disposable copy. Engine symlink used only for reads.',
  stages: [],
  pageErrors: [],
};
let app, page, project, initialCount, initialRaw, selectedId, pdfRect;
const sourceName = 'araujo_catecismo_1686';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const watchedFiles = [
  'historic/araujo_catecismo_1686.tu.py',
  'historic/lexicon.tu.py',
  'ground_truth/records/historic/araujo_catecismo_1686.jsonl',
];
const originalHashes = {};
for (const file of watchedFiles)
  originalHashes[file] = hash(await fs.readFile(path.join(originals, 'oldtupicorpus', file)));

async function saveReport() {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
async function stage(name, fn) {
  const item = { name, startedAt: new Date().toISOString(), status: 'running' };
  report.stages.push(item);
  try {
    item.evidence = await fn();
    item.status = 'passed';
  } catch (error) {
    item.status = 'failed';
    item.error = error.message;
    console.error(`${name}: ${error.message}`);
  }
  item.finishedAt = new Date().toISOString();
  if (page && !page.isClosed()) {
    const screenshot = path.join(
      evidenceDirectory,
      `${String(report.stages.length).padStart(2, '0')}-${name}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => {});
    item.screenshot = path.relative(root, screenshot);
    if (item.status === 'failed') {
      // Preserve the failure screenshot, then remove modal blockers so independent
      // later workflows can report their own result instead of cascading timeouts.
      const reviewBack = page.getByRole('button', { name: 'Voltar sem aplicar', exact: true });
      if (await reviewBack.isVisible()) await reviewBack.click().catch(() => {});
      const newDialog = page.getByRole('dialog', { name: 'Nova passagem', exact: true });
      if (await newDialog.isVisible())
        await newDialog
          .getByRole('button', { name: 'Fechar e manter rascunho', exact: true })
          .click()
          .catch(() => {});
    }
  }
  console.log(`${item.status}: ${name}`);
  await saveReport();
  return item.status === 'passed';
}
async function launch() {
  const environment = { ...process.env, PYDICATE_STUDIO_DEV: '0', PYDICATE_PROJECT_PARENT: parent };
  delete environment.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: [path.join(temporary, 'bootstrap.cjs')],
    env: environment,
    timeout: 30_000,
  });
  page = await app.firstWindow();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  await page.waitForURL('studio://app/index.html');
  await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('textbox', { name: 'Transcrição diplomática', exact: true }),
  ).toBeEnabled();
}
async function close() {
  if (app) {
    await app.close();
    app = null;
  }
}
const invoke = (method, params = {}) =>
  page.evaluate(({ method, params }) => window.studio.invoke(method, params), { method, params });
async function readProject() {
  // Inspect source through an independent process. Refreshing the application's
  // worker here would interrupt a concurrent post-edit renderer evaluation.
  const stateDirectory = path.join(temporary, 'inspection-state');
  await fs.mkdir(stateDirectory, { recursive: true });
  const applicationState = path.join(userData, 'projects');
  for (const name of await fs.readdir(applicationState)) {
    if (name.endsWith('.ids.json'))
      await fs.copyFile(path.join(applicationState, name), path.join(stateDirectory, name));
  }
  const inspector = new PythonWorker({
    script: path.join(root, 'python/worker.py'),
    stateDirectory,
  });
  try {
    return await inspector.request('open_project', { parentPath: parent });
  } finally {
    inspector.close();
  }
}
async function select(ordinal) {
  await page.getByRole('textbox', { name: 'Buscar passagem', exact: true }).fill('');
  await page
    .locator('.passage-item')
    .filter({
      has: page.locator('.ordinal', {
        hasText: new RegExp(`^${String(ordinal).padStart(4, '0')}$`),
      }),
    })
    .click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText(
    `Passagem ${String(ordinal).padStart(4, '0')}`,
  );
  selectedId = project.passages.find((item) => item.ordinal === ordinal)?.id;
}
async function analysis() {
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
}
async function rawEditor(visual = false) {
  await analysis();
  await page.getByRole('tab', { name: visual ? 'Construção' : 'Código', exact: true }).click();
  const openCode = page.getByRole('button', { name: 'Editar Pydicate', exact: true });
  if (visual && (await openCode.isVisible())) await openCode.click();
  const editor = page.getByRole('textbox', { name: 'Pydicate editável', exact: true });
  await expect(editor).toBeVisible();
  return editor;
}
async function lexicalCatalog() {
  await page.getByRole('button', { name: 'Léxico', exact: true }).click();
  const catalog = page.locator('details').filter({
    has: page.locator('summary', { hasText: 'Catálogo do projeto e dicionário Navarro' }),
  });
  if ((await catalog.getAttribute('open')) === null)
    await catalog.locator(':scope > summary').click();
}
async function waitEvaluated() {
  await expect(page.getByTestId('generated-surface')).not.toHaveText(
    /Avaliando|Sem resultado|Não foi possível/,
    { timeout: 25_000 },
  );
  return page.getByTestId('generated-surface').innerText();
}
async function savedDraft(passageId, predicate) {
  let draft;
  await expect
    .poll(
      async () => {
        const envelope = await page.evaluate((id) => window.studio.loadDrafts(id), project.id);
        draft = envelope?.drafts[passageId];
        return Boolean(draft && predicate(draft));
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return draft;
}
async function readyPdf() {
  await expect(page.getByTestId('pdf-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toBeEnabled({
    timeout: 20_000,
  });
}

try {
  await fs.mkdir(parent, { recursive: true });
  await fs.mkdir(userData, { recursive: true });
  await fs.mkdir(path.join(temporary, 'session-data'), { recursive: true });
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await run('git', [
    'clone',
    '--shared',
    '--no-checkout',
    path.join(originals, 'oldtupicorpus'),
    corpus,
  ]);
  await run('git', ['-C', corpus, 'read-tree', 'HEAD']);
  for (const directory of [
    'historic',
    'ground_truth',
    'authoring',
    'tests',
    'synthetic',
    'dictionary',
  ])
    await fs.cp(path.join(originals, 'oldtupicorpus', directory), path.join(corpus, directory), {
      recursive: true,
      filter: (file) => !file.includes('__pycache__'),
    });
  for (const entry of await fs.readdir(path.join(originals, 'oldtupicorpus')))
    if (entry.endsWith('.py'))
      await fs.copyFile(path.join(originals, 'oldtupicorpus', entry), path.join(corpus, entry));
  await fs.symlink(path.join(originals, 'nhe-enga'), path.join(parent, 'nhe-enga'));
  await fs.writeFile(
    path.join(temporary, 'bootstrap.cjs'),
    `const { app }=require('electron');\napp.setPath('userData',${JSON.stringify(userData)});\napp.setPath('sessionData',${JSON.stringify(path.join(temporary, 'session-data'))});\nrequire(${JSON.stringify(path.join(root, 'electron/main.cjs'))});\n`,
  );
  await fs.access(path.join(root, 'dist/index.html'));
  const started = await stage('startup-isolation', async () => {
    await launch();
    project = await readProject();
    initialCount = project.passages.length;
    assert(initialCount > 70, 'Real Araújo inventory should have many expressions.');
    assert(project.passages.every((item) => item.sourceId === sourceName));
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    const policy = await page.evaluate(async () =>
      (await fetch(location.href)).headers.get('Content-Security-Policy'),
    );
    assert(policy.includes("script-src 'self'"));
    assert(!policy.includes('unsafe-eval'));
    const preferences = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
    );
    assert(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration);
    const ordinal = Number(await page.locator('.passage-item.active .ordinal').textContent());
    selectedId = project.passages.find((item) => item.ordinal === ordinal).id;
    return {
      count: initialCount,
      selectedOrdinal: ordinal,
      repositories: project.repositories,
      engineFingerprint: project.engineFingerprint,
      csp: policy,
      sandbox: true,
      darkDefault: true,
    };
  });
  if (!started) throw new Error('Startup failed; subsequent UI workflows require a loaded corpus.');

  await stage('construction-families', async () => {
    const families = [
      ['subordination', (text) => text.includes('<<')],
      ['nominalization', (text) => text.includes('.base_nominal')],
      ['helper', (text) => text.startsWith('credo(')],
    ];
    const checks = [];
    for (const [family, matches] of families) {
      const passage = project.passages.find((item) => matches(item.sourceExpression));
      assert(passage, `Missing observed ${family} expression.`);
      await select(passage.ordinal);
      const editor = await rawEditor(true);
      await expect(editor).toHaveValue(passage.sourceExpression);
      const before = await waitEvaluated();
      await page.locator('[data-author-node="root"]').click();
      await page
        .getByRole('combobox', { name: 'Operação na parte selecionada' })
        .selectOption('negate');
      await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
      await expect(editor).not.toHaveValue(passage.sourceExpression);
      const editedRaw = await editor.inputValue();
      const editedTree = await invoke('parse_expression', {
        raw: editedRaw,
        revisionId: 'native-scope-assertion',
      });
      assert.equal(editedTree.root.kind, 'unary');
      assert.equal(editedTree.root.operator, '-');
      await expect(page.locator('[data-author-node="root"]')).toContainText('-');
      await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
      await expect(editor).toHaveValue(passage.sourceExpression);
      await page.getByRole('button', { name: 'Refazer edição', exact: true }).click();
      await expect(editor).toHaveValue(editedRaw);
      await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
      await expect(editor).toHaveValue(passage.sourceExpression);
      const rawCandidate =
        family === 'helper'
          ? passage.sourceExpression.replace('tuba', 'tayra')
          : `(${passage.sourceExpression}).copy()`;
      await editor.fill(rawCandidate);
      const rawCandidateSurface = await waitEvaluated();
      await expect(page.locator('[data-author-node="root"]')).toBeVisible();
      await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
      await expect(editor).toHaveValue(passage.sourceExpression);
      checks.push({
        family,
        ordinal: passage.ordinal,
        expression: passage.sourceExpression,
        originalSurface: before,
        scopeEdit: 'outer negation',
        emittedVisualEdit: editedRaw,
        undoRedo: true,
        rawCandidate,
        rawCandidateSurface,
      });
    }
    return checks;
  });

  await stage('invalid-draft-save-restart', async () => {
    await select(67);
    initialRaw = project.passages.find((item) => item.ordinal === 67).sourceExpression;
    const editor = await rawEditor(true);
    await editor.fill('(nde *');
    await page
      .getByRole('textbox', { name: 'Nota de leitura', exact: true })
      .fill('Leitura incompleta preservada no desktop: hipótese, não aprovação.');
    await page
      .getByRole('textbox', { name: 'Transcrição diplomática', exact: true })
      .fill('Contribuição mesmo sem análise executável.');
    await savedDraft(
      selectedId,
      (draft) => draft.raw === '(nde *' && draft.notes.includes('hipótese'),
    );
    await expect(page.locator('[data-author-node="root"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Alternar tema', exact: true }).click();
    await close();
    await launch();
    await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0067');
    await expect(await rawEditor()).toHaveValue('(nde *');
    await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
      /hipótese/,
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await (await rawEditor()).fill(initialRaw);
    await waitEvaluated();
    return {
      passageId: selectedId,
      incompleteRaw: '(nde *',
      notesAndTranscriptionRecovered: true,
      selectionRecovered: true,
      lightThemeRecovered: true,
    };
  });

  await stage('pdf-native-canvas-regions', async () => {
    const pdf = path.join(temporary, 'witness-original.pdf');
    await fs.writeFile(pdf, makePdfFixture());
    // Only the native OS picker is controlled; production attach/bytes/region IPC is real.
    await app.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
    }, pdf);
    await page.getByRole('button', { name: 'Vincular PDF à fonte', exact: true }).click();
    await readyPdf();
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await readyPdf();
    await page.getByRole('button', { name: 'Marcar região', exact: true }).click();
    await page.getByTestId('pdf-canvas').scrollIntoViewIfNeeded();
    const box = await page.getByTestId('pdf-canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('pdf-region')).toHaveCount(1);
    pdfRect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    const coordinates = pdfRect.split(',').map(Number);
    for (const [index, expected] of [100, 300, 260, 400].entries())
      assert(Math.abs(coordinates[index] - expected) < 3);
    await page.getByRole('button', { name: 'Girar 90°', exact: true }).click();
    await page.getByLabel('Zoom do PDF').selectOption('1.5');
    await page.getByRole('separator', { name: 'Redimensionar Direita', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await readyPdf();
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', pdfRect);
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    const status = await invoke('evidence_status', {
      projectId: project.id,
      passageId: selectedId,
      sourceId: sourceName,
    });
    assert.equal(status.passage.view.rotation, 90);
    assert.equal(status.passage.view.zoom, 1.5);
    await close();
    await launch();
    await readyPdf();
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', pdfRect);
    await expect(page.getByLabel('Zoom do PDF')).toHaveValue('1.5');
    await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', pdfRect);
    await expect(
      page.getByText('Localização herdada da passagem 67', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Passagem anterior', exact: true }).click();
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', pdfRect);
    return {
      pdfCoordinates: coordinates,
      nativePickerControlled: true,
      productionPdfJsCanvas: true,
      rotation: 90,
      zoom: 1.5,
      restartAndNavigationPreserved: true,
      nextPassageInheritedEditableLocation: true,
      asset: status.asset,
    };
  });

  await stage('dictionary-sense-definition-apply', async () => {
    await lexicalCatalog();
    await page.getByRole('button', { name: 'Dicionário Navarro', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Buscar no léxico ou Navarro', exact: true })
      .fill('casa');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Usar esta acepção', exact: true }).first(),
    ).toBeVisible({ timeout: 20_000 });
    const sense = await page.locator('.lexicon-results article').first().innerText();
    await page.getByRole('button', { name: 'Usar esta acepção', exact: true }).first().click();
    const headword = await page
      .getByRole('textbox', { name: 'Palavra da nova definição', exact: true })
      .inputValue();
    const definition = await page
      .getByRole('textbox', { name: 'Definição lexical', exact: true })
      .inputValue();
    assert(headword && definition);
    await page
      .getByRole('button', { name: 'Revisar definição e usos afetados', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true }),
    ).toBeVisible({ timeout: 25_000 });
    const diff = await page
      .getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true })
      .locator('pre')
      .innerText();
    assert(diff.includes('Navarro') || diff.includes('dictionary'));
    await page.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true }),
    ).toHaveCount(0, { timeout: 25_000 });
    const modified = await fs.readFile(sourcePath, 'utf8');
    assert(modified.includes(headword));
    project = await readProject();
    return {
      actualQuery: 'casa',
      sense,
      headword,
      definition,
      diff,
      disposableSourceChanged: true,
    };
  });

  await stage('reuse-compound-reference', async () => {
    await rawEditor(true);
    await page.locator('[data-author-node="root"]').click();
    await lexicalCatalog();
    await page.getByRole('button', { name: 'Definições do projeto', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Buscar no léxico ou Navarro', exact: true })
      .fill('salve_rainha');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Inspecionar / reutilizar', exact: true }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole('button', { name: 'Inspecionar / reutilizar', exact: true })
      .first()
      .click();
    await page
      .getByRole('button', { name: 'Usar referência na parte selecionada', exact: true })
      .click();
    const reusedRaw = await (await rawEditor()).inputValue();
    const reusedTree = await invoke('parse_expression', {
      raw: reusedRaw,
      revisionId: 'native-reference-assertion',
    });
    assert.equal(reusedTree.root.kind, 'reference');
    assert.equal(reusedTree.root.lexicalReference, 'salve_rainha');
    const surface = await waitEvaluated();
    await (await rawEditor()).fill(initialRaw);
    await waitEvaluated();
    return { namedReference: 'salve_rainha', actualSurface: surface, copiedExpression: false };
  });

  await stage('reviewed-source-writeback', async () => {
    const before = await fs.readFile(sourcePath, 'utf8');
    const editor = await rawEditor();
    const candidate = `(${initialRaw}).copy()`;
    await editor.fill(candidate);
    await waitEvaluated();
    await page.getByRole('button', { name: 'Revisar', exact: true }).click();
    await page.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(dialog).toBeVisible({ timeout: 25_000 });
    const diff = await dialog.locator('pre').innerText();
    assert(diff.includes('.copy()'));
    await page.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 25_000 });
    const after = await fs.readFile(sourcePath, 'utf8');
    assert.notEqual(after, before);
    assert(after.includes(candidate));
    await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0067');
    await expect(await rawEditor()).toHaveValue(candidate);
    assert.equal((await readProject()).passages.length, initialCount);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', pdfRect);
    project = await readProject();
    const recordsPath = path.join(corpus, 'ground_truth/records/historic', `${sourceName}.jsonl`);
    const beforeRecords = (await fs.readFile(recordsPath, 'utf8')).trimEnd().split('\n');
    await page
      .locator('.workspace-footer')
      .getByRole('button', { name: 'Commit to Ground Truth', exact: true })
      .click();
    const groundTruth = page.getByRole('dialog', { name: 'Commit to Ground Truth', exact: true });
    const confirm = groundTruth.getByRole('button', {
      name: 'Confirmar e salvar ground truth',
      exact: true,
    });
    await expect(confirm).toBeEnabled({ timeout: 20_000 });
    await groundTruth
      .getByRole('button', { name: 'Confirmar e salvar ground truth', exact: true })
      .click();
    await expect(
      page.getByText('Ground truth salva. As outras passagens foram preservadas.', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await groundTruth.getByRole('button', { name: 'Fechar ground truth', exact: true }).click();
    const afterRecords = (await fs.readFile(recordsPath, 'utf8')).trimEnd().split('\n');
    assert.equal(afterRecords.length, beforeRecords.length);
    for (let index = 0; index < beforeRecords.length; index++) {
      if (index === 66) continue;
      assert.deepEqual(JSON.parse(afterRecords[index]), JSON.parse(beforeRecords[index]));
    }
    assert.equal(JSON.parse(afterRecords[66]).status, 'approved');
    project = await readProject();
    return {
      candidate,
      diff,
      identityPreserved: selectedId,
      pdfRetained: true,
      countUnchanged: true,
      explicitGroundTruthConfirmed: true,
      otherReferenceRecordsUnchanged: true,
      otherReferenceBytesUnchanged: afterRecords.every(
        (line, index) => index === 66 || line === beforeRecords[index],
      ),
    };
  });

  await stage('new-passage-ui', async () => {
    await page.getByRole('button', { name: 'Nova passagem', exact: true }).click();
    const newDialog = page.getByRole('dialog', { name: 'Nova passagem', exact: true });
    await expect(
      newDialog.getByRole('textbox', { name: 'Transcrição da nova passagem', exact: true }),
    ).toBeVisible();
    await expect(
      newDialog.getByRole('button', { name: 'Revisar nova passagem', exact: true }),
    ).toBeDisabled();
    await newDialog
      .locator('summary')
      .filter({ hasText: /^Análise opcional$/ })
      .click();
    await newDialog
      .getByRole('textbox', { name: 'Pydicate da nova passagem', exact: true })
      .fill('nde');
    await newDialog.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(dialog).toBeVisible();
    const diff = await dialog.locator('pre').innerText();
    await page.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 25_000 });
    project = await readProject();
    assert.equal(project.passages.length, initialCount + 1);
    await expect(page.locator('.breadcrumbs strong')).toHaveText(
      `Passagem ${String(initialCount + 1).padStart(4, '0')}`,
    );
    const newPassage = project.passages.find((item) => item.ordinal === initialCount + 1);
    await expect(await rawEditor()).toHaveValue(newPassage.sourceExpression);
    const newTree = await invoke('parse_expression', {
      raw: newPassage.sourceExpression,
      revisionId: 'native-new-assertion',
    });
    assert.equal(newTree.root.kind, 'reference');
    assert.equal(newTree.root.lexicalReference, 'nde');
    return {
      originalCount: initialCount,
      newCount: project.passages.length,
      diff,
      contributorInput: 'nde',
      sourceExpression: newPassage.sourceExpression,
    };
  });

  await stage('reading-only-pending-restart-and-apply', async () => {
    const beforeCount = project.passages.length;
    const sourceBefore = await fs.readFile(sourcePath, 'utf8');
    const metadata = {
      diplomatic: 'Nova leitura sem análise — testemunho de teste.',
      normalized: 'Leitura normalizada ainda incerta.',
      translation: 'Interpretação provisória do colaborador.',
      notes: 'Conferir a leitura no testemunho. Análise a preparar depois.',
      locators: { printedPage: '123', folio: '61r', line: '3-4' },
    };
    await page.getByRole('button', { name: 'Nova passagem', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nova passagem', exact: true });
    await dialog
      .getByRole('textbox', { name: 'Transcrição da nova passagem', exact: true })
      .fill(metadata.diplomatic);
    await dialog
      .getByRole('textbox', { name: 'Leitura normalizada da nova passagem', exact: true })
      .fill(metadata.normalized);
    await dialog
      .getByRole('textbox', { name: 'Tradução da nova passagem', exact: true })
      .fill(metadata.translation);
    await dialog
      .getByRole('textbox', { name: 'Notas da nova passagem', exact: true })
      .fill(metadata.notes);
    await dialog
      .locator('summary')
      .filter({ hasText: /^Localização e evidência da nova leitura$/ })
      .click();
    await dialog
      .getByRole('textbox', { name: 'Página impressa da nova passagem', exact: true })
      .fill(metadata.locators.printedPage);
    await dialog
      .getByRole('textbox', { name: 'Fólio da nova passagem', exact: true })
      .fill(metadata.locators.folio);
    await dialog
      .getByRole('textbox', { name: 'Linhas no texto da nova passagem', exact: true })
      .fill(metadata.locators.line);
    await expect(
      dialog.getByRole('button', { name: 'Revisar nova passagem', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Salvar nova leitura', exact: true }).click();
    await expect(
      dialog.getByText('Rascunho salvo, mesmo sem análise executável.', { exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate((id) => window.studio.loadDrafts(id), project.id);
    const pending = Object.values(saved.drafts).find(
      (item) => item.passageId.startsWith('pending:') && item.diplomatic === metadata.diplomatic,
    );
    assert(pending, 'Saved reading-only draft has a discoverable pending identity.');
    assert.equal(pending.raw, '');
    assert.equal(pending.notes, metadata.notes);
    assert.deepEqual(pending.locators, metadata.locators);
    assert.equal(await fs.readFile(sourcePath, 'utf8'), sourceBefore);
    assert.equal((await readProject()).passages.length, beforeCount);
    await close();
    await launch();
    const restored = page.getByRole('dialog', { name: 'Nova passagem', exact: true });
    await expect(restored).toBeVisible();
    await expect(
      restored.getByRole('textbox', { name: 'Transcrição da nova passagem', exact: true }),
    ).toHaveValue(metadata.diplomatic);
    await expect(
      restored.getByRole('textbox', { name: 'Notas da nova passagem', exact: true }),
    ).toHaveValue(metadata.notes);
    await expect(
      restored.getByRole('button', { name: 'Revisar nova passagem', exact: true }),
    ).toBeDisabled();
    await restored.getByRole('button', { name: 'Fechar e manter rascunho', exact: true }).click();
    const savedReading = page
      .locator('.pending-passages button')
      .filter({ hasText: metadata.diplomatic.slice(0, 45) });
    await expect(savedReading).toBeVisible();
    await savedReading.click();
    await expect(restored).toBeVisible();
    await restored
      .locator('summary')
      .filter({ hasText: /^Análise opcional$/ })
      .click();
    await expect(
      restored.getByRole('textbox', { name: 'Pydicate da nova passagem', exact: true }),
    ).toHaveValue('');
    const readingScreenshot = path.join(evidenceDirectory, '09-reading-only-restored.png');
    await page.screenshot({ path: readingScreenshot, fullPage: false });
    await restored
      .getByRole('textbox', { name: 'Pydicate da nova passagem', exact: true })
      .fill('nde');
    await restored.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(review).toBeVisible();
    const diff = await review.locator('pre').innerText();
    assert(diff.includes(metadata.diplomatic));
    assert(diff.includes(metadata.notes));
    assert.equal(await fs.readFile(sourcePath, 'utf8'), sourceBefore);
    await review.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(review).toHaveCount(0, { timeout: 25_000 });
    project = await readProject();
    assert.equal(project.passages.length, beforeCount + 1);
    const canonicalId = pending.passageId.replace(/^pending:/, 'passage:');
    const added = project.passages.find((item) => item.id === canonicalId);
    assert(added, 'Reviewed reading keeps its reserved permanent passage identity.');
    await expect(page.locator('.breadcrumbs strong')).toHaveText(
      `Passagem ${String(added.ordinal).padStart(4, '0')}`,
    );
    const canonicalDraft = await savedDraft(canonicalId, (item) => item.notes === metadata.notes);
    for (const key of ['diplomatic', 'normalized', 'translation', 'notes']) {
      assert.equal(canonicalDraft[key], metadata[key]);
      assert.equal(added[key], metadata[key]);
    }
    assert.deepEqual(canonicalDraft.locators, metadata.locators);
    await expect(
      page
        .locator('.pending-passages button')
        .filter({ hasText: metadata.diplomatic.slice(0, 45) }),
    ).toHaveCount(0);
    const sourceAfter = await fs.readFile(sourcePath, 'utf8');
    for (const text of Object.values(metadata).filter((value) => typeof value === 'string'))
      assert(sourceAfter.includes(text));
    assert(sourceAfter.includes('# @page 123'));
    assert(sourceAfter.includes('# @folio 61r'));
    assert(sourceAfter.includes('# @line 3-4'));
    assert(sourceAfter.includes(canonicalId));
    await close();
    await launch();
    await expect(page.locator('.breadcrumbs strong')).toHaveText(
      `Passagem ${String(added.ordinal).padStart(4, '0')}`,
    );
    await expect(
      page.getByRole('textbox', { name: 'Transcrição diplomática', exact: true }),
    ).toHaveValue(metadata.diplomatic);
    await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
      metadata.notes,
    );
    await expect(await rawEditor()).toHaveValue(added.sourceExpression);
    return {
      beforeCount,
      afterCount: project.passages.length,
      pendingId: pending.passageId,
      canonicalId,
      emptyAnalysisSaved: true,
      sourceUnchangedUntilReviewApplied: true,
      restoredDialogAndSidebar: true,
      metadata,
      diff,
      permanentDraftSurvivedRestart: true,
      readingOnlyScreenshot: path.relative(root, readingScreenshot),
    };
  });

  await stage('provider-ui-configuration', async () => {
    await page.getByRole('button', { name: 'Assistência IA', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Provedor de IA', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verificar conexão', exact: true })).toBeEnabled({
      timeout: 35_000,
    });
    const state = await page.locator('.assistant-connection').innerText();
    await page
      .getByRole('combobox', { name: 'Provedor de IA', exact: true })
      .selectOption('claude');
    await expect(page.getByLabel('Modelo de IA', { exact: true })).toHaveValue(
      'claude-haiku-4-5-20251001',
    );
    const tasks = await page
      .getByRole('combobox', { name: 'Tarefa de IA', exact: true })
      .locator('option')
      .allTextContents();
    assert.equal(tasks.length, 4);
    await expect(
      page.getByRole('combobox', { name: 'Escopo da solicitação', exact: true }),
    ).toHaveValue('passage');
    const completeTarget = await page.getByLabel('Expressão enviada para análise').textContent();
    assert(completeTarget.trim().length > 0);
    return {
      codexState: state,
      tasks,
      credentialsAbsentFromRenderer: true,
      explicitScope: 'passage',
      generation:
        'Not requested. Provider generation tests remain simulated; this stage inspects configuration and the explicit full-passage target only.',
    };
  });

  await stage('external-source-conflict', async () => {
    await select(67);
    const editor = await rawEditor();
    const currentRaw = await editor.inputValue();
    await editor.fill(`(${currentRaw}).copy()`);
    await waitEvaluated();
    await page.getByRole('button', { name: 'Revisar', exact: true }).click();
    await page.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(dialog).toBeVisible();
    const outside = '\n# Native smoke: external edit in disposable source only.\n';
    await fs.appendFile(sourcePath, outside);
    await page.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(/mudou|alterad|stale|fora/i, {
      timeout: 15_000,
    });
    assert((await fs.readFile(sourcePath, 'utf8')).endsWith(outside));
    await expect(dialog).toBeVisible();
    const alert = await dialog.getByRole('alert').innerText();
    await page.getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
    await expect(await rawEditor()).toHaveValue(`(${currentRaw}).copy()`);
    return {
      staleApplyRejected: true,
      externalSourceRetained: true,
      draftRetained: true,
      alert,
    };
  });
} catch (error) {
  report.fatalError = error.message;
} finally {
  await close();
  report.originalCorpusUnchanged = {};
  for (const [file, before] of Object.entries(originalHashes))
    report.originalCorpusUnchanged[file] =
      before === hash(await fs.readFile(path.join(originals, 'oldtupicorpus', file)));
  report.finishedAt = new Date().toISOString();
  report.passed =
    !report.fatalError &&
    report.stages.every((item) => item.status === 'passed') &&
    Object.values(report.originalCorpusUnchanged).every(Boolean);
  await saveReport();
  console.log(
    JSON.stringify({
      report: reportPath,
      passed: report.passed,
      temporaryDirectory: temporary,
      stageCount: report.stages.length,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}

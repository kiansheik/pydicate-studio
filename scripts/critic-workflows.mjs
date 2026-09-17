import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
const run = promisify(execFile);
const require = createRequire(import.meta.url);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'critic-round2-'));
const parent = path.join(temp, 'projects');
const corpus = path.join(parent, 'oldtupicorpus');
const userData = path.join(temp, 'profile');
const out = path.join(root, 'docs/reviews/round-2-evidence.json');
const images = path.join(root, 'docs/reviews/round-2-screenshots');
const evidence = {
  startedAt: new Date().toISOString(),
  temp,
  stages: [],
  pageErrors: [],
  policy:
    'Production Electron with disposable full dirty corpus copy; selected engine read-only symlink.',
};
let app, page, project;
await fs.mkdir(parent, { recursive: true });
await fs.mkdir(userData);
await fs.mkdir(images, { recursive: true });
await run('git', ['clone', '--shared', '--no-checkout', '/Users/kian/code/oldtupicorpus', corpus]);
await run('git', ['-C', corpus, 'read-tree', 'HEAD']);
for (const dir of ['historic', 'ground_truth', 'authoring', 'tests', 'synthetic', 'dictionary'])
  await fs.cp(path.join('/Users/kian/code/oldtupicorpus', dir), path.join(corpus, dir), {
    recursive: true,
    filter: (p) => !p.includes('__pycache__'),
  });
for (const name of await fs.readdir('/Users/kian/code/oldtupicorpus'))
  if (name.endsWith('.py'))
    await fs.copyFile(path.join('/Users/kian/code/oldtupicorpus', name), path.join(corpus, name));
await fs.symlink('/Users/kian/code/nhe-enga', path.join(parent, 'nhe-enga'));
await fs.writeFile(
  path.join(temp, 'boot.cjs'),
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(userData)});require(${JSON.stringify(path.join(root, 'electron/main.cjs'))});`,
);
async function save() {
  await fs.writeFile(out, JSON.stringify(evidence, null, 2) + '\n');
}
async function stage(name, fn) {
  const item = { name };
  evidence.stages.push(item);
  try {
    item.evidence = await fn();
    item.status = 'passed';
  } catch (error) {
    item.status = 'failed';
    item.error = String(error);
    console.error(name + ': ' + error.message);
  }
  if (page && !page.isClosed()) {
    item.screenshot = path.relative(
      root,
      path.join(images, String(evidence.stages.length).padStart(2, '0') + '-' + name + '.png'),
    );
    await page.screenshot({ path: path.join(root, item.screenshot) }).catch(() => {});
    const back = page.getByRole('button', { name: 'Voltar sem aplicar', exact: true });
    if (await back.isVisible()) await back.click();
    const cancel = page
      .getByRole('dialog', { name: 'Nova passagem', exact: true })
      .getByRole('button', { name: 'Cancelar', exact: true });
    if (await cancel.isVisible()) await cancel.click();
  }
  console.log(item.status + ': ' + name);
  await save();
}
const invoke = (method, params = {}) =>
  page.evaluate(({ method, params }) => window.studio.invoke(method, params), { method, params });
async function select(ordinal) {
  await page.getByRole('textbox', { name: 'Buscar passagem', exact: true }).fill('');
  await page
    .locator('.passage-item')
    .filter({
      has: page.locator('.ordinal', {
        hasText: new RegExp('^' + String(ordinal).padStart(4, '0') + '$'),
      }),
    })
    .click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText(
    'Passagem ' + String(ordinal).padStart(4, '0'),
  );
}
async function raw() {
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
  const edit = page.getByRole('textbox', { name: 'Pydicate editável', exact: true });
  if (!(await edit.isVisible()))
    await page.getByRole('button', { name: 'Editar Pydicate', exact: true }).click();
  return edit;
}
async function evaluated() {
  await expect(page.getByTestId('generated-surface')).not.toHaveText(
    /Avaliando|Sem resultado|Não foi possível/,
    { timeout: 25000 },
  );
  return page.getByTestId('generated-surface').innerText();
}
async function getDraft(ordinal) {
  const id = project.passages.find((p) => p.ordinal === ordinal).id;
  return page.evaluate(
    async ({ projectId, id }) => (await window.studio.loadDrafts(projectId)).drafts[id],
    { projectId: project.id, id },
  );
}
async function lexsearch(query) {
  await page.getByRole('button', { name: 'Léxico', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar no léxico ou Navarro', exact: true }).fill(query);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.locator('.lexicon-results article').first()).toBeVisible({ timeout: 25000 });
}
try {
  const env = { ...process.env, PYDICATE_STUDIO_DEV: '0', PYDICATE_PROJECT_PARENT: parent };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [path.join(temp, 'boot.cjs')], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', (e) => evidence.pageErrors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForURL('studio://app/index.html');
  await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 30000 });
  project = await page.evaluate(() => window.studio.refreshProject());
  await stage('unfamiliar-families-role-cards', async () => {
    const rows = [];
    for (const ordinal of [2, 16, 40, 58, 74, 79, 82]) {
      await select(ordinal);
      const edit = await raw();
      const original = project.passages.find((p) => p.ordinal === ordinal).sourceExpression;
      await expect(edit).toHaveValue(original);
      const surface = await evaluated();
      const roles = await page.locator('.engine-roles').allTextContents();
      const typed = await page.locator('.node-dispatch').allTextContents();
      await page.locator('[data-author-node="root"]').click();
      await page
        .getByRole('combobox', { name: 'Operação na parte selecionada' })
        .selectOption('copy');
      await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
      await expect(edit).not.toHaveValue(original);
      await expect.poll(() => getDraft(ordinal)).toMatchObject({ raw: await edit.inputValue() });
      const after = await evaluated();
      assert.equal(after, surface);
      await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
      await expect(edit).toHaveValue(original);
      rows.push({ ordinal, surface, roles, typed, copyEditSurfaceEqual: true });
    }
    return rows;
  });
  await stage('named-compound-inspection-and-reuse', async () => {
    await select(60);
    await raw();
    await page.locator('[data-author-node="root"]').click();
    await lexsearch('rightsidegod');
    const card = page
      .locator('.lexicon-results article')
      .filter({ has: page.locator('strong', { hasText: /^rightsidegod$/ }) });
    await card.getByRole('button', { name: 'Inspecionar / reutilizar' }).click();
    await page.getByText('Estrutura da definição', { exact: true }).click();
    await expect(page.locator('.lexical-choice [data-author-node="root"]')).toBeVisible();
    await page.getByRole('button', { name: 'Usar referência na parte selecionada' }).click();
    const edit = await raw();
    await expect(edit).toHaveValue('(rightsidegod)');
    const result = await evaluated();
    await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
    return { reused: 'rightsidegod', result, referenceRetained: true };
  });
  await stage('parameterized-helper-reuse', async () => {
    await select(48);
    await raw();
    await page.locator('[data-author-node="root"]').click();
    await lexsearch('credo');
    await page
      .locator('.lexicon-results article')
      .filter({ has: page.locator('strong', { hasText: /^credo$/ }) })
      .getByRole('button', { name: 'Inspecionar / reutilizar' })
      .click();
    await page.getByRole('textbox', { name: 'Parâmetro x', exact: true }).fill('tayra');
    await page.getByText('Estrutura da definição', { exact: true }).click();
    await expect(page.locator('.lexical-choice [data-author-node="root"]')).toContainText('*');
    await page.getByRole('button', { name: 'Usar referência na parte selecionada' }).click();
    const edit = await raw();
    await expect(edit).toHaveValue('(credo(x=tayra))');
    const result = await evaluated();
    await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
    return { helper: 'credo', parameter: 'tayra', result };
  });
  await stage('raw-invalid-independent-reading-save', async () => {
    await select(79);
    const edit = await raw();
    await edit.fill('n(îe *');
    await page
      .getByRole('textbox', { name: 'Nota de leitura', exact: true })
      .fill('Dúvida humana sem análise executável — critic round 2.');
    await page
      .getByRole('textbox', { name: 'Transcrição diplomática', exact: true })
      .fill('Leitura provisória do fac-símile.');
    await expect
      .poll(() => getDraft(79))
      .toMatchObject({
        raw: 'n(îe *',
        notes: 'Dúvida humana sem análise executável — critic round 2.',
      });
    await expect(page.locator('[data-author-node="root"]')).toHaveCount(0);
    await select(78);
    await select(79);
    await expect(await raw()).toHaveValue('n(îe *');
    const saved = await getDraft(79);
    await (await raw()).fill(project.passages[78].sourceExpression);
    return saved;
  });
  await stage('navarro-sense-create-and-reuse', async () => {
    await select(48);
    await lexsearch('taba');
    await page.getByRole('button', { name: 'Dicionário Navarro', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Buscar no léxico ou Navarro', exact: true })
      .fill('casa');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.locator('.lexicon-results article').first()).toBeVisible({ timeout: 25000 });
    const dictionaryRows = await page.locator('.lexicon-results article').count();
    await page
      .locator('.lexicon-results article')
      .first()
      .getByRole('button', { name: 'Usar esta acepção' })
      .click();
    const headword = await page
      .getByRole('textbox', { name: 'Palavra da nova definição', exact: true })
      .inputValue();
    await page
      .getByRole('combobox', { name: 'Categoria lexical', exact: true })
      .selectOption('Noun');
    await page.getByRole('button', { name: 'Revisar definição e usos afetados' }).click();
    const preview = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(preview).toBeVisible({ timeout: 25000 });
    const name = await preview.locator('strong').innerText();
    const diff = await preview.locator('pre').innerText();
    assert(diff.includes('navarro:'));
    await preview.getByRole('button', { name: 'Aplicar edição revisada' }).click();
    await expect(preview).toHaveCount(0, { timeout: 25000 });
    project = await page.evaluate(() => window.studio.refreshProject());
    await page.getByRole('button', { name: 'Definições do projeto', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Buscar no léxico ou Navarro', exact: true })
      .fill(name);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.locator('.lexicon-results article').first()).toContainText(name, {
      timeout: 25000,
    });
    return { query: 'casa', dictionaryRows, headword, name, diff };
  });
  await stage('new-passage-reviewed-source-write', async () => {
    await page.getByRole('button', { name: 'Nova passagem', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nova passagem', exact: true });
    await dialog.getByRole('button', { name: 'Começar com a construção atual' }).click();
    const copied = await dialog
      .getByRole('textbox', { name: 'Pydicate da nova passagem' })
      .inputValue();
    assert(copied.length > 0);
    await dialog.getByRole('textbox', { name: 'Pydicate da nova passagem' }).fill('credo(tayra)');
    await dialog.getByRole('button', { name: 'Revisar nova passagem' }).click();
    const review = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(review).toBeVisible();
    const diff = await review.locator('pre').innerText();
    await review.getByRole('button', { name: 'Aplicar edição revisada' }).click();
    await expect(review).toHaveCount(0, { timeout: 25000 });
    project = await page.evaluate(() => window.studio.refreshProject());
    assert.equal(project.passages.length, 83);
    await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0083');
    return { diff, selectedNewPassage: true };
  });
  await stage('pdf-region-native-color-and-locators', async () => {
    await select(58);
    await raw();
    const pdf = path.join(temp, 'critic-witness.pdf');
    await fs.writeFile(pdf, require('../electron/tests/pdf-fixture.cjs').makePdfFixture());
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, pdf);
    await page.getByRole('button', { name: 'Vincular PDF à fonte', exact: true }).click();
    await expect(page.getByTestId('pdf-canvas')).toBeVisible({ timeout: 25000 });
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Marcar região', exact: true }).click();
    const box = await page.getByTestId('pdf-canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.4, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('pdf-region')).toHaveCount(1);
    const rect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Girar 90°', exact: true }).click();
    await page.getByLabel('Zoom do PDF').selectOption('1.5');
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rect);
    await page.getByRole('button', { name: 'Alternar tema', exact: true }).click();
    return {
      rect,
      printedLocator: await page
        .getByLabel('Página impressa')
        .inputValue()
        .catch(() => null),
      theme: await page.locator('html').getAttribute('data-theme'),
    };
  });
  await stage('ai-configuration-ui-local-only', async () => {
    await select(2);
    await raw();
    await evaluated();
    await page.getByRole('button', { name: 'Assistência IA', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Provedor de IA' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Tarefa de IA' }).selectOption('translate');
    await page
      .getByRole('textbox', { name: 'Descrição para a IA' })
      .fill('Tradução ainda não enviada pelo crítico.');
    const codexState = await page.locator('.assistant-connection').innerText();
    await page.getByRole('combobox', { name: 'Provedor de IA' }).selectOption('claude');
    const claudeState = await page.locator('.assistant-connection').innerText();
    return {
      codexState,
      claudeState,
      generation:
        'Not sent: automatic approval review rejected the proposed corpus-context egress; no retry or indirect request performed.',
    };
  });
  evidence.finishedAt = new Date().toISOString();
  evidence.appTextTail = (await page.locator('body').innerText()).slice(-6000);
} finally {
  await save();
  if (app) await app.close();
  console.log(
    JSON.stringify({
      report: out,
      temp,
      stages: evidence.stages.map((s) => ({ name: s.name, status: s.status })),
      pageErrors: evidence.pageErrors,
    }),
  );
}

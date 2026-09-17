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
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'critic-round3-'));
const parent = path.join(temp, 'projects');
const corpus = path.join(parent, 'oldtupicorpus');
const userData = path.join(temp, 'profile');
const out = path.join(root, 'docs/reviews/round-3-native-evidence.json');
const images = path.join(root, 'docs/reviews/round-3-screenshots');
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
let pendingId, permanentId, newOrdinal, regionRect, initialCount;
async function launch() {
  const env = { ...process.env, PYDICATE_STUDIO_DEV: '0', PYDICATE_PROJECT_PARENT: parent };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [path.join(temp, 'boot.cjs')], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', (e) => evidence.pageErrors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForURL('studio://app/index.html');
  await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 30000 });
  project = await page.evaluate(() => window.studio.refreshProject());
}
async function restart() {
  await app.close();
  app = null;
  await launch();
}
const dialog = () => page.getByRole('dialog', { name: 'Nova passagem', exact: true });
const sourcePath = path.join(corpus, 'historic/araujo_catecismo_1686.tu.py');
async function reviewMode() {
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
}
async function refresh() {
  await reviewMode();
  await page
    .getByRole('button', { name: 'Recarregar fonte e comparar rascunhos', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Recarregar fonte e comparar rascunhos', exact: true }),
  ).toBeEnabled();
  project = await page.evaluate(() => window.studio.refreshProject());
}
try {
  await launch();
  initialCount = project.passages.length;
  await stage('pending-reading-blank-raw-pdf-restart', async () => {
    await select(67);
    await (await raw()).fill('-(+nde *');
    await page
      .getByRole('textbox', { name: 'Nota de leitura', exact: true })
      .fill('Rascunho existente incompleto R3');
    await expect
      .poll(() => getDraft(67))
      .toMatchObject({ raw: '-(+nde *', notes: 'Rascunho existente incompleto R3' });
    await page.getByRole('button', { name: 'Nova passagem', exact: true }).click();
    await expect(dialog()).toBeVisible();
    await dialog()
      .getByLabel('Transcrição da nova passagem', { exact: true })
      .fill('Leitura nova sem análise R3');
    await dialog()
      .getByLabel('Tradução da nova passagem', { exact: true })
      .fill('Tradução humana pendente R3');
    await dialog()
      .getByLabel('Notas da nova passagem', { exact: true })
      .fill('Incerteza sobre uma letra R3');
    await dialog().getByText('Localização e evidência da nova leitura', { exact: true }).click();
    await dialog().getByLabel('Página impressa da nova passagem', { exact: true }).fill('42');
    await dialog().getByLabel('Fólio da nova passagem', { exact: true }).fill('21v');
    await dialog().getByLabel('Linhas no texto da nova passagem', { exact: true }).fill('3-5');
    const pdf = path.join(temp, 'pending-witness.pdf');
    await fs.writeFile(pdf, require('../electron/tests/pdf-fixture.cjs').makePdfFixture());
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, pdf);
    await dialog().getByRole('button', { name: 'Vincular PDF à fonte', exact: true }).click();
    const canvas = dialog().getByTestId('pdf-canvas');
    await expect(canvas).toBeVisible({ timeout: 20000 });
    await dialog().getByLabel('Zoom do PDF').selectOption('0.5');
    await expect(
      dialog().getByRole('button', { name: 'Marcar região', exact: true }),
    ).toBeEnabled();
    await dialog().getByRole('button', { name: 'Marcar região', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 8 });
    await page.mouse.up();
    await expect(dialog().getByTestId('pdf-region')).toHaveCount(1);
    regionRect = await dialog().getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await dialog().getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(
      dialog().getByText('Evidência salva no computador.', { exact: false }),
    ).toBeVisible();
    await dialog().getByRole('button', { name: 'Salvar nova leitura', exact: true }).click();
    await expect(
      dialog()
        .getByRole('status')
        .filter({ hasText: 'Rascunho salvo, mesmo sem análise executável.' }),
    ).toBeVisible();
    const saved = await page.evaluate((id) => window.studio.loadDrafts(id), project.id);
    pendingId = Object.keys(saved.drafts).find((id) => id.startsWith('pending:'));
    assert(pendingId);
    permanentId = pendingId.replace('pending:', 'passage:');
    assert.equal(saved.drafts[pendingId].raw, '');
    await restart();
    await expect(dialog()).toBeVisible({ timeout: 15000 });
    await expect(dialog().getByLabel('Transcrição da nova passagem')).toHaveValue(
      'Leitura nova sem análise R3',
    );
    await expect(dialog().getByLabel('Tradução da nova passagem')).toHaveValue(
      'Tradução humana pendente R3',
    );
    await dialog().getByText('Localização e evidência da nova leitura', { exact: true }).click();
    await expect(dialog().getByLabel('Fólio da nova passagem')).toHaveValue('21v');
    await expect(dialog().getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', regionRect);
    return {
      pendingId,
      permanentId,
      raw: '',
      rect: regionRect,
      fieldsAndPdfRestored: true,
      sourceCount: project.passages.length,
    };
  });
  await stage('pending-invalid-save-and-reviewed-migration', async () => {
    await dialog().getByText('Análise opcional', { exact: true }).click();
    await dialog().getByLabel('Pydicate da nova passagem').fill('credo(');
    await dialog().getByRole('button', { name: 'Salvar nova leitura', exact: true }).click();
    await expect(
      dialog()
        .getByRole('status')
        .filter({ hasText: 'Rascunho salvo, mesmo sem análise executável.' }),
    ).toBeVisible();
    await dialog().getByRole('button', { name: 'Fechar e manter rascunho', exact: true }).click();
    await expect(page.getByText('Novas leituras salvas', { exact: true })).toBeVisible();
    await page
      .locator('.pending-passages button')
      .filter({ hasText: 'Leitura nova sem análise R3' })
      .click();
    await expect(dialog().getByLabel('Pydicate da nova passagem')).toHaveValue('credo(');
    await dialog().getByLabel('Pydicate da nova passagem').fill('credo(tayra)');
    await dialog().getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(preview).toBeVisible({ timeout: 20000 });
    const diff = await preview.locator('pre').innerText();
    assert(diff.includes(permanentId));
    assert(diff.includes('# @folio 21v'));
    assert(diff.includes('assetId'));
    await preview.getByRole('button', { name: 'Aplicar edição revisada' }).click();
    await expect(preview).toHaveCount(0, { timeout: 25000 });
    project = await page.evaluate(() => window.studio.refreshProject());
    newOrdinal = project.passages.length;
    assert.equal(newOrdinal, initialCount + 1);
    const created = project.passages.find((p) => p.id === permanentId);
    assert(created);
    assert.equal(created.translation, 'Tradução humana pendente R3');
    await expect(page.locator('.breadcrumbs strong')).toHaveText(
      'Passagem ' + String(newOrdinal).padStart(4, '0'),
    );
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', regionRect);
    const saved = await page.evaluate((id) => window.studio.loadDrafts(id), project.id);
    assert(!saved.drafts[pendingId]);
    assert.equal(saved.drafts[permanentId].notes, 'Incerteza sobre uma letra R3');
    await page.waitForTimeout(700);
    await expect(
      page.getByText('A fonte foi alterada fora do Studio.', { exact: false }),
    ).toHaveCount(0);
    await restart();
    await expect(page.locator('.breadcrumbs strong')).toHaveText(
      'Passagem ' + String(newOrdinal).padStart(4, '0'),
    );
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', regionRect);
    await select(67);
    await expect(await raw()).toHaveValue('-(+nde *');
    await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
      'Rascunho existente incompleto R3',
    );
    await (await raw()).fill(project.passages[66].sourceExpression);
    await evaluated();
    return {
      permanentId,
      newOrdinal,
      sourceNotes: created.notes,
      locators: created.witness,
      pdfSurvivesMigrationAndRestart: true,
      pendingRemovedOnlyAfterApply: true,
      ownWriteFalseWarning: false,
    };
  });
  await stage('reviewed-preview-rejects-external-source-change', async () => {
    await select(newOrdinal);
    await raw();
    await page
      .getByRole('textbox', { name: 'Nota de leitura', exact: true })
      .fill('Nota alterada no rascunho R3');
    await reviewMode();
    await page.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(preview).toBeVisible();
    await fs.appendFile(sourcePath, '\n# unrelated concurrent editor R3\n');
    const external = await fs.readFile(sourcePath, 'utf8');
    await preview.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(preview.getByRole('alert')).toContainText(/mudou externamente|mudou/);
    assert.equal(await fs.readFile(sourcePath, 'utf8'), external);
    await preview.getByRole('button', { name: 'Voltar sem aplicar' }).click();
    await refresh();
    return { writeRejected: true, externalBytesPreserved: true };
  });
  await stage('external-metadata-conflict-compare-reconcile', async () => {
    let text = await fs.readFile(sourcePath, 'utf8');
    assert(text.includes('# @translation Tradução humana pendente R3'));
    text = text.replace(
      '# @translation Tradução humana pendente R3',
      '# @translation Tradução EXTERNA R3',
    );
    await fs.writeFile(sourcePath, text);
    await expect(
      page.getByText('A fonte foi alterada fora do Studio.', { exact: false }),
    ).toBeVisible({ timeout: 15000 });
    await refresh();
    await expect(page.getByText('Conciliar versões', { exact: true })).toBeVisible();
    const compare = page
      .locator('.recovery-note')
      .filter({ has: page.getByText('Conciliar versões', { exact: true }) });
    await expect(compare).toContainText('Tradução EXTERNA R3');
    await expect(compare).toContainText('Tradução humana pendente R3');
    await page
      .getByRole('button', { name: 'Continuar meu rascunho sobre esta versão', exact: true })
      .click();
    await expect(page.getByText('Conciliar versões', { exact: true })).toHaveCount(0);
    const saved = await getDraft(newOrdinal);
    assert.equal(saved.translation, 'Tradução humana pendente R3');
    assert((await fs.readFile(sourcePath, 'utf8')).includes('Tradução EXTERNA R3'));
    return {
      sourceTranslation: 'Tradução EXTERNA R3',
      draftTranslation: saved.translation,
      metadataShownBeforeRebase: true,
      sourceStillExternal: true,
    };
  });
  await stage('reviewed-source-recovery-restores-exact-bytes', async () => {
    const before = await fs.readFile(sourcePath, 'utf8');
    await reviewMode();
    await page.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();
    let preview = page.getByRole('dialog', { name: 'Revisar alterações na fonte', exact: true });
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(preview).toHaveCount(0, { timeout: 25000 });
    const applied = await fs.readFile(sourcePath, 'utf8');
    assert.notEqual(before, applied);
    await page.getByText('Recuperar uma aplicação anterior', { exact: true }).click();
    await page
      .getByRole('button', { name: 'Revisar restauração destes bytes', exact: true })
      .click();
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(preview).toHaveCount(0, { timeout: 25000 });
    assert.equal(await fs.readFile(sourcePath, 'utf8'), before);
    return { sourceBytesRestored: true, reviewedRecovery: true };
  });
  evidence.finishedAt = new Date().toISOString();
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

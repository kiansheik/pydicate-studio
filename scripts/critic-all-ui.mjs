import { createHash } from 'node:crypto';
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
const authoringUiPaths = [
  'src/components/AuthoringEditor.tsx',
  'src/domain/authoring.ts',
  'src/useStudio.ts',
  'src/styles.css',
];
const integrationPaths = [
  'python/adapter.py',
  'python/authoring_runtime.py',
  'python/authoring_service.py',
  'python/studio_authoring.py',
  'python/worker.py',
  'python/navarro_search.py',
  'electron/main.cjs',
  'electron/next-service.cjs',
  'electron/python-worker.cjs',
  'electron/preload.cjs',
  'electron/validation.cjs',
  'src/App.tsx',
];
async function fileHashes(paths) {
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (file) => [
        file,
        createHash('sha256')
          .update(await fs.readFile(path.join(root, file)))
          .digest('hex'),
      ]),
    ),
  );
}
function dependencyIdentity(repositories) {
  return repositories
    .map(({ name, revision, fingerprint }) => ({ name, revision, fingerprint }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'critic-all-ui-'));
const parent = path.join(temp, 'projects');
const corpus = path.join(parent, 'oldtupicorpus');
const userData = path.join(temp, 'profile');
const out = path.join(root, 'docs/reviews/round-3-all-expression-ui.json');
const images = path.join(root, 'docs/reviews/round-3-all-expression-screenshots');
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
async function selectNode(id) {
  const parts = id.split('/');
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i).join('/');
    const heading = page.locator(`[data-author-node="${prefix}"]`).first();
    await expect(heading).toBeVisible();
    const expand = heading
      .locator('..')
      .locator(':scope > button.text-button')
      .filter({ hasText: /^Expandir/ });
    if (await expand.count()) await expand.click();
  }
  await page.locator(`[data-author-node="${id}"]`).first().click();
}
function flatten(node) {
  return [node, ...node.children.flatMap((c) => flatten(c.node))];
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
  evidence.repositories = project.repositories;
  evidence.engineFingerprint = project.engineFingerprint;
  evidence.authoringUiSha256 = await fileHashes(authoringUiPaths);
  evidence.integrationSha256 = await fileHashes(integrationPaths);
  evidence.provenanceCapture = 'Captured from the opened project before native interactions.';
  const originalSource = await fs.readFile(
    path.join(corpus, 'historic/araujo_catecismo_1686.tu.py'),
    'utf8',
  );
  evidence.discoveredCount = project.passages.length;
  evidence.sourceId = 'araujo_catecismo_1686';
  evidence.sourceSha256 = createHash('sha256').update(originalSource).digest('hex');
  evidence.rows = [];
  const previous = process.argv[2] ? JSON.parse(await fs.readFile(process.argv[2], 'utf8')) : null;
  if (previous) {
    assert.equal(previous.sourceSha256, evidence.sourceSha256);
    assert.deepEqual(previous.authoringUiSha256, evidence.authoringUiSha256);
    assert.deepEqual(previous.integrationSha256, evidence.integrationSha256);
    assert.deepEqual(
      dependencyIdentity(previous.repositories ?? []),
      dependencyIdentity(evidence.repositories),
    );
  }
  evidence.resumedFrom = process.argv[2] ?? null;
  for (const passage of project.passages) {
    const prior = previous?.rows.find(
      (r) =>
        r.ordinal === passage.ordinal &&
        r.sourceExpression === passage.sourceExpression &&
        r.uiWorkflowVerified,
    );
    if (prior) {
      evidence.rows.push({ ...prior, verificationRun: 'initial' });
      continue;
    }
    const row = {
      ordinal: passage.ordinal,
      passageId: passage.id,
      sourceExpression: passage.sourceExpression,
      sourceId: evidence.sourceId,
      verificationRun: previous ? 'after-fixes' : 'initial',
    };
    evidence.rows.push(row);
    try {
      await select(passage.ordinal);
      const editor = await raw();
      await expect(editor).toHaveValue(passage.sourceExpression);
      row.originalSurface = await evaluated();
      await expect(page.locator('[data-author-node="root"]')).toBeVisible();
      await selectNode('root');
      await page
        .getByRole('combobox', { name: 'Operação na parte selecionada' })
        .selectOption('negate');
      await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
      await expect(editor).not.toHaveValue(passage.sourceExpression);
      row.scopeCandidate = await editor.inputValue();
      const scopeRender = await invoke('evaluate_expression', {
        passageId: passage.id,
        raw: row.scopeCandidate,
        revisionId: 'critic-scope-' + passage.ordinal,
        engineFingerprint: project.engineFingerprint,
      });
      await expect(page.getByTestId('generated-surface')).toHaveText(scopeRender.surface, {
        timeout: 25000,
      });
      row.scopeSurface = scopeRender.surface;
      row.scopeStructureFingerprint = scopeRender.structureFingerprint;
      row.scopeRoundtrip = Boolean(
        (await invoke('source_preview', { passageId: passage.id, raw: row.scopeCandidate })).diff,
      );
      await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
      await expect(editor).toHaveValue(passage.sourceExpression);
      await expect(page.getByTestId('generated-surface')).toHaveText(row.originalSurface, {
        timeout: 25000,
      });
      const parsed = await invoke('parse_expression', {
        passageId: passage.id,
        raw: passage.sourceExpression,
        revisionId: 'critic-leaf-' + passage.ordinal,
      });
      const leaf = flatten(parsed.root)
        .filter((n) => n.kind === 'reference')
        .at(-1);
      assert(leaf);
      await selectNode(leaf.id);
      await expect(page.getByLabel('Conteúdo desta parte', { exact: true })).toHaveValue(leaf.code);
      row.lexicalSelection = { nodeId: leaf.id, name: leaf.code };
      await page.getByLabel('Conteúdo desta parte', { exact: true }).fill(leaf.code + ' + amen');
      await page.getByRole('button', { name: 'Substituir esta parte', exact: true }).click();
      row.lexicalCandidate = await editor.inputValue();
      const expected =
        passage.sourceExpression.slice(0, leaf.start) +
        '(' +
        leaf.code +
        ' + amen)' +
        passage.sourceExpression.slice(leaf.end);
      assert.equal(row.lexicalCandidate, expected);
      const reimport = await invoke('parse_expression', {
        passageId: passage.id,
        raw: row.lexicalCandidate,
        revisionId: 'critic-reimport-' + passage.ordinal,
      });
      assert(reimport.root);
      row.lexicalRoundtrip = Boolean(
        (await invoke('source_preview', { passageId: passage.id, raw: row.lexicalCandidate })).diff,
      );
      try {
        const rendered = await invoke('evaluate_expression', {
          passageId: passage.id,
          raw: row.lexicalCandidate,
          revisionId: 'critic-candidate-' + passage.ordinal,
          engineFingerprint: project.engineFingerprint,
        });
        row.lexicalEvaluation = { status: 'evaluated', surface: rendered.surface };
        await expect(page.getByTestId('generated-surface')).toHaveText(rendered.surface, {
          timeout: 25000,
        });
      } catch (error) {
        row.lexicalEvaluation = { status: 'diagnosed', error: String(error) };
        await expect(page.getByTestId('generated-surface')).toContainText('Sem resultado', {
          timeout: 25000,
        });
        await expect(page.locator('.inline-error')).not.toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Desfazer edição', exact: true }).click();
      await expect(editor).toHaveValue(passage.sourceExpression);
      await expect(page.getByTestId('generated-surface')).toHaveText(row.originalSurface, {
        timeout: 25000,
      });
      row.restoredOriginal = true;
      row.uiWorkflowVerified = true;
    } catch (error) {
      row.uiWorkflowVerified = false;
      row.error = String(error);
      await page
        .screenshot({
          path: path.join(images, 'failure-' + String(passage.ordinal).padStart(4, '0') + '.png'),
        })
        .catch(() => {});
      try {
        await (await raw()).fill(passage.sourceExpression);
      } catch {}
    }
    console.log(
      `${String(passage.ordinal).padStart(4, '0')}: ${row.uiWorkflowVerified ? 'passed' : 'FAILED'}; lexical ${row.lexicalEvaluation?.status ?? 'not reached'}`,
    );
    await save();
  }
  evidence.sourceBytesUnchanged =
    originalSource ===
    (await fs.readFile(path.join(corpus, 'historic/araujo_catecismo_1686.tu.py'), 'utf8'));
  assert.deepEqual(await fileHashes(authoringUiPaths), evidence.authoringUiSha256);
  assert.deepEqual(await fileHashes(integrationPaths), evidence.integrationSha256);
  const afterProject = await page.evaluate(() => window.studio.refreshProject());
  assert.deepEqual(
    dependencyIdentity(afterProject.repositories),
    dependencyIdentity(evidence.repositories),
  );
  evidence.totals = {
    uiWorkflowVerified: evidence.rows.filter((r) => r.uiWorkflowVerified).length,
    scopeRoundtrip: evidence.rows.filter((r) => r.scopeRoundtrip).length,
    lexicalRoundtrip: evidence.rows.filter((r) => r.lexicalRoundtrip).length,
    lexicalEvaluated: evidence.rows.filter((r) => r.lexicalEvaluation?.status === 'evaluated')
      .length,
    lexicalDiagnosed: evidence.rows.filter((r) => r.lexicalEvaluation?.status === 'diagnosed')
      .length,
  };
  evidence.finishedAt = new Date().toISOString();
} finally {
  await save();
  if (app) await app.close();
  console.log(
    JSON.stringify({ report: out, totals: evidence.totals, pageErrors: evidence.pageErrors }),
  );
}

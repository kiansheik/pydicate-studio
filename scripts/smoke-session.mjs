import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { PythonWorker } = require('../electron/python-worker.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parent = path.resolve(root, '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-session-regression-'));
const userData = path.join(temp, 'user-data');
const profile = process.argv.slice(2).find((argument) => argument !== '--quick');
const quick = process.argv.includes('--quick');
await fs.mkdir(userData, { recursive: true });
// Optional existing profile is read only; no provider history/config/credentials copied.
if (profile)
  for (const directory of ['projects', 'drafts'])
    await fs.cp(path.join(profile, directory), path.join(userData, directory), { recursive: true });
const worker = new PythonWorker({
  script: path.join(root, 'python/worker.py'),
  stateDirectory: path.join(userData, 'projects'),
});
let project;
try {
  project = await worker.request('open_project', { parentPath: parent });
} finally {
  worker.close();
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const draftPath = path.join(userData, 'drafts', hash(project.id) + '.json');
if (!profile) {
  const drafts = Object.fromEntries(
    project.passages.map((p) => [
      p.id,
      {
        passageId: p.id,
        revisionId: `legacy-${p.ordinal}`,
        sourceFingerprint: p.legacyExpressionFingerprint,
        diplomatic: p.diplomatic,
        normalized: p.normalized,
        translation: p.translation,
        notes: p.notes,
        analysis: p.analysis,
        updatedAt: new Date().toISOString(),
      },
    ]),
  );
  await fs.mkdir(path.dirname(draftPath), { recursive: true });
  await fs.writeFile(draftPath, JSON.stringify({ version: 1, projectId: project.id, drafts }));
}
const originalDrafts = JSON.parse(await fs.readFile(draftPath, 'utf8'));
await fs.writeFile(
  path.join(userData, 'session.json'),
  JSON.stringify({ parentPath: parent, selectedPassageId: project.passages[0].id }),
);
const bootstrap = path.join(temp, 'bootstrap.cjs');
await fs.writeFile(
  bootstrap,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(userData)});require(${JSON.stringify(path.join(root, 'electron/main.cjs'))});`,
);
const sourceFile = path.join(parent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py');
const beforeHash = hash(await fs.readFile(sourceFile));
const report = {
  profile: profile ? 'copy of existing local profile' : 'legacy format fixture',
  passages: [],
  errors: [],
  providerGenerationRequests: 0,
  userData: temp,
};
let app, page;
async function launch() {
  const env = { ...process.env, PYDICATE_STUDIO_DEV: '0', PYDICATE_PROJECT_PARENT: parent };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [bootstrap], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 30000 });
}
async function select(ordinal) {
  await page
    .locator('.passage-item')
    .filter({
      has: page.locator('.ordinal', {
        hasText: new RegExp(`^${String(ordinal).padStart(4, '0')}$`),
      }),
    })
    .click();
  await expect(page.getByTestId('generated-surface')).not.toHaveText(
    /Avaliando|Sem resultado|Não foi possível/,
    { timeout: 20000 },
  );
}
try {
  await launch();
  for (const passage of project.passages.filter(
    (p) => !quick || [1, 2, 56, 67, 82].includes(p.ordinal),
  )) {
    await select(passage.ordinal);
    report.passages.push({ ordinal: passage.ordinal, rendered: true });
    if (passage.ordinal % 10 === 0)
      console.log(`Rendered ${passage.ordinal}/${project.passages.length}`);
  }
  await select(2);
  await page.getByRole('button', { name: 'Concluir passagem', exact: true }).click();
  await expect(page.getByLabel('Etapa do trabalho')).toHaveValue('complete');
  await page.getByRole('tab', { name: 'Árvore', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Diagrama interativo da análise realizada' }),
  ).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: path.join(temp, 'runtime-tree.png') });
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await app.close();
  app = null;
  await launch();
  await expect(page.getByLabel('Etapa do trabalho')).toHaveValue('complete');
  const saved = JSON.parse(await fs.readFile(draftPath, 'utf8'));
  for (const [id, original] of Object.entries(originalDrafts.drafts)) {
    assert.ok(saved.drafts[id], 'Retained original/orphan draft');
    for (const field of ['translation', 'notes', 'diplomatic', 'normalized'])
      assert.equal(saved.drafts[id][field], original[field]);
    assert.equal(
      saved.drafts[id].revisionId,
      original.revisionId,
      'Migration preserves revision and AI provenance',
    );
  }
  await page.getByRole('button', { name: 'Atividade', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Atividade local' })).toBeVisible();
  const usage = await page.evaluate(() => window.studio.invoke('usage_report', { days: 7 }));
  assert.equal(usage.sessions.length, 2);
  assert.ok(usage.actions.some((row) => row.event === 'review.status'));
  report.sessions = usage.sessions.length;
  report.localCompletionPersisted = true;
  report.humanFieldsAndRevisionsPreserved = true;
  await page.screenshot({ path: path.join(temp, 'usage.png') });
  await page.getByRole('button', { name: 'Fechar atividade' }).click();
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  const raw = page.getByRole('textbox', { name: 'Pydicate editável', exact: true });
  const previousRaw = await raw.inputValue();
  await raw.fill('incomplete(');
  await expect(page.getByTestId('generated-surface')).toHaveText('Não foi possível avaliar');
  const errors = await page.evaluate(() => window.studio.invoke('usage_report', { days: 7 }));
  assert.ok(errors.errors.some((row) => row.errorCode === 'PARSE_INVALID'));
  await raw.fill(previousRaw);
  await expect(page.getByTestId('generated-surface')).not.toHaveText(
    /Avaliando|Sem resultado|Não foi possível/,
    { timeout: 20000 },
  );
  report.parseFailureLogged = true;
  assert.equal(hash(await fs.readFile(sourceFile)), beforeHash);
  assert.deepEqual(report.errors, []);
  console.log(
    JSON.stringify({
      rendered: report.passages.length,
      sessions: usage.sessions.length,
      profile: report.profile,
      artifacts: temp,
    }),
  );
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(temp, 'report.json'), JSON.stringify(report, null, 2));
}

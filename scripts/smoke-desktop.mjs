import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parentPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
await fs.access(path.join(root, 'dist', 'index.html'));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pydicate-desktop-smoke-'));
const userData = path.join(temporary, 'user-data');
const sessionData = path.join(temporary, 'session-data');
await fs.mkdir(userData);
await fs.mkdir(sessionData);
const bootstrap = path.join(temporary, 'bootstrap.cjs');
await fs.writeFile(
  bootstrap,
  `const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(userData)});
app.setPath('sessionData', ${JSON.stringify(sessionData)});
require(${JSON.stringify(path.join(root, 'electron', 'main.cjs'))});
`,
);
let application;

async function launch() {
  const environment = {
    ...process.env,
    PYDICATE_STUDIO_DEV: '0',
    // This retained smoke explicitly exercises the browser example fallback.
    PYDICATE_PROJECT_PARENT: path.join(temporary, 'no-local-project'),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: [bootstrap], env: environment, timeout: 30_000 });
  const window = await application.firstWindow();
  await window.waitForURL('studio://app/index.html');
  await expect(window.getByRole('textbox', { name: /Transcrição diplomática/ })).toBeEnabled();
  return window;
}

async function waitForSaved(page, projectId, text) {
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ projectId, text }) => {
            const value = await window.studio.loadDrafts(projectId);
            return value && Object.values(value.drafts).some((draft) => draft.diplomatic === text);
          },
          { projectId, text },
        ),
      { timeout: 10_000 },
    )
    .toBe(true);
}

try {
  let page = await launch();
  const preferences = await application.evaluate(({ app, BrowserWindow }) => ({
    userData: app.getPath('userData'),
    sandbox: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox,
    contextIsolation:
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().contextIsolation,
    nodeIntegration:
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().nodeIntegration,
  }));
  assert.equal(preferences.userData, userData);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.deepEqual(await page.evaluate(() => [typeof window.require, typeof window.process]), [
    'undefined',
    'undefined',
  ]);
  const policy = await page.evaluate(async () =>
    (await fetch(location.href)).headers.get('Content-Security-Policy'),
  );
  assert.ok(policy?.includes("script-src 'self'"));
  assert.ok(policy?.includes('object-src blob:'));
  assert.ok(!policy.includes('unsafe-eval'));

  await page.locator('input[type="file"]').setInputFiles({
    name: 'smoke.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const scan = page.getByAltText('Digitalização: smoke.png');
  await expect(scan).toBeVisible();
  await expect.poll(() => scan.evaluate((image) => image.naturalWidth)).toBe(1);
  await page.getByRole('button', { name: 'Remover digitalização da sessão' }).click();

  const note = 'Leitura preservada pelo teste desktop.';
  await page.getByRole('textbox', { name: /Transcrição diplomática/ }).fill(note);
  await waitForSaved(page, 'example:araujo-0067', note);
  await application.close();
  application = null;
  page = await launch();
  await expect(page.getByRole('textbox', { name: /Transcrição diplomática/ })).toHaveValue(note);

  if (parentPath) {
    // The native picker is replaced in the test process only; production IPC remains unchanged.
    await application.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
    }, parentPath);
    await page.getByRole('button', { name: 'Abrir projeto', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Abrir projeto existente/ })
      .click();
    await expect
      .poll(
        async () =>
          (await fs.readdir(path.join(userData, 'drafts'))).filter((name) => name.endsWith('.json'))
            .length,
      )
      .toBe(2);
    await expect(page.getByRole('textbox', { name: /Transcrição diplomática/ })).toBeEnabled();
    await expect(page.getByRole('textbox', { name: /Transcrição diplomática/ })).not.toHaveValue(
      note,
    );
    const project = await page.evaluate(() => window.studio.refreshProject());
    const passage = project.passages.find((item) => item.analysis);
    assert.ok(passage, 'The selected project has a supported imperative passage.');
    const rendered = await page.evaluate((request) => window.studio.render(request), {
      revisionId: 'desktop-smoke',
      engineFingerprint: project.engineFingerprint,
      analysis: passage.analysis,
    });
    assert.equal(rendered.origin, 'engine');
    assert.equal(rendered.surface, 'eporoapiti umẽ');
    await page
      .getByRole('textbox', { name: /Transcrição diplomática/ })
      .fill(`${note} Projeto local.`);
    await waitForSaved(page, project.id, `${note} Projeto local.`);
    console.log(
      `Desktop local project passed: ${project.passages.length} passages; ${rendered.surface}.`,
    );
  }
  console.log(
    'Desktop smoke passed: production origin and CSP, isolated renderer, local scan image, draft save/reopen, temporary user data.',
  );
} finally {
  if (application) await application.close();
  await fs.rm(temporary, { recursive: true, force: true });
}

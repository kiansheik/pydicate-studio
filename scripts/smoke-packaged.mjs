import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Exercise the actual installed binary, never a development Electron bootstrap.
// Electron applies --user-data-dir before loading application JavaScript:
// shell/app/electron_main_delegate.cc, ElectronMainDelegate::PreSandboxStartup.
const executablePath = process.argv[2] && path.resolve(process.argv[2]);
if (!executablePath)
  throw new Error(
    'Usage: node scripts/smoke-packaged.mjs <packaged-executable> [disposable-project-parent]',
  );
await fs.access(executablePath);
const projectParent = process.argv[3] && path.resolve(process.argv[3]);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pydicate-packaged-smoke-'));
const userData = path.join(temporary, 'user-data');
await fs.mkdir(userData);
const environment = {
  ...process.env,
  PATH: '',
  PYDICATE_STUDIO_DEV: '0',
  PYDICATE_PROJECT_PARENT: path.join(temporary, 'no-existing-project'),
  // The smoke never downloads or installs an application update. Chromium's
  // proxy also covers electron-updater's Electron HTTP executor on native CI.
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  http_proxy: 'http://127.0.0.1:9',
  https_proxy: 'http://127.0.0.1:9',
};
for (const key of Object.keys(environment))
  if (
    [
      'ELECTRON_RUN_AS_NODE',
      'NODE_OPTIONS',
      'PYDICATE_RUNTIME_DIR',
      'PYDICATE_PYTHON',
      'PYDICATE_GIT',
    ].includes(key) ||
    (key.toUpperCase() === 'PATH' && key !== 'PATH')
  )
    delete environment[key];

let application;
try {
  application = await electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${userData}`,
      '--proxy-server=http://127.0.0.1:9',
      '--proxy-bypass-list=<-loopback>',
      '--disable-background-networking',
    ],
    env: environment,
    timeout: 45_000,
  });
  const identity = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    version: app.getVersion(),
    userData: app.getPath('userData'),
    sessionData: app.getPath('sessionData'),
    applicationDirectory: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    python: process.env.PYDICATE_PYTHON,
    git: process.env.PYDICATE_GIT,
    searchPath: process.env.PATH,
  }));
  assert.equal(identity.packaged, true);
  assert.equal(await fs.realpath(identity.userData), await fs.realpath(userData));
  assert.equal(await fs.realpath(identity.sessionData), await fs.realpath(userData));
  const runtimeDirectory = path.join(identity.resourcesPath, 'runtime');
  for (const executable of [identity.python, identity.git])
    assert.ok(
      executable?.startsWith(runtimeDirectory + path.sep),
      'The packaged app must use its own runtime.',
    );
  for (const directory of identity.searchPath.split(path.delimiter))
    assert.ok(
      directory.startsWith(runtimeDirectory + path.sep),
      'No host Python or Git may appear on PATH.',
    );

  const page = await application.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForURL('studio://app/index.html');
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('button', { name: /Preparar meu espaço de trabalho/ })).toBeVisible(
    { timeout: 30_000 },
  );
  // Do not click setup: it would choose the user's Documents directory. Only a
  // caller-provided disposable project is opened below, through the real IPC.
  const core = await application.evaluate(({ app }) => {
    const path = process.getBuiltinModule('path');
    const { execFileSync } = process.getBuiltinModule('child_process');
    const Module = process.getBuiltinModule('module');
    const applicationRequire = Module.createRequire(path.join(app.getAppPath(), 'package.json'));
    const original = Module._load;
    let shared;
    try {
      Module._load = function (name, ...args) {
        if (name === 'esbuild' || name.startsWith('esbuild/'))
          throw new Error('The packaged application attempted to use a development compiler.');
        return original.call(this, name, ...args);
      };
      shared = applicationRequire('./electron/shared-authoring.cjs').loadSharedAuthoring();
    } finally {
      Module._load = original;
    }
    const probe = execFileSync(
      process.env.PYDICATE_PYTHON,
      [
        '-I',
        '-c',
        [
          'import json, sqlite3, ssl, subprocess, sys',
          'sqlite3.connect(":memory:").execute("select 1")',
          'git = subprocess.check_output(["git", "--version"], text=True).strip()',
          'print(json.dumps({"python": sys.version.split()[0], "git": git}))',
        ].join('; '),
      ],
      { env: process.env, encoding: 'utf8', windowsHide: true },
    );
    return { ...JSON.parse(probe), sharedAuthoring: typeof shared.editCanvas };
  });
  assert.equal(core.sharedAuthoring, 'function');

  let projectResult;
  if (projectParent) {
    await application.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
    }, projectParent);
    await picker.getByRole('button', { name: /Abrir projeto existente/ }).click();
    await expect(picker).not.toBeVisible({ timeout: 30_000 });
    const project = await page.evaluate(() => window.studio.refreshProject());
    assert.equal(project.mode, 'local');
    const passage = project.passages.find((item) => item.sourceId === 'araujo_catecismo_1686');
    assert.ok(passage);
    const result = await page.evaluate(
      async (params) => window.studio.invoke('evaluate_expression', params),
      {
        passageId: passage.id,
        raw: '(pûera * (og * (emi * tym))) / ypy',
        revisionId: 'packaged-runtime-smoke',
        engineFingerprint: project.engineFingerprint,
        includeMorphology: true,
      },
    );
    assert.equal(result.origin, 'engine');
    assert.equal(result.evaluationStatus, 'complete');
    assert.equal(result.surface, 'oemitymbûerypy');
    projectResult = { passages: project.passages.length, surface: result.surface };
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        executablePath,
        packaged: identity.packaged,
        applicationVersion: identity.version,
        isolatedUserData: identity.userData,
        runtimeDirectory,
        ...core,
        ...(projectResult ? { project: projectResult } : {}),
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  if (application) await application.close();
  await fs.rm(temporary, { recursive: true, force: true });
}

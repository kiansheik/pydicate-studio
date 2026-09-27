#!/usr/bin/env node
'use strict';
// Read Chromium-managed values through a disposable Electron profile. Never
// start Studio's main/preload/services or open its actual userData directory.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const EXACT = new Set([
  'studio-theme',
  'pydicate-studio:workspace:v1',
  'pydicate-studio:workspace:v2',
  'pydicate-studio:tools:v1',
]);
const PREFIXES = [
  'studio-learning:v1:',
  'pydicate-studio:evidence-draft:v1:',
  'pydicate-studio:evidence-last-passage:v1:',
  'pydicate:lexical-note-buffer:',
  'studio-pending:',
  'studio:piece-query:',
  'pydicate-studio:drafts:v1:',
  'pydicate-studio:submission:v1:',
];
const allowed = (key) => EXACT.has(key) || PREFIXES.some((prefix) => key.startsWith(prefix));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function snapshot(directory, relative = '') {
  const rows = [];
  for (const name of (await fs.readdir(path.join(directory, relative))).sort()) {
    const file = path.join(relative, name),
      stat = await fs.lstat(path.join(directory, file));
    if (stat.isSymbolicLink())
      throw new Error('Local Storage contains a symlink; inspect before copying.');
    if (stat.isDirectory()) rows.push(...(await snapshot(directory, file)));
    else if (stat.isFile())
      rows.push({
        file,
        size: stat.size,
        sha256: sha(await fs.readFile(path.join(directory, file))),
      });
    else throw new Error('Local Storage contains an unsupported filesystem entry.');
  }
  return rows;
}
async function readLocalStorage({ profile, output, electronExecutable }) {
  profile = await fs.realpath(profile);
  output = path.resolve(output);
  if (output === profile || output.startsWith(profile + path.sep))
    throw new Error('Export must be outside the original profile.');
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  try {
    await fs.access(output);
    throw new Error('Refusing to replace an existing browser-storage export.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const source = path.join(profile, 'Local Storage');
  if ((await fs.lstat(source)).isSymbolicLink())
    throw new Error('Local Storage must not be a symlink.');
  const before = await snapshot(source);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-storage-read-'));
  let failure;
  try {
    const copyProfile = path.join(temporary, 'profile');
    await fs.mkdir(copyProfile, { mode: 0o700 });
    await fs.cp(source, path.join(copyProfile, 'Local Storage'), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    if (JSON.stringify(before) !== JSON.stringify(await snapshot(source)))
      throw new Error('Original Local Storage changed during copying; close desktop and retry.');
    const childResult = path.join(temporary, 'read.json');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawnSync(
      electronExecutable || require('electron'),
      [__filename, '--electron-reader', copyProfile, childResult],
      { env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 },
    );
    if (child.error || child.status !== 0)
      throw new Error(
        'Isolated Electron storage reader failed' +
          (child.error?.code ? ' (' + child.error.code + ')' : '') +
          '.',
      );
    const extracted = JSON.parse(await fs.readFile(childResult, 'utf8'));
    const after = await snapshot(source);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('Original Local Storage changed during inspection; close desktop and retry.');
    for (const origin of extracted.origins) {
      if (!origin.entries || Object.keys(origin.entries).some((key) => !allowed(key)))
        throw new Error('Reader returned a non-allowlisted key.');
    }
    const result = {
      format: 'pydicate-browser-storage',
      version: 1,
      originalUnchanged: true,
      originalFiles: before,
      origins: extracted.origins,
      scope:
        'Allowlisted research and interface preferences only; cookies, credentials, provider configuration and Studio services were not opened.',
      limits: [
        'Session Storage is not included: Chromium associates it with individual renderer/tab namespaces. Preserve its raw directory separately.',
        'Only studio://app, http://127.0.0.1:5173, http://localhost:5173 and file:// origins are inspected. Other origins require explicit investigation.',
      ],
    };
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return result;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true }).catch((error) => {
      if (!failure) throw error;
    });
  }
}
async function electronReader() {
  const { app, BrowserWindow, protocol, session } = require('electron');
  const index = process.argv.indexOf('--electron-reader');
  const [profile, output] = process.argv.slice(index + 1);
  if (!profile || !output) throw new Error('Private reader paths required.');
  app.setPath('userData', profile);
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
  app.disableHardwareAcceleration();
  protocol.registerSchemesAsPrivileged([
    { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  const blank = () =>
    new Response('<!doctype html><title>Private storage reader</title>', {
      headers: {
        'Content-Type': 'text/html',
        'Content-Security-Policy': "default-src 'none'; script-src 'none'; connect-src 'none'",
      },
    });
  for (const scheme of ['studio', 'http', 'file']) await protocol.handle(scheme, blank);
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const origins = [];
  for (const url of [
    'studio://app/index.html',
    'http://127.0.0.1:5173/',
    'http://localhost:5173/',
    'file:///__studio_read_only_storage__.html',
  ]) {
    await window.loadURL(url);
    const selected = await window.webContents.executeJavaScript(`(() => {
      const exact = new Set(${JSON.stringify([...EXACT])});
      const prefixes = ${JSON.stringify(PREFIXES)};
      const keys = Object.keys(localStorage);
      const entries = Object.fromEntries(keys.filter(key => exact.has(key) || prefixes.some(prefix => key.startsWith(prefix))).sort().map(key => [key, localStorage.getItem(key)]));
      return { totalStoredKeys: keys.length, entries };
    })()`);
    const entries = selected.entries;
    origins.push({
      origin: url.startsWith('file:')
        ? 'file://'
        : new URL(url).origin === 'null'
          ? 'studio://app'
          : new URL(url).origin,
      totalStoredKeys: selected.totalStoredKeys,
      excludedKeys: selected.totalStoredKeys - Object.keys(entries).length,
      entries,
    });
  }
  await fs.writeFile(output, JSON.stringify({ origins }) + '\n', { flag: 'wx', mode: 0o600 });
  window.destroy();
  app.quit();
}
module.exports = { readLocalStorage, allowed, snapshot };
if (process.argv.includes('--electron-reader')) {
  electronReader().catch(() => {
    process.exitCode = 1;
    require('electron').app.exit(1);
  });
} else if (require.main === module) {
  let profile = process.env.LOCAL_STUDIO_STATE,
    output;
  const args = process.argv.slice(2);
  if (args.length === 2 && !args[0].startsWith('--')) [profile, output] = args;
  else
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--state') profile = args[++index];
      else if (args[index] === '--output') output = args[++index];
      else {
        console.error('Unknown storage-reader argument.');
        process.exit(2);
      }
    }
  if (!profile || !output) {
    console.error(
      'Usage: node read_local_storage.cjs --state PROFILE --output NEW.json (LOCAL_STUDIO_STATE may supply --state)',
    );
    process.exitCode = 2;
  } else
    readLocalStorage({ profile, output })
      .then((result) =>
        console.log(
          JSON.stringify({
            originalUnchanged: result.originalUnchanged,
            origins: result.origins.map(({ origin, entries, totalStoredKeys, excludedKeys }) => ({
              origin,
              keys: Object.keys(entries).length,
              totalStoredKeys,
              excludedKeys,
            })),
            output: path.resolve(output),
          }),
        ),
      )
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
}

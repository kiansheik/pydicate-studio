'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createUpdateService, RELEASE_URL } = require('../update-service.cjs');

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-update-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const calls = [];
  const events = [];
  const updater = new EventEmitter();
  const token = {
    cancel() {
      calls.push('cancel');
    },
  };
  updater.checkForUpdates = async () => {
    calls.push('check');
    return { updateInfo: { version: '0.2.10001' }, cancellationToken: token };
  };
  updater.downloadUpdate = async () => {
    calls.push('download');
    updater.emit('download-progress', { percent: 25 });
    updater.emit('update-downloaded', { version: '0.2.10001' });
    return ['/simulated/verified-installer'];
  };
  updater.quitAndInstall = (...args) => {
    calls.push(['install', ...args]);
  };
  const app = { isPackaged: true, getVersion: () => '0.2.0', getPath: () => directory };
  const input = {
    app,
    updater,
    platform: 'win32',
    env: {},
    emit: (event) => events.push(event),
    checkTimeoutMs: 25,
    downloadTimeoutMs: 25,
    installTimeoutMs: 25,
    ...options,
  };
  return { directory, app, updater, calls, events, input, service: createUpdateService(input) };
}

test('startup downloads once before install, reports progress and releases a failed restart gate', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.directory, 'drafts.json'), 'human work');
  const first = f.service.start();
  assert.equal(f.service.start(), first);
  const result = await first;
  assert.equal(result.phase, 'manual');
  assert.equal(result.canContinue, true);
  assert.equal(result.version, '0.2.10001');
  assert.equal(result.releaseUrl, RELEASE_URL);
  assert.deepEqual(f.calls.slice(0, 3), ['check', 'download', ['install', true, true]]);
  assert.deepEqual(
    f.events.map((event) => event.phase),
    ['checking', 'downloading', 'downloading', 'installing', 'manual'],
  );
  assert.ok(f.events.every((event) => event.type === 'application-update'));
  assert.equal(f.events[2].percent, 25);
  assert.equal(f.updater.autoDownload, false);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowPrerelease, false);
  assert.equal(f.updater.allowDowngrade, false);
  assert.equal(await fs.readFile(path.join(f.directory, 'drafts.json'), 'utf8'), 'human work');
  assert.deepEqual(
    JSON.parse(
      await fs.readFile(path.join(f.directory, 'application-update-attempt.json'), 'utf8'),
    ),
    { fromVersion: '0.2.0', version: '0.2.10001' },
  );
});

test('an unsuccessful install of the same version is not repeated on the next launch', async (t) => {
  const f = await fixture(t);
  await f.service.start();
  const again = createUpdateService(f.input);
  assert.equal((await again.start()).phase, 'manual');
  assert.equal(f.calls.filter((call) => call === 'download').length, 1);
  assert.equal(f.calls.filter(Array.isArray).length, 1);
});

test('current or older release never downloads or writes installation markers', async (t) => {
  for (const version of ['0.2.0', '0.1.999', '0.2.10001-beta.1']) {
    const f = await fixture(t);
    f.updater.checkForUpdates = async () => ({ updateInfo: { version } });
    assert.equal((await f.service.start()).phase, 'current');
    assert.deepEqual(f.calls, []);
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
});

test('offline and a stalled check continue finitely and ignore late updater events', async (t) => {
  for (const hangs of [false, true]) {
    const f = await fixture(t);
    f.updater.checkForUpdates = () =>
      hangs
        ? new Promise(() => {})
        : Promise.reject(Object.assign(new Error('network offline'), { code: 'ENOTFOUND' }));
    assert.equal((await f.service.start()).phase, 'offline');
    f.updater.emit('update-downloaded', { version: '0.2.10001' });
    f.updater.emit('error', new Error('late network failure'));
    assert.equal(f.service.status().phase, 'offline');
    assert.equal(f.calls.some(Array.isArray), false);
  }
});

test('a stalled download is cancelled and can never trigger a late install', async (t) => {
  const f = await fixture(t);
  f.updater.downloadUpdate = () => new Promise(() => {});
  assert.equal((await f.service.start()).phase, 'offline');
  assert.ok(f.calls.includes('cancel'));
  f.updater.emit('update-downloaded', { version: '0.2.10001' });
  f.updater.emit('download-progress', { percent: 100 });
  assert.equal(f.service.status().phase, 'offline');
  assert.equal(f.calls.some(Array.isArray), false);
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('invalid downloads and emitted updater errors never install', async (t) => {
  for (const emitted of [false, true]) {
    const f = await fixture(t);
    f.updater.downloadUpdate = async () => {
      if (emitted) f.updater.emit('error', new Error('checksum mismatch'));
      return [];
    };
    assert.equal((await f.service.start()).phase, 'error');
    assert.equal(f.calls.some(Array.isArray), false);
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
});

test('unsigned Mac and non-AppImage Linux disclose manual updates without requesting downloads', async (t) => {
  for (const options of [
    { platform: 'darwin', signedMac: false },
    { platform: 'linux', env: {} },
  ]) {
    const f = await fixture(t, options);
    const result = await f.service.start();
    assert.equal(result.phase, 'manual');
    assert.equal(result.canContinue, true);
    assert.equal(result.releaseUrl, RELEASE_URL);
    assert.deepEqual(f.calls, []);
  }
});

test('signed Mac and AppImage use the supported update path', async (t) => {
  for (const options of [
    { platform: 'darwin', signedMac: true },
    { platform: 'linux', env: { APPIMAGE: '/installed/Studio.AppImage' } },
  ]) {
    const f = await fixture(t, options);
    f.updater.checkForUpdates = async () => {
      f.calls.push('check');
      return { updateInfo: { version: '0.2.0' } };
    };
    assert.equal((await f.service.start()).phase, 'current');
    assert.deepEqual(f.calls, ['check']);
  }
});

test('development and explicit disposal never initiate installation', async (t) => {
  const f = await fixture(t);
  f.app.isPackaged = false;
  assert.equal((await f.service.start()).phase, 'disabled');
  assert.deepEqual(f.calls, []);
  const active = await fixture(t);
  active.updater.checkForUpdates = () => new Promise(() => {});
  const pending = active.service.start();
  active.service.dispose();
  assert.equal((await pending).canContinue, true);
  assert.equal(active.calls.some(Array.isArray), false);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createNextService } = require('../next-service.cjs');

async function fixture(t, { saved, needsSetup = async () => false, openPath } = {}) {
  const stateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-install-session-'));
  t.after(() => fs.rm(stateDirectory, { recursive: true, force: true }));
  const settingsFile = path.join(stateDirectory, 'session.json');
  if (saved) await fs.writeFile(settingsFile, JSON.stringify(saved));
  const project = { id: 'managed-project', passages: [{ id: 'passage:one' }] };
  const defaultParent = path.join(stateDirectory, 'default workspace');
  const opened = [];
  const checked = [];
  const service = createNextService({
    stateDirectory,
    defaultParent,
    getProject: () => null,
    getWorker: () => {
      throw new Error('Session preparation must not start a worker directly');
    },
    emit() {},
    needsSetup: async (parent) => {
      checked.push(parent);
      return needsSetup(parent);
    },
    openPath: async (parent) => {
      opened.push(parent);
      return openPath ? openPath(parent) : project;
    },
  });
  t.after(() => service.close());
  return { service, project, defaultParent, opened, checked, settingsFile };
}

test('first launch waits for preparation without opening a worker or saving a nonexistent project', async (t) => {
  const value = await fixture(t, { needsSetup: async () => true });
  assert.deepEqual(await value.service.invoke('session_restore'), {
    project: null,
    setupRequired: true,
  });
  assert.deepEqual(value.checked, [value.defaultParent]);
  assert.deepEqual(value.opened, []);
  await assert.rejects(fs.stat(value.settingsFile), { code: 'ENOENT' });
});

test('a contributor-selected saved folder bypasses default-workspace preparation', async (t) => {
  const existing = path.join(os.tmpdir(), 'existing contributor project');
  const saved = { parentPath: existing, selectedPassageId: 'passage:one' };
  const value = await fixture(t, {
    saved,
    needsSetup: async () => {
      throw new Error('An existing project must not require managed setup');
    },
  });
  const result = await value.service.invoke('session_restore');
  assert.equal(result.project, value.project);
  assert.equal(result.selectedPassageId, saved.selectedPassageId);
  assert.deepEqual(value.checked, []);
  assert.deepEqual(value.opened, [existing]);
  assert.deepEqual(JSON.parse(await fs.readFile(value.settingsFile, 'utf8')), saved);
});

test('a complete default workspace opens and is remembered only after successful opening', async (t) => {
  const value = await fixture(t);
  const result = await value.service.invoke('session_restore');
  assert.equal(result.project, value.project);
  assert.deepEqual(value.checked, [value.defaultParent]);
  assert.deepEqual(value.opened, [value.defaultParent]);
  assert.deepEqual(JSON.parse(await fs.readFile(value.settingsFile, 'utf8')), {
    parentPath: value.defaultParent,
  });
});

test('failed opening preserves the saved project and selection for a later retry', async (t) => {
  const saved = {
    parentPath: path.join(os.tmpdir(), 'temporarily unavailable'),
    selectedPassageId: 'passage:one',
  };
  const value = await fixture(t, {
    saved,
    openPath: async () => {
      throw new Error('fixture unavailable');
    },
  });
  const original = await fs.readFile(value.settingsFile, 'utf8');
  const result = await value.service.invoke('session_restore');
  assert.equal(result.project, null);
  assert.match(result.error, /fixture unavailable/);
  assert.equal(await fs.readFile(value.settingsFile, 'utf8'), original);
});

test('retry after completed setup can restore the default without a previous session file', async (t) => {
  let incomplete = true;
  const value = await fixture(t, { needsSetup: async () => incomplete });
  assert.equal((await value.service.invoke('session_restore')).setupRequired, true);
  incomplete = false;
  assert.equal((await value.service.invoke('session_restore')).project, value.project);
  assert.deepEqual(value.opened, [value.defaultParent]);
  assert.deepEqual(JSON.parse(await fs.readFile(value.settingsFile, 'utf8')), {
    parentPath: value.defaultParent,
  });
});

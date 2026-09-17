'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjectWatch } = require('../project-watch.cjs');
const { createNextService } = require('../next-service.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

test('closing a project watch cancels its already scheduled source-change notification', async () => {
  let callback,
    closed = 0,
    emitted = 0;
  const watcher = createProjectWatch({
    directory: '/fixture',
    delay: 5,
    watch: (_, listener) => {
      callback = listener;
      return {
        close() {
          closed++;
        },
      };
    },
    onChange: () => emitted++,
  });
  callback();
  watcher.close();
  await wait();
  assert.equal(closed, 1);
  assert.equal(emitted, 0);
});

test('reviewed local writes suppress events while later external writes still notify', async () => {
  let callback,
    suppressed = true,
    emitted = 0;
  const watcher = createProjectWatch({
    directory: '/fixture',
    delay: 5,
    isSuppressed: () => suppressed,
    watch: (_, listener) => {
      callback = listener;
      return { close() {} };
    },
    onChange: () => emitted++,
  });
  callback();
  suppressed = false;
  await wait();
  assert.equal(emitted, 0);
  assert.equal(watcher.suppressedChange, true);
  callback();
  await wait();
  assert.equal(emitted, 1);
  watcher.close();
});

test('recovery previews are not adopted as projects; apply and approval use the guarded write action', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-next-service-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const adopted = [],
    guarded = [];
  const project = { id: 'local-test', passages: [], repositories: [] };
  const preview = { previewId: 'preview', diff: 'patch' };
  const service = createNextService({
    stateDirectory: directory,
    emit() {},
    getProject: () => project,
    getWorker: () => ({
      request: async (method) =>
        method === 'source_recover'
          ? preview
          : method === 'source_recovery_list'
            ? { items: [] }
            : method === 'reference_approve'
              ? { project, approval: {} }
              : project,
    }),
    adoptProject: (value) => adopted.push(value),
    duringProjectWrite: async (callback) => {
      guarded.push('begin');
      try {
        return await callback();
      } finally {
        guarded.push('end');
      }
    },
  });
  t.after(() => service.close());
  assert.equal(await service.invoke('source_recover', { recoveryId: 'id' }), preview);
  assert.deepEqual(adopted, []);
  assert.deepEqual(await service.invoke('source_recovery_list', {}), { items: [] });
  await service.invoke('source_apply', { previewId: 'id' });
  await service.invoke('reference_approve', {});
  assert.deepEqual(adopted, [project, project]);
  assert.deepEqual(guarded, ['begin', 'end', 'begin', 'end']);
});

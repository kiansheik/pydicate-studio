'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {
  projectId: 'hosted',
  sourceProjectId: 'desktop',
  passageMappings: { 'old:one': 'passage:new', 'pending:two': 'pending:two' },
};
const prefix = 'pydicate-studio:evidence-draft:v1:';
const key = (id) => prefix + JSON.stringify(['desktop', 'fonte', id]);
const targetKey = (id) => prefix + JSON.stringify(['hosted', 'fonte', id]);
const buffer = {
  assetId: 'pdf:exact',
  revision: 2,
  regions: [{ id: 'region:1', assetId: 'pdf:exact', pageIndex: 3, rect: [1, 2, 20, 30] }],
  view: { pageIndex: 3, zoom: 1.2, rotation: 0 },
  baseline: 'null',
};
function setup(entries, initial = {}) {
  const sandbox = { window: {}, structuredClone };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/desktop-storage.js'), 'utf8'),
    sandbox,
  );
  const saved = new Map(Object.entries(initial));
  return {
    saved,
    restore: (args) =>
      sandbox.window.desktopHistoryStorage.restore({
        context,
        data: {
          format: 'pydicate-browser-storage',
          version: 1,
          origins: [{ origin: 'studio://app', entries }],
        },
        storage: {
          getItem: (key) => (saved.has(key) ? saved.get(key) : null),
          setItem: (key, value) => saved.set(key, value),
        },
        evidenceStatus: async (params) => ({
          ...params,
          asset: { id: 'pdf:exact', managedState: 'ok' },
          passage: null,
          revision: 12,
        }),
        ...args,
      }),
  };
}
test('restores PDF buffers with exact asset and mapped IDs/revision, merges only absent keys, and never replays submission records', async () => {
  const f = setup(
    {
      [key('old:one')]: JSON.stringify(buffer),
      'studio-theme': 'light',
      'pydicate-studio:tools:v1': '{"version":1,"advanced":true}',
      'pydicate-studio:submission:v1:retry': 'retry-id',
      'pydicate:lexical-note-buffer:any': '{"note":"pending"}',
      [key('passage:two')]: JSON.stringify(buffer),
    },
    { 'studio-theme': 'dark' },
  );
  const result = await f.restore();
  assert.equal(result.imported, 3);
  assert.equal(result.archived, 2);
  assert.equal(result.conflicts, 1);
  assert.equal(f.saved.get('studio-theme'), 'dark');
  assert.equal(f.saved.has('pydicate-studio:submission:v1:retry'), false);
  const restored = JSON.parse(f.saved.get(targetKey('passage:new')));
  assert.equal(restored.revision, 12);
  assert.deepEqual(restored.regions, buffer.regions);
  assert.equal(f.saved.has(targetKey('passage:two')), true);
  const before = new Map(f.saved);
  await f.restore();
  assert.deepEqual(f.saved, before);
});
test('keeps buffers historical when current PDF or saved regions changed or passage mapping is unresolved', async () => {
  const f = setup({
    [key('old:one')]: JSON.stringify(buffer),
    [key('orphan')]: JSON.stringify(buffer),
  });
  assert.equal(
    (
      await f.restore({
        evidenceStatus: async (params) => ({
          ...params,
          asset: { id: 'other', managedState: 'ok' },
        }),
      })
    ).conflicts,
    2,
  );
  assert.equal(f.saved.size, 0);
  assert.equal(
    (
      await f.restore({
        evidenceStatus: async (params) => ({
          ...params,
          asset: { id: 'pdf:exact', managedState: 'ok' },
          passage: { regions: [], view: { pageIndex: 9 } },
          revision: 12,
        }),
      })
    ).conflicts,
    2,
  );
  assert.equal(f.saved.size, 0);
});
test('does not replace a local buffer written while server metadata is being checked', async () => {
  const f = setup({ [key('old:one')]: JSON.stringify(buffer) });
  const result = await f.restore({
    evidenceStatus: async (params) => {
      f.saved.set(targetKey('passage:new'), 'new user edit');
      return {
        ...params,
        asset: { id: 'pdf:exact', managedState: 'ok' },
        passage: null,
        revision: 12,
      };
    },
  });
  assert.equal(result.conflicts, 1);
  assert.equal(f.saved.get(targetKey('passage:new')), 'new user edit');
});

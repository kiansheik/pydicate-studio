'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AnalysisStore } = require('../analysis-store.cjs');

async function store(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-analysis-storage-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new AnalysisStore(directory);
}

test('acknowledged analysis transactions reopen with their exact Unicode data and revisions', async (t) => {
  const original = await store(t);
  const projectId = 'local:portable-storage';
  const decisions = ['Tupã îemonhangagûera 🌿', 'primeira\r\nsegunda'];
  const replies = await Promise.all(
    decisions.map((text) =>
      original.transact(projectId, (state) => {
        state.decisions.push({ text });
        return { saved: text };
      }),
    ),
  );
  assert.deepEqual(
    replies,
    decisions.map((text) => ({ saved: text })),
  );
  const reopened = await new AnalysisStore(original.directory).read(projectId);
  assert.equal(reopened.revision, 2);
  assert.deepEqual(
    reopened.decisions,
    decisions.map((text) => ({ text })),
  );
  assert.deepEqual(await fs.readdir(original.directory), [
    path.basename(original.filename(projectId)),
  ]);
});

test('analysis storage preserves damaged state instead of replacing it on a later command', async (t) => {
  const original = await store(t);
  const projectId = 'local:damaged-storage';
  const filename = original.filename(projectId);
  await fs.writeFile(filename, '{damaged state');
  await assert.rejects(
    original.transact(projectId, (state) => state.decisions.push({ text: 'new' })),
    /preservado/,
  );
  assert.equal(await fs.readFile(filename, 'utf8'), '{damaged state');
});

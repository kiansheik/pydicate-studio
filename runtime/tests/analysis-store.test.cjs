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

test('large repeated tool results live once outside the bounded index and reopen losslessly', async (t) => {
  const original = await store(t);
  original.maxBytes = 4096;
  const projectId = 'local:payload-storage';
  const result = { content: 'Tupã 🌿'.repeat(12000) };
  await original.transact(projectId, (state) => {
    for (let i = 0; i < 12; i++) state.operations['tool:' + i] = { result };
  });
  const index = JSON.parse(await fs.readFile(original.filename(projectId), 'utf8'));
  assert.equal(index.payloadStorage.refs.length, 12);
  assert.equal((await fs.readdir(path.join(original.directory, 'payloads'))).length, 1);
  assert((await fs.stat(original.filename(projectId))).size < 4096);
  const reopened = await new AnalysisStore(original.directory, { maxBytes: 4096 }).read(projectId);
  for (const operation of Object.values(reopened.operations))
    assert.deepEqual(operation.result, result);
  // Cancellation metadata can still commit with all original payloads retained.
  await original.transact(projectId, (state) => {
    state.operations.cancel = { jobId: 'job:test' };
  });
  assert.deepEqual((await original.read(projectId)).operations['tool:0'].result, result);
  reopened.operations['tool:0'].result.content = 'changed independently';
  assert.equal(reopened.operations['tool:1'].result.content, result.content);
});

test('legacy inline payloads migrate on write; missing or corrupt blobs preserve the index', async (t) => {
  const original = await store(t),
    projectId = 'local:legacy-payload';
  const value = await original.read(projectId);
  value.operations.tool = { result: { content: 'x'.repeat(20000) } };
  await fs.writeFile(original.filename(projectId), JSON.stringify(value));
  assert.equal((await original.read(projectId)).operations.tool.result.content.length, 20000);
  await original.transact(projectId, (state) => {
    state.operations.cancel = { jobId: 'job:test' };
  });
  const bytes = await fs.readFile(original.filename(projectId));
  const index = JSON.parse(bytes);
  const blob = path.join(
    original.directory,
    'payloads',
    index.payloadStorage.refs[0].hash + '.json',
  );
  await fs.writeFile(blob, 'corrupt');
  await assert.rejects(
    original.transact(projectId, (state) => {
      state.operations.cancel2 = {};
    }),
    /preservado/,
  );
  assert.deepEqual(await fs.readFile(original.filename(projectId)), bytes);
  await fs.rm(blob);
  await assert.rejects(original.read(projectId), /preservado/);
  assert.deepEqual(await fs.readFile(original.filename(projectId)), bytes);
});

test('unbounded human text still fails without rewriting prior state', async (t) => {
  const original = await store(t),
    projectId = 'local:index-limit';
  await original.transact(projectId, (state) => {
    state.decisions.push({ text: 'preserved' });
  });
  const before = await fs.readFile(original.filename(projectId));
  original.maxBytes = 4096;
  await assert.rejects(
    original.transact(projectId, (state) => {
      state.decisions.push({ text: 'x'.repeat(5000) });
    }),
    /dados anteriores foram preservados/,
  );
  assert.deepEqual(await fs.readFile(original.filename(projectId)), before);
});

test('more than 64 MiB of repeated historical payloads fit a bounded durable index without loss', async (t) => {
  const original = await store(t),
    projectId = 'local:real-limit';
  const result = { content: 'x'.repeat(6 * 1024 * 1024) };
  const inline = await original.read(projectId);
  for (let i = 0; i < 12; i++) inline.operations['tool:' + i] = { result };
  const inlineStart = performance.now();
  const inlineBytes = Buffer.byteLength(JSON.stringify(inline));
  const inlineSerializeMs = performance.now() - inlineStart;
  assert(inlineBytes > 64 * 1024 * 1024, 'the original writer rejects this real-size record');
  const start = performance.now();
  await original.transact(projectId, (state) => {
    for (let i = 0; i < 12; i++) state.operations['tool:' + i] = { result };
  });
  const writeMs = performance.now() - start;
  const bytes = (await fs.stat(original.filename(projectId))).size;
  const startRead = performance.now();
  const reopened = await new AnalysisStore(original.directory).read(projectId);
  const readMs = performance.now() - startRead;
  for (const operation of Object.values(reopened.operations))
    assert.equal(operation.result.content.length, 6 * 1024 * 1024);
  assert(bytes < 4096);
  const startSwitch = performance.now();
  await original.transact(projectId, (state) => {
    state.operations['history-selection'] = { conversationId: 'thread:test' };
  });
  const switchMs = performance.now() - startSwitch;
  t.diagnostic(
    `72 MiB logical tool history; old inline ${inlineBytes} bytes (rejected), serialization ${inlineSerializeMs.toFixed(1)}ms; index ${bytes} bytes; first write ${writeMs.toFixed(1)}ms, reopen ${readMs.toFixed(1)}ms, metadata switch ${switchMs.toFixed(1)}ms. No provider time.`,
  );
});

test('a failed index commit leaves prior history intact even after a payload has been durably prepared', async (t) => {
  const original = await store(t),
    projectId = 'local:prepared-payload';
  await original.transact(projectId, (state) => {
    state.decisions.push({ text: 'original preserved' });
  });
  const before = await fs.readFile(original.filename(projectId));
  original.maxBytes = 4096;
  await assert.rejects(
    original.transact(projectId, (state) => {
      state.operations.tool = { result: { content: 'prepared'.repeat(5000) } };
      state.decisions.push({ text: 'x'.repeat(5000) });
    }),
    /dados anteriores foram preservados/,
  );
  assert.equal((await fs.readdir(path.join(original.directory, 'payloads'))).length, 1);
  assert.deepEqual(await fs.readFile(original.filename(projectId)), before);
  const reopened = await new AnalysisStore(original.directory).read(projectId);
  assert.deepEqual(reopened.decisions, [{ text: 'original preserved' }]);
  assert.equal(reopened.operations.tool, undefined);
  // Portable backup/restore retains payloads via relative, content-hash paths.
  original.maxBytes = 64 * 1024 * 1024;
  await original.transact(projectId, (state) => {
    state.operations.tool = { result: { content: 'prepared'.repeat(5000) } };
  });
  const restoredDirectory = original.directory + '-restored';
  t.after(() => fs.rm(restoredDirectory, { recursive: true, force: true }));
  await fs.cp(original.directory, restoredDirectory, { recursive: true });
  assert.equal(
    (await new AnalysisStore(restoredDirectory).read(projectId)).operations.tool.result.content
      .length,
    40000,
  );
});

test('a reader waiting on a rejected oversized write sees committed history rather than inheriting its write error', async (t) => {
  const original = await store(t),
    projectId = 'local:read-after-rejection';
  await original.transact(projectId, (state) => {
    state.decisions.push({ text: 'committed' });
  });
  original.maxBytes = 4096;
  let entered, release;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const rejected = assert.rejects(
    original.transact(projectId, async (state) => {
      state.decisions.push({ text: 'x'.repeat(5000) });
      entered();
      await gate;
    }),
    /dados anteriores foram preservados/,
  );
  await ready;
  const reading = original.read(projectId);
  release();
  await rejected;
  assert.deepEqual((await reading).decisions, [{ text: 'committed' }]);
});

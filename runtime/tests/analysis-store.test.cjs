'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AnalysisStore, digest } = require('../analysis-store.cjs');

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

test('payload values remain independently mutable across repeated references, reads, JSON and clones', async (t) => {
  const original = await store(t),
    projectId = 'local:mutable-payloads';
  const result = { content: '🌿'.repeat(10000), nested: { steps: ['original'] } };
  await original.transact(projectId, (state) => {
    state.operations.first = { result };
    state.operations.second = { result };
  });
  const [first, second] = await Promise.all([original.read(projectId), original.read(projectId)]);
  const json = JSON.parse(JSON.stringify(first));
  const cloned = structuredClone(first);
  first.operations.first.result.nested.steps.push('first read only');
  json.operations.first.result.nested.steps.push('JSON only');
  cloned.operations.first.result.nested.steps.push('clone only');
  assert.deepEqual(first.operations.second.result, result);
  assert.deepEqual(second.operations.first.result, result);
  assert.deepEqual(second.operations.second.result, result);

  const reply = await original.transact(projectId, (state) => {
    state.operations.first.result.nested.steps.push('persisted');
    return state.operations.first;
  });
  reply.result.nested.steps.push('reply only');
  const reopened = await new AnalysisStore(original.directory).read(projectId);
  assert.deepEqual(reopened.operations.first.result.nested.steps, ['original', 'persisted']);
  assert.deepEqual(reopened.operations.second.result, result);
});

test('payload replacements, removed fields and redefined properties survive the shallow index write', async (t) => {
  const original = await store(t),
    projectId = 'local:replace-payloads';
  const result = { content: 'x'.repeat(20000) };
  await original.transact(projectId, (state) => {
    for (const key of ['replace', 'remove', 'undefined', 'redefine', 'untouched'])
      state.operations[key] = { result };
  });
  await original.transact(projectId, (state) => {
    state.operations.replace.result = { content: 'replaced' };
    delete state.operations.remove.result;
    state.operations.undefined.result = undefined;
    Object.defineProperty(state.operations.redefine, 'result', {
      value: { content: 'new descriptor' },
      enumerable: true,
      configurable: true,
    });
  });
  const reopened = await new AnalysisStore(original.directory).read(projectId);
  assert.deepEqual(reopened.operations.replace.result, { content: 'replaced' });
  assert.equal(Object.hasOwn(reopened.operations.remove, 'result'), false);
  assert.equal(Object.hasOwn(reopened.operations.undefined, 'result'), false);
  assert.deepEqual(reopened.operations.redefine.result, { content: 'new descriptor' });
  assert.deepEqual(reopened.operations.untouched.result, result);
  const index = JSON.parse(await fs.readFile(original.filename(projectId), 'utf8'));
  assert.deepEqual(
    index.payloadStorage.refs.map((ref) => ref.path),
    [['operations', 'untouched', 'result']],
  );
});

test('validated lazy inputs retain routing and digest guards on metadata and nested input edits', async (t) => {
  const original = await store(t),
    projectId = 'local:input-guards';
  const packet = { projectId, passageId: 'passage:test', context: { baseline: 'x'.repeat(20000) } };
  const input = { ...packet, digest: digest(packet) };
  await original.transact(projectId, (state) => {
    state.jobs.job = {
      id: 'job',
      projectId,
      passageId: packet.passageId,
      status: 'queued',
      input,
      attempts: [],
      candidateIds: [],
      questions: [],
    };
  });
  await original.transact(projectId, (state) => {
    state.jobs.job.status = 'blocked';
  });
  const before = await fs.readFile(original.filename(projectId));
  await assert.rejects(
    original.transact(projectId, (state) => {
      state.jobs.job.passageId = 'passage:different';
    }),
    /Análise persistida inválida/,
  );
  await assert.rejects(
    original.transact(projectId, (state) => {
      state.jobs.job.input.context.baseline = 'changed without digest';
    }),
    /pacote de entrada.*alterado/,
  );
  assert.deepEqual(await fs.readFile(original.filename(projectId)), before);

  const newPacket = { ...packet, context: { baseline: 'replacement'.repeat(2000) } };
  const newInput = { ...newPacket, digest: digest(newPacket) };
  await original.transact(projectId, (state) => {
    state.jobs.job.input = newInput;
  });
  const reopened = await new AnalysisStore(original.directory).read(projectId);
  assert.deepEqual(reopened.jobs.job.input, newInput);
  assert.equal(reopened.jobs.job.status, 'blocked');
});

test('a warm payload cache detects same-size corruption and preserves committed bytes', async (t) => {
  const original = await store(t),
    projectId = 'local:cached-integrity';
  await original.transact(projectId, (state) => {
    state.operations.tool = { result: { content: 'x'.repeat(20000) } };
  });
  const before = await fs.readFile(original.filename(projectId));
  const index = JSON.parse(before),
    ref = index.payloadStorage.refs[0];
  const filename = path.join(original.directory, 'payloads', ref.hash + '.json');
  // Warm the shared serialized cache; no caller needs to inspect this result.
  await original.read(projectId);
  const bytes = await fs.readFile(filename);
  await fs.writeFile(filename, Buffer.from(bytes.toString().replace('x', 'y')));
  const later = new Date(Date.now() + 1000);
  await fs.utimes(filename, later, later);
  await assert.rejects(original.read(projectId), /Hash do payload.*inválido/);
  await assert.rejects(
    original.transact(projectId, (state) => {
      state.decisions.push('new');
    }),
    /preservado/,
  );
  assert.deepEqual(await fs.readFile(original.filename(projectId)), before);
});

test('serialized cache eviction does not discard or alias live payloads from earlier reads', async (t) => {
  const original = await store(t),
    projectId = 'local:bounded-cache';
  original.maxPayloadCacheBytes = 25000;
  await original.transact(projectId, (state) => {
    state.operations.first = { result: { content: 'a'.repeat(20000) } };
    state.operations.second = { result: { content: 'b'.repeat(20000) } };
  });
  const first = await original.read(projectId);
  const second = await original.read(projectId);
  await original.close();
  assert.equal(first.operations.first.result.content, 'a'.repeat(20000));
  assert.equal(first.operations.second.result.content, 'b'.repeat(20000));
  first.operations.second.result.content = 'mutated after cache close';
  assert.equal(second.operations.second.result.content, 'b'.repeat(20000));
  assert.equal(
    (await original.read(projectId)).operations.second.result.content,
    'b'.repeat(20000),
  );
});

test('unused payloads are still checked for malformed JSON and conflicting reference sizes', async (t) => {
  const original = await store(t),
    projectId = 'local:unused-integrity';
  await original.transact(projectId, (state) => {
    const result = { content: 'x'.repeat(20000) };
    state.operations.first = { result };
    state.operations.second = { result };
  });
  const index = JSON.parse(await fs.readFile(original.filename(projectId), 'utf8'));
  index.payloadStorage.refs[1].bytes++;
  await fs.writeFile(original.filename(projectId), JSON.stringify(index));
  await assert.rejects(original.read(projectId), /Tamanho do payload.*inválido/);

  const invalid = '{"content":' + ' '.repeat(20000);
  const hash = require('node:crypto').createHash('sha256').update(invalid).digest('hex');
  for (const ref of index.payloadStorage.refs) {
    ref.hash = hash;
    ref.bytes = Buffer.byteLength(invalid);
  }
  await fs.writeFile(path.join(original.directory, 'payloads', hash + '.json'), invalid);
  const committed = JSON.stringify(index);
  await fs.writeFile(original.filename(projectId), committed);
  await assert.rejects(
    original.transact(projectId, (state) => {
      state.decisions.push('metadata only');
    }),
    /preservado/,
  );
  assert.equal(await fs.readFile(original.filename(projectId), 'utf8'), committed);
});

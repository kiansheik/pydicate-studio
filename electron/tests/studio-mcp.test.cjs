'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createStudioMcpGateway } = require('../studio-mcp-gateway.cjs');
const { createScratchService, tools, GUIDE } = require('../scratch-service.cjs');
const { PythonWorker } = require('../python-worker.cjs');
function client(descriptor) {
  const process = spawn(descriptor.command, descriptor.args, {
    env: { ...global.process.env, ...descriptor.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let sequence = 0,
    buffer = '',
    stderr = '';
  const pending = new Map();
  process.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  process.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const row = JSON.parse(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
      const item = pending.get(String(row.id));
      if (item) {
        pending.delete(String(row.id));
        clearTimeout(item.timer);
        item.resolve(row);
      }
    }
  });
  process.on('close', () => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('MCP closed: ' + stderr));
    }
  });
  function send(method, params, id = ++sequence) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(String(id));
        reject(new Error('MCP timeout: ' + method + '; ' + stderr));
      }, 60_000);
      pending.set(String(id), { resolve, reject, timer });
      process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async function initialize() {
    return send('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'studio-external-fixture', version: '1.0.0' },
    });
  }
  async function call(name, args = {}, id) {
    const response = await send('tools/call', { name, arguments: args }, id);
    if (response.error)
      throw Object.assign(new Error(response.error.message), { code: response.error.code });
    if (response.result.isError)
      throw Object.assign(new Error(JSON.parse(response.result.content[0].text).message), {
        code: JSON.parse(response.result.content[0].text).code,
      });
    return response.result.structuredContent;
  }
  return {
    process,
    send,
    initialize,
    call,
    close: () => process.kill(),
    notify: (method, params) =>
      process.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'),
  };
}
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-mcp-test-'));
  const gateway = createStudioMcpGateway({
    stateDirectory: directory,
    listTools: () => tools,
    getGuide: () => GUIDE,
    isJobActive: () => true,
    callTool: async (_job, name, args) => ({ name, args }),
    ...options,
  });
  t.after(async () => {
    await gateway.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const descriptor = await gateway.openScope({ jobId: 'job', attemptId: 'attempt' });
  const external = client(descriptor);
  t.after(() => external.close());
  return { directory, gateway, descriptor, external };
}
test('external stdio MCP initializes, discovers the complete catalog/resources, authenticates and revokes', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.external.initialize()).result.protocolVersion, '2025-11-25');
  const first = (await f.external.send('tools/list', {})).result;
  assert.equal(first.tools.length, tools.length);
  assert.equal(first.nextCursor, undefined);
  assert.ok(first.tools.some((tool) => tool.name === 'studio_candidate_evaluate'));
  assert.ok(first.tools.some((tool) => tool.name === 'studio_candidate_propose'));
  const resource = (await f.external.send('resources/read', { uri: 'studio://authoring/guide' }))
    .result;
  assert.match(resource.contents[0].text, /ground truth/);
  assert.equal((await fs.stat(f.gateway.discoveryPath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(f.descriptor.configPath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(f.descriptor.env.STUDIO_MCP_SOCKET)).mode & 0o777, 0o600);
  assert.ok(JSON.parse(await fs.readFile(f.descriptor.configPath)).mcpServers.studio_authoring);
  const forbidden = client({
    ...f.descriptor,
    env: { ...f.descriptor.env, STUDIO_MCP_TOKEN: 'b'.repeat(64) },
  });
  t.after(() => forbidden.close());
  assert.equal((await forbidden.initialize()).error.code, -32001);
  await f.descriptor.close();
  assert.equal((await f.external.send('tools/list', {})).error.code, -32001);
});
test('owner uniqueness, duplicate call idempotency, schema failures and cancellation are actual MCP protocol events', async (t) => {
  let count = 0;
  const f = await fixture(t, {
    callTool: async (_, name, args, { signal }) => {
      count++;
      if (name === 'wait')
        await new Promise((resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('Cancelled.'), { code: 'CANCELLED' })),
            { once: true },
          ),
        );
      if (name === 'unknown')
        throw Object.assign(new Error('Unknown tool.'), { code: 'UNKNOWN_TOOL' });
      return { name, args };
    },
  });
  const other = createStudioMcpGateway({
    stateDirectory: f.directory,
    listTools: () => tools,
    getGuide: () => GUIDE,
    callTool: () => ({}),
  });
  await assert.rejects(other.start(), { code: 'OWNER_ACTIVE' });
  await other.close();
  await fs.access(f.gateway.discoveryPath);
  await f.external.initialize();
  assert.deepEqual(
    await f.external.call('example', { a: 1 }, 20),
    await f.external.call('example', { a: 1 }, 20),
  );
  assert.equal(count, 1);
  const reused = await f.external.send('tools/call', { name: 'example', arguments: { a: 2 } }, 20);
  assert.equal(reused.error.code, -32600);
  await assert.rejects(f.external.call('unknown'), { code: 'UNKNOWN_TOOL' });
  const pending = f.external.call('wait', {}, 30);
  await new Promise((resolve) => setTimeout(resolve, 20));
  f.external.notify('notifications/cancelled', { requestId: 30, reason: 'test' });
  await assert.rejects(pending, { code: 'CANCELLED' });
});
test('independent MCP clients do not collide; explicit command IDs preserve retries across reconnects', async (t) => {
  const receipts = new Map();
  let mutations = 0;
  const f = await fixture(t, {
    callTool: async (_job, name, args, { operationId }) => {
      const signature = JSON.stringify({ name, args });
      const previous = receipts.get(operationId);
      if (previous) {
        if (previous.signature !== signature)
          throw Object.assign(new Error('Operation arguments changed.'), {
            code: 'OPERATION_CONFLICT',
          });
        return previous.result;
      }
      const result = { name, args, mutation: ++mutations };
      receipts.set(operationId, { signature, result });
      return result;
    },
  });
  const second = client(f.descriptor);
  t.after(() => second.close());
  await Promise.all([f.external.initialize(), second.initialize()]);
  const first = await f.external.call('example', { piece: 'a' }, 20);
  const other = await second.call('example', { piece: 'b' }, 20);
  assert.equal(first.mutation, 1);
  assert.equal(other.mutation, 2);
  assert.deepEqual(await f.external.call('example', { piece: 'a' }, 20), first);
  const command = {
    name: 'example',
    arguments: { piece: 'shared-command' },
    _meta: { 'studio/operationId': 'command:stable-retry' },
  };
  const committed = await f.external.send('tools/call', command, 21);
  const reconnected = await second.send('tools/call', command, 21);
  assert.deepEqual(reconnected.result, committed.result);
  assert.equal(mutations, 3);
  const conflict = await second.send(
    'tools/call',
    { ...command, arguments: { piece: 'changed' } },
    22,
  );
  assert.equal(JSON.parse(conflict.result.content[0].text).code, 'OPERATION_CONFLICT');
  const numeric = await f.external.call('example', { piece: 'numeric' }, 23);
  const string = await f.external.call('example', { piece: 'string' }, '23');
  assert.notEqual(numeric.mutation, string.mutation);
});
const realParent = path.resolve(
  process.env.PYDICATE_PROJECT_PARENT ?? path.join(__dirname, '../../..'),
);
test(
  'external MCP reads real Navarro, edits shared scratch and evaluates without touching corpus/reference files',
  { timeout: 120_000 },
  async (t) => {
    try {
      await fs.access(path.join(realParent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py'));
    } catch {
      t.skip('Selected local dependencies are not installed.');
      return;
    }
    const state = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-real-mcp-'));
    const worker = new PythonWorker({
      script: path.resolve(__dirname, '../../python/worker.py'),
      stateDirectory: path.join(state, 'worker'),
    });
    t.after(async () => {
      worker.close();
      await fs.rm(state, { recursive: true, force: true });
    });
    const files = [
      'historic/araujo_catecismo_1686.tu.py',
      'historic/lexicon.tu.py',
      'ground_truth/records/historic/araujo_catecismo_1686.jsonl',
    ];
    const hashes = async () =>
      Promise.all(
        files.map(async (file) =>
          createHash('sha256')
            .update(await fs.readFile(path.join(realParent, 'oldtupicorpus', file)))
            .digest('hex'),
        ),
      );
    const before = await hashes();
    const project = await worker.request('open_project', { parentPath: realParent });
    const passage = project.passages.find((p) => p.sourceId === 'araujo_catecismo_1686');
    const job = {
      id: 'job',
      status: 'running',
      input: {
        projectId: project.id,
        passageId: passage.id,
        sourceId: passage.sourceId,
        sourceFingerprint: passage.sourceFingerprint,
        engineFingerprint: project.engineFingerprint,
        raw: '',
        diplomatic: 'abá',
        tentativeReading: 'abá',
        reviewedTarget: '',
        manifest: {},
        context: [],
      },
    };
    const candidates = new Map();
    const service = createScratchService({
      getJob: async () => job,
      getCandidate: async (_, id) => candidates.get(id),
      saveCandidate: async (_, value, { expectedRevision }) => {
        assert.equal(candidates.get(value.id)?.revisionId ?? null, expectedRevision);
        candidates.set(value.id, structuredClone(value));
        return value;
      },
      request: (...args) => worker.request(...args),
      getProject: async () => project,
      getEvidence: async () => ({ regions: [] }),
      askQuestion: async (_, q) => q,
    });
    const f = await fixture(t, {
      callTool: (...args) => service.call(...args),
      listTools: () => service.tools,
      getGuide: () => service.getGuide(),
    });
    await f.external.initialize();
    const guide = await f.external.call('studio_guide');
    assert.ok(guide.catalog.constructors.some((c) => c.name === 'Noun'));
    const lookup = await f.external.call('studio_dictionary_search', { query: 'abá', limit: 5 });
    assert.ok(lookup.results.length > 0);
    const entry = lookup.results.find((entry) => entry.suggestedConstructor === 'Noun');
    assert.ok(entry);
    const full = await f.external.call('studio_dictionary_entry', {
      entryIndex: entry.entryIndex,
      datasetFingerprint: entry.datasetFingerprint,
    });
    assert.match(full.entry.definition, /pessoa|homem/);
    let c = await f.external.call('studio_candidate_create');
    c = await f.external.call('studio_candidate_edit', {
      candidateId: c.id,
      expectedRevision: c.revisionId,
      action: {
        type: 'dictionary',
        entryIndex: entry.entryIndex,
        datasetFingerprint: entry.datasetFingerprint,
        constructor: 'Noun',
      },
    });
    assert.equal(c.evidence[0].entry.datasetFingerprint, lookup.datasetFingerprint);
    const revision = c.revisionId;
    c = await f.external.call('studio_candidate_evaluate', {
      candidateId: c.id,
      expectedRevision: c.revisionId,
    });
    assert.equal(c.evaluation.evaluationStatus, 'complete');
    assert.equal(c.evaluation.surface, 'abá');
    assert.equal(c.comparison.tentative.exact, true);
    assert.deepEqual(c.tree, candidates.get(c.id).tree);
    c = await f.external.call('studio_candidate_edit', {
      candidateId: c.id,
      expectedRevision: c.revisionId,
      action: {
        type: 'operation',
        source: { nodeId: 'root', expectedRaw: c.raw },
        operation: 'var',
        argument: '1',
      },
    });
    await assert.rejects(
      f.external.call('studio_candidate_edit', {
        candidateId: c.id,
        expectedRevision: revision,
        action: { type: 'raw', raw: 'wrong' },
      }),
      { code: 'STALE_CANDIDATE' },
    );
    await assert.rejects(f.external.call('source_apply', {}), { code: 'UNKNOWN_TOOL' });
    const reuse = await f.external.call('studio_reuse_search', {
      query: 'o emi tym bûer ypy',
      limit: 5,
    });
    assert.ok(reuse.results.length > 0);
    const resolved = await f.external.call('studio_reuse_resolve', {
      constructionId: reuse.results[0].id,
      indexFingerprint: reuse.indexFingerprint,
    });
    assert.ok(resolved.expression);
    job.input.manifest = {
      mode: 'reconstruction',
      excludePassageIds: [
        reuse.results[0].sources.find((source) => source.passageId)?.passageId,
      ].filter(Boolean),
    };
    await assert.rejects(
      f.external.call('studio_reuse_resolve', {
        constructionId: reuse.results[0].id,
        indexFingerprint: reuse.indexFingerprint,
      }),
      { code: 'REFERENCE_WITHHELD' },
    );
    assert.deepEqual(await hashes(), before);
    t.diagnostic(
      `Real selected engine ${project.engineFingerprint}; ${project.passages.length} source passages; full sense ${entry.entryIndex}; corpus/reference hashes unchanged.`,
    );
  },
);

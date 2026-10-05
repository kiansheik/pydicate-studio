'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { createStudio } = require('../studio.cjs');
const { createStudioMcpGateway } = require('../../runtime/studio-mcp-gateway.cjs');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-mcp-startup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const workers = [];
  const project = {
    id: 'project:mcp-startup',
    name: 'Startup fixture',
    mode: 'local',
    engineFingerprint: 'engine:fixture',
    diagnostics: [],
    repositories: [],
    passages: [],
    sources: [
      { id: 'source', title: 'Source', year: '', fileName: 'source.tu.py', passageCount: 0 },
    ],
  };
  t.mock.method(require('../../runtime/python-worker.cjs'), 'PythonWorker', function () {
    const worker = {
      closed: false,
      async request(method) {
        assert.equal(method, 'open_project', 'Readiness must not submit grammar/provider work.');
        return structuredClone(project);
      },
      close() {
        this.closed = true;
      },
    };
    workers.push(worker);
    return worker;
  });
  const config = {
    python: 'fixture-python',
    applicationDirectory: path.resolve(__dirname, '../..'),
    stateDirectory: directory,
    parent: path.join(directory, 'workspace'),
    origin: 'https://fixture.invalid',
    claudeHomeDirectory: path.join(directory, 'claude'),
    aiEnabled: true,
  };
  const store = { db: {}, context: {}, now: Date.now, seed: async () => {} };
  const stateDirectory = path.join(directory, 'analysis/mcp');
  await fs.mkdir(stateDirectory, { recursive: true });
  return {
    directory,
    config,
    store,
    workers,
    stateDirectory,
    discoveryPath: path.join(stateDirectory, 'mcp-owner.json'),
  };
}

async function unauthenticatedRequest(socketPath) {
  const socket = net.createConnection(socketPath);
  try {
    return await new Promise((resolve, reject) => {
      socket.setTimeout(2000, () => reject(new Error('Readiness socket did not respond.')));
      socket.on('error', reject);
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk;
        if (buffer.includes('\n')) resolve(JSON.parse(buffer.split('\n')[0]));
      });
      socket.on('connect', () =>
        socket.write(
          JSON.stringify({
            token: 'invalid',
            message: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
          }) + '\n',
        ),
      );
    });
  } finally {
    socket.destroy();
  }
}

test('AI-enabled hosted startup recovers stale discovery and validates transport without running a job', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    f.discoveryPath,
    JSON.stringify({
      version: 1,
      pid: process.pid,
      socketPath: path.join(os.tmpdir(), 'pydicate-mcp-stale' + process.pid, 'owner.sock'),
      startedAt: '2026-10-03T13:02:48.605Z',
      protocol: 'authenticated-local-mcp',
    }),
  );
  const runtime = await createStudio(f.config, f.store);
  t.after(() => runtime.close());
  const owner = JSON.parse(await fs.readFile(f.discoveryPath));
  assert.equal(owner.pid, process.pid);
  assert.notEqual(owner.startedAt, '2026-10-03T13:02:48.605Z');
  assert.equal((await unauthenticatedRequest(owner.socketPath)).error.code, -32001);
  assert.equal(runtime.hasWork(), false);
  await assert.rejects(fs.stat(path.join(f.directory, 'analysis/records')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(f.stateDirectory, 'mcp-scopes')), { code: 'ENOENT' });
  await runtime.close();
  assert.equal(f.workers[0].closed, true);
  await assert.rejects(fs.stat(f.discoveryPath), { code: 'ENOENT' });
});

test('an actual active MCP owner stops hosted readiness and closes its candidate worker', async (t) => {
  const f = await fixture(t);
  const gateway = createStudioMcpGateway({
    stateDirectory: f.stateDirectory,
    callTool: async () => ({}),
    listTools: async () => [],
    getGuide: async () => '',
  });
  t.after(() => gateway.close());
  const { socketPath } = await gateway.start();
  const discovery = await fs.readFile(f.discoveryPath, 'utf8');
  await assert.rejects(createStudio(f.config, f.store), { code: 'OWNER_ACTIVE' });
  assert.equal(f.workers[0].closed, true);
  assert.equal(await fs.readFile(f.discoveryPath, 'utf8'), discovery);
  assert.equal((await unauthenticatedRequest(socketPath)).error.code, -32001);
});

test('AI-disabled startup does not acquire an authoring owner', async (t) => {
  const f = await fixture(t);
  const runtime = await createStudio({ ...f.config, aiEnabled: false }, f.store);
  t.after(() => runtime.close());
  await assert.rejects(fs.stat(f.discoveryPath), { code: 'ENOENT' });
});

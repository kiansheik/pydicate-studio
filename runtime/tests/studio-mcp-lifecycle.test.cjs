'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { randomBytes } = require('node:crypto');
const { createStudioMcpGateway } = require('../studio-mcp-gateway.cjs');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-mcp-lifecycle-'));
  const gateways = [];
  t.after(async () => {
    await Promise.all(gateways.map((gateway) => gateway.close()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    create(options = {}) {
      const gateway = createStudioMcpGateway({
        stateDirectory: directory,
        listTools: () => [],
        getGuide: () => '',
        callTool: () => ({}),
        ...options,
      });
      gateways.push(gateway);
      return gateway;
    },
    async staleMarker(socketPath) {
      const marker = JSON.stringify({
        version: 1,
        pid: process.pid,
        socketPath:
          socketPath ??
          (process.platform === 'win32'
            ? `\\\\.\\pipe\\pydicate-mcp-${process.pid}-${randomBytes(16).toString('hex')}`
            : path.join(
                os.tmpdir(),
                `pydicate-mcp-${randomBytes(3).toString('hex')}`,
                'owner.sock',
              )),
        startedAt: '2026-10-03T13:02:48.605Z',
        protocol: 'authenticated-local-mcp',
      });
      await fs.writeFile(path.join(directory, 'mcp-owner.json'), marker);
      return marker;
    },
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};

test('a missing legacy endpoint is recovered even when its PID is the current live process', async (t) => {
  const f = await fixture(t);
  await f.staleMarker();
  process.kill(process.pid, 0);
  const gateway = f.create();
  const started = await gateway.start();
  const marker = JSON.parse(await fs.readFile(gateway.discoveryPath, 'utf8'));
  assert.equal(marker.pid, process.pid);
  assert.match(marker.ownerId, /^[a-f0-9]{64}$/);
  assert.equal(marker.socketPath, started.socketPath);
  const scope = await gateway.openScope({ jobId: 'repair', attemptId: 'fresh' });
  assert.equal(scope.env.STUDIO_MCP_SOCKET, started.socketPath);
  await fs.access(scope.configPath);
});

test('a listening owner is refused and the same rejected gateway can retry after that owner closes', async (t) => {
  const f = await fixture(t);
  const first = f.create();
  await first.start();
  const original = await fs.readFile(first.discoveryPath, 'utf8');
  const retry = f.create();
  await assert.rejects(retry.start(), { code: 'OWNER_ACTIVE' });
  assert.equal(await fs.readFile(first.discoveryPath, 'utf8'), original);
  await first.close();
  await retry.start();
  const replacement = await fs.readFile(retry.discoveryPath, 'utf8');
  assert.notEqual(JSON.parse(replacement).ownerId, JSON.parse(original).ownerId);
  await first.close();
  assert.equal(await fs.readFile(retry.discoveryPath, 'utf8'), replacement);
});

test('simultaneous starts share one instance promise and admit only one profile owner', async (t) => {
  const f = await fixture(t);
  await f.staleMarker();
  const first = f.create();
  const second = f.create();
  const pending = first.start();
  assert.equal(first.start(), pending);
  const results = await Promise.allSettled([pending, second.start()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const loserIndex = results.findIndex((result) => result.status === 'rejected');
  assert.equal(results[loserIndex].reason.code, 'OWNER_ACTIVE');
  const before = await fs.readFile(first.discoveryPath, 'utf8');
  await [first, second][loserIndex].close();
  assert.equal(await fs.readFile(first.discoveryPath, 'utf8'), before);
});

test('malformed and non-local endpoint records fail closed without any connection attempt', async (t) => {
  const f = await fixture(t);
  const connect = t.mock.method(net, 'createConnection', () => {
    assert.fail('invalid discovery must not be passed to the network API');
  });
  const gateway = f.create();
  for (const endpoint of [
    undefined,
    { host: 'example.com', port: 443 },
    'https://example.com',
    '/tmp/arbitrary.sock',
  ]) {
    const invalid = JSON.stringify({ pid: process.pid, socketPath: endpoint });
    await fs.writeFile(gateway.discoveryPath, invalid);
    await assert.rejects(gateway.start(), { code: 'OWNER_INVALID' });
    assert.equal(await fs.readFile(gateway.discoveryPath, 'utf8'), invalid);
  }
  assert.equal(connect.mock.callCount(), 0);
});

for (const failure of ['EACCES', 'timeout']) {
  test(`an inconclusive owner probe (${failure}) is bounded and preserves the discovery record`, async (t) => {
    const f = await fixture(t);
    const marker = await f.staleMarker();
    let destroyed = false;
    t.mock.method(net, 'createConnection', (endpoint) => {
      assert.equal(endpoint, JSON.parse(marker).socketPath);
      const socket = new EventEmitter();
      socket.destroy = () => {
        destroyed = true;
      };
      socket.setTimeout = (milliseconds, callback) => {
        assert.ok(milliseconds > 0 && milliseconds <= 1000);
        queueMicrotask(() => {
          if (failure === 'timeout') callback();
          else socket.emit('error', Object.assign(new Error(failure), { code: failure }));
        });
      };
      return socket;
    });
    const gateway = f.create();
    await assert.rejects(gateway.start(), { code: 'OWNER_UNVERIFIED' });
    assert.equal(destroyed, true);
    assert.equal(await fs.readFile(gateway.discoveryPath, 'utf8'), marker);
  });
}

test('close during startup removes only its completed acquisition and cannot reopen the instance', async (t) => {
  const f = await fixture(t);
  const gateway = f.create();
  const entered = deferred(),
    release = deferred();
  const originalWrite = fs.writeFile;
  t.mock.method(fs, 'writeFile', async (filename, ...args) => {
    if (filename === gateway.discoveryPath) {
      entered.resolve();
      await release.promise;
    }
    return originalWrite(filename, ...args);
  });
  const pending = gateway.start();
  const rejected = assert.rejects(pending, { code: 'MCP_CLOSED' });
  await entered.promise;
  const closing = gateway.close();
  assert.equal(gateway.close(), closing);
  release.resolve();
  await rejected;
  await closing;
  await assert.rejects(fs.access(gateway.discoveryPath), { code: 'ENOENT' });
  await assert.rejects(gateway.start(), { code: 'MCP_CLOSED' });
  await assert.rejects(gateway.openScope({ jobId: 'job', attemptId: 'attempt' }), {
    code: 'MCP_CLOSED',
  });
});

test('close drains pending scope preparation and removes its private capability file', async (t) => {
  const f = await fixture(t);
  const entered = deferred(),
    release = deferred();
  const gateway = f.create({
    listTools: async () => {
      entered.resolve();
      await release.promise;
      return [];
    },
  });
  const pending = gateway.openScope({ jobId: 'repair', attemptId: 'attempt' });
  const rejected = assert.rejects(pending, { code: 'MCP_CLOSED' });
  await entered.promise;
  let finished = false;
  const closing = gateway.close().then(() => {
    finished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  release.resolve();
  await rejected;
  await closing;
  assert.deepEqual(await fs.readdir(path.join(f.directory, 'mcp-scopes')), []);
  await assert.rejects(fs.access(gateway.discoveryPath), { code: 'ENOENT' });
});

test('closing an old gateway preserves a discovery record with a different owner identity', async (t) => {
  const f = await fixture(t);
  const gateway = f.create();
  await gateway.start();
  const current = JSON.parse(await fs.readFile(gateway.discoveryPath, 'utf8'));
  const replacement = JSON.stringify({ ...current, ownerId: 'f'.repeat(64) });
  await fs.writeFile(gateway.discoveryPath, replacement);
  await gateway.close();
  assert.equal(await fs.readFile(gateway.discoveryPath, 'utf8'), replacement);
});

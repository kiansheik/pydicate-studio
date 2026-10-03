'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDiagnostics, readCgroup } = require('../diagnostics.cjs');
const { Queue } = require('../queue.cjs');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const fixtureSample = () => ({
  memory: { rssBytes: 3000, heapUsedBytes: 1000, heapLimitBytes: 8000 },
  eventLoop: { p95Ms: 7, maxMs: 14, utilization: 0.25 },
  runtime: { queueDepth: 2 },
  cgroup: { available: false },
});
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-diagnostics-'));
  let at = 1791000000000;
  const diagnostics = createDiagnostics({
    directory,
    automatic: false,
    now: () => at,
    sample: fixtureSample,
    ...options,
  });
  t.after(async () => {
    await diagnostics.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await diagnostics.ready;
  return {
    diagnostics,
    directory,
    advance: (milliseconds) => {
      at += milliseconds;
    },
  };
}

test('diagnostics retain bounded numeric categories, never queries, users, errors or provider payloads', async (t) => {
  const secret = 'private query token password';
  const f = await fixture(t, {
    release: secret,
    sample: async () => ({
      ...fixtureSample(),
      query: secret,
      memory: { ...fixtureSample().memory, token: secret },
      runtime: { queueDepth: 3, user: secret },
    }),
  });
  await f.diagnostics.sample();
  f.diagnostics.observe({
    operation: secret,
    outcome: secret,
    queueMs: 125,
    executionMs: 50,
    user: secret,
    provider: secret,
  });
  f.diagnostics.observe({
    operation: 'render',
    outcome: 'failed',
    queueMs: 5,
    executionMs: 5,
    error: secret,
  });
  await f.diagnostics.flush();
  const report = await f.diagnostics.report();
  assert.equal(report.current.runtime.queueDepth, 3);
  assert.equal(report.current.cgroup.memoryCurrentBytes, null);
  assert.equal(report.latestWindow.totals.count, 2);
  assert.equal(report.latestWindow.totals.maxQueueMs, 125);
  assert.equal(report.latestWindow.totals.p95Ms, 175);
  assert.deepEqual(
    report.latestWindow.operations.map((item) => item.operation),
    ['other', 'render'],
  );
  const files = await fs.readdir(path.join(f.directory, 'diagnostics'));
  const saved = await fs.readFile(path.join(f.directory, 'diagnostics', files[0]), 'utf8');
  assert.equal(saved.includes(secret), false);
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('rotation caps owned diagnostics bytes, expires old samples and restores bounded history', async (t) => {
  const f = await fixture(t, { maxBytes: 4800, segmentBytes: 2400 });
  const root = path.join(f.directory, 'diagnostics');
  await fs.writeFile(path.join(root, 'audit.json'), 'preserve unrelated history');
  for (let i = 0; i < 15; i++) {
    f.advance(30000);
    await f.diagnostics.sample();
    await f.diagnostics.flush();
    const files = (await fs.readdir(root)).filter((name) => name.startsWith('metrics-'));
    const sizes = await Promise.all(
      files.map(async (name) => (await fs.stat(path.join(root, name))).size),
    );
    assert(sizes.reduce((a, b) => a + b, 0) <= 4800);
  }
  const restored = createDiagnostics({
    directory: f.directory,
    automatic: false,
    sample: fixtureSample,
    maxBytes: 4800,
    segmentBytes: 2400,
    now: () => 1791000450000,
  });
  await restored.ready;
  assert((await restored.report()).recent.length > 0);
  assert((await restored.report()).recent.length <= 120);
  await restored.close();
  const before = (await fs.readdir(root)).filter((name) => name.startsWith('metrics-'));
  f.advance(8 * 86400000);
  await f.diagnostics.sample();
  await f.diagnostics.flush();
  for (const name of before) assert.equal((await fs.readdir(root)).includes(name), false);
  assert.equal(
    await fs.readFile(path.join(root, 'audit.json'), 'utf8'),
    'preserve unrelated history',
  );
});

test('a slow persistence write is shared; operation observations perform no filesystem writes', async (t) => {
  const entered = deferred(),
    release = deferred();
  t.after(() => release.resolve());
  let writes = 0;
  const io = {
    ...fs,
    writeFile: async (...args) => {
      writes++;
      entered.resolve();
      await release.promise;
      return fs.writeFile(...args);
    },
  };
  const f = await fixture(t, { io });
  for (let i = 0; i < 1000; i++)
    f.diagnostics.observe({ operation: 'render', executionMs: 4, queueMs: 1 });
  assert.equal(writes, 0);
  await f.diagnostics.sample();
  const writing = f.diagnostics.flush();
  await entered.promise;
  f.diagnostics.observe({ operation: 'lexicon_search', executionMs: 10, queueMs: 2 });
  assert.equal(f.diagnostics.flush(), writing);
  assert.equal(writes, 1);
  release.resolve();
  await writing;
  await f.diagnostics.flush();
  const report = await f.diagnostics.report();
  assert.equal(report.recent[0].count, 1000);
  assert.equal(report.latestWindow.totals.count, 1);
});

test('filesystem failure leaves application observations and in-memory report available', async (t) => {
  const f = await fixture(t, {
    io: {
      ...fs,
      mkdir: async () => {
        throw new Error('private filesystem path');
      },
    },
  });
  await f.diagnostics.sample();
  f.diagnostics.observe({ operation: 'render', executionMs: 8 });
  await assert.doesNotReject(f.diagnostics.flush());
  const report = await f.diagnostics.report();
  assert.equal(report.available, true);
  assert.equal(report.storageStatus, 'unavailable');
  assert.equal(report.latestWindow.totals.count, 1);
  assert.equal(JSON.stringify(report).includes('private filesystem path'), false);
});

test('restart skips a crash-truncated diagnostic line and keeps earlier samples', async (t) => {
  const f = await fixture(t);
  await f.diagnostics.sample();
  await f.diagnostics.flush();
  const root = path.join(f.directory, 'diagnostics'),
    name = (await fs.readdir(root))[0];
  await fs.appendFile(path.join(root, name), '{"unfinished":');
  const next = createDiagnostics({
    directory: f.directory,
    automatic: false,
    sample: fixtureSample,
    now: () => 1791000000000,
  });
  await next.ready;
  assert.equal((await next.report()).recent.length, 1);
  await next.sample();
  await next.flush();
  assert.equal((await next.report()).storageStatus, 'ok');
  await next.close();
});

test('the production sampler reports process memory even without runtime counters', async (t) => {
  const f = await fixture(t, {
    sample: undefined,
    runtime: () => {
      throw new Error('not ready');
    },
  });
  await f.diagnostics.sample();
  const report = await f.diagnostics.report();
  assert(report.current.memory.heapUsedBytes > 0);
  assert(report.current.memory.heapLimitBytes > 0);
  assert.equal(report.current.runtime.queueDepth, null);
  assert(report.current.filesystem.totalBytes > 0);
  assert(report.current.filesystem.availableBytes >= 0);
});

test('filesystem sampling reads only state capacity and sanitizes unavailable or invalid values', async (t) => {
  let calls = 0,
    result = { bsize: 4096, blocks: 1000, bavail: 250 };
  const f = await fixture(t, {
    sample: undefined,
    io: {
      ...fs,
      statfs: async (directory) => {
        calls++;
        assert.equal(directory, f.directory);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  });
  await f.diagnostics.sample();
  assert.deepEqual((await f.diagnostics.report()).current.filesystem, {
    totalBytes: 4096000,
    availableBytes: 1024000,
  });
  for (let i = 0; i < 20; i++) f.diagnostics.observe({ operation: 'render', executionMs: 2 });
  assert.equal(calls, 1, 'Operations must not read filesystem capacity');
  result = new Error('private unavailable filesystem');
  await f.diagnostics.sample();
  assert.deepEqual((await f.diagnostics.report()).current.filesystem, {
    totalBytes: null,
    availableBytes: null,
  });
  result = { bsize: 4096, blocks: Infinity, bavail: -1 };
  await f.diagnostics.sample();
  assert.deepEqual((await f.diagnostics.report()).current.filesystem, {
    totalBytes: null,
    availableBytes: null,
  });
});

test('cgroup metrics identify unavailable Linux files and unlimited limits without guessing', async () => {
  const missing = await readCgroup(async () => {
    throw new Error('ENOENT');
  });
  assert.equal(missing.available, false);
  for (const [key, value] of Object.entries(missing))
    if (!['available', 'memoryUnlimited'].includes(key)) assert.equal(value, null, key);
  const files = {
    'memory.current': '12345\n',
    'memory.max': 'max\n',
    'memory.events': 'oom 2\noom_kill 1\n',
    'cpu.stat': 'nr_throttled 3\nthrottled_usec 123\n',
    'cpu.max': '200000 100000\n',
    'memory.pressure': 'some avg10=1.25 avg60=0.50 avg300=0.25 total=123\n',
    'io.pressure': '',
  };
  const available = await readCgroup(async (filename) => files[path.basename(filename)]);
  assert.equal(available.available, true);
  assert.equal(available.memoryCurrentBytes, 12345);
  assert.equal(available.memoryUnlimited, true);
  assert.equal(available.memoryLimitBytes, null);
  assert.equal(available.cpuQuotaCores, 2);
  assert.equal(available.oomKills, 1);
  assert.equal(available.throttledUsec, 123);
  assert.equal(available.memoryPressureSomeAvg10, 1.25);
});

test('queue observation separates wait and execution, preserves errors and releases user counters', async () => {
  const gate = deferred(),
    entered = deferred(),
    observations = [];
  let now = 0;
  const queue = new Queue({ clock: () => now, observe: (entry) => observations.push(entry) });
  const first = queue.run(
    'private-user',
    async () => {
      entered.resolve();
      await gate.promise;
      now = 40;
      return 'ok';
    },
    'render',
  );
  await entered.promise;
  now = 10;
  const second = queue.run(
    'private-user',
    () => {
      now = 50;
      throw Object.assign(new Error('private source'), { code: 'EXPECTED' });
    },
    'lexicon_search',
  );
  const rejected = assert.rejects(second, { code: 'EXPECTED' });
  now = 40;
  gate.resolve();
  assert.equal(await first, 'ok');
  await rejected;
  assert.deepEqual(observations, [
    { operation: 'render', outcome: 'succeeded', queueMs: 0, executionMs: 40 },
    { operation: 'lexicon_search', outcome: 'failed', queueMs: 30, executionMs: 10 },
  ]);
  assert.equal(queue.count, 0);
  assert.equal(queue.users.size, 0);
  assert.equal(JSON.stringify(observations).includes('private'), false);
  assert.equal(
    await new Queue({
      observe: () => {
        throw Error('observer failure');
      },
    }).run('user', () => 7),
    7,
  );
});

test('existing admin report gates metrics and health probes never read diagnostics', async (t) => {
  const { createHttp } = require('../http.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-diagnostics-http-'));
  let reports = 0;
  const store = {
    now: Date.now,
    db: { query: async () => ({ rows: [] }) },
    report: async (days) => ({ days }),
    cleanup: async () => {},
  };
  const auth = {
    secure: false,
    session: async (cookie) =>
      ['admin', 'contributor'].includes(cookie)
        ? { user: { id: cookie, role: cookie }, csrf: 'test' }
        : null,
  };
  const config = {
    origin: 'http://127.0.0.1',
    stateDirectory: directory,
    claudeHomeDirectory: path.join(directory, 'claude'),
  };
  const app = createHttp({
    config,
    store,
    auth,
    runtime: {},
    diagnostics: {
      report: async () => {
        reports++;
        return { available: true };
      },
    },
  });
  t.after(async () => {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  config.origin += ':' + app.server.address().port;
  const get = (route, cookie) =>
    fetch(config.origin + route, { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal((await get('/api/admin/report')).status, 401);
  assert.equal((await get('/api/admin/report', 'contributor')).status, 403);
  assert.equal((await get('/healthz')).status, 200);
  assert.equal(reports, 0);
  const response = await get('/api/admin/report?days=7', 'admin');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).diagnostics, { available: true });
  assert.equal(reports, 1);
});

test(
  'authenticated Chromium admin panel displays diagnostics and hides administration from contributors',
  {
    skip: process.env.COLLAB_BROWSER_TESTS !== '1',
    timeout: 45000,
  },
  async (t) => {
    const { chromium, expect } = require('@playwright/test');
    const { createTestStore } = require('./helpers.cjs');
    const { Auth, hashPassword } = require('../auth.cjs');
    const { createHttp } = require('../http.cjs');
    const f = await fixture(t, {
      sample: () => ({
        ...fixtureSample(),
        memory: {
          rssBytes: 700 * 1048576,
          heapUsedBytes: 512 * 1048576,
          heapLimitBytes: 1024 * 1048576,
        },
        filesystem: { availableBytes: 20 * 1073741824, totalBytes: 80 * 1073741824 },
      }),
    });
    await f.diagnostics.sample();
    f.diagnostics.observe({ operation: 'render', queueMs: 125, executionMs: 50 });
    await f.diagnostics.flush();
    const store = await createTestStore(f.directory),
      password = 'local diagnostic fixture password';
    const encoded = await hashPassword(password);
    for (const role of ['admin', 'contributor'])
      await store.db
        .prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)')
        .run(role, role + '@example.org', role, role, encoded, Date.now());
    const settings = {
      origin: 'http://127.0.0.1',
      secure: false,
      stateDirectory: f.directory,
      distDirectory: path.join(f.directory, 'dist'),
      claudeHomeDirectory: path.join(f.directory, 'claude'),
    };
    await fs.mkdir(settings.distDirectory);
    await fs.writeFile(
      path.join(settings.distDirectory, 'index.html'),
      '<!doctype html><html><head></head><body><h1>Local administration fixture</h1></body></html>',
    );
    const previousBinary = process.env.COLLAB_CLAUDE_BIN;
    process.env.COLLAB_CLAUDE_BIN = require('./claude-stub.cjs').stubClaude(f.directory, {});
    const auth = new Auth(store, settings),
      app = createHttp({
        config: settings,
        store,
        auth,
        runtime: { project: { id: 'project:diagnostics' }, hasWork: () => false },
        diagnostics: f.diagnostics,
      });
    let browser;
    t.after(async () => {
      await browser?.close();
      await app.close();
      await store.close();
      if (previousBinary === undefined) delete process.env.COLLAB_CLAUDE_BIN;
      else process.env.COLLAB_CLAUDE_BIN = previousBinary;
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    settings.origin += ':' + app.server.address().port;
    auth.origin = settings.origin;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.COLLAB_CHROMIUM ? { executablePath: process.env.COLLAB_CHROMIUM } : {}),
    });
    for (const role of ['admin', 'contributor']) {
      const context = await browser.newContext(),
        page = await context.newPage();
      await page.goto(settings.origin);
      await page.locator('#email').fill(role + '@example.org');
      await page.locator('#password').fill(password);
      await page.locator('#submit').click();
      await page.waitForURL(settings.origin + '/');
      await page.getByRole('button', { name: 'Equipe e comentários' }).click();
      if (role === 'admin') {
        await page.getByText('Administração', { exact: true }).click();
        await page.getByRole('button', { name: 'Atividade e desempenho — 7 dias' }).click();
        await expect(page.getByRole('heading', { name: 'Desempenho do servidor' })).toBeVisible();
        await expect(page.getByText('Heap: 512 MiB de 1024 MiB · RSS: 700 MiB.')).toBeVisible();
        await expect(page.getByText('Disco do estado: 20.0 GiB livres de 80.0 GiB.')).toBeVisible();
        await expect(page.getByText(/1 operações · p95 aproximado: 175,?\.?0 ms/)).toBeVisible();
        await expect(page.getByText(/maior espera na fila: 125\.0 ms/)).toBeVisible();
        await page.screenshot({ path: '/tmp/studio-diagnostics-admin.png', fullPage: true });
      } else {
        await expect(page.getByText('Administração', { exact: true })).toHaveCount(0);
        assert.equal(
          (await context.request.get(settings.origin + '/api/admin/report')).status(),
          403,
        );
      }
      await context.close();
    }
  },
);

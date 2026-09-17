const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  createUsageService,
  readUsage,
  summarizeUsage,
  cleanEvent,
  scrub,
} = require('../usage-service.cjs');

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-usage-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-09-17T12:00:00Z');
  const clock = () => now++;
  return {
    directory,
    clock,
    advance: (ms) => {
      now += ms;
    },
    create: (extra = {}) =>
      createUsageService({ directory, appVersion: '0.2.1', clock, ...options, ...extra }),
  };
}

test('durable serialized sessions retain installation identity across app versions', async (t) => {
  const f = await fixture(t);
  const first = f.create({ buildId: 'build:first' });
  await first.configure({ profileLabel: 'contributor-a' });
  await Promise.all(
    Array.from({ length: 20 }, (_, count) =>
      first.recordUi({
        event: 'editor.batch',
        projectId: 'project:a',
        passageId: 'passage:1',
        revisionId: `revision:${count}`,
        durationMs: 500,
        details: { editCount: count + 1 },
      }),
    ),
  );
  const firstStatus = await first.status();
  await first.close();
  const second = f.create({ appVersion: '0.3.0', buildId: 'build:second' });
  const secondStatus = await second.status();
  assert.equal(firstStatus.installationId, secondStatus.installationId);
  assert.notEqual(firstStatus.sessionId, secondStatus.sessionId);
  assert.equal(secondStatus.profileLabel, 'contributor-a');
  const data = await readUsage(f.directory, { now: f.clock() });
  const batches = data.records.filter((record) => record.event === 'editor.batch');
  assert.equal(batches.length, 20);
  assert.deepEqual(
    batches.map((record) => record.details.editCount),
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
  assert.equal(data.records.at(-1).appVersion, '0.3.0');
  assert.equal(data.records.at(-1).buildId, 'build:second');
  assert.deepEqual(summarizeUsage(data).sessions[1].profileLabels, ['contributor-a']);
  assert.deepEqual(
    summarizeUsage(data).sessions.map((session) => session.buildIds),
    [['build:first'], ['build:second']],
  );
  assert.equal(data.unreadableLines, 0);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(path.join(f.directory, 'events.jsonl'))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.join(f.directory, 'settings.json'))).mode & 0o777, 0o600);
  }
  await second.close();
});

test('rotation bounds retained files, preserves recent events, and never deletes unrelated files', async (t) => {
  const f = await fixture(t, { maxBytes: 1024, maxFiles: 3 });
  const service = f.create();
  await fs.writeFile(path.join(f.directory, 'keep-my-notes.jsonl'), 'not a usage log');
  for (let count = 0; count < 40; count++)
    await service.record({
      event: 'worker.request',
      details: { count, method: 'evaluate_expression' },
      outcome: 'succeeded',
    });
  const status = await service.status();
  assert.equal(status.files, 3);
  assert.ok(status.bytes <= 3 * 1024);
  const data = await readUsage(f.directory, { now: f.clock() });
  assert.equal(data.records.at(-1).details.count, 39);
  assert.ok(data.records.length < 40);
  assert.equal(data.unreadableLines, 0);
  assert.equal(
    await fs.readFile(path.join(f.directory, 'keep-my-notes.jsonl'), 'utf8'),
    'not a usage log',
  );
  await service.close();
});

test('interrupted JSONL tail is preserved without hiding later sessions', async (t) => {
  const f = await fixture(t);
  const first = f.create();
  await first.record({ event: 'worker.request', outcome: 'succeeded' });
  await first.close();
  await fs.appendFile(path.join(f.directory, 'events.jsonl'), '{"interrupted":');
  const restarted = f.create();
  await restarted.record({ event: 'draft.save', outcome: 'succeeded' });
  const data = await readUsage(f.directory, { now: f.clock() });
  assert.equal(data.unreadableLines, 1);
  assert.equal(data.records.at(-1).event, 'draft.save');
  assert.match(
    await fs.readFile(path.join(f.directory, 'events.jsonl'), 'utf8'),
    /\{"interrupted":\n\{/,
  );
  assert.equal((await restarted.status()).unreadableLines, 1);
  await restarted.close();
});

test('only categorical detail keys survive and common secrets, URLs, paths and email are scrubbed', () => {
  const message =
    'API_KEY=plain-secret Bearer abcdefghijk sk-ant-supersecretvalue https://host.invalid/?token=hidden /Users/kian/Private/data.txt me@example.org';
  const event = cleanEvent(
    {
      event: 'ui.error',
      raw: 'private analysis',
      text: 'private translation',
      projectId: '/Users/name/corpus',
      details: {
        errorMessage: message,
        raw: 'private analysis',
        translation: 'private translation',
        apiKey: 'privatekey',
        context: { raw: 'context' },
        count: 3,
        success: false,
      },
    },
    true,
  );
  assert.deepEqual(Object.keys(event.details).sort(), ['count', 'errorMessage', 'success']);
  assert.match(event.projectId, /^hash:/);
  const serialized = JSON.stringify(event);
  for (const secret of [
    'plain-secret',
    'abcdefghijk',
    'supersecretvalue',
    'hidden',
    '/Users/kian',
    'me@example.org',
    'private analysis',
    'private translation',
  ])
    assert.ok(!serialized.includes(secret), secret);
  assert.throws(() => cleanEvent({ event: 'arbitrary.renderer.message' }, true), /não permitido/);
  assert.equal(scrub('password="with spaces"'), 'password=[secret]');
  assert.equal(scrub('{"api_key": "hidden-json-secret"}'), '{"api_key": [secret]}');
  assert.equal(scrub('token=hidden --api-key hidden-cli'), 'token=[secret] --api-key [secret]');
});

test('disable preference persists and corrupt settings remain preserved until explicit reactivation', async (t) => {
  const f = await fixture(t);
  const first = f.create();
  await first.configure({ enabled: false });
  assert.deepEqual(await first.record({ event: 'draft.save' }), {
    recorded: false,
    reason: 'disabled',
  });
  await first.close();
  const disabled = f.create();
  assert.equal((await disabled.status()).enabled, false);
  await disabled.close();
  const settings = path.join(f.directory, 'settings.json');
  await fs.writeFile(settings, '{corrupted settings');
  const corrupt = f.create();
  assert.equal((await corrupt.status()).enabled, false);
  assert.match((await corrupt.status()).lastError, /preservado/);
  assert.equal(await fs.readFile(settings, 'utf8'), '{corrupted settings');
  await corrupt.configure({ enabled: true });
  const preserved = (await fs.readdir(f.directory)).find((name) => /^settings-corrupt-/.test(name));
  assert.equal(await fs.readFile(path.join(f.directory, preserved), 'utf8'), '{corrupted settings');
  assert.equal((await corrupt.status()).enabled, true);
  await corrupt.close();
});

test('report correlates errors and latency with actual sequences without inferring wasted intent', async (t) => {
  const f = await fixture(t);
  const service = f.create();
  for (const passageId of ['a', 'b', 'a']) {
    await service.recordUi({ event: 'navigation.passage', passageId, outcome: 'changed' });
    f.advance(5000);
  }
  for (const durationMs of [10, 20, 100])
    await service.record({
      event: 'worker.request',
      passageId: 'a',
      durationMs,
      outcome: 'failed',
      details: {
        errorCode: 'EVALUATION_ERROR',
        phase: 'evaluate',
        errorMessage: 'Invalid expression',
      },
    });
  await service.recordUi({ event: 'draft.save', passageId: 'a' });
  await service.recordUi({ event: 'draft.save', passageId: 'a' });
  const report = await service.report();
  assert.equal(report.errors[0].count, 3);
  assert.deepEqual(report.errors[0].passages, ['a']);
  assert.equal(report.latencies[0].medianMs, 20);
  assert.equal(report.latencies[0].p95Ms, 100);
  assert.equal(report.passageBacktracksWithin2Minutes.length, 1);
  assert.deepEqual(
    report.repeatedActionsWithin30Seconds.find((row) => row.event === 'draft.save'),
    { event: 'draft.save', count: 1 },
  );
  assert.match(report.interpretation, /não demonstram desperdício/);
  const exported = await service.export();
  assert.match(exported.filename, /^studio-usage-.*\.jsonl$/);
  assert.ok(
    exported.content
      .trim()
      .split('\n')
      .every((line) => JSON.parse(line).version === 1),
  );
  await service.close();
});

test('read-only CLI reports existing logs, supports JSON and leaves files unchanged', async (t) => {
  const f = await fixture(t);
  const service = f.create({ clock: () => Date.now() });
  await service.record({ event: 'draft.save', outcome: 'succeeded', durationMs: 31 });
  await service.close();
  const before = await fs.readFile(path.join(f.directory, 'events.jsonl'), 'utf8');
  const processResult = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, '../../scripts/usage-report.cjs'),
      '--directory',
      f.directory,
      '--json',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(processResult.status, 0, processResult.stderr);
  assert.equal(
    JSON.parse(processResult.stdout).actions.find((row) => row.event === 'draft.save').count,
    1,
  );
  assert.equal(await fs.readFile(path.join(f.directory, 'events.jsonl'), 'utf8'), before);
  const empty = summarizeUsage(await readUsage(path.join(f.directory, 'missing')));
  assert.equal(empty.totalEvents, 0);
});

test('request IDs survive read/export and distinguish lifecycle/error groups across sessions', async (t) => {
  const f = await fixture(t);
  const service = f.create();
  const context = { projectId: 'project:a', passageId: 'passage:1', revisionId: 'revision:1' };
  await service.record({
    event: 'ai.phase',
    ...context,
    requestId: 'request:a',
    outcome: 'started',
    details: { phase: 'source-context' },
  });
  await service.record({
    event: 'ai.phase',
    ...context,
    requestId: 'request:b',
    outcome: 'started',
    details: { phase: 'source-context' },
  });
  await service.record({
    event: 'ai.phase',
    ...context,
    requestId: 'request:a',
    outcome: 'failed',
    durationMs: 1000,
    details: { phase: 'failed', errorCode: 'CONTEXT_TIMEOUT' },
  });
  await service.record({
    event: 'ai.phase',
    ...context,
    requestId: 'request:b',
    outcome: 'succeeded',
    durationMs: 1200,
    details: { phase: 'completed' },
  });
  const report = await service.report();
  assert.equal(report.requests.length, 2);
  assert.deepEqual(report.requests[0].phases, ['source-context', 'failed']);
  assert.equal(report.requests[0].outcome, 'failed');
  assert.equal(report.requests[0].lastMeasuredDurationMs, 1000);
  assert.equal(report.requests[0].revisionId, 'revision:1');
  assert.equal(report.requests[1].outcome, 'succeeded');
  assert.deepEqual(report.errors[0].requestIds, ['request:a']);
  const exported = (await service.export()).content
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    exported.filter((record) => record.event === 'ai.phase').map((record) => record.requestId),
    ['request:a', 'request:b', 'request:a', 'request:b'],
  );
  await service.close();
  const reopened = f.create();
  await reopened.record({
    event: 'ai.phase',
    ...context,
    requestId: 'request:a',
    outcome: 'started',
    details: { phase: 'source-context' },
  });
  const repeatedIdentity = (await reopened.report()).requests.filter(
    (request) => request.requestId === 'request:a',
  );
  assert.equal(repeatedIdentity.length, 2);
  assert.notEqual(repeatedIdentity[0].sessionId, repeatedIdentity[1].sessionId);
  assert.match(
    cleanEvent({ event: 'ai.phase', requestId: '/Users/name/private/request' }).requestId,
    /^hash:/,
  );
  assert.equal(
    cleanEvent({ event: 'ai.phase', requestId: { raw: 'private payload' } }).requestId,
    undefined,
  );
  await reopened.close();
});

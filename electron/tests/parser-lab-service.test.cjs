'use strict';
// Laboratory job ownership, cancellation, restart recovery and lazy start.
// Every process here is a fake: no Python, no engine, no provider, no tokens.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createParserLabService } = require('../parser-lab-service.cjs');

const projectId = 'local-parser-lab-fixture';
const project = {
  id: projectId,
  mode: 'local',
  engineFingerprint: 'sha256:engine',
  passages: [{ id: 'passage:one', sourceId: 'araujo_catecismo_1686' }],
  repositories: [{ name: 'oldtupicorpus', path: '/tmp/parent/oldtupicorpus' }],
};

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.write = (_value, callback) => {
    if (callback) callback(null);
    return true;
  };
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    return true;
  };
  return child;
}

async function harness(options = {}) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'parser-lab-'));
  const spawned = [];
  const service = createParserLabService({
    stateDirectory: path.join(directory, 'state'),
    applicationDirectory: path.resolve(__dirname, '..', '..'),
    getProject: () => project,
    getParent: () => '/tmp/parent',
    emit: (event) => events.push(event),
    artifactRoot: path.join(directory, 'artifacts'),
    spawnProcess: (executable, args) => {
      const child = fakeChild();
      spawned.push({ executable, args, child });
      return child;
    },
    ...options,
  });
  const events = [];
  return { directory, service, spawned, events };
}

function writeArtifact(root, id, manifest) {
  fs.mkdirSync(path.join(root, id), { recursive: true });
  fs.writeFileSync(
    path.join(root, id, 'manifest.json'),
    JSON.stringify({ manifestSchema: 1, artifactId: id, ...manifest }),
  );
}

test('reading status starts no process and lists no artifacts before preparation', async (t) => {
  const { directory, service, spawned } = await harness();
  t.after(() => service.close());
  const status = await service.invoke('parser_lab_status', { projectId });
  assert.equal(spawned.length, 0, 'a status read must not spawn Python');
  assert.equal(status.artifacts.length, 0);
  assert.equal(status.workerRunning, false);
  assert.equal(status.busy, false);
  assert.ok(status.profiles.some((item) => item.profile === 'smoke'));
  assert.ok(status.artifactRoot.startsWith(path.join(directory, 'artifacts')));
});

test('status reports committed manifests, activation and interrupted staging', async (t) => {
  const { directory, service } = await harness();
  t.after(() => service.close());
  const root = path.join(directory, 'artifacts', projectId);
  writeArtifact(root, 'index-1', {
    kind: 'index',
    status: 'complete',
    completed: true,
    counts: { fragments: 42 },
    context: { fingerprint: 'sha256:ctx' },
  });
  writeArtifact(root, 'ranker-1', { kind: 'ranker', status: 'failed', completed: false });
  fs.mkdirSync(path.join(root, '.staging', 'index-2.abcd'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.staging', 'index-2.abcd', 'checkpoint.json'),
    JSON.stringify({ stage: 'fragments', counts: { fragments: 7 } }),
  );
  fs.writeFileSync(path.join(root, 'active.json'), JSON.stringify({ index: 'index-1' }));
  const status = await service.invoke('parser_lab_status', { projectId });
  const index = status.artifacts.find((item) => item.artifactId === 'index-1');
  assert.equal(index.completed, true);
  assert.equal(index.counts.fragments, 42);
  assert.equal(index.contextFingerprint, 'sha256:ctx');
  assert.equal(status.artifacts.find((i) => i.artifactId === 'ranker-1').completed, false);
  assert.deepEqual(status.active, { index: 'index-1' });
  assert.deepEqual(status.interrupted, [
    { name: 'index-2.abcd', lastStage: 'fragments', counts: { fragments: 7 } },
  ]);
});

test('a preparation job runs one writer, streams progress and records its artifact', async (t) => {
  const { service, spawned, events } = await harness();
  t.after(() => service.close());
  const job = await service.invoke('parser_lab_job_start', {
    projectId,
    stage: 'prepare',
    profile: 'smoke',
  });
  assert.equal(job.status, 'running');
  assert.equal(spawned.length, 1);
  assert.ok(spawned[0].args.includes('prepare'));
  assert.ok(spawned[0].args.includes('--activate'));
  await assert.rejects(
    () => service.invoke('parser_lab_job_start', { projectId, stage: 'train' }),
    /em andamento/,
  );
  const child = spawned[0].child;
  child.stderr.emit('data', Buffer.from('{"stage":"fragments","status":"running"}\nnoise\n'));
  child.stdout.emit('data', Buffer.from('{"artifactId":"index-9","counts":{"fragments":3}}'));
  child.emit('close', 0, null);
  await new Promise((resolve) => setImmediate(resolve));
  const { jobs } = await service.invoke('parser_lab_jobs', { projectId });
  const finished = jobs.find((item) => item.id === job.id);
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.artifactId, 'index-9');
  assert.equal(finished.result.counts.fragments, 3);
  assert.ok(finished.progress.some((row) => row.stage === 'fragments'));
  assert.ok(events.some((event) => event.type === 'parser-lab' && event.jobId === job.id));
});

test('cancelling reaches the batch process and never reports success', async (t) => {
  const { service, spawned } = await harness();
  t.after(() => service.close());
  const job = await service.invoke('parser_lab_job_start', {
    projectId,
    stage: 'prepare',
    profile: 'smoke',
  });
  const cancelling = await service.invoke('parser_lab_job_cancel', { projectId, jobId: job.id });
  assert.equal(cancelling.status, 'cancelling');
  assert.deepEqual(spawned[0].child.signals, ['SIGTERM']);
  spawned[0].child.emit('close', null, 'SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));
  const { jobs } = await service.invoke('parser_lab_jobs', { projectId });
  const finished = jobs.find((item) => item.id === job.id);
  assert.equal(finished.status, 'cancelled');
  assert.equal(finished.artifactId, null);
});

test('a failed job keeps its diagnostic instead of claiming an artifact', async (t) => {
  const { service, spawned } = await harness();
  t.after(() => service.close());
  const job = await service.invoke('parser_lab_job_start', { projectId, stage: 'evaluate' });
  // Progress also arrives on stderr; the reported reason must not be a progress dump.
  spawned[0].child.stderr.emit('data', Buffer.from('{"stage":"examples","status":"running"}\n'));
  spawned[0].child.stderr.emit('data', Buffer.from('ValueError: perfil ausente\n'));
  spawned[0].child.stderr.emit('data', Buffer.from('{"stage":"examples","status":"done"}\n'));
  spawned[0].child.emit('close', 2, null);
  await new Promise((resolve) => setImmediate(resolve));
  const { jobs } = await service.invoke('parser_lab_jobs', { projectId });
  const finished = jobs.find((item) => item.id === job.id);
  assert.equal(finished.status, 'failed');
  assert.equal(finished.error, 'ValueError: perfil ausente');
  assert.equal(finished.artifactId, null);
});

test('a job interrupted by a restart is recovered as interrupted and never replayed', async (t) => {
  const { directory, service, spawned } = await harness();
  const job = await service.invoke('parser_lab_job_start', {
    projectId,
    stage: 'prepare',
    profile: 'smoke',
  });
  await service.close();
  const restarted = createParserLabService({
    stateDirectory: path.join(directory, 'state'),
    applicationDirectory: path.resolve(__dirname, '..', '..'),
    getProject: () => project,
    getParent: () => '/tmp/parent',
    emit: () => {},
    artifactRoot: path.join(directory, 'artifacts'),
    spawnProcess: () => {
      throw new Error('a restart must not replay work');
    },
  });
  t.after(() => restarted.close());
  const { jobs } = await restarted.invoke('parser_lab_jobs', { projectId });
  const recovered = jobs.find((item) => item.id === job.id);
  assert.equal(recovered.status, 'interrupted');
  assert.match(recovered.error, /encerrado antes do fim/);
  assert.equal(spawned.length, 1);
});

test('the lab worker starts on the first engine request and carries the lab arguments', async (t) => {
  const { directory, service, spawned } = await harness();
  t.after(() => service.close());
  const reply = service.invoke('parser_lab_analyze', { projectId, text: 'Asó xe rokype' });
  assert.equal(spawned.length, 1);
  assert.ok(spawned[0].args.some((value) => value.endsWith(path.join('parser_lab', 'worker.py'))));
  assert.ok(spawned[0].args.includes('--parent'));
  assert.ok(spawned[0].args.includes(path.join(directory, 'artifacts', projectId)));
  spawned[0].child.stdout.emit(
    'data',
    Buffer.from(JSON.stringify({ id: 1, result: { status: 'complete' } }) + '\n'),
  );
  assert.deepEqual(await reply, { status: 'complete' });
  // The same worker is reused: laboratory work does not respawn per request.
  const second = service.invoke('parser_lab_parse', { projectId, raw: '(+ixé * só)' });
  assert.equal(spawned.length, 1);
  spawned[0].child.stdout.emit('data', Buffer.from(JSON.stringify({ id: 2, result: {} }) + '\n'));
  await second;
});

test('a worker error keeps its service code and does not leave a dead worker behind', async (t) => {
  const { service, spawned } = await harness();
  t.after(() => service.close());
  const reply = service.invoke('parser_lab_analyze', { projectId, text: '   ' });
  spawned[0].child.stdout.emit(
    'data',
    Buffer.from(
      JSON.stringify({ id: 1, error: { code: 'LAB_INPUT', message: 'Escreva uma frase.' } }) + '\n',
    ),
  );
  await assert.rejects(
    () => reply,
    (error) => error.code === 'LAB_INPUT',
  );
  spawned[0].child.emit('close', 1, null);
  const retry = service.invoke('parser_lab_analyze', { projectId, text: 'asó' });
  assert.equal(spawned.length, 2, 'a dead worker is replaced on the next request');
  spawned[1].child.stdout.emit('data', Buffer.from(JSON.stringify({ id: 1, result: {} }) + '\n'));
  await retry;
});

test('another project and unknown operations are refused', async (t) => {
  const { service } = await harness();
  t.after(() => service.close());
  await assert.rejects(
    () => service.invoke('parser_lab_status', { projectId: 'other' }),
    (error) => error.code === 'STALE_PROJECT',
  );
  await assert.rejects(
    () => service.invoke('parser_lab_publish', { projectId }),
    (error) => error.code === 'LAB_UNKNOWN_METHOD',
  );
  await assert.rejects(
    () => service.invoke('parser_lab_job_start', { projectId, stage: 'publish' }),
    (error) => error.code === 'LAB_INPUT',
  );
});

test('the example project cannot reach the laboratory', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'parser-lab-'));
  const service = createParserLabService({
    stateDirectory: path.join(directory, 'state'),
    applicationDirectory: path.resolve(__dirname, '..', '..'),
    getProject: () => ({ id: 'example:araujo-0067', mode: 'example', passages: [] }),
    emit: () => {},
    artifactRoot: path.join(directory, 'artifacts'),
    spawnProcess: () => {
      throw new Error('the example project must not spawn a laboratory process');
    },
  });
  t.after(() => service.close());
  await assert.rejects(
    () => service.invoke('parser_lab_status', {}),
    (error) => error.code === 'LAB_NO_PROJECT',
  );
});

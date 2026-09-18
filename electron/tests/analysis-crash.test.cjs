'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createAnalysisService } = require('../analysis-service.cjs');
const { DraftStore } = require('../draft-store.cjs');

// Independent persistence critic: kill only our disposable child after its real
// scratch/checkpoint writes. No provider, source, reference or sibling writes.
const projectId = 'project:critic-crash';
const passageId = 'passage:critic-crash';
const sourceId = 'araujo_catecismo_1686';
const project = {
  id: projectId,
  mode: 'local',
  engineFingerprint: 'engine:critic-fixture',
  repositories: [],
  passages: [
    {
      id: passageId,
      sourceId,
      sourceFingerprint: 'source:one',
      ordinal: 1,
      sourceExpression: 'a',
      acceptedReference: null,
      diplomatic: 'Abá',
      witness: {},
    },
  ],
};
const serviceOptions = (directory, draftStore) => ({
  stateDirectory: path.join(directory, 'analysis'),
  draftStore,
  evidence: { invoke: async () => ({ revision: 0, asset: null, passage: null }) },
  getConfig: async () => ({
    provider: 'codex',
    models: { codex: 'fixture' },
    reasoningEffort: 'low',
  }),
  getProject: () => project,
  request: async (method, params) =>
    method === 'dictionary_lookup'
      ? { datasetFingerprint: 'dictionary:fixture', entries: [] }
      : { raw: params.raw, revisionId: params.revisionId, root: null, diagnostics: [] },
});

test(
  'a killed owner restores its committed scratch and checkpoint, resumes only queued work, and requires explicit retry',
  { timeout: 30000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-critic3-crash-'));
    const draftStore = new DraftStore(path.join(directory, 'drafts'));
    // Original version-1 profiles have no storageRevision or aiInput fields.
    const originalDraft = {
      passageId,
      revisionId: 'revision:original',
      sourceFingerprint: 'source:one',
      diplomatic: 'Abá',
      normalized: 'abá',
      translation: 'Preserved human translation',
      notes: 'Preserved original notes',
      raw: 'a',
      analysis: null,
      canvas: { fragments: [], positions: {}, layout: 'bottom-up' },
      updatedAt: '2026-09-17T00:00:00.000Z',
    };
    await draftStore.save({ version: 1, projectId, drafts: { [passageId]: originalDraft } });
    const originalBytes = await fs.readFile(draftStore.filename(projectId));
    const childSource = `
    const path = require('node:path');
    const { createAnalysisService } = require(process.argv[1] + '/analysis-service.cjs');
    const { DraftStore } = require(process.argv[1] + '/draft-store.cjs');
    const directory = process.argv[2];
    const project = JSON.parse(process.argv[3]);
    const draftStore = new DraftStore(path.join(directory, 'drafts'));
    const options = (${serviceOptions.toString()})(directory, draftStore);
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const service = createAnalysisService({ ...options, runner: async ({ callTool, onCheckpoint, signal }) => {
      const candidate = await callTool('studio_candidate_create', { raw: '' }, { operationId: 'create-before-kill' });
      await onCheckpoint({ version: 1, phase: 'fixture-provider-inflight', candidateId: candidate.id });
      started(candidate);
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }});
    (async () => {
      const params = { projectId: project.id, passageId: project.passages[0].id, revisionId: 'revision:original', task: 'translate-source', scope: 'passage' };
      const first = await service.invoke('analysis_submit', { ...params, operationId: 'first' });
      const second = await service.invoke('analysis_submit', { ...params, operationId: 'second' });
      const candidate = await ready;
      const saved = await service.invoke('analysis_get', { projectId: project.id, jobId: first.id });
      process.stdout.write(JSON.stringify({ first, second, candidate, attempt: saved.job.attempts.at(-1) }) + '\\n');
    })().catch(error => { process.stderr.write(error.stack); process.exit(1); });
  `;
    const child = spawn(
      process.execPath,
      ['-e', childSource, path.resolve(__dirname, '..'), directory, JSON.stringify(project)],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = once(child, 'exit');
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    let service;
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
      await service?.close();
      await fs.rm(directory, { recursive: true, force: true });
    });
    const saved = await new Promise((resolve, reject) => {
      let buffer = '';
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        if (buffer.includes('\n')) resolve(JSON.parse(buffer.slice(0, buffer.indexOf('\n'))));
      });
      child.once('exit', () => reject(new Error('Child exited before checkpoint: ' + stderr)));
    });
    assert.equal(saved.attempt.checkpoint.phase, 'fixture-provider-inflight');
    child.kill('SIGKILL');
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    assert.equal(stderr, '');
    let providerCalls = 0;
    service = createAnalysisService({
      ...serviceOptions(directory, draftStore),
      runner: async () => {
        providerCalls++;
        return { text: 'Fixture source interpretation' };
      },
    });
    await service.start();
    const get = (id) => service.invoke('analysis_get', { projectId, jobId: id });
    const interrupted = await get(saved.first.id);
    assert.equal(interrupted.job.status, 'blocked');
    assert.equal(interrupted.job.error.code, 'INTERRUPTED');
    assert.deepEqual(interrupted.job.input, saved.first.input);
    assert.deepEqual(interrupted.candidates[0], saved.candidate);
    assert.equal(interrupted.job.attempts[0].checkpoint.phase, 'fixture-provider-inflight');
    assert.equal(interrupted.job.lease, undefined);
    async function completed(id) {
      for (let i = 0; i < 200; i++) {
        const detail = await get(id);
        if (detail.job.status === 'ready-for-review') return detail;
        if (['blocked', 'failed'].includes(detail.job.status))
          throw new Error(detail.job.error?.message ?? detail.job.status);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('Queued fixture did not complete');
    }
    await completed(saved.second.id);
    assert.equal(providerCalls, 1, 'Only never-dispatched queued work resumes automatically');
    await assert.rejects(
      service.callTool(
        saved.first.id,
        'studio_context',
        {},
        { attemptId: saved.attempt.id, operationId: 'old-owner' },
      ),
      { code: 'STALE_ATTEMPT' },
    );
    await service.invoke('analysis_retry', {
      projectId,
      jobId: saved.first.id,
      operationId: 'explicit-retry',
    });
    const retried = await completed(saved.first.id);
    assert.equal(retried.job.attempts.length, 2);
    assert.equal(providerCalls, 2);
    assert.deepEqual(retried.job.input, saved.first.input);
    assert.equal(retried.candidates[0].id, saved.candidate.id);
    assert.deepEqual(await fs.readFile(draftStore.filename(projectId)), originalBytes);
    const legacy = await draftStore.load(projectId);
    const acknowledgement = await draftStore.saveChecked(legacy);
    assert.equal(acknowledgement.storageRevision, 1);
    assert.deepEqual((await draftStore.load(projectId)).drafts[passageId], originalDraft);
  },
);

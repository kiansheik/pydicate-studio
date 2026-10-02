'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createExternalAnalysisRunner } = require('../analysis-external.cjs');
test('external runner awaits committed proposal and final MCP response without inference', async () => {
  const candidates = [],
    events = [],
    checkpoints = [];
  let idleWaited = false;
  const runner = createExternalAnalysisRunner({
    getJob: async () => ({ questions: [] }),
    getCandidates: async () => candidates,
    pollMs: 2,
  });
  const pending = runner({
    mcp: {
      jobId: 'job',
      attemptId: 'attempt',
      configPath: '/private/scoped.json',
      waitForIdle: async () => {
        idleWaited = true;
      },
    },
    signal: new AbortController().signal,
    budgets: { timeoutMs: 1000 },
    onEvent: async (event) => events.push(event),
    onCheckpoint: async (checkpoint) => checkpoints.push(checkpoint),
  });
  candidates.push({
    id: 'candidate',
    status: 'proposed',
    rationale: 'Attested dictionary sense; role remains tentative.',
  });
  const result = await pending;
  assert.equal(idleWaited, true);
  assert.equal(result.usage.providerRequests, 0);
  assert.match(result.text, /role remains tentative/);
  assert.equal(events[0].phase, 'external-client');
  assert.equal(checkpoints[0].status, 'waiting-for-client');
});
test('external question, timeout and cancellation preserve distinct outcomes', async () => {
  const runner = createExternalAnalysisRunner({
    getJob: async () => ({ questions: [{ question: 'Which sense?' }] }),
    getCandidates: async () => [],
    pollMs: 1,
  });
  const options = {
    mcp: { jobId: 'job', configPath: '/private/scoped.json' },
    budgets: { timeoutMs: 20 },
    signal: new AbortController().signal,
  };
  assert.equal((await runner(options)).text, 'Which sense?');
  const waiting = createExternalAnalysisRunner({
    getJob: async () => ({ questions: [] }),
    getCandidates: async () => [],
    pollMs: 1,
  });
  await assert.rejects(waiting(options), { code: 'EXTERNAL_TIMEOUT' });
  const controller = new AbortController();
  const pending = waiting({ ...options, signal: controller.signal, budgets: { timeoutMs: 1000 } });
  controller.abort(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }));
  await assert.rejects(pending, { code: 'CANCELLED' });
});
test('external retry preserves prior results and waits for an action from the new attempt', async () => {
  const old = {
    id: 'candidate:old',
    revisionId: 'revision:old',
    status: 'proposed',
    updatedAt: 'old',
    rationale: 'Prior proposal',
  };
  const candidates = [old];
  const questions = [{ id: 'question:old', question: 'Prior question' }];
  const runner = createExternalAnalysisRunner({
    getJob: async () => ({ questions }),
    getCandidates: async () => candidates,
    pollMs: 1,
  });
  const options = {
    mcp: { jobId: 'job', attemptId: 'attempt:retry', configPath: '/private/scoped.json' },
    signal: new AbortController().signal,
    budgets: { timeoutMs: 25 },
    externalBaseline: { questionIds: ['question:old'], candidates: [structuredClone(old)] },
  };
  await assert.rejects(runner(options), { code: 'EXTERNAL_TIMEOUT' });
  const pending = runner({ ...options, budgets: { timeoutMs: 1000 } });
  candidates[0] = { ...old, updatedAt: 'new', rationale: 'Newly checked proposal' };
  const result = await pending;
  assert.equal(result.text, 'Newly checked proposal');
  assert.deepEqual(questions, [{ id: 'question:old', question: 'Prior question' }]);
  const questionOnly = runner({
    ...options,
    externalBaseline: { ...options.externalBaseline, candidates: [structuredClone(candidates[0])] },
    budgets: { timeoutMs: 1000 },
  });
  questions.push({ id: 'question:new', question: 'New focused question' });
  assert.equal((await questionOnly).text, 'New focused question');
});

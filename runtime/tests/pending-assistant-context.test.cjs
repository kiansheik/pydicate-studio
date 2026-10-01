'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire, wrap } = require('node:module');

// Load the real routing code with service/process boundaries replaced. These
// checks never instantiate a provider, contact a server, or write a profile.
function loadWithMocks(filename, mocks) {
  const module = { exports: {} };
  const requireOriginal = createRequire(filename);
  const run = vm.runInThisContext(wrap(fs.readFileSync(filename, 'utf8')), { filename });
  run(
    module.exports,
    (specifier) => mocks[specifier] ?? requireOriginal(specifier),
    module,
    filename,
    path.dirname(filename),
  );
  return module.exports;
}

const sourceId = 'araujo_catecismo_1686';
const pendingId = 'pending:4edba8f4-e6aa-4fce-abfc-31cc2edaf0ea';
function setup() {
  const calls = [],
    evidenceCalls = [];
  const passage = {
    id: 'passage:saved',
    sourceId,
    ordinal: 82,
    sourceExpression: 'amen',
    acceptedReference: 'amém',
  };
  let project = {
    id: 'project',
    engineFingerprint: 'engine-v1',
    passages: [passage],
    repositories: [
      { name: 'oldtupicorpus', path: '/fixture/oldtupicorpus' },
      { name: 'nhe-enga', path: '/fixture/nhe-enga' },
    ],
  };
  const { createNextService } = loadWithMocks(path.join(__dirname, '../next-service.cjs'), {
    './provider-service.cjs': {
      createProviderService: ({ getContext }) => ({
        handle: (_, params) => getContext(params),
        close() {},
      }),
    },
    './evidence-service.cjs': {
      createEvidenceService: () => ({
        invoke: async (method, params) => {
          evidenceCalls.push({ method, params });
          return { state: 'missing' };
        },
      }),
    },
    './lexical-notes-service.cjs': {
      createLexicalNotesService: () => ({
        invoke: async (method, params) => {
          assert.equal(method, 'lexical_notes_list');
          assert.equal(params.projectId, project.id);
          return { records: [] };
        },
      }),
    },
  });
  let duringWorker = () => {};
  const service = createNextService({
    stateDirectory: '/unused-mocked-state',
    getProject: () => project,
    getWorker: () => ({
      request: async (method, params) => {
        calls.push({ method, params });
        duringWorker();
        const pending = params.passageId.startsWith('pending:');
        return {
          sourceId,
          ordinal: pending ? 83 : passage.ordinal,
          pending,
          passage: pending
            ? { id: params.passageId, pending: true, acceptedReference: null }
            : passage,
          raw: params.raw,
          evaluation: { expression: params.raw, revisionId: params.revisionId },
        };
      },
    }),
  });
  const request = {
    projectId: project.id,
    passageId: pendingId,
    revisionId: 'current-draft',
    action: 'translate',
    context: { sourceId, ordinal: 999, raw: 'og * (emi * tym)', scope: 'passage' },
  };
  return {
    service,
    calls,
    evidenceCalls,
    passage,
    request,
    duringWorker: (callback) => (duringWorker = callback),
    replaceProject: (patch) => (project = { ...project, ...patch }),
  };
}

test('pending assistant route evaluates exact draft and uses reserved evidence identity without claiming saved reference', async () => {
  const fixture = setup();
  const result = await fixture.service.invoke('ai_start', fixture.request);
  assert.equal(result.pending, true);
  assert.equal(result.ordinal, 83);
  assert.equal(result.passage.acceptedReference, null);
  assert.equal(result.evaluation.expression, fixture.request.context.raw);
  assert.deepEqual(fixture.calls, [
    {
      method: 'assistant_context',
      params: {
        projectId: 'project',
        passageId: pendingId,
        sourceId,
        raw: fixture.request.context.raw,
        revisionId: 'current-draft',
        engineFingerprint: 'engine-v1',
        action: 'translate',
      },
    },
  ]);
  assert.equal(
    fixture.evidenceCalls[0].params.passageId,
    pendingId.replace('pending:', 'passage:'),
  );
});

test('saved assistant route retains published expression, ordinal and reference', async () => {
  const fixture = setup();
  const result = await fixture.service.invoke('ai_start', {
    ...fixture.request,
    passageId: fixture.passage.id,
    context: { sourceId, ordinal: 999 },
  });
  assert.equal(result.pending, false);
  assert.equal(result.ordinal, 82);
  assert.equal(result.raw, 'amen');
  assert.equal(result.passage.acceptedReference, 'amém');
  assert.equal(fixture.evidenceCalls[0].params.passageId, fixture.passage.id);
});

test('pending assistant rejects invalid source, identity, project and context changed during lookup', async () => {
  const fixture = setup();
  for (const patch of [
    { projectId: 'wrong-project' },
    { passageId: 'pending:invalid' },
    { passageId: 'passage:unknown' },
    { context: { ...fixture.request.context, sourceId: '../escape' } },
    { passageId: fixture.passage.id, context: { sourceId: 'wrong-source' } },
  ]) {
    await assert.rejects(
      fixture.service.invoke('ai_start', { ...fixture.request, ...patch }),
      /projeto/,
    );
  }
  assert.equal(fixture.calls.length, 0);
  fixture.duringWorker(() => fixture.replaceProject({ engineFingerprint: 'engine-v2' }));
  await assert.rejects(fixture.service.invoke('ai_start', fixture.request), /mudou durante/);
  assert.equal(fixture.evidenceCalls.length, 0);
});

test('upstream MCP never treats a pending ordinal as a saved row but preserves saved lookup', async () => {
  const calls = [];
  class FakeRpc {
    async request(method, params) {
      calls.push({ method, params });
      return { structuredContent: {} };
    }
    send() {}
    close() {}
  }
  const { authoringContext } = loadWithMocks(path.join(__dirname, '../provider-context.cjs'), {
    './provider-rpc.cjs': { JsonLineRpc: FakeRpc },
  });
  const context = {
    corpusPath: '/fixture/corpus',
    enginePath: '/fixture/engine',
    sourceId,
    ordinal: 83,
    pending: true,
  };
  await authoringContext(context, { context: { ordinal: 999, selectedLexicalReference: 'tym' } });
  assert.equal(
    calls.some((call) => call.params?.name === 'get_source_context'),
    false,
  );
  assert.equal(
    calls.some((call) => call.params?.name === 'search_lexicon'),
    true,
  );
  calls.length = 0;
  await authoringContext({ ...context, pending: false, ordinal: 82 }, { context: {} });
  assert.deepEqual(
    calls.find((call) => call.params?.name === 'get_source_context').params.arguments,
    { source: sourceId, record_id: 82, radius: 2 },
  );
});

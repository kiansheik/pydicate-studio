'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createGrammarRepair, REPAIR_STRATEGY } = require('../grammar-repair.cjs');
const { createAnalysisService } = require('../analysis-service.cjs');
const { DraftStore } = require('../draft-store.cjs');

async function fixture(t, extraOptions = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'grammar-repair-test-'));
  const engine = await fs.realpath(directory);
  await fs.mkdir(path.join(engine, 'tupi/tupi'), { recursive: true });
  await fs.writeFile(path.join(engine, 'tupi/tupi/verb.py'), 'FORM = "mororerobiare"\n');
  await fs.writeFile(path.join(engine, 'historical.txt'), 'protected corpus');
  const project = {
    id: 'project:repair',
    mode: 'local',
    engineFingerprint: 'engine:old',
    repositories: [
      { name: 'nhe-enga', path: engine },
      { name: 'oldtupicorpus', path: '/readonly/corpus' },
    ],
    passages: [
      {
        id: 'passage:repair',
        ordinal: 90,
        sourceId: 'araujo_catecismo_1686',
        sourceFingerprint: 'source:one',
        acceptedReference: null,
      },
    ],
  };
  const draftStore = new DraftStore(path.join(engine, 'state/drafts'));
  const draft = {
    passageId: 'passage:repair',
    revisionId: 'revision:one',
    sourceFingerprint: 'source:one',
    raw: 'moro.var(1) * erobiar',
    diplomatic: '',
    normalized: '',
    translation: '',
    notes: 'minhas notas',
    analysis: null,
    updatedAt: '2026-09-18T00:00:00.000Z',
  };
  await draftStore.saveChecked({
    version: 1,
    projectId: project.id,
    drafts: { [draft.passageId]: draft },
  });
  let reloads = 0;
  const surface = () =>
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        'import runpy,sys; print(runpy.run_path(sys.argv[1])["FORM"])',
        path.join(engine, 'tupi/tupi/verb.py'),
      ],
      { encoding: 'utf8' },
    ).trim();
  const requests = [];
  const request = async (method, params) => {
    requests.push({ method, params });
    if (extraOptions.interceptRequest) {
      const result = await extraOptions.interceptRequest(method, params, surface());
      if (result !== undefined) return result;
    }
    if (method === 'grammar_regression')
      return {
        engineFingerprint: project.engineFingerprint,
        sources: {
          source: {
            rows: [
              {
                ordinal: 1,
                codeFingerprint: 'same-expression',
                surface: surface(),
                annotated: surface(),
                reference: 'mororerobiare',
              },
            ],
          },
        },
      };
    if (method === 'parse_expression')
      return {
        root: {
          id: 'root',
          kind: 'operator',
          code: params.raw,
          start: 0,
          end: params.raw.length,
          children: [
            {
              slot: 'left',
              node: {
                id: 'left',
                kind: 'reference',
                code: params.raw.split(' * ')[0],
                start: 0,
                end: params.raw.indexOf(' * '),
                children: [],
              },
            },
          ],
        },
      };
    if (method === 'evaluate_expression' || method === 'lexicon_tree_evaluate')
      return {
        expression: params.raw,
        revisionId: params.revisionId,
        engineFingerprint: project.engineFingerprint,
        surface: surface(),
        evaluationStatus: 'complete',
        ...(method === 'lexicon_tree_evaluate'
          ? { definitionContext: { namespace: 'declaration' } }
          : {}),
        tree: {
          id: 'root',
          kind: 'reference',
          code: params.raw,
          label: params.raw,
          start: 0,
          end: params.raw.length,
          children: [],
          evaluation: { status: 'ok', surface: surface() },
        },
      };
    if (method === 'assistant_context') return { raw: params.raw, pending: false };
    if (method === 'dictionary_lookup') return { datasetFingerprint: 'dictionary:one' };
    throw new Error('Unexpected request ' + method);
  };
  const options = {
    stateDirectory: path.join(engine, 'state/edits'),
    draftStore,
    request,
    getProject: () => project,
    reloadProject: async () => {
      reloads++;
      project.engineFingerprint = 'engine:' + surface();
      return project;
    },
    getConfig: async () => ({
      provider: 'claude',
      models: { codex: 'fixture-codex', claude: 'fixture-claude' },
      reasoningEffort: 'medium',
    }),
    ...extraOptions,
  };
  const repair = createGrammarRepair(options);
  const params = {
    projectId: project.id,
    passageId: draft.passageId,
    revisionId: draft.revisionId,
    operationId: 'operation:repair',
    task: 'grammar-repair',
    scope: 'passage',
    grammarRepair: {
      mode: 'engine',
      raw: draft.raw,
      revisionId: draft.revisionId,
      intendedSurface: 'morerobiare',
      explanation: 'moro deve ter a variante mor',
      enginePath: '/ignore-client-path',
    },
  };
  const services = [];
  t.after(async () => {
    for (const service of services) await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    engine,
    repair,
    params,
    draftStore,
    project,
    requests,
    reloads: () => reloads,
    async job() {
      return {
        id: 'job:repair',
        projectId: project.id,
        passageId: draft.passageId,
        input: await repair.capture(params),
      };
    },
    service(runner) {
      const service = createAnalysisService({
        ...options,
        stateDirectory: path.join(engine, 'state/analysis'),
        evidence: { invoke: async () => ({ revision: 0 }) },
        runner,
      });
      services.push(service);
      return service;
    },
  };
}
async function waitFor(fn) {
  for (let i = 0; i < 500; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Fixture did not finish');
}

test('capture uses the selected grammar and saved expression, preserves the intended form and rejects a stale dialog', async (t) => {
  const f = await fixture(t),
    job = await f.job();
  assert.equal(job.input.grammarRepair.enginePath, f.engine);
  // Grammar repair follows the configured provider. It used to be pinned to
  // Codex, which silently ignored the person's choice in the assistant panel.
  assert.equal(job.input.provider, 'claude');
  assert.equal(job.input.model, 'fixture-claude');
  assert.equal(job.input.reasoningEffort, null);
  assert.equal(job.input.diagnostic.evidence.currentSurface, 'mororerobiare');
  assert.equal(job.input.diagnostic.evidence.intendedSurface, 'morerobiare');
  assert.equal(job.input.raw, 'moro.var(1) * erobiar');
  assert.match(job.input.diagnostic.prompt, /O envio autoriza/);
  assert.doesNotMatch(job.input.diagnostic.prompt, /aguarde a aprovação/);
  await assert.rejects(
    f.repair.capture({
      ...f.params,
      grammarRepair: { ...f.params.grammarRepair, raw: 'different' },
    }),
    { code: 'DRAFT_CONFLICT' },
  );
  const follow = await f.repair.capture(
    { ...f.params, description: 'Confira também o contraste.' },
    job,
  );
  assert.equal(follow.grammarRepair.intendedSurface, 'morerobiare');
  assert.deepEqual(follow.grammarRepair.baseline, job.input.grammarRepair.baseline);
});

test('selected subtree repair validates saved spans, retains its parent and checks both after every edit', async (t) => {
  const f = await fixture(t);
  const selectedNode = { id: 'left', start: 0, end: 11, code: 'moro.var(1)' };
  selectedNode.end = selectedNode.code.length;
  const params = { ...f.params, grammarRepair: { ...f.params.grammarRepair, selectedNode } };
  const input = await f.repair.capture(params);
  assert.equal(input.scope, 'constituent');
  assert.equal(input.raw, selectedNode.code);
  assert.equal(input.grammarRepair.contextRaw, f.params.grammarRepair.raw);
  assert.deepEqual(input.grammarRepair.selectedNode, selectedNode);
  assert.equal(input.diagnostic.evidence.expression, selectedNode.code);
  assert.equal(input.diagnostic.evidence.contextExpression, f.params.grammarRepair.raw);
  for (const changed of [{ code: 'another' }, { end: 99 }, { start: 1 }, { id: 'missing' }])
    await assert.rejects(
      f.repair.capture({
        ...params,
        grammarRepair: {
          ...params.grammarRepair,
          selectedNode: { ...selectedNode, ...changed },
        },
      }),
      { code: 'STALE_NODE' },
    );
  const job = { id: 'job:selected', projectId: f.project.id, passageId: f.params.passageId, input };
  const file = await f.repair.call(job, 'grammar_read', { path: 'tupi/tupi/verb.py' });
  const first = f.requests.length;
  const result = await f.repair.call(job, 'grammar_edit', {
    path: file.path,
    expectedHash: file.hash,
    oldText: 'mororerobiare',
    newText: 'morerobiare',
  });
  assert.equal(result.verification.expression, selectedNode.code);
  assert.equal(result.verification.parent.expression, f.params.grammarRepair.raw);
  assert.deepEqual(
    f.requests
      .slice(first)
      .filter((r) => r.method === 'evaluate_expression')
      .map((r) => r.params.raw),
    [selectedNode.code, f.params.grammarRepair.raw],
  );
  assert.equal(f.requests.at(-1).method, 'grammar_regression');
  const follow = await f.repair.capture({ ...params, description: 'Continue esta parte.' }, job);
  assert.equal(follow.raw, selectedNode.code);
  assert.deepEqual(follow.grammarRepair.selectedNode, selectedNode);
  assert.equal(
    (await f.draftStore.load(f.project.id)).drafts[f.params.passageId].raw,
    f.params.grammarRepair.raw,
  );
});

test('a selected subtree cannot leave its containing tree with a new execution failure', async (t) => {
  const f = await fixture(t, {
    interceptRequest(method, params, surface) {
      if (
        method === 'evaluate_expression' &&
        params.raw.includes(' * ') &&
        surface === 'morerobiare'
      )
        return {
          evaluationStatus: 'partial',
          failures: [{ nodeId: 'root', message: 'Broken parent' }],
        };
    },
  });
  const params = {
    ...f.params,
    grammarRepair: {
      ...f.params.grammarRepair,
      selectedNode: { id: 'left', start: 0, end: 11, code: 'moro.var(1)' },
    },
  };
  const job = {
    id: 'job:parent',
    projectId: f.project.id,
    passageId: f.params.passageId,
    input: await f.repair.capture(params),
  };
  const file = await f.repair.call(job, 'grammar_read', { path: 'tupi/tupi/verb.py' });
  const result = await f.repair.call(job, 'grammar_edit', {
    path: file.path,
    expectedHash: file.hash,
    oldText: 'mororerobiare',
    newText: 'morerobiare',
  });
  assert.equal(result.rolledBack, true);
  assert.equal(result.verificationError.code, 'GRAMMAR_REGRESSION');
  assert.equal(await fs.readFile(path.join(f.engine, file.path), 'utf8'), file.content);
});

test('unsaved shared definition repairs use the guarded declaration evaluator for target and contrasts', async (t) => {
  let stale = false;
  const f = await fixture(t, {
    projectInterpretations: async () => {
      throw new Error('Passage meanings cannot bind a shared definition');
    },
    interceptRequest(method) {
      if (stale && method === 'lexicon_tree_evaluate')
        throw Object.assign(new Error('Definition changed'), { code: 'STALE_DEFINITION' });
    },
  });
  const sharedDefinition = {
    name: 'enosem',
    expectedExpression: 'old_definition',
    sourceFingerprint: 'source:definition',
    declarationId: 'lexical:original',
    declarationSourceId: 'lexicon',
    declarationLine: 42,
  };
  const params = {
    ...f.params,
    grammarRepair: {
      ...f.params.grammarRepair,
      raw: 'new_root * new_suffix',
      sharedDefinition,
      selectedNode: { id: 'left', start: 0, end: 8, code: 'new_root' },
    },
  };
  const input = await f.repair.capture(params);
  assert.equal(input.raw, 'new_root');
  assert.equal(input.grammarRepair.contextRaw, 'new_root * new_suffix');
  assert.equal(input.grammarRepair.passageRaw, f.params.grammarRepair.raw);
  assert.deepEqual(input.diagnostic.evidence.targetDefinitionContext, { namespace: 'declaration' });
  const job = {
    id: 'job:definition',
    projectId: f.project.id,
    passageId: f.params.passageId,
    input,
  };
  await f.repair.check(job);
  await f.repair.call(job, 'render_candidate', { raw: 'contrast' });
  const evaluations = f.requests.filter((r) => r.method === 'lexicon_tree_evaluate');
  assert.deepEqual(
    evaluations.map((r) => r.params.raw),
    ['new_root', 'new_root * new_suffix', 'new_root', 'new_root * new_suffix', 'contrast'],
  );
  for (const { params: request } of evaluations) {
    assert.equal(request.name, sharedDefinition.name);
    assert.equal(request.expectedExpression, sharedDefinition.expectedExpression);
    assert.equal(request.sourceFingerprint, sharedDefinition.sourceFingerprint);
    assert.equal(request.declarationId, sharedDefinition.declarationId);
    assert.equal(request.declarationSourceId, sharedDefinition.declarationSourceId);
    assert.equal(request.declarationLine, sharedDefinition.declarationLine);
  }
  const context = await f.repair.call(job, 'grammar_context', {});
  assert.equal(context.context.raw, f.params.grammarRepair.raw);
  assert.equal(context.contextScope, 'containing-passage');
  assert.equal(input.interpretationContext, undefined);
  const follow = await f.repair.capture({ ...params, description: 'Continue a definição.' }, job);
  assert.deepEqual(follow.grammarRepair.sharedDefinition, sharedDefinition);
  stale = true;
  await assert.rejects(f.repair.check(job), { code: 'STALE_DEFINITION' });
  assert.equal(
    (await f.draftStore.load(f.project.id)).drafts[f.params.passageId].raw,
    f.params.grammarRepair.raw,
  );
});

test('pending passage repairs retain insertion scope through capture, checking and follow-up', async (t) => {
  const f = await fixture(t);
  const envelope = await f.draftStore.load(f.project.id);
  const id = 'pending:00000000-0000-4000-8000-000000000001';
  const draft = structuredClone(envelope.drafts[f.params.passageId]);
  draft.passageId = id;
  draft.pending = {
    sourceId: 'araujo_catecismo_1686',
    ordinal: 1,
    beforePassageId: f.params.passageId,
  };
  envelope.drafts[id] = draft;
  await f.draftStore.saveChecked(envelope);
  const params = { ...f.params, passageId: id };
  const input = await f.repair.capture(params);
  const job = { id: 'job:pending', projectId: f.project.id, passageId: id, input };
  await f.repair.check(job);
  await f.repair.call(job, 'grammar_context', {});
  const follow = await f.repair.capture({ ...params, description: 'Continue.' }, job);
  assert.equal(follow.grammarRepair.insertion.beforePassageId, f.params.passageId);
  for (const { method, params: request } of f.requests)
    if (method === 'evaluate_expression' || method === 'assistant_context')
      assert.equal(request.beforePassageId, f.params.passageId);
});

test('loose fragment selection is verified against the saved fragment instead of the passage', async (t) => {
  const f = await fixture(t);
  const envelope = await f.draftStore.load(f.project.id);
  envelope.drafts[f.params.passageId].canvas = {
    positions: {},
    fragments: [{ id: 'loose', raw: 'piece * suffix', x: 0, y: 0 }],
  };
  await f.draftStore.saveChecked(envelope);
  const input = await f.repair.capture({
    ...f.params,
    grammarRepair: {
      ...f.params.grammarRepair,
      fragmentId: 'loose',
      raw: 'piece * suffix',
      selectedNode: { id: 'left', start: 0, end: 5, code: 'piece' },
    },
  });
  assert.equal(input.raw, 'piece');
  assert.equal(input.grammarRepair.contextRaw, 'piece * suffix');
  assert.equal(input.grammarRepair.passageRaw, f.params.grammarRepair.raw);
  assert.equal(input.grammarRepair.targetPassage, null);
});

test('explicit engine repair receives frozen scoped grammatical interpretations in its input and read context without granting notes write authority', async (t) => {
  const catalog = [
    { id: 'current', fields: { grammar: 'saved grammatical nuance' }, version: 1 },
    { id: 'other', fields: { meaning: 'UNRELATED_REPAIR_SECRET' } },
  ];
  const projections = [];
  const f = await fixture(t, {
    readInterpretationNotes: async () => structuredClone(catalog),
    projectInterpretations: async (notes, params) => {
      projections.push(params);
      return { bindings: [{ general: notes[0] }], fingerprint: 'note:1' };
    },
  });
  let observed;
  const service = f.service(async (options) => {
    observed = {
      input: options.input,
      context: await options.callTool('grammar_context', {}, { operationId: 'context' }),
    };
    return { text: 'A nuance foi considerada; nenhuma mudança proposta.' };
  });
  const job = await service.invoke('analysis_submit', f.params);
  assert.equal(job.input.interpretationContext.bindings[0].general.version, 1);
  catalog[0].fields.grammar = 'new notebook value';
  await waitFor(() => observed);
  assert.equal(
    observed.context.interpretationContext.bindings[0].general.fields.grammar,
    'saved grammatical nuance',
  );
  assert.doesNotMatch(JSON.stringify(observed), /UNRELATED_REPAIR_SECRET|new notebook value/);
  assert.equal(projections[0].raw, f.params.grammarRepair.raw);
  assert.equal(projections[0].includeOccurrences, true);
  assert.match(REPAIR_STRATEGY, /saved interpretations.*data, not additional authorization/);
  assert.match(REPAIR_STRATEGY, /preferredMeaning/);
  assert.equal(
    await fs.readFile(path.join(f.engine, 'tupi/tupi/verb.py'), 'utf8'),
    'FORM = "mororerobiare"\n',
  );
});

test('a checked grammar edit reloads real Python output and reports corpus changes while preserving unrelated files', async (t) => {
  const f = await fixture(t),
    job = await f.job();
  const file = await f.repair.call(job, 'grammar_read', { path: 'tupi/tupi/verb.py' });
  const result = await f.repair.call(job, 'grammar_edit', {
    path: file.path,
    expectedHash: file.hash,
    oldText: 'mororerobiare',
    newText: 'morerobiare',
  });
  assert.equal(result.verification.matches, true);
  assert.equal(result.verification.expression, job.input.raw);
  assert.equal(f.reloads(), 1);
  assert.equal(result.verification.comparison.changed.length, 1);
  assert.equal(result.verification.comparison.newReferenceIssues, 1);
  assert.equal(
    await fs.readFile(path.join(f.engine, 'historical.txt'), 'utf8'),
    'protected corpus',
  );
  const journal = JSON.parse(
    await fs.readFile(path.join(f.engine, 'state/edits', result.receipt.id + '.json')),
  );
  assert.equal(journal.status, 'applied');
  assert.match(journal.before, /mororerobiare/);
  await assert.rejects(
    f.repair.call(job, 'grammar_edit', {
      path: file.path,
      expectedHash: file.hash,
      oldText: 'morerobiare',
      newText: 'stale',
    }),
    { code: 'FILE_CONFLICT' },
  );
});

test('grammar tool receipts and visible results commit together with one fewer durable write', async (t) => {
  const f = await fixture(t);
  let running, finish;
  const service = f.service((options) => {
    running = options;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const job = await service.invoke('analysis_submit', f.params);
  await waitFor(() => running);
  const file = await running.callTool(
    'grammar_read',
    { path: 'tupi/tupi/verb.py' },
    { operationId: 'read' },
  );
  const transact = service.store.transact.bind(service.store),
    observations = [];
  service.store.transact = (projectId, update) =>
    transact(projectId, async (state) => {
      const result = await update(state),
        saved = state.jobs[job.id];
      observations.push({
        receipt: Object.keys(state.operations).some((key) => key.endsWith(':checked-edit')),
        edits: saved.grammarEdits?.length ?? 0,
        events: saved.events.filter(
          (event) => event.type === 'tool-result' && event.tool === 'grammar_edit',
        ).length,
        verified: !!saved.grammarVerification,
      });
      return result;
    });
  const args = {
    path: file.path,
    expectedHash: file.hash,
    oldText: 'mororerobiare',
    newText: 'morerobiare',
  };
  const result = await running.callTool('grammar_edit', args, { operationId: 'checked-edit' });
  assert.deepEqual(observations, [
    { receipt: false, edits: 0, events: 0, verified: false },
    { receipt: true, edits: 1, events: 1, verified: true },
  ]);
  assert.deepEqual(
    await running.callTool('grammar_edit', args, { operationId: 'checked-edit' }),
    result,
  );
  assert.equal(observations.length, 2, 'replay must not write or apply the edit again');
  const journal = JSON.parse(
    await fs.readFile(
      path.join(f.engine, 'state/analysis/grammar-edits', result.receipt.id + '.json'),
    ),
  );
  assert.equal(journal.status, 'applied');
  assert.match(journal.before, /mororerobiare/);
  service.store.transact = transact;
  finish({ text: 'Checked correction saved.' });
  await waitFor(
    async () =>
      (await service.invoke('analysis_get', { projectId: f.project.id, jobId: job.id })).job
        .status === 'needs-input',
  );
});

test('a cancelled grammar read cannot persist its late result or idempotency receipt', async (t) => {
  let hold = false,
    releaseRead,
    reading;
  const started = new Promise((resolve) => {
    reading = resolve;
  });
  const f = await fixture(t, {
    interceptRequest(method) {
      if (hold && method === 'assistant_context') {
        reading();
        return new Promise((resolve) => {
          releaseRead = resolve;
        });
      }
    },
  });
  let running, finish;
  const service = f.service((options) => {
    running = options;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const job = await service.invoke('analysis_submit', f.params);
  await waitFor(() => running);
  hold = true;
  const late = running.callTool('grammar_context', {}, { operationId: 'held-read' });
  await started;
  await service.invoke('analysis_cancel', {
    projectId: f.project.id,
    jobId: job.id,
    operationId: 'cancel-held',
  });
  releaseRead({ raw: job.input.raw });
  await assert.rejects(late, { code: 'STALE_ATTEMPT' });
  const state = await service.store.read(f.project.id);
  assert.equal(
    Object.keys(state.operations).some((key) => key.endsWith(':held-read')),
    false,
  );
  assert.equal(
    state.jobs[job.id].events.some(
      (event) => event.type === 'tool-result' && event.tool === 'grammar_context',
    ),
    false,
  );
  finish({ text: 'Cancelled.' });
  await waitFor(
    async () =>
      (await service.invoke('analysis_get', { projectId: f.project.id, jobId: job.id })).job
        .status === 'cancelled',
  );
});

test('contrasts evaluate without reopening an unchanged worker or repeating corpus regression', async (t) => {
  const f = await fixture(t),
    job = await f.job();
  const regressions = f.requests.filter(
    (request) => request.method === 'grammar_regression',
  ).length;
  for (const raw of ['contrast_one', 'contrast_two', 'contrast_three']) {
    const result = await f.repair.call(job, 'render_candidate', { raw });
    assert.equal(result.expression, raw);
  }
  assert.equal(f.reloads(), 0);
  assert.equal(
    f.requests.filter((request) => request.method === 'grammar_regression').length,
    regressions,
  );
});

for (const code of ['STALE_ENGINE', 'WORKER_UNAVAILABLE']) {
  test(`a contrast retries an explicit ${code} read once after reloading`, async (t) => {
    let attempts = 0;
    const f = await fixture(t, {
      interceptRequest(method, params) {
        if (method === 'evaluate_expression' && params.raw === 'contrast' && ++attempts === 1)
          throw Object.assign(new Error('The read needs a fresh worker'), { code });
      },
    });
    const job = await f.job();
    const result = await f.repair.call(job, 'render_candidate', { raw: 'contrast' });
    assert.equal(result.expression, 'contrast');
    assert.equal(attempts, 2);
    assert.equal(f.reloads(), 1);
    const calls = f.requests.filter((request) => request.params.raw === 'contrast');
    assert.deepEqual(calls[0], calls[1]);
  });
}

test('persistent worker failures stop after one read retry and linguistic errors do not reload', async (t) => {
  const f = await fixture(t, {
    interceptRequest(method, params) {
      if (method === 'evaluate_expression' && params.raw === 'offline')
        throw Object.assign(new Error('Worker unavailable'), { code: 'WORKER_UNAVAILABLE' });
      if (method === 'evaluate_expression' && params.raw === 'invalid')
        throw Object.assign(new Error('Invalid predicate'), { code: 'ENGINE_ERROR' });
    },
  });
  const job = await f.job();
  await assert.rejects(f.repair.call(job, 'render_candidate', { raw: 'offline' }), {
    code: 'WORKER_UNAVAILABLE',
  });
  assert.equal(f.reloads(), 1);
  assert.equal(f.requests.filter((request) => request.params.raw === 'offline').length, 2);
  await assert.rejects(f.repair.call(job, 'render_candidate', { raw: 'invalid' }), {
    code: 'ENGINE_ERROR',
  });
  assert.equal(f.reloads(), 1);
  assert.equal(f.requests.filter((request) => request.params.raw === 'invalid').length, 1);
});

test('grammar_files advertises only available guides and grammar files that can be read', async (t) => {
  const f = await fixture(t),
    job = await f.job();
  assert.deepEqual((await f.repair.call(job, 'grammar_files', {})).files, ['tupi/tupi/verb.py']);
  await fs.mkdir(path.join(f.engine, 'docs/agent'), { recursive: true });
  await fs.mkdir(path.join(f.engine, 'tests'));
  await fs.writeFile(
    path.join(f.engine, 'docs/agent/grammar-navigation.md'),
    'Rules and locations',
  );
  await fs.writeFile(path.join(f.engine, 'AGENT_NOTES.md'), 'Saved rule notes');
  await fs.writeFile(path.join(f.engine, 'AGENTS.md'), 'Repository instructions');
  await fs.writeFile(path.join(f.engine, 'tests/test_grammar.py'), '# grammar regression');
  const { files } = await f.repair.call(job, 'grammar_files', {});
  assert.deepEqual(files, [
    'AGENTS.md',
    'AGENT_NOTES.md',
    'docs/agent/grammar-navigation.md',
    'tests/test_grammar.py',
    'tupi/tupi/verb.py',
  ]);
  for (const filename of files) {
    const file = await f.repair.call(job, 'grammar_read', { path: filename });
    assert.equal(file.path, filename);
    assert(file.hash);
  }
  assert.deepEqual((await f.repair.call(job, 'grammar_files', { query: 'tests/' })).files, [
    'tests/test_grammar.py',
  ]);
});

test('grammar_files omits nonregular, linked, and oversized files, including linked guide parents', async (t) => {
  const f = await fixture(t),
    job = await f.job();
  await fs.symlink(path.join(f.engine, 'historical.txt'), path.join(f.engine, 'AGENT_NOTES.md'));
  await fs.mkdir(path.join(f.engine, 'AGENTS.md'));
  await fs.mkdir(path.join(f.engine, 'other/agent'), { recursive: true });
  await fs.writeFile(path.join(f.engine, 'other/agent/grammar-navigation.md'), 'Unavailable guide');
  await fs.symlink(path.join(f.engine, 'other'), path.join(f.engine, 'docs'));
  await fs.symlink(
    path.join(f.engine, 'historical.txt'),
    path.join(f.engine, 'tupi/tupi/linked.py'),
  );
  await fs.link(
    path.join(f.engine, 'historical.txt'),
    path.join(f.engine, 'tupi/tupi/hardlinked.py'),
  );
  await fs.writeFile(path.join(f.engine, 'tupi/tupi/oversized.py'), 'x'.repeat(512001));
  await fs.writeFile(path.join(f.engine, 'tests'), 'Not a directory');
  assert.deepEqual((await f.repair.call(job, 'grammar_files', {})).files, ['tupi/tupi/verb.py']);
});

test('grammar tools reject traversal, links, instructions edits and arbitrary host operations', async (t) => {
  const f = await fixture(t),
    job = await f.job();
  await fs.symlink(
    path.join(f.engine, 'historical.txt'),
    path.join(f.engine, 'tupi/tupi/linked.py'),
  );
  await fs.writeFile(path.join(f.engine, 'AGENTS.md'), 'original instructions');
  for (const name of [
    '../historical.txt',
    'tupi/../historical.txt',
    'historical.txt',
    'tupi/tupi/linked.py',
  ])
    await assert.rejects(f.repair.call(job, 'grammar_read', { path: name }), {
      code: 'FILE_SCOPE',
    });
  const instructions = await f.repair.call(job, 'grammar_read', { path: 'AGENTS.md' });
  await assert.rejects(
    f.repair.call(job, 'grammar_edit', {
      path: 'AGENTS.md',
      expectedHash: instructions.hash,
      oldText: 'original',
      newText: 'rewritten',
    }),
    { code: 'FILE_SCOPE' },
  );
  await assert.rejects(f.repair.call(job, 'exec', { command: 'anything' }), {
    code: 'UNKNOWN_TOOL',
  });
  assert.equal(
    await fs.readFile(path.join(f.engine, 'AGENTS.md'), 'utf8'),
    'original instructions',
  );
});

test('a broken edit is rolled back with its receipt before the next attempt', async (t) => {
  const f = await fixture(t),
    job = await f.job();
  let file = await f.repair.call(job, 'grammar_read', { path: 'tupi/tupi/verb.py' });
  const broken = await f.repair.call(job, 'grammar_edit', {
    path: file.path,
    expectedHash: file.hash,
    oldText: file.content,
    newText: 'FORM = (\n',
  });
  assert(broken.receipt);
  assert(broken.verificationError);
  assert.equal(broken.rolledBack, true);
  assert.equal(await fs.readFile(path.join(f.engine, file.path), 'utf8'), file.content);
  file = await f.repair.call(job, 'grammar_read', { path: file.path });
  const fixed = await f.repair.call(job, 'grammar_edit', {
    path: file.path,
    expectedHash: file.hash,
    oldText: file.content,
    newText: 'FORM = "morerobiare"\n',
  });
  assert.equal(fixed.verification.matches, true);
});

test('repair jobs start a separate thread, keep other conversations running, serialize one engine and preserve follow-up context', async (t) => {
  const f = await fixture(t),
    running = [];
  const service = f.service(
    (options) =>
      new Promise((resolve) => {
        if (options.signal.aborted) return resolve({ text: 'cancelled' });
        running.push({ options, resolve });
        options.signal.addEventListener('abort', () => resolve({ text: 'cancelled' }), {
          once: true,
        });
      }),
  );
  // A regular read-only conversation can remain active while a repair starts.
  const envelope = await f.draftStore.load(f.project.id);
  envelope.drafts[f.params.passageId].diplomatic = 'A source';
  await f.draftStore.saveChecked(envelope);
  const ordinary = await service.invoke('analysis_submit', {
    ...f.params,
    task: 'explain',
    operationId: 'ordinary',
  });
  await waitFor(() => running.length === 1);
  const first = await service.invoke('analysis_submit', f.params);
  await waitFor(() => running.length === 2);
  assert.notEqual(first.conversationId, ordinary.conversationId);
  assert.deepEqual(first.input.conversation, []);
  assert(running[1].options.grammarRepair);
  assert(running[1].options.tools.some((tool) => tool.name === 'grammar_edit'));
  assert(!running[0].options.tools.some((tool) => tool.name === 'grammar_edit'));
  const second = await service.invoke('analysis_submit', {
    ...f.params,
    operationId: 'repair:two',
  });
  assert.equal(
    (await service.invoke('analysis_get', { projectId: f.project.id, jobId: second.id })).job
      .status,
    'queued',
  );
  const read = await running[1].options.callTool(
    'grammar_read',
    { path: 'tupi/tupi/verb.py' },
    { operationId: 'read' },
  );
  await running[1].options.callTool(
    'grammar_edit',
    { path: read.path, expectedHash: read.hash, oldText: 'mororerobiare', newText: 'morerobiare' },
    { operationId: 'edit' },
  );
  running[1].resolve({ text: 'A variante mor foi corrigida.' });
  await waitFor(() => running.length === 3);
  const firstDone = await service.invoke('analysis_get', {
    projectId: f.project.id,
    jobId: first.id,
  });
  assert.equal(firstDone.job.status, 'needs-input');
  assert.equal(firstDone.job.grammarVerification.matches, true);
  assert.equal(firstDone.job.grammarVerification.regressionsHealthy, false);
  assert.match(firstDone.job.questions.at(-1).text, /regressão/);
  assert.equal(firstDone.job.grammarEdits.length, 1);
  assert.equal(
    (await service.invoke('analysis_get', { projectId: f.project.id, jobId: ordinary.id })).job
      .status,
    'running',
  );
  running[2].resolve({ text: 'Segundo diagnóstico.' });
  await waitFor(
    async () =>
      (await service.invoke('analysis_get', { projectId: f.project.id, jobId: second.id })).job
        .status === 'needs-input',
  );
  const follow = await service.invoke('analysis_submit', {
    ...f.params,
    operationId: 'reply',
    parentJobId: first.id,
    description: 'Confira o plural.',
  });
  assert.equal(follow.conversationId, first.conversationId);
  assert(follow.input.conversation.some((turn) => turn.text === 'A variante mor foi corrigida.'));
  assert.equal(follow.input.grammarRepair.raw, first.input.grammarRepair.raw);
  assert.equal(follow.input.grammarRepair.intendedSurface, 'morerobiare');
  const selection = await service.invoke('analysis_select_conversation', {
    projectId: f.project.id,
    passageId: f.params.passageId,
    conversationId: ordinary.conversationId,
  });
  assert.equal(selection.id, ordinary.conversationId);
  await service.invoke('analysis_composer', {
    projectId: f.project.id,
    passageId: f.params.passageId,
    conversationId: first.conversationId,
    text: 'Delayed text in the repair thread',
  });
  const listing = await service.invoke('analysis_list', { projectId: f.project.id });
  assert.equal(listing.conversations[0].id, ordinary.conversationId);
  assert.notEqual(listing.conversations[0].composer, 'Delayed text in the repair thread');
  assert.equal(
    (await service.invoke('analysis_get', { projectId: f.project.id, jobId: first.id }))
      .conversation.composer,
    'Delayed text in the repair thread',
  );
});

test('matching targets become ready only with clean corpus coverage and execution checks', async (t) => {
  for (const scenario of ['healthy', 'coverage', 'execution']) {
    await t.test(scenario, async (t) => {
      let snapshots = 0;
      const f = await fixture(t, {
        interceptRequest(method, params, surface) {
          if (method !== 'grammar_regression' || ++snapshots === 1 || scenario === 'healthy')
            return undefined;
          return {
            engineFingerprint: 'current',
            sources: {
              source: {
                rows: [
                  {
                    ordinal: 1,
                    codeFingerprint:
                      scenario === 'coverage' ? 'changed-expression' : 'same-expression',
                    surface,
                    annotated: surface,
                    reference: surface,
                    ...(scenario === 'execution' ? { error: 'new failure' } : {}),
                  },
                ],
              },
            },
          };
        },
      });
      const service = f.service(async () => ({ text: 'Conferido.' }));
      const job = await service.invoke('analysis_submit', {
        ...f.params,
        grammarRepair: { ...f.params.grammarRepair, intendedSurface: 'mororerobiare' },
      });
      const completed = await waitFor(async () => {
        const detail = await service.invoke('analysis_get', {
          projectId: f.project.id,
          jobId: job.id,
        });
        return ['ready-for-review', 'needs-input'].includes(detail.job.status) && detail.job;
      });
      assert.equal(completed.grammarVerification.matches, true);
      assert.equal(completed.grammarVerification.regressionsHealthy, scenario === 'healthy');
      assert.equal(completed.status, scenario === 'healthy' ? 'ready-for-review' : 'needs-input');
    });
  }
});

test('unapproved example changes require review except the explicitly corrected saved passage', async (t) => {
  for (const scenario of ['target', 'other', 'definition']) {
    await t.test(scenario, async (t) => {
      const f = await fixture(t, {
        interceptRequest(method, params, surface) {
          if (method !== 'grammar_regression') return undefined;
          return {
            engineFingerprint: 'current',
            sources: {
              araujo_catecismo_1686: {
                rows: [
                  {
                    ordinal: 90,
                    codeFingerprint: 'target-expression',
                    surface: scenario === 'other' ? 'fixed' : surface,
                  },
                  {
                    ordinal: 91,
                    codeFingerprint: 'other-expression',
                    surface: scenario === 'other' ? surface : 'fixed',
                  },
                ],
              },
            },
          };
        },
      });
      const params = {
        ...f.params,
        grammarRepair: {
          ...f.params.grammarRepair,
          ...(scenario === 'definition'
            ? {
                sharedDefinition: {
                  name: 'piece',
                  expectedExpression: 'old',
                  sourceFingerprint: 'source:definition',
                },
              }
            : {}),
        },
      };
      const job = {
        id: 'job:scope',
        projectId: f.project.id,
        passageId: f.params.passageId,
        input: await f.repair.capture(params),
      };
      const file = await f.repair.call(job, 'grammar_read', { path: 'tupi/tupi/verb.py' });
      const { verification, rolledBack } = await f.repair.call(job, 'grammar_edit', {
        path: file.path,
        expectedHash: file.hash,
        oldText: 'mororerobiare',
        newText: 'morerobiare',
      });
      assert.equal(rolledBack, undefined);
      assert.equal(verification.matches, true);
      assert.equal(verification.comparison.changed.length, 1);
      assert.equal(verification.unexpectedChanges.length, scenario === 'target' ? 0 : 1);
      assert.equal(verification.regressionsHealthy, scenario === 'target');
    });
  }
});

test('an identical preexisting source error remains visible without becoming a new coverage regression', async (t) => {
  const f = await fixture(t, {
    interceptRequest(method) {
      if (method !== 'grammar_regression') return undefined;
      return {
        engineFingerprint: 'current',
        sources: {
          broken: { error: 'preexisting import failure' },
          source: { rows: [{ ordinal: 1, codeFingerprint: 'same', surface: 'fixed' }] },
        },
      };
    },
  });
  const job = await f.job();
  const check = await f.repair.check(job);
  assert.deepEqual(check.comparison.sourceChanges, ['broken']);
  assert.deepEqual(check.coverageChanges, []);
  assert.deepEqual(check.newEvaluationErrors, []);
  assert.equal(check.regressionsHealthy, true);
});

test('failed repair is checked and resumes from compact receipts rather than replaying megabytes of tool history', async (t) => {
  const f = await fixture(t);
  let runs = 0;
  const service = f.service(async (options) => {
    runs++;
    if (runs === 1) {
      await options.onCheckpoint({
        version: 1,
        provider: options.input.provider,
        inputDigest: options.input.digest,
        phase: 'provider-inflight',
        messages: [{ role: 'user', content: 'old tool payload'.repeat(100000) }],
        calls: [],
      });
      throw Object.assign(new Error('timed out'), { code: 'JOB_TIMEOUT' });
    }
    assert.equal(options.checkpoint, undefined);
    assert(JSON.stringify(options.messages).length < 20000);
    assert.match(options.messages[0].content, /Completed edits are already saved/);
    return { text: 'Checked saved work' };
  });
  const job = await service.invoke('analysis_submit', f.params);
  await waitFor(
    async () =>
      (await service.invoke('analysis_get', { projectId: f.project.id, jobId: job.id })).job
        .status === 'blocked',
  );
  let detail = await service.invoke('analysis_get', { projectId: f.project.id, jobId: job.id });
  assert.equal(detail.job.grammarVerification.comparison.checked, 1);
  await service.invoke('analysis_resume', {
    projectId: f.project.id,
    jobId: job.id,
    operationId: 'resume:compact',
  });
  await waitFor(() => runs === 2);
  await waitFor(
    async () =>
      (await service.invoke('analysis_get', { projectId: f.project.id, jobId: job.id })).job
        .status !== 'running',
  );
  detail = await service.invoke('analysis_get', { projectId: f.project.id, jobId: job.id });
  assert.equal(detail.job.attempts.length, 2);
  assert.equal(detail.job.attempts[0].checkpoint.messages[0].content.length, 1600000);
});

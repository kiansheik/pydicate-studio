'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createGrammarRepair } = require('../grammar-repair.cjs');
const { createAnalysisService } = require('../analysis-service.cjs');
const { DraftStore } = require('../draft-store.cjs');

async function fixture(t) {
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
    if (method === 'evaluate_expression')
      return {
        expression: params.raw,
        revisionId: params.revisionId,
        engineFingerprint: project.engineFingerprint,
        surface: surface(),
        evaluationStatus: 'complete',
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
  assert.equal(job.input.provider, 'codex');
  assert.equal(job.input.model, 'fixture-codex');
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

test('a temporarily broken edit keeps its receipt and can be repaired in the same job', async (t) => {
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
  assert.equal(firstDone.job.status, 'ready-for-review');
  assert.equal(firstDone.job.grammarVerification.matches, true);
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
        .status === 'ready-for-review',
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

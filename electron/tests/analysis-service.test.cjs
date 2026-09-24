'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createAnalysisService } = require('../analysis-service.cjs');
const { AnalysisStore } = require('../analysis-store.cjs');
const { DraftStore } = require('../draft-store.cjs');
const projectId = 'project:analysis-fixture',
  sourceId = 'araujo_catecismo_1686',
  passageId = 'passage:one';
const canvas = { fragments: [], positions: {}, layout: 'bottom-up' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
function parse(raw, revisionId) {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        'import json,sys;sys.path.insert(0,sys.argv[1]);from studio_authoring import expression_tree;print(json.dumps(expression_tree(sys.stdin.read(),sys.argv[2])))',
        path.resolve(__dirname, '../../python'),
        revisionId,
      ],
      { input: raw, encoding: 'utf8' },
    ),
  );
}
function draft(id = passageId) {
  return {
    passageId: id,
    revisionId: 'revision:one',
    sourceFingerprint: 'source:one',
    diplomatic: 'Abá',
    normalized: 'abá',
    translation: 'Leitura humana',
    notes: 'Fonte incerta',
    raw: 'a',
    analysis: null,
    canvas: structuredClone(canvas),
    aiInput: { tentativeReading: 'aba', meaning: 'pessoa', constraints: 'manter nasalização' },
    updatedAt: '2026-09-17T00:00:00.000Z',
  };
}
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-analysis-test-'));
  const draftStore = new DraftStore(path.join(directory, 'drafts'));
  await draftStore.saveChecked({ version: 1, projectId, drafts: { [passageId]: draft() } });
  let project = {
    id: projectId,
    mode: 'local',
    engineFingerprint: 'engine:one',
    repositories: [],
    passages: [
      {
        id: passageId,
        sourceId,
        sourceFingerprint: 'source:one',
        ordinal: 2,
        sourceExpression: 'a',
        acceptedReference: 'abá',
        diplomatic: 'Abá',
        witness: { printedPage: '6' },
      },
    ],
  };
  let savedEvidence = {
    revision: 4,
    asset: null,
    passage: null,
    inherited: {
      regions: [{ id: 'not-evidence', assetId: 'previous', pageIndex: 0, rect: [1, 2, 3, 4] }],
    },
  };
  const events = [],
    requests = [];
  let requestHook;
  const services = [];
  const request = async (method, params) => {
    requests.push({ method, params });
    const overridden = await requestHook?.(method, params);
    if (overridden !== undefined) return overridden;
    if (method === 'dictionary_lookup')
      return { datasetFingerprint: 'dictionary:one', entries: [] };
    if (method === 'predicate_catalog') return { constructors: [] };
    if (method === 'parse_expression') return parse(params.raw, params.revisionId);
    if (method === 'evaluate_expression')
      return {
        revisionId: params.revisionId,
        expression: params.raw,
        engineFingerprint: project.engineFingerprint,
        surface: params.raw.includes('broken') ? '' : 'abá',
        annotated: 'abá[ROOT]',
        morphemes: [{ text: 'abá', tag: 'ROOT' }],
        evaluationStatus: params.raw.includes('broken') ? 'partial' : 'complete',
        tree: parse(params.raw, params.revisionId).root,
      };
    throw new Error('Unexpected request ' + method);
  };
  const create = (overrides = {}) => {
    const service = createAnalysisService({
      stateDirectory: path.join(directory, 'analysis'),
      draftStore,
      evidence: {
        invoke: async (method) => {
          assert.equal(method, 'evidence_status');
          return structuredClone(savedEvidence);
        },
      },
      getConfig: async () => ({
        provider: 'claude',
        models: { claude: 'fixture-model', codex: 'fixture-model' },
        reasoningEffort: 'low',
      }),
      getProject: () => project,
      request,
      emit: (event) => events.push(event),
      autoRun: false,
      ...options,
      ...overrides,
    });
    services.push(service);
    return service;
  };
  const service = create();
  t.after(async () => {
    for (const service of services) await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    draftStore,
    service,
    create,
    events,
    requests,
    setRequestHook: (hook) => {
      requestHook = hook;
    },
    project: () => project,
    setProject: (value) => {
      project = value;
    },
    setEvidence: (value) => {
      savedEvidence = value;
    },
    evidence: () => savedEvidence,
    params: (extra = {}) => ({
      projectId,
      passageId,
      revisionId: 'revision:one',
      operationId: 'submit:one',
      task: 'analyze',
      scope: 'passage',
      evidenceRevision: 4,
      ...extra,
    }),
  };
}
async function waitJob(
  service,
  id,
  predicate = (job) =>
    ['ready-for-review', 'needs-input', 'failed', 'blocked', 'cancelled'].includes(job.status),
) {
  for (let i = 0; i < 300; i++) {
    const value = await service.invoke('analysis_get', { projectId, jobId: id });
    if (predicate(value.job)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Fixture job did not reach requested state');
}
async function waitStarted(service, jobId, started) {
  // A sandbox can reject the temporary Unix listener before the fixture runner
  // starts. Report that failure rather than leaving the test on an unresolved gate.
  return Promise.race([
    started,
    waitJob(service, jobId).then(({ job }) => {
      throw new Error(`Fixture runner did not start: ${job.error?.message || job.status}`);
    }),
  ]);
}
async function candidateRunner({ callTool, onCheckpoint, input }) {
  const create = input.feedback?.candidate
    ? { fromCandidateId: input.feedback.candidate.id }
    : { raw: 'a' };
  let candidate = await callTool('studio_candidate_create', create, { operationId: 'create' });
  const same = await callTool('studio_candidate_create', create, { operationId: 'create' });
  assert.equal(same.id, candidate.id);
  candidate = await callTool(
    'studio_candidate_edit',
    {
      candidateId: candidate.id,
      expectedRevision: candidate.revisionId,
      action: { type: 'raw', raw: 'a.var(1)' },
    },
    { operationId: 'edit' },
  );
  candidate = await callTool(
    'studio_candidate_evaluate',
    { candidateId: candidate.id, expectedRevision: candidate.revisionId },
    { operationId: 'evaluate' },
  );
  candidate = await callTool(
    'studio_candidate_propose',
    {
      candidateId: candidate.id,
      expectedRevision: candidate.revisionId,
      rationale: 'Forma avaliada; interpretação ainda hipotética.',
      uncertainties: ['Rever sentido.'],
      translation: { text: 'Pessoa.', uncertainties: ['Rever sentido.'] },
    },
    { operationId: 'propose' },
  );
  await assert.rejects(callTool('source_apply', {}, { operationId: 'forbidden' }), {
    code: 'UNKNOWN_TOOL',
  });
  await onCheckpoint({
    version: 1,
    phase: 'completed',
    messages: [{ role: 'assistant', content: 'Candidato registrado.' }],
  });
  return { text: 'Candidato registrado.', usage: { output_tokens: 20 } };
}

test('saved notebook versions stay private and frozen through paused job restart while candidate prompts project only their current notes', async (t) => {
  const { freezeInterpretationNotes } = require('../interpretation-context.cjs');
  let records = [
      { id: 'relevant', fields: { meaning: 'frozen interpretation' }, version: 1 },
      { id: 'unrelated', fields: { meaning: 'UNRELATED_NOTE_SECRET' }, version: 2 },
    ],
    reads = 0,
    runs = 0;
  const projections = [],
    modelInputs = [];
  const f = await fixture(t, {
    autoRun: true,
    readInterpretationNotes: async () => {
      reads++;
      return freezeInterpretationNotes(records);
    },
    projectInterpretations: async (catalog, params) => {
      projections.push({ catalog: structuredClone(catalog), params });
      const note = catalog.find((entry) => entry.id === 'relevant');
      return {
        bindings: [{ preferredMeaning: note.fields.meaning, version: note.version }],
        fingerprint: 'version:' + note.version,
      };
    },
    runner: async (options) => {
      modelInputs.push(structuredClone(options.input));
      runs++;
      if (runs === 1) return { text: 'Preciso de uma orientação.' };
      return candidateRunner(options);
    },
  });
  const job = await f.service.invoke('analysis_submit', f.params());
  assert.equal(
    job.input.interpretationContext.bindings[0].preferredMeaning,
    'frozen interpretation',
  );
  assert.doesNotMatch(JSON.stringify(job), /UNRELATED_NOTE_SECRET|interpretationNotes/);
  const paused = await waitJob(f.service, job.id);
  assert.equal(paused.job.status, 'needs-input');
  assert.doesNotMatch(JSON.stringify(paused), /UNRELATED_NOTE_SECRET|interpretationNotes/);
  records[0] = { ...records[0], fields: { meaning: 'newer notebook interpretation' }, version: 2 };
  await f.service.close();
  const reopened = f.create();
  await reopened.start();
  assert.equal(runs, 1);
  await reopened.invoke('analysis_resume', {
    projectId,
    jobId: job.id,
    operationId: 'resume:notes',
    instruction: 'Continue.',
  });
  const done = await waitJob(reopened, job.id);
  assert.equal(done.job.status, 'ready-for-review');
  assert.equal(reads, 1, 'continuation must not reload new notebook meanings');
  assert.equal(
    projections.length,
    2,
    'original input and evaluated candidate each project their own tree',
  );
  assert.equal(projections[1].params.raw, 'a.var(1)');
  assert.equal(projections[1].catalog[0].version, 1);
  assert.equal(
    done.candidates[0].evaluation.interpretationContext.bindings[0].preferredMeaning,
    'frozen interpretation',
  );
  assert.doesNotMatch(
    JSON.stringify(modelInputs),
    /UNRELATED_NOTE_SECRET|newer notebook|interpretationNotes/,
  );
  assert.doesNotMatch(
    JSON.stringify(await reopened.invoke('analysis_list', { projectId })),
    /UNRELATED_NOTE_SECRET|interpretationNotes/,
  );
  assert.doesNotMatch(JSON.stringify(f.events), /UNRELATED_NOTE_SECRET|interpretationNotes/);
  const privateState = await reopened.store.read(projectId);
  assert.equal(privateState.jobs[job.id].interpretationNotes[0].version, 1);
});

test('submission captures immutable distinct tentative/target/evidence input and concurrent duplicate operation creates one job', async (t) => {
  const f = await fixture(t);
  const params = f.params(),
    [first, second] = await Promise.all([
      f.service.invoke('analysis_submit', params),
      f.service.invoke('analysis_submit', params),
    ]);
  assert.equal(first.id, second.id);
  assert.equal(first.input.diplomatic, 'Abá');
  assert.equal(first.input.tentativeReading, 'aba');
  assert.equal(first.input.reviewedTarget, 'abá');
  assert.deepEqual(first.input.evidence.regions, [], 'inherited positioning guide is not evidence');
  first.input.diplomatic = 'locally modified response';
  const stored = await f.service.invoke('analysis_get', { projectId, jobId: first.id });
  assert.equal(stored.job.input.diplomatic, 'Abá');
  const envelope = await f.draftStore.load(projectId);
  envelope.drafts[passageId].diplomatic = 'Nova leitura';
  envelope.drafts[passageId].revisionId = 'revision:two';
  await f.draftStore.saveChecked(envelope);
  assert.equal(
    (await f.service.invoke('analysis_get', { projectId, jobId: first.id })).job.input
      .baseRevisionId,
    'revision:one',
  );
  assert.equal((await f.service.invoke('analysis_list', { projectId })).jobs.length, 1);
  await assert.rejects(f.service.invoke('analysis_submit', { ...params, description: 'changed' }), {
    code: 'OPERATION_CONFLICT',
  });
});

test('new conversation archives history, clears provider context and keeps late results in the old thread', async (t) => {
  const f = await fixture(t);
  const first = await f.service.invoke('analysis_submit', f.params());
  await f.service.invoke('analysis_composer', { projectId, passageId, text: 'Previous question' });
  const command = { projectId, passageId, operationId: 'chat:new' };
  const fresh = await f.service.invoke('analysis_new_conversation', command);
  assert.notEqual(fresh.id, first.conversationId);
  assert.equal(fresh.composer, '');
  assert.deepEqual(fresh.turns, []);
  assert.equal((await f.service.invoke('analysis_new_conversation', command)).id, fresh.id);
  const second = await f.service.invoke(
    'analysis_submit',
    f.params({ operationId: 'submit:new-chat' }),
  );
  assert.equal(second.conversationId, fresh.id);
  assert.deepEqual(second.input.conversation, []);
  const old = await f.service.invoke('analysis_get', { projectId, jobId: first.id });
  assert.equal(old.conversation.id, first.conversationId);
  assert.equal(old.conversation.composer, 'Previous question');
  assert.equal(old.conversation.archived, true);
  await f.service.close();
  const resumed = f.create({ autoRun: true, runner: async () => ({ text: 'Late result' }) });
  await resumed.start();
  await waitJob(resumed, first.id);
  await waitJob(resumed, second.id);
  const listing = await resumed.invoke('analysis_list', { projectId });
  assert.equal(listing.conversations.length, 1);
  assert.equal(listing.conversations[0].id, fresh.id);
  const history = await resumed.invoke('analysis_get', { projectId, jobId: first.id });
  const current = await resumed.invoke('analysis_get', { projectId, jobId: second.id });
  assert(
    history.conversation.turns.some((turn) => turn.jobId === first.id && turn.role === 'assistant'),
  );
  assert(current.conversation.turns.every((turn) => turn.jobId !== first.id));
});

test('source translation can start without expression; failed save/evidence revision checks create no job', async (t) => {
  const f = await fixture(t);
  const envelope = await f.draftStore.load(projectId);
  envelope.drafts[passageId].raw = '';
  await f.draftStore.saveChecked(envelope);
  const job = await f.service.invoke('analysis_submit', f.params({ task: 'translate-source' }));
  assert.equal(job.input.raw, '');
  await assert.rejects(
    f.service.invoke('analysis_submit', f.params({ operationId: 'stale', revisionId: 'old' })),
    { code: 'DRAFT_CONFLICT' },
  );
  await assert.rejects(
    f.service.invoke('analysis_submit', f.params({ operationId: 'evidence', evidenceRevision: 2 })),
    { code: 'EVIDENCE_CONFLICT' },
  );
  await assert.rejects(
    f.service.invoke('analysis_submit', f.params({ operationId: 'images', includeImages: true })),
    { code: 'EVIDENCE_UNAVAILABLE' },
  );
  assert.equal((await f.service.invoke('analysis_list', { projectId })).jobs.length, 1);
});

test('scratch queue produces a proposed revision, atomically accepts to draft, preserves receipt through undo and rejects stale autosave', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const old = await f.draftStore.load(projectId),
    submitted = await f.service.invoke('analysis_submit', f.params());
  const done = await waitJob(f.service, submitted.id);
  assert.equal(done.job.status, 'ready-for-review');
  assert.equal(done.candidates.length, 1);
  const candidate = done.candidates[0];
  assert.equal(candidate.raw, 'a.var(1)');
  assert.equal(candidate.status, 'proposed');
  assert.equal(candidate.linguisticStatus, 'hypothesis-for-human-review');
  assert.equal(candidate.translation.text, 'Pessoa.');
  assert.equal(candidate.translation.revisionId, candidate.revisionId);
  assert.equal(
    (await f.draftStore.load(projectId)).drafts[passageId].translation,
    'Leitura humana',
    'generation registers the tentative translation only on the proposal',
  );
  assert.equal(
    (await f.draftStore.load(projectId)).drafts[passageId].raw,
    'a',
    'model cannot change human draft',
  );
  const accept = {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:one',
  };
  const result = await f.service.invoke('analysis_accept', accept);
  assert.equal(result.draft.raw, candidate.raw);
  assert.equal(result.draft.normalized, 'abá');
  assert.equal(
    result.draft.translation,
    'Leitura humana',
    'accepting structure preserves human text',
  );
  assert.equal(result.draft.aiAcceptances.length, 1);
  assert.deepEqual(
    (await f.service.invoke('analysis_accept', accept)).decision,
    result.decision,
    'repeat acceptance reuses receipt',
  );
  await assert.rejects(f.draftStore.saveChecked(old), { code: 'DRAFT_CONFLICT' });
  const undo = await f.draftStore.load(projectId);
  undo.drafts[passageId] = { ...draft(), revisionId: 'undo:one' };
  await f.draftStore.saveChecked(undo);
  const restored = (await f.draftStore.load(projectId)).drafts[passageId];
  assert.equal(restored.raw, 'a');
  assert.equal(restored.aiAcceptances.length, 1);
  assert.equal(restored.aiAcceptances[0].candidateRevision, candidate.revisionId);
  assert.equal((await f.service.store.read(projectId)).decisions.length, 1);
});

test('current draft adoption preserves edits since submission and rejects actual stale draft/candidate revisions', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const submitted = await f.service.invoke('analysis_submit', f.params()),
    done = await waitJob(f.service, submitted.id),
    candidate = done.candidates[0];
  const envelope = await f.draftStore.load(projectId);
  envelope.drafts[passageId].revisionId = 'human:newer';
  envelope.drafts[passageId].notes = 'Human edit while model ran';
  await f.draftStore.saveChecked(envelope);
  const params = {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:stale',
  };
  await assert.rejects(f.service.invoke('analysis_accept', params), { code: 'DRAFT_CONFLICT' });
  await assert.rejects(
    f.service.invoke('analysis_accept', {
      ...params,
      expectedDraftRevision: 'human:newer',
      candidateRevision: 'candidate:obsolete',
    }),
    { code: 'STALE_CANDIDATE' },
  );
  const accepted = await f.service.invoke('analysis_accept', {
    ...params,
    expectedDraftRevision: 'human:newer',
  });
  assert.equal(accepted.draft.raw, candidate.raw);
  assert.equal(accepted.decision.baseRevisionId, 'human:newer');
  assert.equal(
    (await f.draftStore.load(projectId)).drafts[passageId].notes,
    'Human edit while model ran',
  );
  assert.equal(
    (await f.service.invoke('analysis_get', { projectId, jobId: submitted.id })).candidates.length,
    1,
  );
  const current = await f.draftStore.load(projectId),
    a = structuredClone(current),
    b = structuredClone(current);
  a.drafts[passageId].notes = 'A';
  b.drafts[passageId].notes = 'B';
  const writes = await Promise.allSettled([
    f.draftStore.saveChecked(a),
    f.draftStore.saveChecked(b),
  ]);
  assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(writes.find((r) => r.status === 'rejected').reason.code, 'DRAFT_CONFLICT');
});

test('stale proposal is rechecked on the current engine without rewriting evidence or rerunning the provider', async (t) => {
  let providerCalls = 0;
  const f = await fixture(t, {
    autoRun: true,
    runner: async (input) => {
      providerCalls++;
      return candidateRunner(input);
    },
  });
  const submitted = await f.service.invoke('analysis_submit', f.params());
  const before = await waitJob(f.service, submitted.id),
    candidate = before.candidates[0];
  f.setProject({ ...f.project(), engineFingerprint: 'engine:updated' });
  const accept = {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:revalidated',
  };
  const result = await f.service.invoke('analysis_accept', accept);
  assert.equal(result.draft.raw, candidate.raw);
  assert.equal(result.decision.revalidation.engineFingerprint, 'engine:updated');
  assert.equal(result.decision.revalidation.status, 'complete');
  assert.equal(result.decision.revalidation.surface, 'abá');
  assert.equal(result.decision.revalidation.changedSinceProposal, false);
  assert.equal(result.decision.revalidation.sourceFingerprint, 'source:one');
  const after = await f.service.invoke('analysis_get', { projectId, jobId: submitted.id });
  assert.deepEqual(after.candidates, before.candidates);
  assert.deepEqual(after.job, before.job);
  const evaluationCount = f.requests.filter((item) => item.method === 'evaluate_expression').length;
  f.setProject({ ...f.project(), engineFingerprint: 'engine:even-newer' });
  const replay = await f.service.invoke('analysis_accept', accept);
  assert.deepEqual(replay.decision, result.decision);
  assert.equal(
    f.requests.filter((item) => item.method === 'evaluate_expression').length,
    evaluationCount,
  );
  assert.equal(providerCalls, 1);
});

test('changed, partial and failed local evaluations remain editable without certifying the historical proposal', async (t) => {
  for (const kind of ['changed', 'partial', 'failed']) {
    await t.test(kind, async (t) => {
      const f = await fixture(t, { autoRun: true, runner: candidateRunner });
      const submitted = await f.service.invoke('analysis_submit', f.params());
      const before = await waitJob(f.service, submitted.id),
        candidate = before.candidates[0];
      f.setProject({ ...f.project(), engineFingerprint: 'engine:changed' });
      f.setRequestHook((method, params) => {
        if (method !== 'evaluate_expression') return;
        if (kind === 'failed')
          throw Object.assign(new Error('Unknown predicate after lexicon edit'), {
            code: 'ENGINE_ERROR',
          });
        return {
          revisionId: params.revisionId,
          expression: params.raw,
          engineFingerprint: params.engineFingerprint,
          evaluationStatus: kind === 'partial' ? 'partial' : 'complete',
          surface: kind === 'partial' ? '' : 'changed surface',
          annotated: kind === 'partial' ? '' : 'changed[ROOT]',
        };
      });
      const result = await f.service.invoke('analysis_accept', {
        projectId,
        jobId: submitted.id,
        candidateId: candidate.id,
        candidateRevision: candidate.revisionId,
        expectedDraftRevision: 'revision:one',
        operationId: 'accept:' + kind,
      });
      assert.equal(result.draft.raw, candidate.raw);
      assert.equal(result.draft.translation, 'Leitura humana');
      assert.equal(result.decision.revalidation.status, kind === 'changed' ? 'complete' : kind);
      if (kind === 'failed') {
        assert.equal(result.decision.revalidation.error.code, 'ENGINE_ERROR');
        assert.equal(result.decision.revalidation.surface, undefined);
        assert.equal(result.decision.revalidation.changedSinceProposal, undefined);
      } else assert.equal(result.decision.revalidation.changedSinceProposal, true);
      assert.deepEqual(
        (await f.service.invoke('analysis_get', { projectId, jobId: submitted.id })).candidates,
        before.candidates,
      );
    });
  }
});

test('worker freshness failure can retry the same acceptance after refresh without writing an obsolete receipt', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const submitted = await f.service.invoke('analysis_submit', f.params());
  const done = await waitJob(f.service, submitted.id),
    candidate = done.candidates[0];
  const accept = {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:refresh',
  };
  f.setRequestHook((method) => {
    if (method === 'evaluate_expression')
      throw Object.assign(new Error('disk snapshot changed'), { code: 'STALE_ENGINE' });
  });
  await assert.rejects(f.service.invoke('analysis_accept', accept), { code: 'STALE_ENGINE' });
  assert.equal((await f.draftStore.load(projectId)).drafts[passageId].revisionId, 'revision:one');
  f.setProject({ ...f.project(), engineFingerprint: 'engine:refreshed' });
  f.setRequestHook(undefined);
  const result = await f.service.invoke('analysis_accept', accept);
  assert.equal(result.decision.revalidation.engineFingerprint, 'engine:refreshed');
  assert.equal(result.draft.aiAcceptances.length, 1);
});

test('local proposal revalidation cannot overwrite edits made while its evaluation was running', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const submitted = await f.service.invoke('analysis_submit', f.params());
  const done = await waitJob(f.service, submitted.id),
    candidate = done.candidates[0];
  const entered = deferred(),
    release = deferred();
  f.setRequestHook(async (method) => {
    if (method === 'evaluate_expression') {
      entered.resolve();
      await release.promise;
    }
  });
  const accept = f.service.invoke('analysis_accept', {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:concurrent',
  });
  const rejection = assert.rejects(accept, { code: 'DRAFT_CONFLICT' });
  await entered.promise;
  const edited = await f.draftStore.load(projectId);
  edited.drafts[passageId].revisionId = 'human:during-evaluation';
  edited.drafts[passageId].raw = 'a.var(2)';
  await f.draftStore.saveChecked(edited);
  release.resolve();
  await rejection;
  const saved = (await f.draftStore.load(projectId)).drafts[passageId];
  assert.equal(saved.raw, 'a.var(2)');
  assert.equal(saved.aiAcceptances, undefined);
});

test('queued acceptance rechecks project identity inside its atomic draft transaction', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const submitted = await f.service.invoke('analysis_submit', f.params());
  const done = await waitJob(f.service, submitted.id),
    candidate = done.candidates[0];
  const params = {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:project-race',
  };
  await assert.rejects(
    f.service.invoke('analysis_accept', { ...params, passageId: 'passage:other' }),
    { code: 'STALE_CANDIDATE' },
  );
  const queued = deferred(),
    release = deferred();
  const acceptCandidate = f.draftStore.acceptCandidate.bind(f.draftStore);
  f.draftStore.acceptCandidate = async (command) => {
    queued.resolve();
    await release.promise;
    return acceptCandidate(command);
  };
  const accepting = f.service.invoke('analysis_accept', params);
  const rejected = assert.rejects(accepting, { code: 'STALE_ENGINE' });
  await queued.promise;
  f.setProject({ ...f.project(), engineFingerprint: 'engine:changed-during-write' });
  release.resolve();
  await rejected;
  const saved = (await f.draftStore.load(projectId)).drafts[passageId];
  assert.equal(saved.revisionId, 'revision:one');
  assert.equal(saved.aiAcceptances, undefined);
});

test('restart blocks ambiguous running attempt without rerun; explicit retry adds an attempt and keeps frozen input', async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    runner: async () => {
      calls++;
      return { text: 'Interpretação da fonte.' };
    },
  });
  const job = await f.service.invoke('analysis_submit', f.params({ task: 'translate-source' }));
  await f.service.store.transact(projectId, (state) => {
    const value = state.jobs[job.id];
    value.status = 'running';
    value.lease = { ownerId: 'dead-owner', attemptId: 'attempt:old' };
    value.attempts.push({
      id: 'attempt:old',
      status: 'running',
      startedAt: new Date().toISOString(),
      checkpoint: { phase: 'provider-inflight' },
    });
  });
  await f.service.close();
  const next = f.create({ autoRun: true });
  await next.start();
  const interrupted = await next.invoke('analysis_get', { projectId, jobId: job.id });
  assert.equal(interrupted.job.status, 'blocked');
  assert.equal(interrupted.job.error.code, 'INTERRUPTED');
  assert.equal(calls, 0);
  const retry = { projectId, jobId: job.id, operationId: 'retry:one' };
  await next.invoke('analysis_retry', retry);
  await next.invoke('analysis_retry', retry);
  const done = await waitJob(next, job.id);
  assert.equal(done.job.status, 'ready-for-review');
  assert.equal(done.job.attempts.length, 2);
  assert.equal(calls, 1);
  assert.equal(done.job.input.digest, job.input.digest);
});

test('budget pause resumes after restart with recovered tool receipt, saved candidate and fresh budgets', async (t) => {
  let requests = 0;
  const provider = {
    completeToolRound: async ({ messages, onEvent, maxTokens }) => {
      requests++;
      if (requests === 1)
        return {
          content: [
            {
              type: 'tool_use',
              id: 'saved-create',
              name: 'studio_candidate_create',
              input: { raw: 'a' },
            },
          ],
          usage: { output_tokens: 8 },
          stopReason: 'tool_use',
        };
      if (requests === 2) {
        await onEvent({ type: 'text-delta', text: 'Tradução parcial preservada.' });
        return {
          content: [{ type: 'text', text: 'Tradução parcial preservada.' }],
          usage: { output_tokens: 56 },
          stopReason: 'max_tokens',
        };
      }
      assert.equal(requests, 3, 'resume is explicit and deduplicated');
      assert.equal(maxTokens, 64, 'new attempt gets its own output budget');
      const results = messages
        .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
        .filter((block) => block.type === 'tool_result');
      assert.equal(results.length, 1);
      assert.match(JSON.stringify(results[0]), /candidate:/);
      assert.equal(
        results[0].is_error,
        undefined,
        'the persisted owner receipt resolves the pending call',
      );
      assert.match(messages.at(-1).content, /Continue em espanhol/);
      return {
        content: [{ type: 'text', text: 'Tradução concluída.' }],
        usage: { output_tokens: 8 },
        stopReason: 'end_turn',
      };
    },
  };
  const f = await fixture(t, { autoRun: true, providers: { claude: provider } });
  const job = await f.service.invoke(
    'analysis_submit',
    f.params({
      task: 'translate-analysis',
      budgets: { maxSteps: 1, maxRounds: 2, maxOutputTokens: 64 },
    }),
  );
  const paused = await waitJob(f.service, job.id);
  assert.equal(paused.job.status, 'blocked');
  assert.equal(paused.job.error.code, 'OUTPUT_BUDGET');
  assert.equal(paused.job.partialResponse, 'Tradução parcial preservada.');
  assert.equal(paused.candidates.length, 1);
  // Simulate a stop after the owner persisted the tool result but before the
  // runner persisted its matching tool_result. Resume must recover that receipt.
  await f.service.store.transact(projectId, (state) => {
    const checkpoint = state.jobs[job.id].attempts[0].checkpoint;
    checkpoint.phase = 'tool-pending';
    checkpoint.messages = checkpoint.messages.slice(0, 2);
    checkpoint.calls = [];
    checkpoint.pendingCall = {
      id: 'saved-create',
      name: 'studio_candidate_create',
      signature: JSON.stringify(['studio_candidate_create', { raw: 'a' }]),
    };
  });
  await f.service.close();
  const next = f.create();
  await next.start();
  assert.equal(requests, 2, 'a restart does not automatically consume provider usage');
  const resume = {
    projectId,
    jobId: job.id,
    operationId: 'resume:budget',
    instruction: 'Continue em espanhol.',
  };
  await next.invoke('analysis_resume', resume);
  await next.invoke('analysis_resume', resume);
  const done = await waitJob(next, job.id);
  assert.equal(done.job.status, 'ready-for-review');
  assert.equal(done.job.attempts.length, 2);
  assert.equal(done.candidates.length, 1, 'candidate creation was not replayed');
  assert.equal(done.candidates[0].id, paused.candidates[0].id);
  assert.equal(done.job.input.digest, job.input.digest);
  assert.equal(done.job.attempts[1].checkpoint.usage.output_tokens, 8);
  assert.equal(done.job.partialResponse, undefined);
  await assert.rejects(next.invoke('analysis_resume', { ...resume, instruction: 'Changed' }), {
    code: 'OPERATION_CONFLICT',
  });
});

test('needs-input resumes the same conversation with optional guidance and retains prior questions', async (t) => {
  let requests = 0;
  const f = await fixture(t, {
    autoRun: true,
    runner: async (options) => {
      requests++;
      if (requests === 1) {
        await options.callTool(
          'studio_question',
          { question: 'Qual acepção?' },
          { operationId: 'question' },
        );
        await options.onCheckpoint({
          version: 1,
          provider: 'claude',
          inputDigest: options.input.digest,
          phase: 'completed',
          messages: [{ role: 'assistant', content: 'Qual acepção?' }],
          calls: [],
          round: 1,
          steps: 1,
          usage: {},
        });
        return { text: 'Aguardando uma escolha.' };
      }
      assert.equal(options.checkpoint.phase, 'completed');
      assert.equal(options.continuation.context.previousQuestions[0].text, 'Qual acepção?');
      assert.equal(options.continuation.context.instruction, 'A segunda acepção.');
      return { text: 'Segunda acepção registrada.' };
    },
  });
  const job = await f.service.invoke('analysis_submit', f.params({ task: 'translate-source' }));
  const paused = await waitJob(f.service, job.id);
  assert.equal(paused.job.status, 'needs-input');
  await f.service.invoke('analysis_resume', {
    projectId,
    jobId: job.id,
    operationId: 'resume:question',
    instruction: 'A segunda acepção.',
  });
  const done = await waitJob(f.service, job.id);
  assert.equal(done.job.status, 'ready-for-review');
  assert.equal(done.job.conversationId, job.conversationId);
  assert.equal(done.job.input.digest, job.input.digest);
  assert.deepEqual(done.job.questions, []);
  assert.equal(done.job.attempts[0].questions[0].text, 'Qual acepção?');
  assert.equal(done.job.attempts[1].instruction, 'A segunda acepção.');
});

test('resume rejects changed source context without queuing or spending provider usage', async (t) => {
  let requests = 0;
  const f = await fixture(t, {
    autoRun: true,
    runner: async () => {
      requests++;
      throw Object.assign(new Error('Pause'), { code: 'ROUND_BUDGET' });
    },
  });
  const job = await f.service.invoke('analysis_submit', f.params());
  await waitJob(f.service, job.id);
  f.setProject({ ...f.project(), engineFingerprint: 'engine:changed' });
  await assert.rejects(
    f.service.invoke('analysis_resume', { projectId, jobId: job.id, operationId: 'resume:stale' }),
    { code: 'STALE_ENGINE' },
  );
  assert.equal(requests, 1);
  const saved = await f.service.invoke('analysis_get', { projectId, jobId: job.id });
  assert.equal(saved.job.status, 'blocked');
  assert.equal(saved.job.attempts.length, 1);
});

test('cancellation stops new and late tool work while retaining earlier scratch candidate', async (t) => {
  const started = deferred(),
    ending = deferred();
  let captured;
  const f = await fixture(t, {
    autoRun: true,
    runner: async (options) => {
      captured = options;
      await options.callTool(
        'studio_candidate_create',
        { raw: 'a' },
        { operationId: 'before-cancel' },
      );
      started.resolve();
      await new Promise((resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        }),
      );
      return ending.promise;
    },
  });
  const job = await f.service.invoke('analysis_submit', f.params());
  await waitStarted(f.service, job.id, started.promise);
  const cancelled = await f.service.invoke('analysis_cancel', {
    projectId,
    jobId: job.id,
    operationId: 'cancel:one',
  });
  assert.equal(cancelled.status, 'cancelling');
  const done = await waitJob(f.service, job.id);
  assert.equal(done.job.status, 'cancelled');
  assert.equal(done.candidates.length, 1);
  await assert.rejects(
    captured.callTool('studio_candidate_create', { raw: 'b' }, { operationId: 'late' }),
    { code: 'STALE_ATTEMPT' },
  );
  await assert.rejects(captured.onEvent({ type: 'text-delta', text: 'late' }), {
    code: 'STALE_ATTEMPT',
  });
  assert.equal(
    (await f.service.invoke('analysis_get', { projectId, jobId: job.id })).candidates.length,
    1,
  );
});

test('batch keeps each failure separate, blocks unavailable provider and never shares queued guesses as reviewed context', async (t) => {
  const f = await fixture(t, {
    autoRun: true,
    runner: async () => {
      throw Object.assign(new Error('fixture provider unavailable'), { code: 'PROVIDER_AUTH' });
    },
  });
  const envelope = await f.draftStore.load(projectId);
  envelope.drafts['pending:two'] = {
    ...draft('pending:two'),
    pending: { sourceId, ordinal: 3, previousPassageId: passageId },
    normalized: '',
  };
  await f.draftStore.saveChecked(envelope);
  const result = await f.service.invoke('analysis_submit_batch', {
    projectId,
    items: [
      f.params(),
      f.params({ passageId: 'pending:two', operationId: 'submit:two' }),
      f.params({ passageId: 'missing', operationId: 'submit:missing' }),
    ],
  });
  assert.equal(result.jobs.length, 2);
  assert.equal(result.errors.length, 1);
  for (const job of result.jobs) {
    const done = await waitJob(f.service, job.id);
    assert.equal(done.job.status, 'blocked');
    assert.equal(done.job.attempts.length, 1);
    assert(done.job.input.context.every((p) => p.reviewStatus === 'legacy-surface-only'));
    assert(done.job.input.context.every((p) => p.raw === undefined));
    assert(!done.job.input.context.some((p) => p.id.startsWith('pending:')));
  }
});

test('changed engine blocks tool execution before candidate mutation and damaged input remains recoverable', async (t) => {
  const started = deferred(),
    proceed = deferred();
  const f = await fixture(t, {
    autoRun: true,
    runner: async ({ callTool }) => {
      started.resolve();
      await proceed.promise;
      await callTool('studio_candidate_create', { raw: 'a' }, { operationId: 'after-change' });
      return { text: 'never' };
    },
  });
  const job = await f.service.invoke('analysis_submit', f.params());
  await waitStarted(f.service, job.id, started.promise);
  f.setProject({ ...f.project(), engineFingerprint: 'engine:changed' });
  proceed.resolve();
  const done = await waitJob(f.service, job.id);
  assert.equal(done.job.status, 'blocked');
  assert.equal(done.job.error.code, 'STALE_ENGINE');
  assert.equal(done.candidates.length, 0);
  const filename = f.service.store.filename(projectId),
    bytes = await fs.readFile(filename, 'utf8'),
    value = JSON.parse(bytes);
  value.jobs[job.id].input.diplomatic = 'tampered';
  await fs.writeFile(filename, JSON.stringify(value));
  const corrupted = await fs.readFile(filename, 'utf8');
  await assert.rejects(
    new AnalysisStore(path.dirname(filename)).read(projectId),
    /pacote de entrada/,
  );
  assert.equal(await fs.readFile(filename, 'utf8'), corrupted);
});

test('evidence or human input changed during capture creates no job and preserves the new saved state', async (t) => {
  const f = await fixture(t);
  f.setRequestHook(async (method) => {
    if (method === 'dictionary_lookup') f.setEvidence({ ...f.evidence(), revision: 5 });
  });
  await assert.rejects(f.service.invoke('analysis_submit', f.params()), {
    code: 'EVIDENCE_CONFLICT',
  });
  assert.equal((await f.service.invoke('analysis_list', { projectId })).jobs.length, 0);
  f.setRequestHook(async (method) => {
    if (method !== 'dictionary_lookup') return;
    const envelope = await f.draftStore.load(projectId);
    envelope.drafts[passageId].revisionId = 'human:capture-race';
    envelope.drafts[passageId].notes = 'Do not overwrite this input';
    await f.draftStore.saveChecked(envelope);
  });
  await assert.rejects(
    f.service.invoke(
      'analysis_submit',
      f.params({ operationId: 'race:draft', evidenceRevision: 5 }),
    ),
    { code: 'DRAFT_CONFLICT' },
  );
  assert.equal((await f.service.invoke('analysis_list', { projectId })).jobs.length, 0);
  assert.equal(
    (await f.draftStore.load(projectId)).drafts[passageId].notes,
    'Do not overwrite this input',
  );
});

test('feedback snapshots the selected candidate revision and preserves prior alternatives', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const first = await f.service.invoke('analysis_submit', f.params());
  const done = await waitJob(f.service, first.id),
    candidate = done.candidates[0];
  const params = f.params({
    operationId: 'feedback:one',
    task: 'revise',
    description: 'Este constituinte é o objeto.',
    parentJobId: first.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    feedbackNode: {
      candidateId: candidate.id,
      candidateRevision: candidate.revisionId,
      nodeId: candidate.tree.id,
    },
  });
  const next = await f.service.invoke('analysis_submit', params);
  assert.equal(next.input.feedback.candidate.raw, 'a.var(1)');
  assert.equal(next.input.feedback.candidate.revisionId, candidate.revisionId);
  assert.equal(next.input.feedback.node.nodeId, candidate.tree.id);
  assert.equal(
    (await f.service.invoke('analysis_get', { projectId, jobId: first.id })).candidates[0]
      .revisionId,
    candidate.revisionId,
  );
  await assert.rejects(
    f.service.invoke('analysis_submit', {
      ...params,
      operationId: 'feedback:stale',
      candidateRevision: 'stale',
    }),
    { code: 'STALE_CANDIDATE' },
  );
  await assert.rejects(
    f.service.invoke('analysis_submit', {
      ...params,
      operationId: 'feedback:node',
      feedbackNode: { ...params.feedbackNode, nodeId: 'missing' },
    }),
    { code: 'STALE_NODE' },
  );
  const revised = await waitJob(f.service, next.id);
  assert.equal(revised.job.status, 'ready-for-review');
  assert.notEqual(revised.candidates[0].id, candidate.id);
});

test('acceptance receipt survives interrupted analysis mirror and retry does not apply twice', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const submitted = await f.service.invoke('analysis_submit', f.params()),
    done = await waitJob(f.service, submitted.id),
    candidate = done.candidates[0];
  const accept = {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:interrupted',
  };
  const transact = f.service.store.transact.bind(f.service.store);
  f.service.store.transact = (project, update) =>
    transact(project, async (state) => {
      const before = state.decisions.length;
      const result = await update(state);
      if (state.decisions.length > before) throw new Error('simulated mirror interruption');
      return result;
    });
  await assert.rejects(f.service.invoke('analysis_accept', accept), /mirror interruption/);
  const committed = await f.draftStore.load(projectId);
  assert.equal(committed.drafts[passageId].raw, candidate.raw);
  assert.equal(committed.drafts[passageId].aiAcceptances.length, 1);
  f.service.store.transact = transact;
  const retried = await f.service.invoke('analysis_accept', accept);
  assert.equal(retried.draft.revisionId, committed.drafts[passageId].revisionId);
  assert.equal(retried.draft.aiAcceptances.length, 1);
  assert.equal((await f.service.store.read(projectId)).decisions.length, 1);
});

test('publishing a pending passage preserves its conversation and candidates without rewriting frozen input', async (t) => {
  const f = await fixture(t, { autoRun: true, runner: candidateRunner });
  const pendingId = 'pending:published-later',
    publishedId = 'passage:published-later';
  const envelope = await f.draftStore.load(projectId);
  envelope.drafts[pendingId] = {
    ...draft(pendingId),
    pending: { sourceId, ordinal: 3, previousPassageId: passageId },
  };
  await f.draftStore.saveChecked(envelope);
  const submitted = await f.service.invoke('analysis_submit', f.params({ passageId: pendingId }));
  const done = await waitJob(f.service, submitted.id);
  const candidate = done.candidates[0];
  await f.service.invoke('analysis_composer', {
    projectId,
    passageId: pendingId,
    text: 'Feedback preservado',
    selectedCandidateId: candidate.id,
  });
  const acceptance = {
    projectId,
    jobId: submitted.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revisionId,
    expectedDraftRevision: 'revision:one',
    operationId: 'accept:before-publish',
  };
  const accepted = await f.service.invoke('analysis_accept', acceptance);
  const frozen = structuredClone(done.job.input);
  const saved = await f.draftStore.load(projectId);
  saved.drafts[publishedId] = {
    ...saved.drafts[pendingId],
    passageId: publishedId,
    sourceFingerprint: 'source:published',
    revisionId: 'human:after-publication',
    raw: 'a.var(2)',
  };
  delete saved.drafts[publishedId].pending;
  delete saved.drafts[pendingId];
  await f.draftStore.saveChecked(saved);
  f.setProject({
    ...f.project(),
    passages: [
      ...f.project().passages,
      {
        ...f.project().passages[0],
        id: publishedId,
        ordinal: 3,
        sourceFingerprint: 'source:published',
      },
    ],
  });
  const listed = await f.service.invoke('analysis_list', { projectId, passageId: publishedId });
  assert.equal(listed.jobs.length, 1);
  assert.equal(listed.jobs[0].passageId, publishedId);
  assert.equal(listed.conversations[0].composer, 'Feedback preservado');
  const details = await f.service.invoke('analysis_get', { projectId, jobId: submitted.id });
  assert.equal(details.conversation.passageId, publishedId);
  assert.equal(details.candidates[0].passageId, publishedId);
  assert.deepEqual(details.job.input, frozen);
  const updated = await f.service.invoke('analysis_composer', {
    projectId,
    passageId: publishedId,
    text: 'Continuar após publicar',
    selectedCandidateId: candidate.id,
    expectedRevision: details.conversation.revision,
  });
  assert.equal(updated.id, done.conversation.id);
  const beforeReplay = await f.draftStore.load(projectId);
  await f.service.store.transact(projectId, (state) => {
    state.decisions = [];
  });
  const replayed = await f.service.invoke('analysis_accept', acceptance);
  assert.equal(replayed.draft.passageId, publishedId);
  assert.equal(replayed.draft.raw, 'a.var(2)', 'receipt replay must not reapply the old candidate');
  assert.equal(replayed.envelope.storageRevision, beforeReplay.storageRevision);
  assert.deepEqual(replayed.decision, accepted.decision);
  assert.equal((await f.service.store.read(projectId)).decisions.length, 1);
  await assert.rejects(
    f.service.invoke('analysis_accept', {
      ...acceptance,
      candidateRevision: 'different-revision',
    }),
    { code: 'OPERATION_CONFLICT' },
  );
  const feedback = await f.service.invoke(
    'analysis_submit',
    f.params({
      passageId: publishedId,
      revisionId: 'human:after-publication',
      operationId: 'feedback:published',
      parentJobId: submitted.id,
      candidateId: candidate.id,
      candidateRevision: candidate.revisionId,
      task: 'revise',
    }),
  );
  await waitJob(f.service, feedback.id);
  const persisted = await f.service.store.read(projectId);
  assert.equal(Object.keys(persisted.conversations).length, 1);
  assert.equal(feedback.conversationId, submitted.conversationId);
  assert.deepEqual(persisted.jobs[submitted.id].input, frozen);
  assert.equal(persisted.jobs[submitted.id].passageId, pendingId);
  await assert.rejects(
    f.service.invoke('analysis_accept', {
      projectId,
      jobId: submitted.id,
      candidateId: candidate.id,
      candidateRevision: candidate.revisionId,
      expectedDraftRevision: 'revision:one',
      operationId: 'accept:after-publish',
    }),
    { code: 'DRAFT_CONFLICT' },
  );
  const reopened = await f.service.invoke('analysis_accept', {
    ...acceptance,
    expectedDraftRevision: 'human:after-publication',
    operationId: 'accept:reopen-after-publish',
  });
  assert.equal(reopened.draft.passageId, publishedId);
  assert.equal(reopened.draft.pending, undefined);
  assert.equal(reopened.draft.raw, candidate.raw);
  assert.equal(reopened.decision.revalidation.sourceFingerprint, 'source:published');
  assert.equal(
    f.requests.filter((item) => item.method === 'evaluate_expression').at(-1).params.passageId,
    publishedId,
  );
});

test('replaying an acknowledged cancellation cannot cancel a later retry', async (t) => {
  const started = [deferred(), deferred()];
  let invocation = 0;
  const f = await fixture(t, {
    autoRun: true,
    runner: async ({ signal }) => {
      started[invocation++].resolve();
      await new Promise((resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
  });
  const job = await f.service.invoke('analysis_submit', f.params());
  await waitStarted(f.service, job.id, started[0].promise);
  const cancel = { projectId, jobId: job.id, operationId: 'cancel:durable' };
  await f.service.invoke('analysis_cancel', cancel);
  await waitJob(f.service, job.id);
  await f.service.invoke('analysis_retry', {
    projectId,
    jobId: job.id,
    operationId: 'retry:durable',
  });
  await waitStarted(f.service, job.id, started[1].promise);
  await f.service.invoke('analysis_cancel', cancel);
  const current = await f.service.invoke('analysis_get', { projectId, jobId: job.id });
  assert.equal(current.job.status, 'running');
  assert.equal(current.job.attempts.length, 2);
  const state = await f.service.store.read(projectId);
  assert.equal(state.operations['cancel:cancel:durable'].attemptId, current.job.attempts[0].id);
  const other = await f.service.invoke(
    'analysis_submit',
    f.params({ operationId: 'submit:other' }),
  );
  await assert.rejects(f.service.invoke('analysis_cancel', { ...cancel, jobId: other.id }), {
    code: 'OPERATION_CONFLICT',
  });
  await f.service.invoke('analysis_cancel', { ...cancel, operationId: 'cancel:second' });
  await waitJob(f.service, job.id);
  await f.service.invoke('analysis_cancel', {
    ...cancel,
    jobId: other.id,
    operationId: 'cancel:other',
  });
});

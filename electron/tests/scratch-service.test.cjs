'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createScratchService, comparison, tools } = require('../scratch-service.cjs');
const { loadSharedAuthoring } = require('../shared-authoring.cjs');
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
function fixture(options = {}) {
  const project = {
    id: 'project',
    engineFingerprint: 'engine',
    passages: [{ id: 'passage', sourceId: 'source', sourceFingerprint: 'source-hash' }],
  };
  const job = {
    id: 'job',
    status: 'running',
    input: {
      projectId: 'project',
      passageId: 'passage',
      sourceId: 'source',
      sourceFingerprint: 'source-hash',
      engineFingerprint: 'engine',
      raw: 'a',
      diplomatic: 'a',
      tentativeReading: 'A',
      reviewedTarget: 'a',
      manifest: {},
      context: [],
    },
  };
  const candidates = new Map(),
    events = [],
    requests = [];
  const service = createScratchService({
    getJob: async () => job,
    getProject: async () => project,
    getCandidate: async (_, id) => candidates.get(id),
    saveCandidate: async (_, value, { expectedRevision }) => {
      assert.equal(candidates.get(value.id)?.revisionId ?? null, expectedRevision);
      candidates.set(value.id, structuredClone(value));
      return value;
    },
    request: async (method, params) => {
      requests.push({ method, params });
      assert.equal(params.projectId, 'project');
      assert.equal(params.engineFingerprint, 'engine');
      if (method === 'parse_expression') return parse(params.raw, params.revisionId);
      if (method === 'evaluate_expression')
        return {
          revisionId: params.revisionId,
          expression: params.raw,
          engineFingerprint: 'engine',
          surface: params.raw === 'a' ? 'a' : 'aba',
          annotated: 'a[ROOT]',
          morphemes: [{ text: 'a', tag: 'ROOT' }],
          tree: parse(params.raw, params.revisionId).root,
          evaluationStatus: params.raw.includes('__studio_slot_') ? 'partial' : 'complete',
        };
      if (method === 'dictionary_predicate')
        return {
          expression: "Noun(value='abá', definition='(s.) pessoa: exemplo completo.')",
          status: 'ready',
          entry: {
            entryIndex: params.entryIndex,
            datasetFingerprint: params.datasetFingerprint,
            headword: 'abá',
            definition: '(s.) pessoa: exemplo completo.',
          },
          constructor: 'Noun',
        };
      if (method === 'structure_search') return { results: [], total: 0 };
      if (method === 'predicate_catalog') return { constructors: [] };
      throw new Error('Unexpected worker method: ' + method);
    },
    getEvidence: async () => ({ regions: [] }),
    askQuestion: async (_, question) => question,
    recordTool: async (_, event) => events.push(event),
    ...options,
  });
  let operation = 0;
  return {
    service,
    job,
    project,
    candidates,
    events,
    requests,
    call: (name, args) => service.call('job', name, args, { operationId: 'op-' + ++operation }),
  };
}
test('candidate evaluation projects frozen notebook onto each current tree, excluding local occurrence notes on loose pieces and all notes during reconstruction', async () => {
  const calls = [];
  const f = fixture({
    projectInterpretations: async (notes, params) => {
      calls.push({ notes: structuredClone(notes), params });
      return { bindings: [{ preferredMeaning: 'scoped saved meaning' }], fingerprint: params.raw };
    },
  });
  f.job.interpretationNotes = [{ id: 'private-catalog', fields: { meaning: 'frozen' } }];
  f.job.input.canvas = {
    fragments: [{ id: 'loose', raw: 'b', x: 0, y: 0 }],
    positions: {},
    layout: 'bottom-up',
  };
  let candidate = await f.call('studio_candidate_create', {
    useInput: true,
  });
  candidate = await f.call('studio_candidate_evaluate', {
    candidateId: candidate.id,
    expectedRevision: candidate.revisionId,
  });
  assert.equal(
    candidate.evaluation.interpretationContext.bindings[0].preferredMeaning,
    'scoped saved meaning',
  );
  assert.equal(calls[0].notes[0].fields.meaning, 'frozen');
  assert.equal(calls[0].params.includeOccurrences, true);
  assert.equal(calls[1].params.includeOccurrences, false);
  assert.equal(calls[1].params.raw, 'b');
  assert.equal(calls[1].params.passageId, 'passage');
  f.job.input.manifest = { mode: 'reconstruction' };
  await f.call('studio_candidate_evaluate', {
    candidateId: candidate.id,
    expectedRevision: candidate.revisionId,
  });
  assert.equal(calls.length, 2);
});
test('shared canvas edits round-trip raw, operations, scalar arguments, loose pieces, holes and stale nodes', async () => {
  const f = fixture();
  let c = await f.call('studio_candidate_create', { raw: 'a * b' });
  assert.equal(c.tree.kind, 'binary');
  const initial = c;
  const left = { nodeId: c.tree.children[0].node.id, expectedRaw: c.raw };
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: { type: 'detach', source: left, fragmentId: 'loose' },
  });
  assert.match(c.raw, /__studio_slot_/);
  assert.equal(c.canvas.fragments[0].raw, 'a');
  await assert.rejects(
    f.call('studio_candidate_edit', {
      candidateId: c.id,
      expectedRevision: initial.revisionId,
      action: { type: 'remove', source: left },
    }),
    { code: 'STALE_CANDIDATE' },
  );
  await assert.rejects(
    f.call('studio_candidate_edit', {
      candidateId: c.id,
      expectedRevision: c.revisionId,
      action: { type: 'remove', source: left },
    }),
    /estrutura mudou/,
  );
  const hole = c.tree.children[0].node;
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: {
      type: 'connect',
      source: { fragmentId: 'loose', nodeId: 'root', expectedRaw: 'a' },
      target: { nodeId: hole.id, expectedRaw: c.raw },
    },
  });
  assert.equal(c.canvas.fragments.length, 0);
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: {
      type: 'operation',
      source: { nodeId: 'root', expectedRaw: c.raw },
      operation: 'var',
      argument: '1',
    },
  });
  assert.match(c.raw, /\.var\(1\)/);
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: {
      type: 'argument',
      source: { nodeId: 'root', expectedRaw: c.raw },
      slot: 'arg0',
      text: '2,5',
    },
  });
  assert.match(c.raw, /\.var\(2.5\)/);
  const duplicate = {
    type: 'duplicate',
    source: { nodeId: 'root', expectedRaw: c.raw },
    fragmentId: 'copy',
  };
  const expected = loadSharedAuthoring().editCanvas(
    { raw: c.raw, canvas: c.canvas, roots: { main: c.tree } },
    duplicate,
  );
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: duplicate,
  });
  assert.deepEqual(c.canvas, expected.canvas);
  assert.equal(c.raw, expected.raw);
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: { type: 'raw', raw: 'a * (' },
  });
  assert.equal(c.raw, 'a * (');
  assert.equal(c.tree, null);
  assert.equal(f.candidates.get(c.id).raw, 'a * (');
});
test('dictionary insertion keeps complete nonverbal sense identity and evaluated proposals stay hypotheses', async () => {
  const f = fixture();
  let c = await f.call('studio_candidate_create', {});
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: { type: 'dictionary', entryIndex: 42, datasetFingerprint: 'sha256:' + 'a'.repeat(64) },
  });
  assert.equal(c.evidence[0].entry.entryIndex, 42);
  assert.match(c.evidence[0].entry.definition, /exemplo completo/);
  await assert.rejects(
    f.call('studio_candidate_propose', {
      candidateId: c.id,
      expectedRevision: c.revisionId,
      rationale: 'Dictionary evidence.',
      uncertainties: [],
    }),
    { code: 'EVALUATION_REQUIRED' },
  );
  c = await f.call('studio_candidate_evaluate', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
  });
  assert.equal(c.evaluation.expression, c.raw);
  assert.equal(c.evaluation.revisionId, c.revisionId);
  await assert.rejects(
    f.call('studio_candidate_propose', {
      candidateId: c.id,
      expectedRevision: c.revisionId,
      rationale: 'Dictionary evidence.',
      uncertainties: [],
    }),
    (error) => error.code === 'TRANSLATION_REQUIRED' && /translation:/.test(error.message),
  );
  c = await f.call('studio_candidate_propose', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    rationale: 'Dictionary evidence.',
    uncertainties: ['Role not established.'],
    translation: { text: ' Pessoa. ', uncertainties: ['Papel sintático incerto.'] },
  });
  assert.equal(c.status, 'proposed');
  assert.equal(c.linguisticStatus, 'hypothesis-for-human-review');
  assert.equal(f.candidates.get(c.id).tree.kind, 'call');
  assert.equal(c.evidence[0].binding, 'current');
  assert.deepEqual(c.translation, {
    text: 'Pessoa.',
    uncertainties: ['Papel sintático incerto.'],
    language: 'pt',
    status: 'tentative',
    revisionId: c.revisionId,
    expression: c.raw,
    engineFingerprint: 'engine',
    evaluatedSurface: 'aba',
  });
  assert.deepEqual(
    (await f.call('studio_candidate_get', { candidateId: c.id, view: 'evaluation' })).translation,
    c.translation,
  );
  c = await f.call('studio_candidate_edit', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    action: { type: 'raw', raw: "Noun(value='unrelated')" },
  });
  assert.equal(c.evidence[0].binding, 'historical');
  assert.equal(c.translation, undefined, 'an edited expression cannot retain a stale translation');
  assert.equal(c.evaluation, undefined);
  assert.equal(c.evidence[0].entry.entryIndex, 42, 'the research trail remains preserved');
});
test('partial proposals remain available but cannot claim a complete translation', async () => {
  const f = fixture();
  let c = await f.call('studio_candidate_create', { raw: 'a * __studio_slot_1' });
  c = await f.call('studio_candidate_evaluate', {
    candidateId: c.id,
    expectedRevision: c.revisionId,
  });
  const args = {
    candidateId: c.id,
    expectedRevision: c.revisionId,
    rationale: 'Ligação incompleta.',
    uncertainties: ['Falta uma peça.'],
  };
  await assert.rejects(
    f.call('studio_candidate_propose', {
      ...args,
      translation: { text: 'Tradução sem sustentação.', uncertainties: [] },
    }),
    { code: 'TRANSLATION_UNAVAILABLE' },
  );
  c = await f.call('studio_candidate_propose', args);
  assert.equal(c.status, 'proposed');
  assert.equal(c.translation, undefined);
});
test('bounded schemas and strict allowlist exclude owner writes and arbitrary paths', async () => {
  const f = fixture();
  assert.ok(!tools.some((t) => /source_apply|reference_approve|lexicon_update/.test(t.name)));
  await assert.rejects(f.call('source_apply', {}), { code: 'UNKNOWN_TOOL' });
  await assert.rejects(f.call('studio_evidence', { path: '/etc/passwd' }), {
    code: 'INVALID_ARGUMENTS',
  });
  await assert.rejects(f.call('studio_candidate_create', { raw: 'a'.repeat(100001) }), {
    code: 'INVALID_ARGUMENTS',
  });
  await assert.rejects(
    f.call('studio_candidate_edit', {
      candidateId: 'x',
      expectedRevision: 'r',
      action: { type: 'exec', command: 'anything' },
    }),
    { code: 'INVALID_ARGUMENTS' },
  );
  assert.equal(f.requests.length, 0);
});
test('captured fingerprints and cancelled jobs invalidate tools before a scratch commit', async () => {
  const f = fixture();
  f.project.engineFingerprint = 'changed';
  await assert.rejects(f.call('studio_candidate_create', {}), { code: 'STALE_ENGINE' });
  f.project.engineFingerprint = 'engine';
  f.project.passages[0].sourceFingerprint = 'changed';
  await assert.rejects(f.call('studio_candidate_create', {}), { code: 'STALE_SOURCE' });
  f.project.passages[0].sourceFingerprint = 'source-hash';
  f.job.status = 'cancelled';
  await assert.rejects(f.call('studio_candidate_create', {}), { code: 'JOB_INACTIVE' });
  assert.equal(f.candidates.size, 0);
});
test('reconstruction excludes own raw and reuse derivatives, and cannot expand arbitrary lexical helpers', async () => {
  const f = fixture();
  f.job.input.manifest = { mode: 'reconstruction', excludeLexicalNames: ['answer'] };
  f.job.input.evaluation = { expression: 'SECRET_ANSWER' };
  f.job.input.feedback = { candidate: { raw: 'SECRET_ANSWER' } };
  f.job.input.conversation = [{ text: 'SECRET_ANSWER' }];
  f.job.input.context = [
    { passageId: 'passage', raw: 'hidden' },
    { passageId: 'prior', raw: 'reviewed' },
  ];
  const result = await f.call('studio_context', {});
  assert.ok(!JSON.stringify(result).includes('SECRET_ANSWER'));
  assert.equal(result.input.raw, '');
  assert.deepEqual(
    result.input.context.map((c) => c.passageId),
    ['prior'],
  );
  await assert.rejects(f.call('studio_candidate_create', { useInput: true }), {
    code: 'REFERENCE_WITHHELD',
  });
  await assert.rejects(f.call('studio_lexicon_inspect', { name: 'answer' }), {
    code: 'REFERENCE_WITHHELD',
  });
  await f.call('studio_reuse_search', { query: 'abá' });
  assert.deepEqual(f.requests.at(-1).params.excludePassageIds, ['passage']);
  assert.deepEqual(f.requests.at(-1).params.excludeLexicalNames, ['answer']);
});
test('feedback branches only the exact frozen previous candidate and keeps dictionary evidence', async () => {
  const f = fixture();
  f.job.input.feedback = {
    candidate: {
      id: 'old-candidate',
      jobId: 'old-job',
      revisionId: 'frozen-revision',
      raw: 'a',
      canvas: { fragments: [], positions: {} },
      evidence: [
        {
          kind: 'dictionary',
          entry: { entryIndex: 42, datasetFingerprint: 'sha256:' + 'a'.repeat(64) },
        },
      ],
      status: 'proposed',
      evaluation: { surface: 'a' },
    },
  };
  const result = await f.call('studio_candidate_create', { fromCandidateId: 'old-candidate' });
  assert.equal(result.raw, 'a');
  assert.equal(result.evidence[0].entry.entryIndex, 42);
  assert.notEqual(result.id, 'old-candidate');
  assert.notEqual(result.revisionId, 'frozen-revision');
  assert.equal(result.status, 'scratch');
  assert.equal(result.evaluation, undefined);
  assert.equal(f.job.input.feedback.candidate.status, 'proposed');
  await assert.rejects(
    f.call('studio_candidate_create', { fromCandidateId: 'unrelated-old-candidate' }),
    { code: 'CANDIDATE_NOT_FOUND' },
  );
});
test('dictionary tools enforce frozen input identity before conversion', async () => {
  const f = fixture();
  f.job.input.manifest.dictionary = {
    dataset: 'navarro-website',
    fingerprint: 'sha256:' + 'a'.repeat(64),
  };
  let c = await f.call('studio_candidate_create', {});
  await assert.rejects(
    f.call('studio_candidate_edit', {
      candidateId: c.id,
      expectedRevision: c.revisionId,
      action: {
        type: 'dictionary',
        entryIndex: 42,
        datasetFingerprint: 'sha256:' + 'b'.repeat(64),
      },
    }),
    { code: 'STALE_DICTIONARY' },
  );
  assert.equal(f.candidates.get(c.id).raw, '');
});
test('spacing/case and diacritics remain independent comparisons with preserved spelling', () => {
  assert.deepEqual(comparison('Ã b', 'ab'), {
    version: 1,
    actual: 'Ã b',
    expected: 'ab',
    exact: false,
    spacingCase: false,
    accentFolded: true,
  });
  assert.equal(comparison('a’', "a'").accentFolded, false);
  assert.equal(comparison('A b', 'ab').spacingCase, true);
});
module.exports = { fixture };

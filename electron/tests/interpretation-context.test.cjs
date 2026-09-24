'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  freezeInterpretationNotes,
  interpretationContext,
} = require('../interpretation-context.cjs');

const entry = {
  id: 'lexical:want',
  name: 'potar',
  kind: 'predicate',
  expression: 'potar',
  definition: 'want (dictionary sense)',
};
const occurrence = {
  id: 'old:first',
  lexicalId: entry.id,
  noteOccurrenceId: 'stable:first',
  nodeFingerprint: 'node:want',
  sourceNodeId: 'root/left',
  expression: 'potar',
  start: 0,
  end: 5,
};
const inventory = {
  version: 1,
  expressionFingerprint: 'expression:new',
  revisionId: 'revision:new',
  engineFingerprint: 'engine:one',
  entries: [entry],
  occurrences: [
    occurrence,
    {
      ...occurrence,
      id: 'old:second',
      noteOccurrenceId: 'stable:second',
      sourceNodeId: 'root/right',
      start: 8,
      end: 13,
    },
  ],
};
const options = { sourceId: 'araujo', passageId: 'passage:one' };
function note(scope = 'entry', overrides = {}) {
  return {
    id: 'note:' + scope,
    version: 3,
    scope,
    lexicalId: entry.id,
    sourceId: options.sourceId,
    passageId: options.passageId,
    occurrenceId: occurrence.noteOccurrenceId,
    nodeFingerprint: occurrence.nodeFingerprint,
    revisionId: 'revision:old',
    expressionFingerprint: 'expression:old',
    fields: {
      meaning: scope === 'entry' ? 'general desire' : 'desire in this passage',
      grammar: 'stative reading',
      note: 'tentative contributor interpretation',
    },
    updatedAt: '2026-09-20T00:00:00Z',
    provenance: {
      definition: entry.definition,
      expression: entry.expression,
      sourcePath: '/private/local/path',
    },
    history: [{ fields: { meaning: 'HISTORICAL_SECRET' } }],
    ...overrides,
  };
}

test('current scoped notes preserve dictionary provenance and distinguish repeated occurrences after sibling edits', () => {
  const records = [
    note(),
    note('occurrence'),
    note('occurrence', {
      id: 'other-passage',
      passageId: 'passage:other',
      fields: { meaning: 'UNRELATED_SECRET' },
    }),
    note('entry', { lexicalId: 'different-sense', fields: { meaning: 'OTHER_SENSE_SECRET' } }),
  ];
  const result = interpretationContext(freezeInterpretationNotes(records), inventory, options);
  assert.equal(result.bindings.length, 2);
  assert.equal(result.bindings[0].preferredMeaning, 'desire in this passage');
  assert.equal(result.bindings[0].meaningSource, 'occurrence-interpretation');
  assert.equal(result.bindings[1].preferredMeaning, 'general desire');
  assert.equal(result.bindings[1].occurrence, null);
  assert.equal(result.bindings[0].originalDefinition, entry.definition);
  assert.equal(result.bindings[0].occurrence.version, 3);
  assert.equal(result.bindings[0].occurrence.provenance.originalDefinition, entry.definition);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|private\/local/);
  assert.equal(
    interpretationContext(records, inventory, { ...options, passageId: 'pending:one' }).fingerprint,
    result.fingerprint,
  );
});

test('explicit source meanings outrank generic notes while conflicting local interpretations stay visibly separate', () => {
  const defined = {
    ...inventory,
    occurrences: [
      {
        ...occurrence,
        hasDefinitionOverride: true,
        compositeDefinition: 'meaning explicitly in source',
      },
    ],
  };
  const generic = interpretationContext([note()], defined, options).bindings[0];
  assert.equal(generic.preferredMeaning, 'meaning explicitly in source');
  assert.equal(generic.meaningSource, 'source-definition');
  assert.equal(generic.general.fields.meaning, 'general desire');
  const local = interpretationContext([note(), note('occurrence')], defined, options).bindings[0];
  assert.equal(local.preferredMeaning, 'desire in this passage');
  assert.equal(local.explicitDefinition, 'meaning explicitly in source');
  assert.equal(local.originalDefinition, 'meaning explicitly in source');
});

test('changed nodes never inherit stale local notes; legacy notes require exact full expression and stable note wins', () => {
  const legacy = note('occurrence', {
    id: 'legacy',
    nodeFingerprint: undefined,
    occurrenceId: occurrence.id,
    expressionFingerprint: inventory.expressionFingerprint,
    fields: { meaning: 'legacy meaning' },
  });
  assert.equal(
    interpretationContext([legacy], inventory, options).bindings[0].preferredMeaning,
    'legacy meaning',
  );
  assert.equal(
    interpretationContext([legacy], { ...inventory, expressionFingerprint: 'changed' }, options)
      .bindings.length,
    0,
  );
  const stable = note('occurrence');
  assert.equal(
    interpretationContext([legacy, stable], inventory, options).bindings[0].occurrence.id,
    stable.id,
  );
  assert.equal(
    interpretationContext(
      [stable],
      { ...inventory, occurrences: [{ ...occurrence, nodeFingerprint: 'different-shape' }] },
      options,
    ).bindings.length,
    0,
  );
  assert.equal(
    interpretationContext([stable], inventory, { ...options, sourceId: 'other-source' }).bindings
      .length,
    0,
  );
  assert.equal(
    interpretationContext([stable], inventory, { ...options, includeOccurrences: false }).bindings
      .length,
    0,
  );
});

test('per-occurrence original primitive meaning survives shared construction IDs and missing realization never invents the explicit override', () => {
  const repeated = {
    ...inventory,
    occurrences: [
      {
        ...occurrence,
        hasDefinitionOverride: true,
        baseDefinition: 'explicit primitive meaning',
        inheritedDefinition: 'original primitive meaning',
      },
      { ...inventory.occurrences[1], baseDefinition: 'original primitive meaning' },
    ],
  };
  const result = interpretationContext([note()], repeated, options);
  assert.equal(result.bindings[0].preferredMeaning, 'explicit primitive meaning');
  assert.equal(result.bindings[0].originalDefinition, 'original primitive meaning');
  assert.equal(result.bindings[1].originalDefinition, 'original primitive meaning');
  assert.equal(result.bindings[1].preferredMeaning, 'general desire');
  const unavailable = interpretationContext(
    [note()],
    {
      ...inventory,
      occurrences: [{ ...occurrence, hasDefinitionOverride: true }],
      diagnostics: ['meaning unavailable in this realization'],
    },
    options,
  );
  assert.equal(unavailable.bindings[0].explicitDefinition, undefined);
  assert.equal(unavailable.bindings[0].preferredMeaning, null);
  assert.equal(unavailable.bindings[0].meaningSource, 'source-definition-unavailable');
  assert.equal(unavailable.bindings[0].sourceDefinitionUnavailable, true);
  assert.equal(unavailable.diagnostics.length, 2);
});

test('evidenced composite meaning is retained beneath a general interpretation without using incidental runtime definitions', () => {
  const composite = {
    ...inventory,
    occurrences: [
      {
        ...occurrence,
        compositeDefinition: 'meaning of the entire construction',
        definition: 'incidental runtime leaf',
      },
    ],
  };
  const result = interpretationContext(
    [note('entry', { fields: { grammar: 'grammatical nuance only' } })],
    composite,
    options,
  );
  assert.equal(result.bindings[0].originalDefinition, 'meaning of the entire construction');
  assert.equal(result.bindings[0].preferredMeaning, 'meaning of the entire construction');
  assert.equal(result.bindings[0].meaningSource, 'engine-definition');
  assert.doesNotMatch(JSON.stringify(result), /incidental runtime leaf/);
});

test('constituent context includes only selected syntax and proven dependency anchors', () => {
  const current = {
    ...inventory,
    occurrences: [
      ...inventory.occurrences,
      {
        ...occurrence,
        id: 'dependency',
        start: undefined,
        end: undefined,
        sourceNodeId: 'root/left/dependency',
      },
      { ...occurrence, id: 'uncertain-helper', certainty: 'candidate' },
    ],
  };
  const result = interpretationContext([note()], current, {
    ...options,
    scope: 'constituent',
    selectedNode: { id: 'root/left', start: 0, end: 5 },
  });
  assert.deepEqual(
    result.bindings.map((item) => item.occurrenceId),
    ['old:first', 'dependency'],
  );
  assert.equal(
    interpretationContext([note()], current, { ...options, scope: 'constituent' }).bindings.length,
    0,
  );
});

test('snapshot fingerprints bind versions, preserve frozen values and explicitly report bounded coverage', () => {
  const record = note(),
    saved = freezeInterpretationNotes([record]);
  record.fields.meaning = 'changed later';
  assert.equal(saved[0].fields.meaning, 'general desire');
  assert.equal(saved[0].history, undefined);
  const first = interpretationContext(saved, inventory, options);
  const changed = interpretationContext([{ ...saved[0], version: 4 }], inventory, options);
  assert.notEqual(first.fingerprint, changed.fingerprint);
  assert.equal(
    interpretationContext([...saved, note('entry', { lexicalId: 'unrelated' })], inventory, options)
      .fingerprint,
    first.fingerprint,
  );
  assert.deepEqual(
    freezeInterpretationNotes([
      note('entry', { fields: { meaning: '  ', grammar: '', note: '' } }),
    ]),
    [],
  );
  assert.throws(() => freezeInterpretationNotes(Array(10001).fill(record)), /inválido/);
  assert.throws(
    () =>
      freezeInterpretationNotes([
        note('entry', { fields: { meaning: 'x'.repeat(4 * 1024 * 1024) } }),
      ]),
    /4 MiB/,
  );
  const many = interpretationContext(
    saved,
    {
      ...inventory,
      occurrences: Array.from({ length: 220 }, (_, i) => ({ ...occurrence, id: 'node:' + i })),
    },
    options,
  );
  assert.equal(many.bindings.length, 200);
  assert.equal(many.truncated, true);
  assert.equal(many.diagnostics.length, 1);
});

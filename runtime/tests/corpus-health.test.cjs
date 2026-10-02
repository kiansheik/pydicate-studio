const test = require('node:test'),
  assert = require('node:assert/strict');
const { summarizeCorpus } = require('../corpus-health.cjs');
test('health separates divergences, runtime errors, unreviewed rows, pending drafts and observed morphemes', () => {
  const snapshot = {
    engineFingerprint: 'e',
    sources: {
      book: {
        rows: [
          { ordinal: 1, reference: 'x', surface: 'x', annotated: 'mo[CAUS]x[ROOT]' },
          { ordinal: 2, reference: 'y', surface: 'z', annotated: 'mo[CAUS]z[ROOT]' },
          { ordinal: 3, reference: null, surface: 'x', annotated: 'x[ROOT]' },
          { ordinal: 4, error: 'bad' },
        ],
      },
      broken: { error: 'import failed' },
    },
  };
  const project = {
    sources: [
      { id: 'book', title: 'Book' },
      { id: 'empty', title: 'Empty' },
    ],
    passages: [{ id: 'p2', sourceId: 'book', ordinal: 2 }],
  };
  const envelope = {
    drafts: {
      a: { pending: { sourceId: 'book' } },
      b: { pending: { sourceId: 'book' }, organization: { deleted: true } },
    },
  };
  const report = summarizeCorpus(snapshot, project, envelope, [
    {
      id: 'job',
      input: { task: 'grammar-repair' },
      status: 'failed',
      grammarVerification: { matches: true, comparison: { checked: 151 } },
    },
  ]);
  assert.deepEqual(report.totals, {
    sources: 3,
    lines: 4,
    divergent: 1,
    failures: 2,
    pending: 1,
    morphemes: 3,
  });
  assert.equal(report.sources[0].issues[0].passageId, 'p2');
  assert.equal(report.sources[0].unreviewed, 2);
  assert.equal(report.interruptedRepairs[0].verified, true);
});

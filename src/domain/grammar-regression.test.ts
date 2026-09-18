import { expect, it } from 'vitest';
import { compareGrammarSnapshots, type CorpusSnapshot } from './grammar-regression';

it('reports changed approved lines separately from baseline mismatches', () => {
  const before: CorpusSnapshot = {
    engineFingerprint: 'before',
    sources: {
      araujo: {
        rows: [
          { ordinal: 1, codeFingerprint: 'a', surface: 'old', reference: 'old' },
          { ordinal: 2, codeFingerprint: 'b', surface: 'baseline', reference: 'target' },
        ],
      },
    },
  };
  const after: CorpusSnapshot = {
    engineFingerprint: 'after',
    sources: {
      araujo: {
        rows: [
          { ordinal: 1, codeFingerprint: 'a', surface: 'new', reference: 'old' },
          { ordinal: 2, codeFingerprint: 'b', surface: 'baseline', reference: 'target' },
        ],
      },
    },
  };
  const result = compareGrammarSnapshots(before, after);
  expect(result.checked).toBe(2);
  expect(result.baselineIssues).toBe(1);
  expect(result.newReferenceIssues).toBe(1);
  expect(result.changed).toEqual([
    {
      source: 'araujo',
      ordinal: 1,
      before: 'old',
      after: 'new',
      approvedReferenceChanged: true,
      annotatedChanged: false,
    },
  ]);
  expect(result.sourceChanges).toEqual([]);
});

it('does not attribute edited source expressions to the grammar', () => {
  const before: CorpusSnapshot = {
    engineFingerprint: 'before',
    sources: { a: { rows: [{ ordinal: 1, codeFingerprint: 'old', surface: 'old' }] } },
  };
  const after: CorpusSnapshot = {
    engineFingerprint: 'after',
    sources: { a: { rows: [{ ordinal: 1, codeFingerprint: 'new', surface: 'new' }] } },
  };
  const result = compareGrammarSnapshots(before, after);
  expect(result.changed).toEqual([]);
  expect(result.sourceChanges).toEqual(['a:1']);
});

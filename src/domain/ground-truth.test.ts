import { describe, expect, it } from 'vitest';
import {
  approvalState,
  declaredTarget,
  targetConflicts,
  type ApprovalContext,
  type ReferenceStatus,
} from './ground-truth';
import type { RenderResult } from './types';
import { reviewKind } from '../components/SourceReviewContent';
import type { SourcePreview } from './authoring';

const status: ReferenceStatus = {
  record: { surface: "morerobîare'yma", status: 'approved' },
  recordPath: 'ground_truth/records/historic/araujo_catecismo_1686.jsonl',
  recordCount: 89,
  nextOrdinal: 90,
  canApproveSequentially: true,
};

const result = {
  surface: "morerobîare'yma",
  evaluationStatus: 'complete',
} as unknown as RenderResult;

function context(overrides: Partial<ApprovalContext> = {}): ApprovalContext {
  return {
    isNewPassage: false,
    status,
    changed: false,
    conflict: false,
    result,
    ready: true,
    ...overrides,
  };
}

describe('which reviews may approve a reference', () => {
  const base = { previewId: 'p', diff: 'd', sourceFingerprint: 'f' };
  // The same overlay reviews passages, lexicon entries and recoveries. Only a
  // passage review is a statement about this passage's reference.
  it('recognises a passage review', () => {
    expect(reviewKind({ ...base, passageId: 'passage:1' } as SourcePreview)).toBe('passage-update');
    expect(reviewKind({ ...base, newPassage: true } as SourcePreview)).toBe('passage-new');
  });

  it('recognises the reviews that must never approve', () => {
    expect(reviewKind({ ...base, kind: 'lexicon', name: 'oka' } as SourcePreview)).toBe('lexicon');
    expect(reviewKind({ ...base, name: 'oka' } as SourcePreview)).toBe('lexicon');
    expect(reviewKind({ ...base, kind: 'recovery' } as SourcePreview)).toBe('recovery');
    expect(reviewKind({ ...base, reviewSummary: { kind: 'lexicon' } } as SourcePreview)).toBe(
      'lexicon',
    );
  });

  it('leaves an unrecognised review out of the approving kinds', () => {
    expect(reviewKind(base as SourcePreview)).toBe('unknown');
  });
});

describe('when a reference may be approved', () => {
  it('records the reviewed form once every condition holds', () => {
    expect(approvalState(context())).toEqual({ ready: true, surface: "morerobîare'yma" });
  });

  it('refuses an unapplied draft, so the source is always published first', () => {
    const blocked = approvalState(context({ changed: true }));
    expect(blocked.ready).toBe(false);
    expect(blocked).toMatchObject({ code: 'UNAPPLIED_CHANGES' });
  });

  it('refuses a passage that is out of sequence and names the one to do first', () => {
    const blocked = approvalState(
      context({ status: { ...status, canApproveSequentially: false, nextOrdinal: 7 } }),
    );
    expect(blocked).toMatchObject({ ready: false, code: 'OUT_OF_SEQUENCE' });
    expect(blocked.ready === false && blocked.reason).toContain('0007');
  });

  it('never overwrites a declared human target that the form contradicts', () => {
    const declared = { ...status, record: { ...status.record!, normalized_target: 'outra forma' } };
    expect(declaredTarget(declared)).toBe('outra forma');
    expect(targetConflicts(declared, result)).toBe(true);
    expect(approvalState(context({ status: declared }))).toMatchObject({
      ready: false,
      code: 'TARGET_CONFLICT',
    });
  });

  it('accepts a declared target that the form matches', () => {
    const declared = {
      ...status,
      record: { ...status.record!, normalized_target: "morerobîare'yma" },
    };
    expect(targetConflicts(declared, result)).toBe(false);
    expect(approvalState(context({ status: declared })).ready).toBe(true);
  });

  it('does not treat a partial evaluation as agreement with the declared target', () => {
    const partial = { ...result, evaluationStatus: 'partial' } as RenderResult;
    const declared = { ...status, record: { ...status.record!, normalized_target: 'outra forma' } };
    expect(targetConflicts(declared, partial)).toBe(false);
    expect(approvalState(context({ result: partial }))).toMatchObject({
      ready: false,
      code: 'PARTIAL_EVALUATION',
    });
  });

  it('refuses a new passage, a draft conflict, a missing result and a loading project', () => {
    expect(approvalState(context({ isNewPassage: true }))).toMatchObject({ code: 'NEW_PASSAGE' });
    expect(approvalState(context({ conflict: true }))).toMatchObject({ code: 'DRAFT_CONFLICT' });
    expect(approvalState(context({ result: null }))).toMatchObject({ code: 'NO_RESULT' });
    expect(approvalState(context({ ready: false }))).toMatchObject({ code: 'NOT_READY' });
    expect(approvalState(context({ status: undefined }))).toMatchObject({ code: 'NO_STATUS' });
  });

  it('always explains a refusal, so an automatic save can say why it stopped', () => {
    for (const blocked of [
      approvalState(context({ changed: true })),
      approvalState(context({ conflict: true })),
      approvalState(context({ isNewPassage: true })),
      approvalState(context({ result: null })),
    ]) {
      expect(blocked.ready).toBe(false);
      expect(blocked.ready === false && blocked.reason.length).toBeGreaterThan(10);
    }
  });
});

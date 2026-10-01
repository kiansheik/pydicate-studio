import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { createDraft } from './model';
import { passageStage, passageSubmission } from './passage-status';
import type { SubmissionSummary } from './submissions';

describe('passage completion', () => {
  const passage = createExampleProject().passages[0];
  const submission = { status: 'submitted' } as SubmissionSummary;

  it('keeps saved references separate from completion without a recorded decision', () => {
    expect(passage.acceptedReference).not.toBeNull();
    expect(passageStage(passage, createDraft(passage))).toBe('analysis');
    expect(passageSubmission(passage, createDraft(passage), submission)).toBe(submission);
  });

  it('shows completed work consistently despite an older review submission', () => {
    const draft = createDraft(passage);
    draft.workflow = { stage: 'complete', updatedAt: '2026-10-01T00:00:00Z' };
    expect(passageStage(passage, draft)).toBe('complete');
    expect(passageSubmission(passage, draft, submission)).toBeUndefined();
  });

  it('respects explicit reopening even when the source has approved status', () => {
    const approved = { ...passage, status: 'approved' as const };
    expect(passageStage(approved)).toBe('complete');
    const draft = createDraft(approved);
    draft.workflow = { stage: 'review', updatedAt: '2026-10-01T00:01:00Z' };
    expect(passageStage(approved, draft)).toBe('review');
    expect(passageSubmission(approved, draft, submission)).toBe(submission);
  });

  it('reopens review only for a submission recorded after explicit completion', () => {
    const draft = createDraft(passage);
    draft.workflow = { stage: 'complete', updatedAt: '2026-10-01T00:00:00Z' };
    const older = { ...submission, submittedAt: Date.parse('2026-09-30T23:59:00Z') };
    const newer = { ...submission, submittedAt: Date.parse('2026-10-01T00:01:00Z') };
    expect(passageStage(passage, draft, older)).toBe('complete');
    expect(passageSubmission(passage, draft, older)).toBeUndefined();
    expect(passageStage(passage, draft, newer)).toBe('review');
    expect(passageSubmission(passage, draft, newer)).toBe(newer);
    expect(passageStage(passage, draft, { ...newer, status: 'merged' })).toBe('complete');
  });
});

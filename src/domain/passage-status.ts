import type { Draft, Passage } from './types';
import type { SubmissionSummary } from './submissions';

export const passageStatusLabels = {
  untranscribed: 'Por transcrever',
  analysis: 'Em análise',
  review: 'Precisa de revisão',
  approved: 'Aprovado',
  changed: 'Resultado mudou',
  complete: 'Concluída',
};

/** Explicit completion wins over an older submission; reopening remains intentional. */
export function passageStage(passage: Passage, draft?: Draft, submission?: SubmissionSummary) {
  const stage =
    draft?.workflow?.stage ?? (passage.status === 'approved' ? 'complete' : passage.status);
  // A later explicit submission starts a new review. Historical submissions
  // cannot override the completion recorded after reference approval.
  if (
    stage === 'complete' &&
    draft?.workflow?.updatedAt &&
    submission &&
    ['submitted', 'ready', 'changes_requested'].includes(submission.status) &&
    Number(submission.submittedAt) > Date.parse(draft.workflow.updatedAt)
  )
    return 'review';
  return stage;
}

export function passageSubmission(
  passage: Passage,
  draft: Draft | undefined,
  submission: SubmissionSummary | undefined,
) {
  return passageStage(passage, draft, submission) === 'complete' ? undefined : submission;
}

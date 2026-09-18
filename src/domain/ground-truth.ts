/** One definition of when a reference may be approved.
 *
 * The panel and the automatic save after a source edit both ask this, so the
 * automatic path can never approve in a state the panel would have refused.
 * Every answer carries a reason, so a blocked save says why instead of doing
 * nothing visible.
 */
import type { RenderResult } from './types';

export interface ReferenceStatus {
  record: null | { surface: string; normalized_target?: string; status?: string };
  recordPath: string;
  recordCount: number;
  nextOrdinal: number;
  canApproveSequentially: boolean;
}

export interface ApprovalContext {
  isNewPassage: boolean;
  status: ReferenceStatus | undefined;
  /** The draft still differs from the published source, or is an unreviewed proposal. */
  changed: boolean;
  conflict: boolean;
  result: RenderResult | null | undefined;
  ready: boolean;
}

export type Approval =
  | { ready: true; surface: string }
  | { ready: false; reason: string; code: ApprovalBlock };

export type ApprovalBlock =
  | 'NOT_READY'
  | 'NEW_PASSAGE'
  | 'NO_STATUS'
  | 'OUT_OF_SEQUENCE'
  | 'UNAPPLIED_CHANGES'
  | 'DRAFT_CONFLICT'
  | 'NO_RESULT'
  | 'PARTIAL_EVALUATION'
  | 'TARGET_CONFLICT';

/** The declared human target, when the record carries one. */
export function declaredTarget(status: ReferenceStatus | undefined) {
  return status?.record?.normalized_target;
}

/** True when the realized form contradicts a declared human target. */
export function targetConflicts(
  status: ReferenceStatus | undefined,
  result: RenderResult | null | undefined,
) {
  const declared = declaredTarget(status);
  return (
    !!declared && !!result && result.evaluationStatus !== 'partial' && declared !== result.surface
  );
}

export function approvalState(context: ApprovalContext): Approval {
  const { isNewPassage, status, changed, conflict, result, ready } = context;
  if (!ready)
    return { ready: false, code: 'NOT_READY', reason: 'Aguarde o carregamento do projeto.' };
  if (isNewPassage)
    return {
      ready: false,
      code: 'NEW_PASSAGE',
      reason: 'Revise e acrescente a nova passagem à fonte antes de salvar ground truth.',
    };
  if (!status)
    return {
      ready: false,
      code: 'NO_STATUS',
      reason: 'Conferindo o registro atual desta passagem.',
    };
  if (!status.canApproveSequentially)
    return {
      ready: false,
      code: 'OUT_OF_SEQUENCE',
      reason: `Primeiro salve a passagem ${String(status.nextOrdinal).padStart(4, '0')}. O corpus mantém as referências em sequência.`,
    };
  if (changed)
    return {
      ready: false,
      code: 'UNAPPLIED_CHANGES',
      reason: 'Aplique primeiro a edição revisada na fonte.',
    };
  if (conflict)
    return {
      ready: false,
      code: 'DRAFT_CONFLICT',
      reason: 'Concilie a fonte e o rascunho antes de aprovar.',
    };
  if (!result)
    return {
      ready: false,
      code: 'NO_RESULT',
      reason: 'Aguardando a avaliação da fonte pelo motor.',
    };
  if (result.evaluationStatus === 'partial')
    return {
      ready: false,
      code: 'PARTIAL_EVALUATION',
      reason: 'A expressão ainda não é avaliada por completo.',
    };
  if (targetConflicts(status, result))
    return {
      ready: false,
      code: 'TARGET_CONFLICT',
      reason:
        'A forma atual difere do alvo humano declarado; ele não será substituído automaticamente.',
    };
  return { ready: true, surface: result.surface };
}

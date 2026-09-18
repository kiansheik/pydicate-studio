import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCheck, X } from 'lucide-react';
import type { Studio } from '../useStudio';
import { invoke } from '../domain/authoring';
import { approvalState, targetConflicts, type ReferenceStatus } from '../domain/ground-truth';
export function GroundTruthPanel({
  studio,
  onReviewSource,
  onClose,
  reviewProposal = false,
}: {
  studio: Studio;
  onReviewSource: () => void;
  onClose?: () => void;
  reviewProposal?: boolean;
}) {
  const { passage, draft, result } = studio;
  const isNewPassage = passage.id.startsWith('pending:');
  const [status, setStatus] = useState<ReferenceStatus>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setStatus(undefined);
    setError('');
    if (isNewPassage) return;
    void invoke<ReferenceStatus>('reference_status', { passageId: passage.id })
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [passage.id, studio.project.engineFingerprint]);
  useEffect(() => {
    setSaved(false);
  }, [passage.id, draft?.revisionId]);
  const changed =
    reviewProposal ||
    (!!draft &&
      (draft.raw !== passage.sourceExpression ||
        (['diplomatic', 'normalized', 'translation', 'notes'] as const).some(
          (field) => draft[field] !== passage[field],
        ) ||
        Object.entries(draft.locators ?? {}).some(
          ([key, value]) =>
            value !==
            (
              {
                printedPage: passage.witness.printedPage ?? '',
                folio: passage.witness.folio ?? '',
                line: String(passage.witness.textualLine ?? ''),
                section: passage.witness.section ?? '',
                subsection: passage.witness.subsection ?? '',
              } as Record<string, string>
            )[key],
        )));
  const targetConflict = targetConflicts(status, result);
  // One shared definition, so the automatic save after a source edit can never
  // approve in a state this panel would have refused.
  const approval = approvalState({
    isNewPassage,
    status,
    changed,
    conflict: studio.conflict,
    result,
    ready: studio.ready,
  });
  const blocked = !approval.ready;
  return (
    <section className="ground-truth-panel" aria-label="Salvar ground truth">
      <header>
        <ClipboardCheck size={21} />
        <div>
          <h2>Salvar como ground truth</h2>
          <p>Registrar a forma que você revisou como referência do corpus.</p>
        </div>
      </header>
      <ol className="review-steps">
        <li>
          <strong>Salvar a edição na fonte</strong>
          <p>
            {reviewProposal
              ? 'Use a proposta exibida no rascunho e revise sua inclusão na fonte.'
              : isNewPassage
                ? 'Esta nova passagem está no seu rascunho. Revise a inclusão no corpus quando a construção estiver pronta.'
                : changed
                  ? 'Seu rascunho tem alterações que ainda não estão no arquivo do corpus.'
                  : 'O rascunho acompanha a expressão e os campos da fonte atual.'}
          </p>
          {(isNewPassage || changed) && (
            <button className="button" disabled={!studio.ready} onClick={onReviewSource}>
              {reviewProposal ? 'Usar e revisar proposta' : 'Revisar edição da fonte'}
            </button>
          )}
        </li>
        <li>
          <strong>Revisar e confirmar a referência</strong>
          {status && (
            <p>
              {status.record
                ? `Esta passagem já tem um registro${status.record.status === 'approved' ? ' aprovado' : ''}. Confirmar atualiza somente este registro.`
                : 'Esta passagem ainda não tem ground truth.'}
            </p>
          )}
          {status && !status.canApproveSequentially && (
            <p role="alert">
              Primeiro salve a passagem {String(status.nextOrdinal).padStart(4, '0')}. O corpus
              mantém as referências em sequência.
            </p>
          )}
          <div className="ground-truth-forms">
            <div>
              <small>GROUND TRUTH ATUAL</small>
              <p>
                {status?.record?.normalized_target ??
                  status?.record?.surface ??
                  'Ainda não registrada'}
              </p>
            </div>
            <div>
              <small>FORMA A REGISTRAR</small>
              <p>{result?.surface ?? 'Aguardando avaliação da fonte'}</p>
            </div>
          </div>
          {targetConflict && (
            <p role="alert">
              A forma atual difere do alvo humano declarado. Corrija a análise ou revise esse alvo
              no fluxo editorial; ele não será substituído automaticamente.
            </p>
          )}
          {studio.conflict && <p role="alert">Concilie a fonte e o rascunho antes de aprovar.</p>}
          <div className="ground-truth-actions">
            {onClose && (
              <button className="button" disabled={studio.busy} onClick={onClose}>
                {saved ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            <button
              className="button primary"
              disabled={blocked || saved}
              onClick={async () => {
                setError('');
                setSaved(false);
                try {
                  await studio.approveGroundTruth(result!.surface);
                  setSaved(true);
                } catch (reason) {
                  setError(String(reason));
                }
              }}
            >
              <Check size={15} /> Confirmar e salvar ground truth
            </button>
          </div>
        </li>
      </ol>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {saved && <p role="status">Ground truth salva. As outras passagens foram preservadas.</p>}
      {status && (
        <details>
          <summary>Onde essa decisão fica salva</summary>
          <code>{status.recordPath}</code>
          <p>
            É uma alteração no arquivo de referências do corpus. “Preparar contribuição Git” permite
            revisar e compartilhar a alteração depois.
          </p>
        </details>
      )}
    </section>
  );
}

export function GroundTruthDialog({
  studio,
  onReviewSource,
  reviewProposal,
  onClose,
}: {
  studio: Studio;
  onReviewSource: () => void;
  reviewProposal?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ground-truth-dialog"
      aria-label="Commit to Ground Truth"
      onCancel={(event) => {
        event.preventDefault();
        if (!studio.busy) onClose();
      }}
    >
      <button
        className="icon-button ground-truth-close"
        aria-label="Fechar ground truth"
        disabled={studio.busy}
        onClick={onClose}
        autoFocus
      >
        <X size={19} />
      </button>
      <GroundTruthPanel
        studio={studio}
        onReviewSource={onReviewSource}
        onClose={onClose}
        reviewProposal={reviewProposal}
      />
    </dialog>
  );
}

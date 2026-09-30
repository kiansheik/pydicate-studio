import { useCallback, useRef, useState } from 'react';
import type { Studio } from '../useStudio';
import type { SubmissionSummary, SubmissionReview } from '../domain/submissions';
import { workspaceAutofill } from '../domain/workspace-autofill';
import { SubmissionPdf } from './SubmissionPdf';
import { SourceReviewContent } from './SourceReviewContent';
import './SubmissionReviewQueue.css';

function ReviewLine({
  item,
  busy,
  prepare,
  onCheck,
  checked,
  outcome,
}: {
  item: SubmissionSummary;
  busy: boolean;
  prepare: (pageIndex: number) => Promise<SubmissionReview>;
  onCheck: (review: SubmissionReview | null) => void;
  checked: boolean;
  outcome?: string;
}) {
  const [review, setReview] = useState<SubmissionReview>();
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [pixels, setPixels] = useState(false);
  const [pdfPage, setPdfPage] = useState('1');
  const ready = useCallback(() => setPixels(true), []);
  async function load() {
    setLoading(true);
    setError('');
    setPixels(false);
    onCheck(null);
    setReview(undefined);
    try {
      setReview(await prepare(Number(pdfPage) - 1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }
  return (
    <article className="submission-review-line" data-submission-id={item.id}>
      <header>
        <strong>{item.author}</strong>
        <span>{new Date(Number(item.submittedAt)).toLocaleString('pt-BR')}</span>
      </header>
      <p>
        {item.sourceTitle || item.sourceId || 'Fonte'} · Linha {item.ordinal ?? 'nova'}
      </p>
      {!outcome && (
        <label>
          Página do PDF, se não houver recorte salvo{' '}
          <input
            {...workspaceAutofill}
            type="number"
            min="1"
            step="1"
            value={pdfPage}
            disabled={busy || loading}
            onChange={(event) => {
              setPdfPage(event.target.value);
              setReview(undefined);
              setPixels(false);
              onCheck(null);
            }}
          />
        </label>
      )}
      {!outcome && (
        <button className="button" disabled={busy || loading} onClick={() => void load()}>
          {loading ? 'Preparando…' : review ? 'Recarregar esta revisão' : 'Conferir esta linha'}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {outcome && <p role="status">{outcome}</p>}
      {review && (
        <>
          <div className="submission-comparison">
            <SubmissionPdf evidence={review.evidence} onReady={ready} />
            <div>
              <h3>Transcrição</h3>
              <p>{review.draft.diplomatic || 'Não informada'}</p>
              <h3>Resultado do motor</h3>
              <p lang="tpw" className="submission-surface">
                {review.evaluation.surface}
              </p>
              <h3>Leitura registrada</h3>
              <p>{review.draft.normalized || 'Não informada'}</p>
              <h3>Tradução</h3>
              <p>{review.draft.translation || 'Não informada'}</p>
            </div>
          </div>
          <details>
            <summary>Conferir árvore, léxico e alterações na fonte</summary>
            <SourceReviewContent
              preview={{
                ...review.preview,
                draftRevisionId: review.draft.revisionId,
                ...(review.passageId.startsWith('pending:')
                  ? { pendingDraftId: review.passageId }
                  : {}),
              }}
              hasChanges={!!review.preview.diff || !!review.preview.files?.some((f) => f.diff)}
              currentPassageId={review.passageId}
              draftRevisionId={review.draft.revisionId}
              draftRaw={review.draft.raw}
              engineFingerprint={review.evaluation.engineFingerprint}
              result={review.evaluation}
              pending={false}
              saveGroundTruth
            />
          </details>
          {!outcome && (
            <label>
              <input
                {...workspaceAutofill}
                type="checkbox"
                disabled={busy || !pixels}
                checked={checked}
                onChange={(event) => onCheck(event.target.checked ? review : null)}
              />
              Conferi a linha no PDF e aprovo esta forma como referência
            </label>
          )}
        </>
      )}
    </article>
  );
}
export function SubmissionReviewQueue({
  studio,
  items,
}: {
  studio: Studio;
  items: SubmissionSummary[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [rows, setRows] = useState<SubmissionSummary[]>([]),
    [checked, setChecked] = useState<Record<string, SubmissionReview>>({});
  const [outcomes, setOutcomes] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!window.studio?.prepareSubmission || !window.studio?.capabilities?.passageManagement)
    return null;
  async function publish() {
    setBusy(true);
    setError('');
    for (const item of rows) {
      const review = checked[item.id];
      if (!review) continue;
      try {
        const result = await studio.publishReviewedSubmission(review.token);
        setOutcomes((current) => ({
          ...current,
          [review.id]: result.approved
            ? 'Incorporada ao corpus; referência aprovada.'
            : `Fonte salva, mas a referência não foi aprovada: ${result.error}`,
        }));
        setChecked((current) => {
          const next = { ...current };
          delete next[review.id];
          return next;
        });
        if (!result.approved) {
          setError('O lote foi interrompido. Confira a linha indicada antes de continuar.');
          break;
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
        break;
      }
    }
    setBusy(false);
  }
  return (
    <>
      <button
        className="button small"
        disabled={!studio.ready}
        onClick={() => {
          setRows(items.filter((item) => ['submitted', 'ready'].includes(item.status)));
          setChecked({});
          setOutcomes({});
          setError('');
          dialog.current?.showModal();
        }}
      >
        Revisar envios em lote
      </button>
      <dialog
        ref={dialog}
        className="submission-review-dialog"
        aria-label="Revisar envios em lote"
        onClose={() => {
          setRows([]);
          setChecked({});
        }}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <header>
          <h2>Revisar envios em lote</h2>
          <button className="button" disabled={busy} onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        <p>
          Compare cada forma com o recorte do PDF. Marque somente as linhas conferidas; elas serão
          salvas no corpus com a forma aprovada como referência.
        </p>
        {!rows.length && <p>Nenhuma passagem aguardando revisão.</p>}
        {rows.map((item) => (
          <ReviewLine
            key={item.id}
            item={item}
            busy={busy || preparing}
            checked={!!checked[item.id]}
            outcome={outcomes[item.id]}
            prepare={async (pageIndex) => {
              if (preparingRef.current) throw new Error('Aguarde a preparação da outra linha.');
              preparingRef.current = true;
              setPreparing(true);
              try {
                await studio.persist();
                return await window.studio!.prepareSubmission!(item.id, pageIndex);
              } finally {
                preparingRef.current = false;
                setPreparing(false);
              }
            }}
            onCheck={(review) =>
              setChecked((current) => {
                const next = { ...current };
                if (review) next[item.id] = review;
                else delete next[item.id];
                return next;
              })
            }
          />
        ))}
        <footer>
          <p role="alert">{error}</p>
          <button
            className="button primary"
            disabled={busy || preparing || !Object.keys(checked).length}
            onClick={() => void publish()}
          >
            {busy
              ? 'Incorporando as linhas conferidas…'
              : `Incorporar ${Object.keys(checked).length} selecionada(s)`}
          </button>
        </footer>
      </dialog>
    </>
  );
}

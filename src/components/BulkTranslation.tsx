import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { invoke } from '../domain/authoring';
import {
  analysisError,
  candidateTranslation,
  type AnalysisCandidate,
  type AnalysisJob,
} from '../domain/analysis';
import { translationChange } from '../domain/translations';
import type { Studio } from '../useStudio';

/**
 * A translation is only applicable in bulk when it belongs to the tree the draft already
 * holds. When the draft moved on, applying would mean silently replacing that tree, which is
 * the single-passage accept flow's business, not this one's.
 */
type Row = {
  jobId: string;
  candidateId: string;
  passageId: string;
  ordinal: number | string;
  language: 'pt';
  text: string;
  current: string;
  uncertainties: string[];
  state: 'empty' | 'conflict' | 'stale';
};

export function BulkTranslation({
  studio,
  jobs,
  onClose,
  onNotice,
}: {
  studio: Studio;
  jobs: AnalysisJob[];
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const projectId = studio.project.id;
  // Every complete candidate carries a tentative translation, whatever task produced it, so
  // the review covers all finished proposals rather than only the translate ones.
  const ready = jobs.filter((job) => job.status === 'ready-for-review');
  const jobKey = ready
    .map((job) => job.id)
    .sort()
    .join(',');

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError('');
    void (async () => {
      const collected: Row[] = [];
      for (const job of ready) {
        try {
          const detail = await invoke<{ candidates: AnalysisCandidate[] }>('analysis_get', {
            projectId,
            jobId: job.id,
          });
          if (!alive) return;
          for (const candidate of detail.candidates) {
            const translation = candidateTranslation(candidate);
            const draft = studio.envelope.drafts[candidate.passageId];
            if (!translation || !draft) continue;
            const current = draft.translations?.[translation.language] ?? '';
            // An identical translation is already applied; it is not a decision to make.
            if (current.trim() === translation.text.trim()) continue;
            collected.push({
              jobId: job.id,
              candidateId: candidate.id,
              passageId: candidate.passageId,
              ordinal:
                studio.project.passages.find((item) => item.id === candidate.passageId)?.ordinal ??
                'local',
              language: translation.language,
              text: translation.text,
              current,
              uncertainties: translation.uncertainties,
              state: draft.raw !== candidate.raw ? 'stale' : current.trim() ? 'conflict' : 'empty',
            });
          }
        } catch (reason) {
          if (alive) setError(analysisError(reason));
        }
      }
      if (!alive) return;
      collected.sort((a, b) => String(a.ordinal).localeCompare(String(b.ordinal), 'pt'));
      setRows(collected);
      // An empty field has nothing to weigh against, so it is checked already; a written
      // translation is only replaced when its own box is ticked.
      setChosen(
        Object.fromEntries(
          collected.filter((row) => row.state === 'empty').map((row) => [row.candidateId, true]),
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, [projectId, jobKey]);

  const selected = (rows ?? []).filter((row) => row.state !== 'stale' && chosen[row.candidateId]);

  function apply() {
    setBusy(true);
    setError('');
    try {
      const applied = studio.editPassages(
        selected.map((row) => {
          const draft = studio.envelope.drafts[row.passageId]!;
          return {
            passageId: row.passageId,
            changes: translationChange(draft, row.text, row.language),
            expectedRevision: draft.revisionId,
          };
        }),
      );
      const missed = selected.length - applied.length;
      onNotice(
        `${applied.length} tradução(ões) gravada(s) no rascunho.${missed ? ` ${missed} passagem(ns) mudaram durante a revisão e ficaram como estavam.` : ''} Salve os rascunhos para preservar.`,
      );
      setRows((current) => (current ?? []).filter((row) => !applied.includes(row.passageId)));
    } catch (reason) {
      setError(analysisError(reason));
    } finally {
      setBusy(false);
    }
  }

  const stale = (rows ?? []).filter((row) => row.state === 'stale').length;
  return (
    <section className="bulk-translation" aria-label="Traduções propostas em lote">
      <header>
        <h3>Traduções propostas</h3>
        <button className="icon-button" aria-label="Fechar traduções propostas" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {rows === null && <p role="status">Lendo as propostas concluídas…</p>}
      {rows?.length === 0 && (
        <p>
          Nenhuma tradução nova. Só aparecem aqui propostas concluídas cuja tradução ainda não está
          no rascunho.
        </p>
      )}
      {!!rows?.length && (
        <>
          <p className="field-hint">
            Passagens sem tradução já vêm marcadas. Uma tradução escrita só é substituída se você
            marcar a caixa dela depois de comparar.
          </p>
          <ul>
            {rows.map((row) => (
              <li key={row.candidateId} data-state={row.state}>
                <label>
                  <input
                    type="checkbox"
                    disabled={row.state === 'stale' || busy}
                    checked={!!chosen[row.candidateId]}
                    onChange={(event) =>
                      setChosen((value) => ({
                        ...value,
                        [row.candidateId]: event.target.checked,
                      }))
                    }
                  />
                  <strong>Passagem {row.ordinal}</strong>
                </label>
                {row.state === 'stale' ? (
                  <p className="field-hint">
                    A árvore do rascunho mudou depois desta proposta. Abra a passagem para aceitar a
                    proposta e a tradução juntas.
                  </p>
                ) : (
                  <>
                    {row.state === 'conflict' && (
                      <p className="bulk-current">
                        <span>Atual</span> {row.current}
                      </p>
                    )}
                    <p className="bulk-proposed">
                      <span>Proposta</span> {row.text}
                    </p>
                    {!!row.uncertainties.length && (
                      <ul className="bulk-uncertainties">
                        {row.uncertainties.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {!!stale && (
            <p className="field-hint">
              {stale} proposta(s) pertencem a outra revisão do rascunho e não podem ser aplicadas
              daqui.
            </p>
          )}
          <button className="button primary" disabled={busy || !selected.length} onClick={apply}>
            Gravar {selected.length} tradução(ões) no rascunho
          </button>
        </>
      )}
    </section>
  );
}

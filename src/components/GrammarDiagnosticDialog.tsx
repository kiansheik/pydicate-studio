import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import type { CanvasDiagnostic } from '../domain/grammar-diagnostic';
import { grammarDiagnostic } from '../domain/grammar-diagnostic';
import type { Passage, StudioProject } from '../domain/types';
import { invoke } from '../domain/authoring';
import type { RenderResult } from '../domain/types';
import { compareGrammarSnapshots, type CorpusSnapshot } from '../domain/grammar-regression';
import '../grammar-diagnostic.css';

export function GrammarDiagnosticDialog({
  project,
  passage,
  report,
  onClose,
  onRefresh,
  onSubmit,
}: {
  project: StudioProject;
  passage: Passage;
  report: CanvasDiagnostic;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSubmit: (request: {
    mode: 'engine' | 'tree';
    intendedSurface: string;
    explanation: string;
    operationId: string;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'engine' | 'tree'>('engine');
  const [intendedSurface, setIntendedSurface] = useState(() =>
    report.root.evaluation?.status === 'ok' ? report.root.evaluation.surface : '',
  );
  const [explanation, setExplanation] = useState('');
  const baselineKey = `studio:grammar-baseline:${JSON.stringify([project.id, passage.id, report.revisionId, report.fragmentId])}`;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseline, setBaseline] = useState<CorpusSnapshot | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(baselineKey) || 'null');
      return saved?.raw === report.raw ? saved.snapshot : null;
    } catch {
      return null;
    }
  });
  const { prompt } = grammarDiagnostic(project, passage, report, {
    mode,
    intendedSurface,
    explanation,
    baselineEngineFingerprint: baseline?.engineFingerprint,
  });
  const [comparison, setComparison] = useState<ReturnType<typeof compareGrammarSnapshots> | null>(
    null,
  );
  const [freshSurface, setFreshSurface] = useState<string | null>(null);
  const wordSequence = (value: string) => value.trim().split(/\s+/u).join(' ');
  const dialog = useRef<HTMLDialogElement>(null);
  const submission = useRef<{ key: string; id: string } | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="grammar-diagnostic-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-label="Diagnóstico para corrigir a gramática"
    >
      <header>
        <h2>Corrigir resultado</h2>
        <button
          className="icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Fechar diagnóstico"
          title="Fechar"
        >
          <X size={18} />
        </button>
      </header>
      <p className="grammar-current-result">
        Resultado atual:{' '}
        <strong lang="tpw">
          {report.root.evaluation?.status === 'ok'
            ? report.root.evaluation.surface
            : 'Sem resultado'}
        </strong>
      </p>
      <fieldset className="grammar-repair-mode">
        <legend>O que precisa ser investigado?</legend>
        <label>
          <input
            type="radio"
            name="grammar-repair-mode"
            checked={mode === 'engine'}
            onChange={() => setMode('engine')}
          />{' '}
          Corrigir a gramática local
        </label>
        <label>
          <input
            type="radio"
            name="grammar-repair-mode"
            checked={mode === 'tree'}
            onChange={() => setMode('tree')}
          />{' '}
          Completar ou ajustar a árvore
        </label>
      </fieldset>
      <label className="grammar-repair-field">
        Como deveria ficar?
        <input
          aria-label="Forma pretendida"
          value={intendedSurface}
          onChange={(event) => setIntendedSurface(event.target.value)}
        />
      </label>
      <label className="grammar-repair-field">
        O que precisa mudar?
        <textarea
          aria-label="Explicação linguística"
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          rows={3}
        />
      </label>
      <div className="grammar-diagnostic-actions">
        <button
          className="button primary"
          disabled={busy || (mode === 'engine' && !intendedSurface.trim())}
          onClick={async () => {
            if (sending.current) return;
            sending.current = true;
            setBusy(true);
            setStatus('Salvando a correção e verificando as formas atuais…');
            const key = JSON.stringify([mode, intendedSurface, explanation]);
            if (submission.current?.key !== key)
              submission.current = { key, id: crypto.randomUUID() };
            try {
              await onSubmit({
                mode,
                intendedSurface,
                explanation,
                operationId: submission.current.id,
              });
              onClose();
            } catch (error) {
              setStatus(error instanceof Error ? error.message : String(error));
            } finally {
              setBusy(false);
              sending.current = false;
            }
          }}
        >
          <Send size={16} />{' '}
          {busy ? 'Preparando…' : mode === 'engine' ? 'Enviar ao Codex' : 'Enviar à IA'}
        </button>
      </div>
      <p role="status">{status}</p>
      <details className="grammar-technical">
        <summary>Detalhes e diagnóstico</summary>
        <textarea aria-label="Prompt de correção da gramática" readOnly value={prompt} rows={8} />
        <div className="grammar-diagnostic-actions">
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setStatus('Avaliando todas as fontes antes da alteração…');
              try {
                const snapshot = await invoke<CorpusSnapshot>('grammar_regression');
                setBaseline(snapshot);
                try {
                  sessionStorage.setItem(
                    baselineKey,
                    JSON.stringify({ raw: report.raw, snapshot }),
                  );
                } catch {
                  /* The in-memory baseline remains usable for this dialog. */
                }
                setComparison(null);
                setStatus(
                  'Linha de base do corpus registrada. Agora o prompt pode acompanhar uma mudança no motor.',
                );
              } catch (error) {
                setStatus(error instanceof Error ? error.message : String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Registrar linha de base do corpus
          </button>
          <button
            className="button"
            disabled={busy || (mode === 'engine' && (!intendedSurface.trim() || !baseline))}
            onClick={async () => {
              try {
                if (window.studio?.copyText) await window.studio.copyText(prompt);
                else await navigator.clipboard.writeText(prompt);
                setStatus(
                  'Prompt copiado. Cole no seu agente de código para investigar a gramática.',
                );
              } catch {
                setStatus('Selecione o texto acima e copie com o teclado.');
              }
            }}
          >
            Copiar prompt
          </button>
          <button
            className="button"
            disabled={busy || (mode === 'engine' && (!intendedSurface.trim() || !baseline))}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([prompt], { type: 'text/markdown;charset=utf-8' }),
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = `pydicate-diagnostico-${passage.ordinal}.md`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 0);
              setStatus('Diagnóstico exportado.');
            }}
          >
            Exportar diagnóstico
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setStatus('Atualizando motor e árvore…');
              try {
                await onRefresh();
                if (baseline) {
                  const next = await invoke<CorpusSnapshot>('grammar_regression');
                  setComparison(compareGrammarSnapshots(baseline, next));
                }
                const result = await invoke<RenderResult>('evaluate_expression', {
                  passageId: passage.id,
                  sourceId: passage.sourceId,
                  raw: report.raw,
                  revisionId: report.revisionId ?? 'grammar-repair-check',
                });
                setFreshSurface(result.surface);
                setStatus(
                  'Motor e corpus reavaliados. Confira a forma pretendida e todas as linhas alteradas abaixo.',
                );
              } catch (error) {
                setStatus(error instanceof Error ? error.message : String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Atualizar motor e árvore
          </button>
        </div>
        {baseline && (
          <p>
            Linha de base:{' '}
            {Object.values(baseline.sources).reduce(
              (count, item) => count + (item.rows?.length ?? 0),
              0,
            )}{' '}
            passagens · motor {baseline.engineFingerprint.slice(0, 16)}.
          </p>
        )}
        {freshSurface !== null && (
          <p>
            Nova realização da árvore: <strong>{freshSurface}</strong>
            {intendedSurface.trim() &&
              ` · ${wordSequence(freshSurface) === wordSequence(intendedSurface) ? 'corresponde à forma pretendida' : 'ainda difere da forma pretendida'}`}
          </p>
        )}
        {comparison && (
          <section className="grammar-regression-results" aria-label="Regressão de todas as fontes">
            <h3>Regressão de todas as fontes</h3>
            <p>
              {comparison.checked} expressões inalteradas verificadas · {comparison.changed.length}{' '}
              realizações alteradas · {comparison.baselineIssues} divergências já presentes na linha
              de base · {comparison.newReferenceIssues} referências antes coincidentes agora
              divergentes.
            </p>
            {!!comparison.sourceChanges.length && (
              <p role="alert">
                A fonte também mudou: {comparison.sourceChanges.join(', ')}. Essas linhas não podem
                ser atribuídas apenas ao motor.
              </p>
            )}
            <ul>
              {comparison.changed.map((line) => (
                <li key={`${line.source}:${line.ordinal}`}>
                  <strong>
                    {line.source}:{String(line.ordinal).padStart(4, '0')}
                  </strong>{' '}
                  · {line.before || '(sem forma)'} → {line.after || '(sem forma)'}
                  {line.annotatedChanged && ' · anotação mudou'}
                  {line.approvedReferenceChanged && ' · referência aprovada afetada'}
                </li>
              ))}
            </ul>
          </section>
        )}
      </details>
    </dialog>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FlaskConical, Play, RefreshCw } from 'lucide-react';
import { invoke } from '../domain/authoring';
import {
  acceptanceLabel,
  annotationDifference,
  previewLabInput,
  routeLabel,
  type LabCandidate,
  type LabResult,
  type LabStatus,
} from '../domain/parser-lab';
import type { Studio } from '../useStudio';
import '../parser-lab.css';

/** Propose an analysis for the passage being worked on, and import the chosen one.
 *
 * The transcription is already on screen, so the input starts from it instead of
 * asking the contributor to retype the form. Importing is the ordinary draft
 * edit, undoable like any other, and it records which reading was chosen so the
 * laboratory learns from real use rather than from a separate exercise.
 */
export function PassageSolver({
  studio,
  onOpenLaboratory,
}: {
  studio: Studio;
  onOpenLaboratory: () => void;
}) {
  const { passage, draft, project } = studio;
  const local = project.mode === 'local';
  const transcription = (
    draft?.normalized ||
    passage.normalized ||
    draft?.diplomatic ||
    passage.diplomatic ||
    ''
  ).trim();
  const [text, setText] = useState(transcription);
  const [result, setResult] = useState<LabResult | null>(null);
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState('');
  const request = useRef(0);
  const preview = previewLabInput(text);

  // Following the contributor to another passage must not leave the previous
  // passage's readings on screen as if they were this one's.
  useEffect(() => {
    request.current += 1;
    setText(transcription);
    setResult(null);
    setError('');
    setImported('');
    setSelected(0);
  }, [passage.id]);

  const refresh = () =>
    invoke<LabStatus>('parser_lab_status', { projectId: project.id })
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    if (local) void refresh();
  }, [local, project.id]);

  async function analyse() {
    const ticket = ++request.current;
    setBusy(true);
    setError('');
    setResult(null);
    setImported('');
    try {
      const value = await invoke<LabResult>('parser_lab_analyze', {
        projectId: project.id,
        text,
      });
      if (ticket !== request.current) return;
      setResult(value);
      setSelected(0);
    } catch (reason) {
      if (ticket === request.current)
        setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      if (ticket === request.current) setBusy(false);
    }
  }

  async function prepare() {
    setPreparing(true);
    setError('');
    try {
      await invoke('parser_lab_job_start', {
        projectId: project.id,
        stage: 'prepare',
        profile: 'smoke',
      });
      // The first index is small; poll until it is active rather than making the
      // contributor guess when it is ready.
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const next = await invoke<LabStatus>('parser_lab_status', { projectId: project.id });
        setStatus(next);
        if (next.active?.index) break;
        const job = next.jobs[0];
        if (job && ['failed', 'cancelled', 'interrupted'].includes(job.status)) {
          setError(job.error || 'A preparação não terminou.');
          break;
        }
      }
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      setPreparing(false);
    }
  }

  /** Take the chosen reading into the draft, and record that it was chosen. */
  function useReading(candidate: LabCandidate) {
    studio.edit({ raw: candidate.source }, draft?.revisionId);
    setImported(candidate.source);
    void invoke('parser_lab_judgment', {
      projectId: project.id,
      judgment: {
        verdict: 'accepted',
        normalized: result?.input.normalized ?? '',
        rawInput: result?.input.raw ?? '',
        candidateSource: candidate.source,
        surface: candidate.surface,
        shownSources: (result?.candidates ?? []).map((row) => row.source),
        chosenRank: (result?.candidates ?? []).indexOf(candidate) + 1,
        context: result?.context,
        artifacts: result?.artifacts,
        normalizerProfile: result?.input.profile,
      },
    }).catch(() => undefined);
  }

  const ready = Boolean(status?.active?.index);
  return (
    <div className="projection solver" aria-label="Sugerir análise">
      <div className="section-intro">
        <div>
          <h2>Sugerir uma análise a partir da forma</h2>
          <p>
            Experimental. A busca combina apenas o léxico e as construções declaradas no índice
            preparado, valida cada proposta no motor selecionado e mostra todas as leituras que a
            forma não distingue. Nada é publicado nem aprovado aqui.
          </p>
        </div>
        <button className="button small" onClick={onOpenLaboratory}>
          <FlaskConical size={15} /> Laboratório
        </button>
      </div>
      {!local && (
        <p className="lab-boundary" role="status">
          Abra o corpus local no aplicativo desktop para usar o motor selecionado.
        </p>
      )}
      {local && !ready && (
        <section className="lab-prepare">
          <p>
            Este projeto ainda não tem um índice. A preparação é local, leva alguns segundos e não
            consulta nenhum serviço.
          </p>
          <button className="button primary" disabled={preparing} onClick={() => void prepare()}>
            {preparing ? <RefreshCw size={15} /> : <Play size={15} />}{' '}
            {preparing ? 'Preparando…' : 'Preparar índice'}
          </button>
        </section>
      )}
      <section className="lab-input">
        <label>
          Forma a analisar
          <textarea
            data-testid="solver-input"
            rows={2}
            spellCheck={false}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void analyse();
            }}
          />
        </label>
        <div className="lab-actions">
          <button
            className="button primary"
            data-testid="solver-analyse"
            disabled={busy || !local || !ready || Boolean(preview.error)}
            onClick={() => void analyse()}
          >
            <Play size={16} /> Sugerir análise
          </button>
          {transcription && text !== transcription && (
            <button className="button small" onClick={() => setText(transcription)}>
              Usar a transcrição da passagem
            </button>
          )}
          <span className="lab-normalized" data-testid="solver-normalized">
            Entrada normalizada: <code lang="tpw">{preview.normalized || '—'}</code>
          </span>
        </div>
        <p className="lab-note">{preview.note}</p>
      </section>
      {busy && <p role="status">Procurando análises válidas…</p>}
      {error && <p role="alert">{error}</p>}
      {result && result.status !== 'complete' && (
        <p role="status" data-testid="solver-status">
          {result.message}
        </p>
      )}
      {result && result.candidates.length > 0 && (
        <section aria-label="Leituras propostas">
          <p className="lab-ambiguity" data-testid="solver-status">
            {result.candidates.length === 1
              ? 'Uma leitura completa foi validada.'
              : `${result.candidates.length} leituras válidas. A forma não decide entre elas; escolha a que o trecho pede.`}
          </p>
          <ol className="lab-candidates" data-testid="solver-candidates">
            {result.candidates.map((item, index) => (
              <li
                key={item.source}
                className={
                  (index === selected ? 'selected ' : '') +
                  'acceptance-' +
                  (item.provenance.acceptance ?? 'presumed')
                }
              >
                <button onClick={() => setSelected(index)}>
                  <code>{item.source}</code>
                  <span lang="tpw">{item.surface}</span>
                  <small>
                    {routeLabel(item)} · {acceptanceLabel(item)}
                  </small>
                  {annotationDifference(item).length > 0 && (
                    <small className="lab-difference">
                      Difere da primeira em{' '}
                      {annotationDifference(item)
                        .map(
                          (row) =>
                            `${row.surface}: ${(row.left ?? ['—']).join(' ')} vs ${(row.right ?? ['—']).join(' ')}`,
                        )
                        .join('; ')}
                    </small>
                  )}
                </button>
                {index === selected && (
                  <button
                    className="button small lab-choose"
                    data-testid={`solver-use-${index}`}
                    onClick={() => useReading(item)}
                  >
                    <ArrowRight size={14} /> Usar esta análise no rascunho
                  </button>
                )}
              </li>
            ))}
          </ol>
          {imported && (
            <p role="status" data-testid="solver-imported">
              <Check size={15} /> Análise levada ao rascunho. Desfazer recupera a anterior. A fonte
              e a referência não foram alteradas.
            </p>
          )}
          <details className="lab-details">
            <summary>Morfemas do motor</summary>
            <ul className="lab-morphemes-inline">
              {(result.candidates[selected]?.morphemes ?? []).map((morpheme) => (
                <li key={morpheme.occurrence}>
                  <code lang="tpw">{morpheme.surface}</code>{' '}
                  <small>{morpheme.tags.join(' · ')}</small>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FlaskConical, Play, RefreshCw } from 'lucide-react';
import { invoke } from '../domain/authoring';
import {
  acceptanceLabel,
  activeArtifact,
  annotationDifference,
  candidateDecompositions,
  candidateLexicalEvidence,
  describeAmbiguity,
  DECOMPOSITION_NOTE,
  lexicalEvidenceLabel,
  lexicalHintsForRequest,
  previewLabInput,
  routeLabel,
  type LabCandidate,
  type LabJob,
  type LabLexicalHint,
  type LabResult,
  type LabStatus,
} from '../domain/parser-lab';
import type { Studio } from '../useStudio';
import { LabLexicalHints } from './LabLexicalHints';
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
  const [lexicalHints, setLexicalHints] = useState<LabLexicalHint[]>([]);
  const [result, setResult] = useState<LabResult | null>(null);
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState('');
  const request = useRef(0);
  const preparation = useRef(0);
  const preview = previewLabInput(text);

  // Following the contributor to another passage must not leave the previous
  // passage's readings on screen as if they were this one's.
  useEffect(() => {
    request.current += 1;
    setText(transcription);
    setLexicalHints([]);
    setBusy(false);
    setResult(null);
    setError('');
    setImported('');
    setSelected(0);
  }, [passage.id, project.id]);

  useEffect(() => {
    setPreparing(false);
    return () => {
      request.current += 1;
      preparation.current += 1;
    };
  }, [project.id]);

  function invalidateAnalysis() {
    request.current += 1;
    setBusy(false);
    setResult(null);
    setError('');
    setImported('');
    setSelected(0);
  }

  const refresh = () =>
    invoke<LabStatus>('parser_lab_status', { projectId: project.id })
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    if (local) void refresh();
  }, [local, project.id]);

  async function analyse() {
    if (busy || !local || !status?.active?.index || preview.error) return;
    const ticket = ++request.current;
    setBusy(true);
    setError('');
    setResult(null);
    setImported('');
    try {
      const value = await invoke<LabResult>('parser_lab_analyze', {
        projectId: project.id,
        text,
        lexicalHints: lexicalHintsForRequest(lexicalHints),
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
    const ticket = ++preparation.current;
    setPreparing(true);
    setError('');
    try {
      const started = await invoke<LabJob>('parser_lab_job_start', {
        projectId: project.id,
        stage: 'prepare',
        profile: 'smoke',
      });
      // A rebuild starts while the previous index is still active. Follow this
      // exact job, so that previous index cannot falsely signal completion.
      for (let attempt = 0; attempt < 600; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (ticket !== preparation.current) return;
        const next = await invoke<LabStatus>('parser_lab_status', { projectId: project.id });
        if (ticket !== preparation.current) return;
        setStatus(next);
        const job = next.jobs.find((item) => item.id === started.id);
        if (job?.status === 'succeeded') {
          invalidateAnalysis();
          return;
        }
        if (job && ['failed', 'cancelled', 'interrupted'].includes(job.status)) {
          setError(job.error || 'A preparação não terminou.');
          return;
        }
      }
      setError('A preparação continua em andamento. Acompanhe o trabalho no Laboratório.');
    } catch (reason) {
      if (ticket === preparation.current)
        setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      if (ticket === preparation.current) setPreparing(false);
    }
  }

  /** Take the chosen reading into the draft, and record that it was chosen. */
  function useReading(candidate: LabCandidate) {
    if (!studio.ready || !draft || !result?.candidates.includes(candidate)) return;
    studio.edit({ raw: candidate.source }, draft?.revisionId);
    setImported(candidate.source);
    void invoke('parser_lab_judgment', {
      projectId: project.id,
      judgment: {
        verdict: 'accepted',
        normalized: result?.input.normalized ?? '',
        rawInput: result?.input.raw ?? '',
        candidateSource: candidate.source,
        candidateCompleteness: candidate.completeness,
        lexicalEvidence: candidate.provenance.lexicalEvidence ?? [],
        lexicalHints: lexicalHintsForRequest(lexicalHints),
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
  const indexCounts = activeArtifact(status, 'index')?.counts;
  const preparationLabel = status?.jobs?.some(
    (job) => job.status === 'running' && job.phase === 'lexicon',
  )
    ? 'Carregando léxico…'
    : 'Preparando…';
  return (
    <div className="projection solver" aria-label="Sugerir análise">
      <div className="section-intro">
        <div>
          <h2>Sugerir uma análise a partir da forma</h2>
          <p>
            Experimental. A busca usa o léxico compartilhado e o dicionário Navarro preparado,
            combina construções e confere cada proposta no motor selecionado. As leituras
            encontradas preservam as ambiguidades da forma. A cobertura ainda é limitada. Nada é
            publicado nem aprovado aqui.
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
            Prepare o índice com as entradas compatíveis de toda a cópia local do dicionário Navarro
            e o léxico compartilhado. A preparação é local e não consulta nenhum serviço.
          </p>
          <button className="button primary" disabled={preparing} onClick={() => void prepare()}>
            {preparing ? <RefreshCw size={15} /> : <Play size={15} />}{' '}
            {preparing ? preparationLabel : 'Preparar índice'}
          </button>
        </section>
      )}
      {local && ready && (
        <div className="lab-actions">
          <button
            className="button small"
            disabled={preparing || status?.busy}
            onClick={() => void prepare()}
          >
            <RefreshCw size={15} /> {preparing ? preparationLabel : 'Repreparar índice'}
          </button>
          <span className="lab-note">
            Atualiza o léxico compartilhado e a cópia local do Navarro.
          </span>
          {indexCounts?.dictionaryIndexedSenses !== undefined && (
            <span className="lab-note">
              {indexCounts.dictionaryIndexedSenses} acepções do Navarro no índice
              {indexCounts.dictionarySkippedSenses !== undefined
                ? `; ${indexCounts.dictionarySkippedSenses} não incluídas nesta versão.`
                : '.'}
            </span>
          )}
        </div>
      )}
      <section className="lab-input">
        <label>
          Forma a analisar
          <textarea
            data-testid="solver-input"
            rows={2}
            spellCheck={false}
            value={text}
            onChange={(event) => {
              invalidateAnalysis();
              setText(event.target.value);
            }}
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
            <button
              className="button small"
              onClick={() => {
                invalidateAnalysis();
                setText(transcription);
              }}
            >
              Usar a transcrição da passagem
            </button>
          )}
          <span className="lab-normalized" data-testid="solver-normalized">
            Entrada normalizada: <code lang="tpw">{preview.normalized || '—'}</code>
          </span>
        </div>
        <p className="lab-note">{preview.note}</p>
        <LabLexicalHints
          value={lexicalHints}
          onChange={(hints) => {
            invalidateAnalysis();
            setLexicalHints(hints);
          }}
        />
      </section>
      {busy && <p role="status">Procurando análises válidas…</p>}
      {error && <p role="alert">{error}</p>}
      {result && result.status !== 'complete' && (
        <p role="status" data-testid={result.candidates.length ? undefined : 'solver-status'}>
          {result.message}
        </p>
      )}
      {result && result.candidates.length > 0 && (
        <section aria-label="Leituras propostas">
          <p className="lab-ambiguity" data-testid="solver-status">
            {describeAmbiguity(result)}
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
                  {candidateDecompositions(item).map((decomposition, position) => (
                    <small className="lab-lexical-evidence" key={`decomposition-${position}`}>
                      <strong>Significado de {decomposition.dictionaryHeadword} · Navarro: </strong>
                      {decomposition.definition}
                    </small>
                  ))}
                  {candidateDecompositions(item).length > 0 && <small>{DECOMPOSITION_NOTE}</small>}
                  {candidateLexicalEvidence(item).map((evidence, position) => (
                    <small className="lab-lexical-evidence" key={position}>
                      {lexicalEvidenceLabel(evidence)}
                    </small>
                  ))}
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
                    disabled={!studio.ready || !draft}
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
            <summary>Código completo desta análise</summary>
            <pre>
              <code>{result.candidates[selected]?.source}</code>
            </pre>
          </details>
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
            {!result.candidates[selected]?.morphemes.length && (
              <p className="lab-note">O motor não forneceu segmentação em morfemas.</p>
            )}
          </details>
        </section>
      )}
    </div>
  );
}

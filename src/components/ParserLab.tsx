import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Database,
  FlaskConical,
  GraduationCap,
  ListChecks,
  Play,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import { invoke, type ParsedExpression } from '../domain/authoring';
import { emptyCanvas, type CanvasState } from '../domain/canvas';
import {
  acceptanceLabel,
  activeArtifact,
  annotationDifference,
  artifactUsable,
  candidateDecompositions,
  candidateLexicalEvidence,
  describeAmbiguity,
  DECOMPOSITION_NOTE,
  formatBytes,
  jobLabel,
  lexicalEvidenceLabel,
  lexicalHintsForRequest,
  previewLabInput,
  routeLabel,
  validationLabel,
  type LabCandidate,
  type LabFeedback,
  type LabJob,
  type LabLexicalHint,
  type LabResult,
  type LabStatus,
} from '../domain/parser-lab';
import type { RenderResult, StudioProject } from '../domain/types';
import { PydicateTree } from './RuntimeTree';
import { LabLexicalHints } from './LabLexicalHints';
import '../parser-lab.css';

type Section = 'analisar' | 'dados' | 'treinar' | 'avaliar' | 'execucoes';

const sections: { id: Section; label: string; icon: typeof FlaskConical }[] = [
  { id: 'analisar', label: 'Analisar', icon: FlaskConical },
  { id: 'dados', label: 'Dados', icon: Database },
  { id: 'treinar', label: 'Treinar', icon: GraduationCap },
  { id: 'avaliar', label: 'Avaliar', icon: ListChecks },
  { id: 'execucoes', label: 'Execuções', icon: RefreshCw },
];

interface LabEditorState {
  raw: string;
  canvas: CanvasState;
}

export function ParserLab({
  project,
  onClose,
  onTransfer,
}: {
  project: StudioProject;
  onClose: () => void;
  onTransfer?: (source: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<Section>('analisar');
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [busy, setBusy] = useState(false);
  const local = project.mode === 'local';

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Reading state is a filesystem listing. It starts no generation, no training,
  // no indexing, no model download and no provider call.
  const refresh = useCallback(async () => {
    if (!local) return;
    try {
      const value = await invoke<LabStatus>('parser_lab_status', { projectId: project.id });
      setStatus(value);
      setStatusError('');
    } catch (reason) {
      setStatusError(String(reason instanceof Error ? reason.message : reason));
    }
  }, [local, project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = window.studio?.onEvent?.((event: { type?: string; projectId?: string }) => {
      if (event?.type === 'parser-lab' && event.projectId === project.id) void refresh();
    });
    return unsubscribe;
  }, [project.id, refresh]);

  return (
    <dialog
      className="lab-dialog"
      ref={dialog}
      aria-label="Laboratório Tupi para Pydicate"
      onCancel={onClose}
    >
      <header className="lab-header">
        <div>
          <FlaskConical size={20} />
          <h1>Tupi → Pydicate</h1>
          <span className="lab-tag">EXPERIMENTAL</span>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Voltar ao trabalho">
          <X size={20} />
        </button>
      </header>
      <nav className="lab-nav" aria-label="Seções do laboratório">
        {sections.map((item) => (
          <button
            key={item.id}
            className={'button small' + (section === item.id ? ' active' : '')}
            aria-current={section === item.id}
            onClick={() => setSection(item.id)}
          >
            <item.icon size={15} /> {item.label}
          </button>
        ))}
      </nav>
      {!local && (
        <p className="lab-boundary" role="status">
          Abra o corpus local no aplicativo desktop. O laboratório usa o motor selecionado; não há
          análise no navegador.
        </p>
      )}
      {statusError && <p role="alert">{statusError}</p>}
      {section === 'analisar' && (
        <AnalyseSection
          project={project}
          status={status}
          onRefresh={refresh}
          busy={busy}
          setBusy={setBusy}
          onTransfer={onTransfer}
          local={local}
        />
      )}
      {section === 'dados' && (
        <DataSection project={project} status={status} onRefresh={refresh} local={local} />
      )}
      {section === 'treinar' && (
        <TrainSection project={project} status={status} onRefresh={refresh} local={local} />
      )}
      {section === 'avaliar' && (
        <EvaluateSection project={project} status={status} onRefresh={refresh} local={local} />
      )}
      {section === 'execucoes' && (
        <RunsSection project={project} status={status} onRefresh={refresh} />
      )}
    </dialog>
  );
}

function ArtifactBanner({ status }: { status: LabStatus | null }) {
  const index = activeArtifact(status, 'index');
  const ranker = activeArtifact(status, 'ranker');
  return (
    <p className="lab-artifacts" data-testid="lab-artifacts">
      {index ? (
        <>
          Índice ativo <code>{index.artifactId}</code> ({index.counts.fragments ?? 0} fragmentos,{' '}
          {index.counts.retrievalExpressions ?? 0} expressões registradas)
          {index.counts.lexicalEntries !== undefined &&
            ` · ${index.counts.lexicalEntries} entradas lexicais`}
          {index.counts.dictionaryIndexedSenses !== undefined &&
            ` · Navarro: ${index.counts.dictionaryIndexedSenses} acepções incluídas, ${index.counts.dictionarySkippedSenses ?? 0} não incluídas nesta versão`}
        </>
      ) : (
        'Nenhum índice ativo. Use Preparar baseline em Dados.'
      )}
      {ranker ? (
        <>
          {' · '}Classificador <code>{ranker.artifactId}</code>
        </>
      ) : (
        ' · Ordenação determinística'
      )}
      {status?.interrupted?.length ? (
        <>
          {' · '}
          <strong>
            {status.interrupted.length} preparação(ões) interrompida(s)
            {status.interrupted[0].lastStage
              ? ` (última etapa: ${status.interrupted[0].lastStage})`
              : ''}
          </strong>
        </>
      ) : null}
    </p>
  );
}

function AnalyseSection({
  project,
  status,
  onRefresh,
  busy,
  setBusy,
  onTransfer,
  local,
}: {
  project: StudioProject;
  status: LabStatus | null;
  onRefresh: () => Promise<void>;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onTransfer?: (source: string) => void;
  local: boolean;
}) {
  const [text, setText] = useState('');
  const [lexicalHints, setLexicalHints] = useState<LabLexicalHint[]>([]);
  const [result, setResult] = useState<LabResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<LabEditorState | null>(null);
  const [undo, setUndo] = useState<LabEditorState[]>([]);
  const [redo, setRedo] = useState<LabEditorState[]>([]);
  const [parsed, setParsed] = useState<ParsedExpression | null>(null);
  const [evaluated, setEvaluated] = useState<(RenderResult & { morphemeUnits?: unknown[] }) | null>(
    null,
  );
  const [evaluating, setEvaluating] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [judged, setJudged] = useState('');
  const request = useRef(0);
  const preview = previewLabInput(text);

  useEffect(
    () => () => {
      request.current += 1;
      setBusy(false);
    },
    [project.id, setBusy],
  );

  function invalidateAnalysis() {
    request.current += 1;
    setBusy(false);
    setResult(null);
    setSelected(0);
    setEditor(null);
    setEvaluated(null);
    setParsed(null);
    setJudged('');
    setError('');
    setTransferOpen(false);
  }

  async function analyse() {
    if (busy || !local || preview.error) return;
    const ticket = ++request.current;
    setBusy(true);
    setError('');
    setResult(null);
    setEditor(null);
    setEvaluated(null);
    setParsed(null);
    try {
      const value = await invoke<LabResult>('parser_lab_analyze', {
        projectId: project.id,
        text,
        lexicalHints: lexicalHintsForRequest(lexicalHints),
      });
      // A reply for an input the contributor already changed is discarded.
      if (ticket !== request.current) return;
      setResult(value);
      setSelected(0);
      if (value.best) install({ raw: value.best.source, canvas: emptyCanvas() }, false);
      void onRefresh();
      return true;
    } catch (reason) {
      if (ticket !== request.current) return;
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      if (ticket === request.current) setBusy(false);
    }
  }

  function install(next: LabEditorState, remember = true) {
    if (remember) {
      request.current += 1;
      setJudged('');
    }
    if (next.raw !== editor?.raw) {
      setParsed(null);
      setEvaluated(null);
    }
    if (remember && editor) {
      setUndo((values) => [...values.slice(-49), editor]);
      setRedo([]);
    } else if (!remember) {
      setUndo([]);
      setRedo([]);
    }
    setEditor(next);
  }

  // The lab editor evaluates in the laboratory's own answer-free context. It
  // never touches the open passage, its draft, source or reference.
  useEffect(() => {
    if (!editor || !local) return;
    let current = true;
    setEvaluating(true);
    const timer = setTimeout(() => {
      void invoke<ParsedExpression>('parser_lab_parse', { projectId: project.id, raw: editor.raw })
        .then(async (tree) => {
          if (!current) return;
          setParsed(tree);
          const value = await invoke<RenderResult>('parser_lab_evaluate', {
            projectId: project.id,
            raw: editor.raw,
          });
          if (current) setEvaluated(value);
        })
        .catch((reason) => {
          if (current) setError(String(reason instanceof Error ? reason.message : reason));
        })
        .finally(() => {
          if (current) setEvaluating(false);
        });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [editor?.raw, project.id, local]);

  async function judge(verdict: 'accepted' | 'rejected' | 'corrected' | 'uncertain') {
    if (!result) return;
    const ticket = request.current;
    // If a correction selects another proposed reading, retain that reading's
    // lexical evidence, including any unresolved hypothesis.
    const judgedCandidate =
      (verdict === 'corrected'
        ? result.candidates.find((item) => item.source === editor?.raw)
        : undefined) ?? result.candidates[selected];
    try {
      await invoke('parser_lab_judgment', {
        projectId: project.id,
        judgment: {
          verdict,
          normalized: result.input.normalized,
          rawInput: result.input.raw,
          candidateSource: result.candidates[selected]?.source ?? '',
          candidateCompleteness: judgedCandidate?.completeness,
          lexicalEvidence: judgedCandidate?.provenance.lexicalEvidence ?? [],
          lexicalHints: lexicalHintsForRequest(lexicalHints),
          correctedSource: verdict === 'corrected' ? (editor?.raw ?? '') : '',
          surface: result.candidates[selected]?.surface ?? '',
          // The whole set that was on screen and which one was chosen: that is
          // what makes this a usable preference later, not just a verdict.
          shownSources: result.candidates.map((row) => row.source),
          chosenRank: selected + 1,
          // Distinguishes a ranking mistake from a coverage failure.
          correctionWasProposed:
            verdict === 'corrected'
              ? result.candidates.some((row) => row.source === editor?.raw)
              : undefined,
          context: result.context,
          artifacts: result.artifacts,
          normalizerProfile: result.input.profile,
        },
      });
      if (ticket !== request.current) return;
      // Re-analyse first, so the confirmation appears beside the reordered
      // readings instead of being cleared by the refresh behind it.
      const refreshed = await analyse();
      if (!refreshed || request.current !== ticket + 1) return;
      setJudged(
        'Registrado no laboratório. A próxima análise desta frase já usa a sua escolha, e o ' +
          'treino pode usá-la como contraste. Isto não publica fonte nem aprova referência.',
      );
    } catch (reason) {
      if (ticket === request.current)
        setError(String(reason instanceof Error ? reason.message : reason));
    }
  }

  const candidate: LabCandidate | undefined = result?.candidates[selected];
  const displayedMorphemes =
    (evaluated?.morphemeUnits as LabCandidate['morphemes'] | undefined) ??
    candidate?.morphemes ??
    [];
  return (
    <main className="lab-main" aria-label="Analisar">
      <ArtifactBanner status={status} />
      <section className="lab-input">
        <label>
          Frase em tupi
          {/* The typed text is never rewritten, so the caret never jumps; the
              observation is shown beside the box instead. Enter during an IME
              composition commits that composition and must not submit. */}
          <textarea
            data-testid="lab-input"
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
            data-testid="lab-analyse"
            disabled={busy || !local || Boolean(preview.error)}
            onClick={() => void analyse()}
          >
            <Play size={16} /> Analisar
          </button>
          <span className="lab-normalized" data-testid="lab-normalized">
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
        {preview.error && text.length > 0 && <p role="alert">{preview.error}</p>}
      </section>
      {busy && <p role="status">Procurando análises válidas…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <section className="lab-result" aria-label="Resultado">
          <p className="lab-status" data-testid="lab-status">
            {result.status === 'complete' ? (
              <>
                <Check size={16} /> Análise completa validada pelo motor.
              </>
            ) : (
              <>
                <AlertTriangle size={16} /> {result.message}
              </>
            )}
          </p>
          <p className="lab-ambiguity">{describeAmbiguity(result)}</p>
          {result.status !== 'complete' && (
            <ul className="lab-next">
              <li>
                Atualize o índice em <strong>Dados</strong> para incluir o léxico compartilhado e as
                entradas compatíveis da cópia local do Navarro.
              </li>
              <li>Para uma raiz ausente ou um nome próprio, informe uma hipótese acima.</li>
              <li>Confira a grafia: a conversão de ortografia histórica não é aplicada aqui.</li>
              <li>Analise um trecho menor para ver quais constituintes já são reconhecidos.</li>
            </ul>
          )}
          {result.candidates.length > 0 && (
            <ol className="lab-candidates" data-testid="lab-candidates">
              {result.candidates.map((item, index) => (
                <li
                  key={item.source}
                  className={
                    (index === selected ? 'selected ' : '') +
                    'acceptance-' +
                    (item.provenance.acceptance ?? 'presumed')
                  }
                >
                  <button
                    onClick={() => {
                      request.current += 1;
                      setJudged('');
                      setSelected(index);
                      install({ raw: item.source, canvas: emptyCanvas() }, false);
                    }}
                  >
                    <code>{item.source}</code>
                    <span lang="tpw">{item.surface}</span>
                    <small>
                      {routeLabel(item)} · {item.family} · ordenação {item.score.toFixed(3)}
                      {item.provenance.acceptance === 'confirmed' &&
                        ' · leitura que você confirmou'}
                      {item.provenance.acceptance === 'rejected' && ' · leitura que você recusou'}
                      {item.provenance.acceptance === 'not-preferred' &&
                        ' · leitura possível que você não escolheu'}
                    </small>
                    {item.provenance.lexicalStatus === 'provisional' && (
                      <small>{acceptanceLabel(item)}</small>
                    )}
                    {candidateDecompositions(item).map((decomposition, position) => (
                      <small className="lab-lexical-evidence" key={`decomposition-${position}`}>
                        <strong>
                          Significado de {decomposition.dictionaryHeadword} · Navarro:{' '}
                        </strong>
                        {decomposition.definition}
                      </small>
                    ))}
                    {candidateDecompositions(item).length > 0 && (
                      <small>{DECOMPOSITION_NOTE}</small>
                    )}
                    {candidateLexicalEvidence(item).map((evidence, position) => (
                      <small className="lab-lexical-evidence" key={position}>
                        {lexicalEvidenceLabel(evidence)}
                      </small>
                    ))}
                    {/* Two readings that realize the same form differ somewhere in
                        the grammar's own annotation. Showing exactly where turns
                        the choice into an informed one. */}
                    {annotationDifference(item).length > 0 && (
                      <small className="lab-difference">
                        Difere da primeira leitura em{' '}
                        {annotationDifference(item)
                          .map(
                            (row) =>
                              `${row.surface}: ${(row.left ?? ['—']).join(' ')} vs ${(row.right ?? ['—']).join(' ')}`,
                          )
                          .join('; ')}
                      </small>
                    )}
                    {(item.provenance.annotationIdenticalSources ?? []).length > 0 && (
                      <small>
                        Mesma análise, outra escrita:{' '}
                        {(item.provenance.annotationIdenticalSources ?? []).join(', ')}
                      </small>
                    )}
                  </button>
                  {index === selected && result.candidates.length > 1 && (
                    <button
                      className="button small lab-choose"
                      data-testid={`lab-choose-${index}`}
                      onClick={() => void judge('accepted')}
                    >
                      <Check size={14} />{' '}
                      {item.provenance.lexicalStatus === 'provisional'
                        ? 'Prefiro esta hipótese'
                        : 'Esta é a leitura correta'}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {candidate && (
            <>
              <p className="lab-note">{candidate.scoreMeaning}</p>
              <section className="lab-morphemes" aria-label="Morfemas do motor">
                <h3>Morfemas e etiquetas do motor</h3>
                <ul data-testid="lab-morphemes">
                  {displayedMorphemes.map((morpheme) => (
                    <li key={morpheme.occurrence}>
                      <code lang="tpw">{morpheme.surface}</code>
                      <small>{morpheme.tags.join(' · ')}</small>
                    </li>
                  ))}
                </ul>
                {!displayedMorphemes.length && (
                  <p className="lab-note">O motor não forneceu segmentação em morfemas.</p>
                )}
                <p className="lab-note">{result.alignmentNote}</p>
              </section>
              <section className="lab-coverage" aria-label="Cobertura e validação">
                <dl>
                  <div>
                    <dt>Forma restaurada</dt>
                    <dd lang="tpw" data-testid="lab-surface">
                      {evaluated?.surface ?? candidate.surface}
                    </dd>
                  </div>
                  <div>
                    <dt>Validação</dt>
                    <dd>{validationLabel(candidate)}</dd>
                  </div>
                  <div>
                    <dt>Trechos cobertos</dt>
                    <dd>
                      {candidate.spans.length
                        ? candidate.spans
                            .map(
                              (span) =>
                                `${span.type} ${result.input.normalized.slice(span.start, span.end)}`,
                            )
                            .join(' + ')
                        : 'Correspondência única em toda a entrada.'}
                    </dd>
                  </div>
                  <div>
                    <dt>Estado desta leitura</dt>
                    <dd data-testid="lab-acceptance">{acceptanceLabel(candidate)}</dd>
                  </div>
                  <div>
                    <dt>Procedência</dt>
                    <dd>
                      {routeLabel(candidate)}
                      {candidate.provenance.measuresGeneralization === false &&
                        ' — a recuperação não mede generalização.'}
                    </dd>
                  </div>
                </dl>
              </section>
            </>
          )}
          {result.rejections.length > 0 && (
            <details className="lab-details">
              <summary>Motivos de recusa ({result.rejections.length})</summary>
              <ul>
                {result.rejections.map((row) => (
                  <li key={row.code}>
                    <code>{row.code}</code> ×{row.count} — {row.message}
                    {row.detail ? ` (${row.detail})` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details className="lab-details">
            <summary>
              <Code2 size={14} /> Configuração e tempos
            </summary>
            <pre>
              {JSON.stringify(
                {
                  input: result.input,
                  context: result.context,
                  artifacts: result.artifacts,
                  timings: result.timings,
                  configuration: result.configuration,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      )}
      {editor && (
        <section className="lab-editor" aria-label="Árvore do laboratório">
          <h3>Editar esta análise</h3>
          <p className="lab-note">
            Edições ficam no laboratório. O rascunho aberto, a fonte, a tradução humana e a
            referência não são alterados.
          </p>
          <div className="lab-tree">
            <PydicateTree
              raw={editor.raw}
              evaluatedRoot={evaluated?.tree}
              authoringRoot={parsed?.root}
              revisionId={`parser-lab:${undo.length}:${redo.length}`}
              engineFingerprint={project.engineFingerprint}
              sourceId={result?.context.sourceId}
              canvas={editor.canvas}
              onChangeCanvas={(edit) => install({ ...editor, ...edit })}
              onChangeRaw={(raw) => install({ ...editor, raw })}
              onUndo={
                undo.length
                  ? () => {
                      request.current += 1;
                      setJudged('');
                      const next = undo.at(-1)!;
                      setRedo((values) => [...values, editor]);
                      setUndo((values) => values.slice(0, -1));
                      setEditor(next);
                    }
                  : undefined
              }
              onRedo={
                redo.length
                  ? () => {
                      request.current += 1;
                      setJudged('');
                      const next = redo.at(-1)!;
                      setUndo((values) => [...values, editor]);
                      setRedo((values) => values.slice(0, -1));
                      setEditor(next);
                    }
                  : undefined
              }
              canUndo={!!undo.length}
              canRedo={!!redo.length}
              failures={evaluated?.failures}
              status={evaluating ? 'Avaliando no laboratório…' : undefined}
            />
          </div>
          <label className="lab-code">
            Código da análise
            <textarea
              data-testid="lab-code"
              rows={3}
              spellCheck={false}
              value={editor.raw}
              onChange={(event) => install({ ...editor, raw: event.target.value })}
            />
          </label>
          <p className="lab-editor-surface" data-testid="lab-editor-surface" lang="tpw">
            {evaluating ? 'Avaliando…' : (evaluated?.surface ?? 'Sem forma completa')}
          </p>
          <div className="lab-actions">
            <button
              className="button small"
              onClick={() => void window.studio?.copyText?.(editor.raw)}
            >
              <Copy size={15} /> Copiar código
            </button>
            <button
              className="button small"
              onClick={() =>
                void window.studio?.copyText?.(
                  JSON.stringify({ result, expression: editor.raw }, null, 2),
                )
              }
            >
              Exportar resultado
            </button>
            {onTransfer && (
              <button className="button small" onClick={() => setTransferOpen(true)}>
                <ChevronRight size={15} /> Levar para um rascunho
              </button>
            )}
          </div>
          {transferOpen && onTransfer && (
            <div className="lab-confirm" role="group" aria-label="Levar para um rascunho">
              <p>
                Substituir a expressão do rascunho aberto por esta análise? Você poderá desfazer.
                Nada é publicado na fonte nem aprovado como referência.
              </p>
              <button
                className="button"
                onClick={() => {
                  onTransfer(editor.raw);
                  setTransferOpen(false);
                }}
              >
                Levar para o rascunho
              </button>
              <button className="button" onClick={() => setTransferOpen(false)}>
                Manter só no laboratório
              </button>
            </div>
          )}
          <div className="lab-actions" aria-label="Julgamento do contribuidor">
            <button className="button small" onClick={() => void judge('accepted')}>
              Análise aceitável
            </button>
            <button className="button small" onClick={() => void judge('rejected')}>
              Análise incorreta
            </button>
            <button className="button small" onClick={() => void judge('corrected')}>
              Registrar minha correção
            </button>
            <button className="button small" onClick={() => void judge('uncertain')}>
              Sem certeza
            </button>
          </div>
          {judged && <p role="status">{judged}</p>}
        </section>
      )}
    </main>
  );
}

function JobControls({
  project,
  status,
  onRefresh,
  stage,
  params,
  label,
  disabled,
}: {
  project: StudioProject;
  status: LabStatus | null;
  onRefresh: () => Promise<void>;
  stage: 'prepare' | 'train' | 'evaluate';
  params: Record<string, unknown>;
  label: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const active = status?.jobs.find(
    (job) => job.status === 'running' || job.status === 'cancelling',
  );
  async function start() {
    setStarting(true);
    setError('');
    try {
      await invoke('parser_lab_job_start', { projectId: project.id, stage, ...params });
      await onRefresh();
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      setStarting(false);
    }
  }
  async function cancel() {
    if (!active) return;
    try {
      await invoke('parser_lab_job_cancel', { projectId: project.id, jobId: active.id });
      await onRefresh();
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    }
  }
  return (
    <div className="lab-actions">
      <button
        className="button primary"
        data-testid={`lab-start-${stage}`}
        disabled={disabled || starting || Boolean(active)}
        onClick={() => void start()}
      >
        <Play size={15} /> {label}
      </button>
      {active && (
        <button className="button small" onClick={() => void cancel()}>
          <Square size={14} /> Cancelar {jobLabel(active)}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function DataSection({
  project,
  status,
  onRefresh,
  local,
}: {
  project: StudioProject;
  status: LabStatus | null;
  onRefresh: () => Promise<void>;
  local: boolean;
}) {
  const [profile, setProfile] = useState('smoke');
  const chosen = status?.profiles.find((item) => item.profile === profile);
  return (
    <main className="lab-main" aria-label="Dados">
      <ArtifactBanner status={status} />
      <p>
        A preparação inclui as entradas compatíveis de toda a cópia local do dicionário Navarro e o
        léxico compartilhado, inclusive no perfil mínimo. Também gera fragmentos das famílias
        declaradas e indexa expressões já registradas no corpus. O perfil limita os exemplos de
        treino e avaliação, que são separados por grupo. O índice recém-preparado é ativado por este
        botão.
      </p>
      <label>
        Perfil
        <select
          data-testid="lab-profile"
          value={profile}
          onChange={(event) => setProfile(event.target.value)}
        >
          {(status?.profiles ?? []).map((item) => (
            <option key={item.profile} value={item.profile}>
              {item.label} ({item.profile})
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <ul className="lab-profile">
          <li>{chosen.description}</li>
          <li>
            Inventário:{' '}
            {Object.entries(chosen.inventoryCounts)
              .map(([key, value]) => `${key} ${value}`)
              .join(', ')}
          </li>
          <li>Famílias: {chosen.families.join(', ')}</li>
          <li>Regras raiz: {chosen.rootRules.join(', ')}</li>
          <li>
            Limites:{' '}
            {Object.entries(chosen.limits)
              .map(([k, v]) => `${k} ${v}`)
              .join(', ')}{' '}
            · armazenamento estimado {formatBytes(chosen.estimatedBytes)}
          </li>
          <li>
            Reservas: léxico {chosen.holdout?.lexemes?.join(', ') || 'nenhuma'}; famílias{' '}
            {chosen.holdout?.families?.join(', ') || 'nenhuma'}
          </li>
        </ul>
      )}
      <JobControls
        project={project}
        status={status}
        onRefresh={onRefresh}
        stage="prepare"
        params={{ profile }}
        label="Preparar baseline"
        disabled={!local}
      />
      <p className="lab-note">Diretório de artefatos: {status?.artifactRoot ?? '—'}</p>
      {Boolean(status?.interrupted.length) && (
        <section aria-label="Preparações interrompidas">
          <h3>Preparações interrompidas</h3>
          <ul className="lab-profile">
            {status?.interrupted.map((row) => (
              <li key={row.name}>
                <code>{row.name}</code> — última etapa {row.lastStage ?? 'desconhecida'}
              </li>
            ))}
          </ul>
          <p className="lab-note">
            Um trabalho interrompido nunca é reaproveitado como artefato concluído. Descartar os
            restos libera espaço; a preparação recomeça do início.
          </p>
          <button
            className="button small"
            data-testid="lab-clear-staging"
            onClick={() =>
              void invoke('parser_lab_clear_staging', { projectId: project.id }).then(() =>
                onRefresh(),
              )
            }
          >
            Descartar restos interrompidos
          </button>
        </section>
      )}
      <ArtifactTable status={status} project={project} onRefresh={onRefresh} />
    </main>
  );
}

function ArtifactTable({
  status,
  project,
  onRefresh,
}: {
  status: LabStatus | null;
  project: StudioProject;
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  // The worker enforces compatibility against the live engine before it uses an
  // artifact. Here we can only compare contexts with the active index, which is
  // enough to show which artifacts were built under a different one.
  const reference = activeArtifact(status, 'index')?.contextFingerprint ?? null;
  async function activate(kind: string, artifactId: string) {
    try {
      await invoke('parser_lab_activate', { projectId: project.id, kind, artifactId });
      await onRefresh();
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    }
  }
  return (
    <section aria-label="Artefatos">
      <h3>Artefatos</h3>
      {error && <p role="alert">{error}</p>}
      {!status?.artifacts.length && <p>Nenhum artefato preparado neste projeto.</p>}
      <table className="lab-table">
        <tbody>
          {(status?.artifacts ?? []).map((artifact) => (
            <tr key={artifact.artifactId}>
              <td>
                <code>{artifact.artifactId}</code>
                <small>{artifact.kind}</small>
              </td>
              <td>
                {artifact.completed ? 'concluído' : artifact.status}
                {artifact.completed && !artifactUsable(artifact, reference) && (
                  <small>outro contexto de motor — reconstrua antes de usar</small>
                )}
              </td>
              <td>
                {Object.entries(artifact.counts)
                  .slice(0, 4)
                  .map(([key, value]) => `${key} ${value}`)
                  .join(' · ')}
              </td>
              <td>
                {status?.active[artifact.kind] === artifact.artifactId ? (
                  <strong>ativo</strong>
                ) : (
                  <button
                    className="button small"
                    disabled={!artifact.completed}
                    onClick={() => void activate(artifact.kind, artifact.artifactId)}
                  >
                    Ativar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TrainSection({
  project,
  status,
  onRefresh,
  local,
}: {
  project: StudioProject;
  status: LabStatus | null;
  onRefresh: () => Promise<void>;
  local: boolean;
}) {
  const [optional, setOptional] = useState<{
    neural?: Record<string, unknown>;
    agent?: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState('');
  const rankers = (status?.artifacts ?? []).filter((item) => item.kind === 'ranker');
  return (
    <main className="lab-main" aria-label="Treinar">
      <ArtifactBanner status={status} />
      <p>
        O classificador de candidatos é treinado com contrastes produzidos pelo mesmo buscador que o
        laboratório usa em tempo real. Ele só é ativado por ação explícita, e a comparação com a
        ordenação determinística fica registrada no artefato.
      </p>
      <JobControls
        project={project}
        status={status}
        onRefresh={onRefresh}
        stage="train"
        params={{ epochs: 8, maxExamples: 400, maxContrasts: 400 }}
        label="Treinar classificador"
        disabled={!local || !status?.active.index}
      />
      {rankers.map((artifact) => (
        <details key={artifact.artifactId} className="lab-details" open>
          <summary>
            <code>{artifact.artifactId}</code>{' '}
            {status?.active.ranker === artifact.artifactId ? '(ativo)' : ''}
          </summary>
          <pre>{JSON.stringify(artifact.metrics, null, 2)}</pre>
          {artifact.metrics?.recommendActivation === false && (
            <p role="note">
              Os dados desta execução não justificam ativar o classificador: a ordenação
              determinística permanece ativa.
            </p>
          )}
        </details>
      ))}
      <LearningPanel project={project} />
      <section aria-label="Rotas opcionais">
        <h3>Rotas opcionais</h3>
        <button
          className="button small"
          onClick={() =>
            void invoke<{ neural: Record<string, unknown>; agent: Record<string, unknown> }>(
              'parser_lab_optional',
              { projectId: project.id },
            )
              .then(setOptional)
              .catch((reason) =>
                setError(String(reason instanceof Error ? reason.message : reason)),
              )
          }
        >
          Conferir disponibilidade
        </button>
        {error && <p role="alert">{error}</p>}
        {optional && <pre data-testid="lab-optional">{JSON.stringify(optional, null, 2)}</pre>}
      </section>
    </main>
  );
}

function LearningPanel({ project }: { project: StudioProject }) {
  const [feedback, setFeedback] = useState<LabFeedback | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      setFeedback(await invoke<LabFeedback>('parser_lab_feedback', { projectId: project.id }));
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Aprendizado com o uso">
      <h3>O que o uso já ensinou</h3>
      <p className="lab-note">
        Cada análise fica registrada localmente. Confirmar ou corrigir uma leitura vale mais do que
        qualquer exemplo gerado: duas leituras que realizam a mesma forma só podem ser separadas por
        quem lê. Correções que a busca nunca propôs são falhas de cobertura, não de ordenação, e
        aparecem abaixo como lacunas.
      </p>
      <div className="lab-actions">
        <button className="button small" data-testid="lab-feedback" onClick={() => void load()}>
          <RefreshCw size={15} /> {busy ? 'Conferindo…' : 'Conferir aprendizado'}
        </button>
        {feedback && (
          <button
            className="button small"
            onClick={() =>
              void invoke('parser_lab_feedback_export', { projectId: project.id }).catch((reason) =>
                setError(String(reason instanceof Error ? reason.message : reason)),
              )
            }
          >
            Exportar para treino
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {feedback && (
        <>
          <ul className="lab-profile" data-testid="lab-feedback-summary">
            <li>
              {feedback.summary.attempts} análises registradas, {feedback.summary.attemptsUnknown}{' '}
              sem nenhuma leitura válida
            </li>
            <li>
              {feedback.summary.judgments} julgamentos · {feedback.summary.confirmedExamples}{' '}
              leituras confirmadas · {feedback.summary.preferencePairs} contrastes decididos para o
              treino
            </li>
            <li>
              {feedback.summary.correctionsTheSearchNeverProposed} correções que a busca nunca
              propôs (cobertura, não ordenação)
            </li>
          </ul>
          {feedback.coverageGaps.length > 0 && (
            <details className="lab-details" open>
              <summary>Lacunas de cobertura ({feedback.coverageGaps.length})</summary>
              <ul className="lab-profile" data-testid="lab-gaps">
                {feedback.coverageGaps.map((gap) => (
                  <li key={gap.normalized}>
                    <code lang="tpw">{gap.normalized}</code> · {gap.attempts}×
                    {gap.recognizedSpans.length > 0
                      ? ' · reconhecido: ' +
                        gap.recognizedSpans
                          .slice(0, 4)
                          .map((span) => `${span.text} (${span.types.join('/')})`)
                          .join(', ')
                      : ' · nenhum trecho reconhecido'}
                  </li>
                ))}
              </ul>
              <p className="lab-note">
                Cada linha é uma frase que alguém quis analisar e o inventário declarado não
                alcançou. Amplie o perfil em Dados e prepare de novo.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function EvaluateSection({
  project,
  status,
  onRefresh,
  local,
}: {
  project: StudioProject;
  status: LabStatus | null;
  onRefresh: () => Promise<void>;
  local: boolean;
}) {
  const evaluations = (status?.artifacts ?? []).filter((item) => item.kind === 'evaluation');
  return (
    <main className="lab-main" aria-label="Avaliar">
      <ArtifactBanner status={status} />
      <p>
        Cada conjunto responde a uma pergunta diferente e é relatado com o seu denominador. A
        recuperação de expressões conhecidas não mede generalização; as reservas de léxico e de
        família são repetidas com o recurso removido do índice, para mostrar onde a gramática
        declarada deixa de generalizar.
      </p>
      <JobControls
        project={project}
        status={status}
        onRefresh={onRefresh}
        stage="evaluate"
        params={{ sample: 25 }}
        label="Avaliar"
        disabled={!local || !status?.active.index}
      />
      {evaluations.map((artifact) => (
        <details key={artifact.artifactId} className="lab-details" open>
          <summary>
            <code>{artifact.artifactId}</code>
          </summary>
          <pre data-testid="lab-evaluation">{JSON.stringify(artifact.metrics, null, 2)}</pre>
        </details>
      ))}
    </main>
  );
}

function RunsSection({
  project,
  status,
  onRefresh,
}: {
  project: StudioProject;
  status: LabStatus | null;
  onRefresh: () => Promise<void>;
}) {
  return (
    <main className="lab-main" aria-label="Execuções">
      <button className="button small" onClick={() => void onRefresh()}>
        <RefreshCw size={15} /> Atualizar
      </button>
      {!status?.jobs.length && <p>Nenhuma execução registrada neste projeto.</p>}
      <ul className="lab-jobs" data-testid="lab-jobs">
        {(status?.jobs ?? []).map((job: LabJob) => (
          <li key={job.id}>
            <strong>{jobLabel(job)}</strong>
            <small>
              {job.profile ? `perfil ${job.profile} · ` : ''}
              {job.startedAt}
              {job.finishedAt ? ` → ${job.finishedAt}` : ''}
            </small>
            {job.artifactId && (
              <small>
                artefato <code>{job.artifactId}</code>
              </small>
            )}
            {job.error && <p role="alert">{job.error}</p>}
            {job.progress.length > 0 && (
              <details className="lab-details">
                <summary>Progresso ({job.progress.length})</summary>
                <pre>{job.progress.map((row) => JSON.stringify(row)).join('\n')}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      <p className="lab-note">
        Um trabalho interrompido pelo encerramento do Studio aparece como interrompido e nunca é
        repetido automaticamente.
      </p>
      <p className="lab-note">Projeto: {project.id}</p>
    </main>
  );
}

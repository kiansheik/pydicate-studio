import { TranslationFields } from './components/TranslationFields';
import { MorphemeText } from './components/MorphemeHighlight';
import type { MorphemeSurfaceHighlight } from './domain/morpheme-display';
import { sameTranslations } from './domain/translations';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Code2,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Layers,
  Leaf,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { compareReference, expressionFor } from './domain/model';
import { flushLexicalNotes } from './domain/lexical-note-sync';
import { analysisNoteSnapshot } from './domain/analysis-submission';
import type { LexicalNote } from './domain/passage-lexicon';
import { SourceRecovery } from './components/SourceRecovery';
import {
  SourceReviewContent,
  currentSourceReviewResult,
  reviewKind,
  sourceReviewTitle,
} from './components/SourceReviewContent';
import { AuthoringEditor, LexiconPanel } from './components/AuthoringEditor';
import { DictionaryTab } from './components/DictionaryTab';
import {
  AnalysisSupport,
  CandidateProjection,
  useAnalysisWorkspace,
} from './components/AnalysisSupport';
import { analysisLabels, type AnalysisEvidence } from './domain/analysis';
import { PydicateTree } from './components/RuntimeTree';
import { UsagePanel } from './components/UsagePanel';
import { WorkspaceLayout, useWorkspaceLayout } from './components/WorkspaceLayout';
import { PassageLexicon } from './components/PassageLexicon';
import { PassageSolver } from './components/PassageSolver';
import { GrammarDiagnosticDialog } from './components/GrammarDiagnosticDialog';
import type { CanvasDiagnostic } from './domain/grammar-diagnostic';
import { DraftArchive } from './components/DraftArchive';
import { track } from './domain/usage';
import './workbench.css';
import { flattenNodes, invoke, type SourcePreview } from './domain/authoring';
import { PhraseEditor, SelectionNote, nodeLabels } from './components/PhraseEditor';
import { useStudio } from './useStudio';
import type { Studio } from './useStudio';

const LearningWorkspace = lazy(() =>
  import('./components/LearningWorkspace').then((module) => ({
    default: module.LearningWorkspace,
  })),
);
// Hidden experimental workspace. The module is only fetched once a contributor
// has enabled it and opened it, so an ordinary session never loads this code.
const ParserLab = lazy(() =>
  import('./components/ParserLab').then((module) => ({ default: module.ParserLab })),
);
const tabs = [
  'Construção',
  'Morfemas',
  'Árvore',
  'Sugerir',
  'Tradução',
  'Histórico',
  'Código',
] as const;
type Tab = (typeof tabs)[number];
const statusLabels = {
  untranscribed: 'Por transcrever',
  analysis: 'Em análise',
  review: 'Precisa de revisão',
  approved: 'Aprovado',
  changed: 'Resultado mudou',
  complete: 'Concluída',
};

function exportContribution(studio: Studio) {
  const payload = {
    format: 'pydicate-studio-contribution',
    version: 1,
    exportedAt: new Date().toISOString(),
    projectId: studio.project.id,
    passage: {
      id: studio.passage.id,
      legacyId: studio.passage.legacyId,
      sourceId: studio.passage.sourceId,
      sourceExpression: studio.passage.sourceExpression,
      sourceFingerprint: studio.passage.sourceFingerprint,
    },
    draft: studio.draft,
    reference: {
      text: studio.passage.acceptedReference,
      provenance: studio.passage.referenceProvenance,
    },
    evaluation: studio.result,
    repositories: studio.project.repositories,
    editorialApproval: null,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pydicate-contribuicao-${studio.passage.ordinal}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Projections({
  studio,
  tab,
  selected,
  select,
  inspectLexeme,
  lexicalPreview,
  prepareDiagnostic,
  askAI,
  openLaboratory,
  translate,
  onSurfaceHighlight,
}: {
  studio: Studio;
  tab: Tab;
  selected: string;
  select: (id: string) => void;
  inspectLexeme: () => void;
  lexicalPreview: (preview: SourcePreview) => void;
  prepareDiagnostic: (report: CanvasDiagnostic) => void;
  askAI: (id: string) => void;
  openLaboratory: () => void;
  translate: () => void;
  onSurfaceHighlight: (highlight: MorphemeSurfaceHighlight | null) => void;
}) {
  const { draft, passage, result } = studio;
  if (studio.project.mode === 'local' && tab === 'Árvore')
    return (
      <PydicateTree
        evaluatedRoot={result?.tree}
        failures={result?.failures}
        selectedSourceNodeId={selected}
        onSelectSourceNode={select}
        onSurfaceHighlight={onSurfaceHighlight}
        status={studio.pending ? 'Avaliando a estrutura…' : studio.renderError || undefined}
        authoringRoot={studio.parsed?.root}
        raw={draft?.raw ?? passage.sourceExpression}
        revisionId={draft?.revisionId}
        passageId={passage.id}
        sourceId={passage.sourceId}
        engineFingerprint={studio.project.engineFingerprint}
        onChangeRaw={(raw) => studio.edit({ raw })}
        canvas={draft?.canvas}
        onChangeCanvas={(changes) => studio.edit(changes)}
        onPrepareDiagnostic={prepareDiagnostic}
        onUndo={studio.undo}
        onRedo={studio.redo}
        canUndo={studio.canUndo}
        canRedo={studio.canRedo}
        onLexicalPreview={lexicalPreview}
        onInspectLexeme={inspectLexeme}
        onAskAI={askAI}
      />
    );
  if (studio.project.mode === 'local' && ['Construção', 'Código'].includes(tab))
    return (
      <AuthoringEditor
        studio={studio}
        selected={selected}
        onSelect={select}
        codeOnly={tab === 'Código'}
      />
    );
  if (tab === 'Sugerir') return <PassageSolver studio={studio} onOpenLaboratory={openLaboratory} />;
  if (tab === 'Construção')
    return <PhraseEditor studio={studio} selected={selected} select={select} />;
  if (tab === 'Morfemas')
    return (
      <div className="projection">
        <div className="section-intro">
          <div>
            <h2>O que cada parte realiza</h2>
            <p>As anotações vêm do motor que gerou esta forma.</p>
          </div>
        </div>
        {result ? (
          <>
            <div className="morpheme-strip">
              {result.morphemes.map((m, i) => (
                <button
                  key={i}
                  data-node-id={m.nodeId}
                  aria-pressed={selected === m.nodeId}
                  className={`morpheme ${selected === m.nodeId ? 'is-selected' : ''}`}
                  onClick={() => select(m.nodeId)}
                >
                  <span lang="tpw">{m.text}</span>
                  <small>{m.tag}</small>
                </button>
              ))}
            </div>
            <div className="annotation-list">
              {result.morphemes.map((m, i) => (
                <div key={i}>
                  <span className="annotation-form">{m.text}</span>
                  <p>{m.explanation}</p>
                </div>
              ))}
            </div>
            <p className="field-hint">
              Morfemas e constituintes são camadas distintas. Um participante subentendido pode não
              ter forma independente.
            </p>
          </>
        ) : (
          <p className="empty-message">
            Selecione a passagem 0067 para explorar a realização do primeiro editor.
          </p>
        )}
      </div>
    );
  if (tab === 'Árvore')
    return (
      <div className="projection">
        <div className="section-intro">
          <div>
            <h2>Estrutura e escopo</h2>
            <p>A árvore acompanha as mesmas escolhas do editor.</p>
          </div>
        </div>
        {draft?.analysis ? (
          <div className="syntax-tree">
            {draft.analysis.negated && (
              <>
                <button
                  data-node-id="negation"
                  aria-pressed={selected === 'negation'}
                  onClick={() => select('negation')}
                  className={`tree-node ${selected === 'negation' ? 'is-selected' : ''}`}
                >
                  Negação <small>escopo: oração inteira</small>
                </button>
                <div className="tree-line" />
              </>
            )}
            <button
              data-node-id="mood"
              aria-pressed={selected === 'mood'}
              onClick={() => select('mood')}
              className={`tree-node ${selected === 'mood' ? 'is-selected' : ''}`}
            >
              {draft.analysis.mood === 'imperative' ? 'Imperativo' : 'Indicativo'}
            </button>
            <div className="tree-line" />
            <button
              data-node-id="clause"
              aria-pressed={selected === 'clause'}
              onClick={() => select('clause')}
              className={`tree-node ${selected === 'clause' ? 'is-selected' : ''}`}
            >
              Oração
            </button>
            <div className="tree-line" />
            <div className="tree-branches">
              {['subject', 'predicate', 'object'].map((id) => (
                <button
                  key={id}
                  data-node-id={id}
                  aria-pressed={selected === id}
                  onClick={() => select(id)}
                  className={`tree-node ${selected === id ? 'is-selected' : ''}`}
                >
                  {nodeLabels[id]}
                  {id === 'subject' && (
                    <small>{draft.analysis?.hiddenSubject ? 'Subentendido' : 'Expresso'}</small>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="empty-message">
            A representação visual desta construção ainda não está disponível. Sua expressão
            original foi preservada.
          </p>
        )}
      </div>
    );
  if (tab === 'Tradução')
    return (
      <div className="projection">
        <div className="section-intro">
          <div>
            <h2>Tradução da passagem</h2>
            <p>Registre sua tradução e preserve dúvidas para a revisão.</p>
          </div>
          {studio.project.mode === 'local' && (
            <button
              className="button small"
              disabled={!studio.ready || !draft?.raw?.trim() || studio.pending}
              onClick={translate}
            >
              Traduzir árvore atual
            </button>
          )}
        </div>
        <label className="editor-label">
          Tradução sem idioma informado
          <textarea
            rows={7}
            disabled={!studio.ready}
            value={draft?.translation ?? ''}
            onChange={(e) => studio.edit({ translation: e.target.value })}
            placeholder="Como você interpreta esta passagem?"
          />
        </label>
        <TranslationFields
          value={draft?.translations}
          disabled={!studio.ready}
          onChange={(translations) => studio.edit({ translations })}
        />
        <div className="teaching-note">
          <MessageSquareText size={18} />
          <p>
            A tradução é independente da análise formal. Nenhuma sugestão é convertida
            automaticamente em leitura aceita.
          </p>
        </div>
      </div>
    );
  if (tab === 'Histórico')
    return (
      <div className="projection">
        <div className="section-intro">
          <div>
            <h2>De onde vem esta leitura</h2>
            <p>Referência, rascunho e verificação têm origens distintas.</p>
          </div>
        </div>
        <div className="timeline">
          <div>
            <span className="timeline-dot" />
            <strong>Referência importada do corpus</strong>
            <p>{passage.acceptedReference ?? 'Ainda não há uma referência salva.'}</p>
            <small>
              {passage.referenceProvenance === 'example'
                ? 'Cópia de exemplo · origem editorial legada'
                : 'Origem editorial legada ou não informada'}{' '}
              · sem nova aprovação
            </small>
          </div>
          <div>
            <span className="timeline-dot" />
            <strong>Rascunho neste dispositivo</strong>
            <p>Leitura, tradução, notas e estrutura são salvas separadamente.</p>
            <small>
              {draft ? new Date(draft.updatedAt).toLocaleString('pt-BR') : 'Carregando…'}
            </small>
          </div>
          <div>
            <span className="timeline-dot" />
            <strong>
              {studio.project.mode === 'local'
                ? 'Avaliação pelo motor local'
                : 'Resultado de exemplo'}
            </strong>
            <p>
              {result
                ? 'Comparação vinculada à revisão atual do rascunho.'
                : 'Nenhuma avaliação disponível para esta construção.'}
            </p>
          </div>
        </div>
        <p className="field-hint">
          Este resumo mostra a origem dos dados. O histórico imutável de decisões editoriais será
          integrado ao serviço do corpus.
        </p>
      </div>
    );
  return (
    <div className="projection">
      <div className="section-intro">
        <div>
          <h2>A expressão por trás da análise</h2>
          <p>O código acompanha a estrutura; você não precisa escrevê-lo.</p>
        </div>
        <Code2 size={19} />
      </div>
      <span className="eyebrow">
        {draft?.analysis ? 'EXPRESSÃO DO RASCUNHO' : 'EXPRESSÃO ORIGINAL · SOMENTE LEITURA'}
      </span>
      <pre className="expression-code">
        <code>{draft?.analysis ? expressionFor(draft.analysis) : passage.sourceExpression}</code>
      </pre>
      <details className="code-details">
        <summary>Expressão original preservada</summary>
        <pre>
          <code>{passage.sourceExpression}</code>
        </pre>
      </details>
      {result && (
        <details className="code-details">
          <summary>Anotações do motor</summary>
          <pre>
            <code>{result.annotated}</code>
          </pre>
        </details>
      )}
      <p className="field-hint">
        O rascunho não reescreve o arquivo .tu.py. Exporte a contribuição para inspecionar a
        proposta junto com sua origem.
      </p>
    </div>
  );
}

function ProjectDialog({ studio, close }: { studio: Studio; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="project-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-header">
        <span className="eyebrow">SEU ESPAÇO DE TRABALHO</span>
        <button className="icon-button" aria-label="Fechar projeto" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <h2>Ler, descrever, construir.</h2>
      <p>Comece pela passagem. A estrutura pode vir depois.</p>
      {window.studio?.setupProject && (
        <>
          <button
            className="project-option actionable"
            disabled={studio.busy}
            onClick={() => {
              void studio.setupProject().then((opened) => {
                if (opened) close();
              });
            }}
          >
            <div className="project-option-icon">
              <ArrowDownToLine />
            </div>
            <div>
              <strong>
                {studio.installation?.workspace.ready
                  ? 'Abrir meu espaço de trabalho'
                  : 'Preparar meu espaço de trabalho'}
              </strong>
              <p>
                Baixa o corpus e a gramática para este computador. O aplicativo já inclui Python e
                Git.
              </p>
              {studio.installation && (
                <small className="workspace-directory">
                  {studio.installation.workspace.directory}
                </small>
              )}
            </div>
            <ChevronRight size={20} />
          </button>
          {studio.setupProgress && (
            <div className="setup-progress" role="status" aria-live="polite">
              {studio.setupProgress.message}
              {studio.busy && <progress max={100} value={studio.setupProgress.percent} />}
            </div>
          )}
          {studio.error && <p role="alert">{studio.error}</p>}
        </>
      )}
      <button
        className="project-option"
        disabled={studio.busy}
        onClick={() => {
          void studio.openExample().then(close);
        }}
      >
        <div className="project-option-icon">
          <BookOpen />
        </div>
        <div>
          <strong>Explorar o exemplo incluído</strong>
          <p>
            Oito passagens reais de Araújo. Rascunhos locais e resultados previamente avaliados para
            0067.
          </p>
        </div>
        <span className="tag">{studio.project.mode === 'example' ? 'Aberto' : 'Explorar'}</span>
      </button>
      <button
        className="project-option actionable"
        disabled={studio.busy || !window.studio}
        onClick={() => {
          void studio.openProject().then((opened) => {
            if (opened) close();
          });
        }}
      >
        <div className="project-option-icon">
          <FolderOpen />
        </div>
        <div>
          <strong>Abrir projeto existente</strong>
          <p>
            {window.studio
              ? 'Escolha a pasta que contém oldtupicorpus e nhe-enga.'
              : 'Disponível no aplicativo desktop. Execute npm run desktop para abrir seus repositórios.'}
          </p>
        </div>
        <ChevronRight size={20} />
      </button>
      <div className="dialog-footnote">
        <Leaf size={16} />
        <span>
          Seus rascunhos ficam neste dispositivo. A fonte e as referências do corpus são
          preservadas.
        </span>
      </div>
      {studio.installation && (
        <div className="installation-status">
          <p>
            Studio {studio.installation.update.currentVersion} ·{' '}
            {studio.installation.update.message}
          </p>
          {[
            ...new Set([
              ...studio.installation.warnings,
              ...studio.installation.workspace.warnings,
            ]),
          ].map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <p>
            Ao abrir, o Studio procura atualizações. Alterações locais no corpus e na gramática são
            preservadas.
          </p>
          <button className="button small" onClick={() => void window.studio?.openReleasePage?.()}>
            Página de versões
          </button>
        </div>
      )}
    </dialog>
  );
}

export default function App() {
  const studio = useStudio();
  const { project, passage, draft, result } = studio;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState<Tab>(window.studio ? 'Árvore' : 'Construção');
  const [selected, setSelected] = useState('object');
  const [surfaceHighlight, setSurfaceHighlight] = useState<MorphemeSurfaceHighlight | null>(null);
  const [mode, setMode] = useState<'analysis' | 'reading' | 'review' | 'lexicon' | 'dictionary'>(
    'analysis',
  );
  const [projectDialog, setProjectDialog] = useState(false);
  useEffect(() => {
    if (studio.setupRequired) setProjectDialog(true);
  }, [studio.setupRequired]);
  const [details, setDetails] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [learningView, setLearningView] = useState<'lessons' | 'reference' | null>(null);
  const [labOpen, setLabOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [translationRequest, setTranslationRequest] = useState(0);
  const layout = useWorkspaceLayout();
  const openTranslation = () => {
    layout.support('ai');
    setTranslationRequest((value) => value + 1);
  };
  const analysis = useAnalysisWorkspace(studio);
  const [dictionaryEvidence, setDictionaryEvidence] = useState<AnalysisEvidence | null>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('studio-theme') || 'dark');
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [approveOnSave, setApproveOnSave] = useState(true);
  useEffect(() => setApproveOnSave(true), [preview?.previewId]);
  const passageReview =
    !!preview && ['passage-update', 'passage-new'].includes(reviewKind(preview));
  const previewHasChanges = Boolean(preview?.diff || preview?.files?.some((file) => file.diff));
  const reviewedResult = preview
    ? currentSourceReviewResult({
        preview,
        currentPassageId: passage.id,
        draftRevisionId: draft?.revisionId,
        draftRaw: draft?.raw ?? passage.sourceExpression,
        engineFingerprint: project.engineFingerprint,
        result,
      })
    : null;
  const [grammarReport, setGrammarReport] = useState<CanvasDiagnostic | null>(null);
  const restoredPendingProject = useRef('');
  useEffect(() => {
    if (!studio.ready || restoredPendingProject.current === project.id) return;
    restoredPendingProject.current = project.id;
    const saved = localStorage.getItem('studio-pending:' + project.id);
    if (saved && studio.envelope.drafts[saved]) {
      studio.setSelectedId(saved);
      setMode('analysis');
      setTab('Árvore');
    }
    localStorage.removeItem('studio-pending:' + project.id);
  }, [studio.ready, project.id, studio.envelope]);
  const [reviewBusy, setReviewBusy] = useState(false);
  useEffect(() => {
    if (!preview) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!reviewBusy) setPreview(null);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [preview, reviewBusy]);
  const [evidencePointer, setEvidencePointer] = useState<Record<string, unknown> | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [groundTruthNote, setGroundTruthNote] = useState('');
  const [gitContribution, setGitContribution] = useState<{
    patch: string;
    instructions: string;
    repositories: unknown[];
  } | null>(null);
  useEffect(() => {
    setEvidencePointer(null);
    setPreview(null);
    setReviewError('');
    setSelected('root');
    setGrammarReport(null);
  }, [project.id, passage.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('studio-theme', theme);
  }, [theme]);
  const [notice, setNotice] = useState('');
  const note = useRef<HTMLTextAreaElement>(null);
  const activePassage = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activePassage.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [passage.id, layout.state.hidden.navigator, layout.state.maximized]);
  const comparison =
    result && result.evaluationStatus !== 'partial'
      ? compareReference(result.surface, passage.acceptedReference)
      : null;
  const currentHighlight =
    mode === 'analysis' &&
    tab === 'Árvore' &&
    !analysis.preview &&
    !studio.pending &&
    result?.origin === 'engine' &&
    result.evaluationStatus !== 'partial' &&
    surfaceHighlight?.passageId === passage.id &&
    surfaceHighlight.raw === (draft?.raw ?? passage.sourceExpression) &&
    surfaceHighlight.revisionId === draft?.revisionId &&
    result.revisionId === draft?.revisionId &&
    surfaceHighlight.engineFingerprint === project.engineFingerprint &&
    result.engineFingerprint === project.engineFingerprint &&
    surfaceHighlight.surface === result.surface
      ? surfaceHighlight.ranges
      : [];
  const stage = draft?.workflow?.stage ?? (passage.status === 'review' ? 'review' : 'analysis');
  const completed = project.passages.filter(
    (p) => studio.envelope.drafts[p.id]?.workflow?.stage === 'complete',
  ).length;
  function changeMode(next: typeof mode) {
    track('navigation.mode', { from: mode, to: next });
    setMode(next);
  }
  function changeTab(next: Tab) {
    track('navigation.projection', { from: tab, to: next });
    setTab(next);
    requestAnimationFrame(() =>
      document
        .querySelector('.tab-content')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  }

  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(() => track('navigation.search', { count: query.length }), 800);
    return () => clearTimeout(timer);
  }, [query]);
  const passages = project.passages.filter(
    (p) =>
      (filter !== 'editable' || project.mode === 'local' || p.analysis) &&
      (filter !== 'complete' || studio.envelope.drafts[p.id]?.workflow?.stage === 'complete') &&
      (filter !== 'open' || studio.envelope.drafts[p.id]?.workflow?.stage !== 'complete') &&
      `${p.title} ${p.ordinal} ${p.acceptedReference ?? ''}`
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .includes(query.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()),
  );
  const sourceIds = [...new Set(passages.map((p) => p.sourceId))];
  const selectedIndex = project.passages.findIndex((p) => p.id === passage.id);
  const orphaned = studio.orphanDrafts.length;
  const changePassage = (id: string) => {
    studio.setSelectedId(id);
    setNotice('');
    setSelected('object');
  };
  function addNextPassage(position?: 'before' | 'after') {
    if (!studio.createPendingDraft(position)) return;
    setMode('analysis');
    setTab('Árvore');
    setSelected('root');
    setQuery('');
    setFilter('all');
    setNotice('');
    if (layout.state.hidden.editor) layout.toggle('editor');
    if (layout.state.hidden.source) layout.toggle('source');
    if (layout.state.maximized) layout.maximize(layout.state.maximized);
  }
  async function save() {
    try {
      await studio.persist();
      setNotice('Rascunho salvo. A referência do corpus foi preservada.');
    } catch (e) {
      studio.setError(String(e));
    }
  }
  async function reviewSource(useProposal = false) {
    if (!draft || reviewBusy) return;
    setReviewBusy(true);
    setReviewError('');
    const metadata: Record<string, unknown> = {};
    if (!sameTranslations(draft.translations, passage.translations))
      metadata.translations = draft.translations ?? {};
    for (const key of ['diplomatic', 'normalized', 'translation', 'notes'] as const)
      if (draft[key] !== passage[key]) metadata[key] = draft[key];
    const locators: Record<string, string> = {
      printedPage: passage.witness.printedPage ?? '',
      folio: passage.witness.folio ?? '',
      line: String(passage.witness.textualLine ?? ''),
      section: passage.witness.section ?? '',
      subsection: passage.witness.subsection ?? '',
    };
    for (const [key, value] of Object.entries(draft.locators ?? {}))
      if (value !== locators[key]) metadata[key] = value;
    if (evidencePointer) metadata.evidence = evidencePointer;
    try {
      let revision = draft.revisionId;
      if (useProposal && analysis.preview) {
        const candidate = analysis.preview;
        const accepted = await studio.acceptCandidate({
          jobId: candidate.jobId,
          candidateId: candidate.id,
          candidateRevision: candidate.revisionId,
          expectedDraftRevision: revision,
        });
        revision = accepted.draft.revisionId;
        await analysis.selectCandidate(null);
        setTab('Árvore');
      }
      setPreview(
        await studio.sourcePreview(false, metadata, {
          passageId: passage.id,
          draftRevisionId: revision,
        }),
      );
    } catch (e) {
      studio.setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewBusy(false);
    }
  }
  const navigationPane = (
    <aside className="navigator" aria-label="Passagens">
      <div className="navigator-top">
        <span className="eyebrow">MESA DE LEITURA</span>
        <span className="edition-number">01</span>
      </div>
      <h1>Suas passagens</h1>
      <label className="search-box">
        <Search size={15} />
        <input
          aria-label="Buscar passagem"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar passagem…"
        />
        <span>⌕</span>
      </label>
      <div className="navigator-filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          Todas <span>{project.passages.length}</span>
        </button>
        <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>
          Em trabalho
        </button>
        <button
          className={filter === 'complete' ? 'active' : ''}
          onClick={() => setFilter('complete')}
        >
          Concluídas <span>{completed}</span>
        </button>
      </div>
      <div className="passage-list">
        {sourceIds.map((sourceId) => (
          <section key={sourceId}>
            <div className="source-group">
              <ChevronDown size={12} />
              <BookOpen size={13} />
              <span>
                {sourceId.includes('araujo')
                  ? 'Araújo · Catecismo'
                  : sourceId.includes('bettendorff')
                    ? 'Bettendorff · Compêndio'
                    : sourceId}
              </span>
            </div>
            {passages
              .filter((p) => p.sourceId === sourceId)
              .map((p) => (
                <button
                  key={p.id}
                  ref={passage.id === p.id ? activePassage : undefined}
                  className={`passage-item ${passage.id === p.id ? 'active' : ''}`}
                  onClick={() => changePassage(p.id)}
                  aria-current={passage.id === p.id ? 'page' : undefined}
                >
                  <span className="passage-item-top">
                    <span className="ordinal">{String(p.ordinal).padStart(4, '0')}</span>
                    {p.analysis && (
                      <span className="editable-dot" title="Editor visual disponível" />
                    )}
                  </span>
                  <span className="passage-reading" lang="tpw">
                    {p.acceptedReference ?? 'Por transcrever'}
                  </span>
                  <span className="passage-status">
                    <span
                      className={`status-dot ${studio.envelope.drafts[p.id]?.workflow?.stage ?? p.status}`}
                    />
                    {statusLabels[studio.envelope.drafts[p.id]?.workflow?.stage ?? p.status]}
                    {analysis.listing.jobs.find((job) => job.passageId === p.id) && (
                      <span className="analysis-nav-badge">
                        IA ·{' '}
                        {
                          analysisLabels[
                            analysis.listing.jobs.find((job) => job.passageId === p.id)!.status
                          ]
                        }
                      </span>
                    )}
                  </span>
                </button>
              ))}
          </section>
        ))}
        {!passages.length && <p className="empty-search">Nenhuma passagem encontrada.</p>}
      </div>
      <div className="navigator-bottom">
        <div className="notebook-icon">
          <FileText size={18} />
        </div>
        <div>
          <strong>Seu caderno de trabalho</strong>
          <p>Uma leitura de cada vez.</p>
        </div>
      </div>
      <button
        className="button new-passage"
        disabled={project.mode !== 'local' || !studio.ready}
        onClick={() => addNextPassage()}
      >
        <Plus size={15} /> Adicionar próxima passagem
      </button>
      <div className="navigator-version">
        TUPI ANTIGO <span>v0.2</span>
      </div>
    </aside>
  );
  const editorPane = (
    <div className="desk workspace-desk">
      <header className="desk-header">
        <div className="breadcrumbs">
          <span>{passage.sourceId.includes('araujo') ? 'Araújo, 1686' : 'Corpus histórico'}</span>
          <ChevronRight size={13} />
          <strong>Passagem {String(passage.ordinal).padStart(4, '0')}</strong>
          {passage.id.startsWith('pending:') && (
            <span className="new-passage-badge">Nova · rascunho local</span>
          )}
        </div>
        <div className="desk-nav">
          {project.mode === 'local' && (
            <button
              className="button small add-next-passage"
              disabled={!studio.ready}
              onClick={() => addNextPassage()}
            >
              <Plus size={14} /> Adicionar próxima passagem
            </button>
          )}
          {project.mode === 'local' && (
            <>
              <button
                className="button small"
                disabled={!studio.ready}
                aria-label="Inserir antes desta passagem"
                onClick={() => addNextPassage('before')}
              >
                Inserir antes
              </button>
              <button
                className="button small"
                disabled={!studio.ready}
                aria-label="Inserir depois desta passagem"
                onClick={() => addNextPassage('after')}
              >
                Inserir depois
              </button>
              <button
                className="button small"
                disabled={!studio.ready}
                onClick={() => {
                  void studio
                    .persist()
                    .then(() => {
                      if (project.passages[selectedIndex + 1])
                        changePassage(project.passages[selectedIndex + 1].id);
                      else addNextPassage();
                    })
                    .catch((error) => studio.setError(String(error)));
                }}
              >
                Continuar depois
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label="Passagem anterior"
            disabled={selectedIndex <= 0 || !studio.ready}
            onClick={() => changePassage(project.passages[selectedIndex - 1].id)}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Próxima passagem"
            disabled={selectedIndex >= project.passages.length - 1 || !studio.ready}
            onClick={() => changePassage(project.passages[selectedIndex + 1].id)}
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </header>
      <div className="desk-columns">
        <main
          className="analysis-pane"
          id="analysis"
          data-tree-active={mode === 'analysis' && tab === 'Árvore'}
        >
          <div className="workspace-top">
            <div className="work-modes">
              <button
                className={mode === 'reading' ? 'active' : ''}
                onClick={() => {
                  changeMode('reading');
                  setTimeout(() => note.current?.focus(), 0);
                }}
              >
                <FileText size={14} />
                Contribuir uma leitura
              </button>
              <button
                className={mode === 'analysis' ? 'active' : ''}
                onClick={() => changeMode('analysis')}
              >
                <GitBranch size={14} />
                Montar a análise
              </button>
              <button
                className={mode === 'review' ? 'active' : ''}
                onClick={() => changeMode('review')}
              >
                <ClipboardCheck size={14} />
                Revisar
              </button>
              <button
                className={mode === 'lexicon' ? 'active' : ''}
                onClick={() => changeMode('lexicon')}
              >
                Léxico
              </button>
              <button
                className={mode === 'dictionary' ? 'active' : ''}
                onClick={() => changeMode('dictionary')}
              >
                Dicionário
              </button>
              <button
                className={
                  layout.state.supportTab === 'ai' && !layout.state.hidden.source ? 'active' : ''
                }
                onClick={() => layout.support('ai')}
              >
                Assistência IA
              </button>
            </div>
            <div className="workspace-title">
              <div className="workflow-control">
                <label>
                  Etapa do meu trabalho
                  <select
                    aria-label="Etapa do trabalho"
                    value={stage}
                    disabled={!studio.ready}
                    onChange={(event) => studio.setWorkflow(event.target.value as typeof stage)}
                  >
                    <option value="analysis">Em análise</option>
                    <option value="review">Precisa de revisão</option>
                    <option value="complete">Concluída</option>
                  </select>
                </label>
                {stage !== 'complete' && (
                  <button
                    className="button primary small"
                    disabled={!studio.ready}
                    onClick={() => {
                      const index = passages.findIndex((item) => item.id === passage.id);
                      const next = index >= 0 ? passages[index + 1] : undefined;
                      studio.setWorkflow('complete');
                      if (next && next.id !== passage.id) changePassage(next.id);
                    }}
                  >
                    <Check size={14} /> Concluir passagem
                  </button>
                )}
                {project.mode === 'local' && passage.id.startsWith('pending:') && (
                  <button
                    className="button small ground-truth-shortcut"
                    disabled={
                      !(analysis.preview?.raw ?? draft?.raw)?.trim() || !studio.ready || reviewBusy
                    }
                    onClick={() => void reviewSource(!!analysis.preview)}
                  >
                    <Check size={14} />{' '}
                    {reviewBusy
                      ? 'Conferindo regressão…'
                      : analysis.preview
                        ? 'Usar e revisar proposta'
                        : 'Revisar nova passagem'}
                  </button>
                )}
              </div>
            </div>
            <div
              className={`comparison-grid${project.mode === 'local' && !compareOpen ? ' is-compact' : ''}`}
            >
              <div
                className="reference-surface"
                hidden={project.mode === 'local' && !compareOpen}
                id="saved-reference"
              >
                <div className="surface-label">
                  <BookOpen size={13} />
                  {project.mode === 'example' ? 'REFERÊNCIA DO EXEMPLO' : 'REFERÊNCIA SALVA'}
                </div>
                <p data-testid="reference-surface" lang="tpw">
                  {passage.acceptedReference ?? 'Sem referência salva'}
                </p>
                <span className="surface-caption">
                  {passage.acceptedReference
                    ? 'Preservada · origem legada'
                    : 'Aguardando decisão editorial'}
                </span>
              </div>
              <div
                className={`generated-surface ${comparison?.kind === 'different' ? 'different' : ''}`}
              >
                <div className="surface-label">
                  <Layers size={13} />
                  {project.mode === 'local' ? 'RESULTADO ATUAL' : 'RESULTADO DO EXEMPLO'}
                </div>
                <p data-testid="generated-surface" lang="tpw">
                  {studio.pending ? (
                    'Avaliando…'
                  ) : result?.evaluationStatus === 'partial' ? (
                    'Confira as etapas destacadas na árvore'
                  ) : result ? (
                    <MorphemeText text={result.surface} ranges={currentHighlight} />
                  ) : studio.renderError ? (
                    'Não foi possível avaliar'
                  ) : !draft?.raw?.trim() ? (
                    'Comece pela busca de peças na árvore'
                  ) : (
                    'Sem resultado nesta revisão'
                  )}
                </p>
                <span className="surface-caption">
                  {result?.origin === 'engine'
                    ? 'Motor local · revisão atual'
                    : result
                      ? 'Resultado previamente avaliado'
                      : !draft?.raw?.trim()
                        ? 'Sua próxima leitura começa aqui'
                        : 'Aguardando análise válida e avaliação'}
                </span>
                {project.mode === 'local' && (
                  <div className="surface-repair-action">
                    <button
                      className="button small"
                      disabled={!studio.ready || studio.pending || !draft?.raw?.trim()}
                      onClick={openTranslation}
                    >
                      <MessageSquareText size={13} /> Traduzir
                    </button>
                    <button
                      className="button small"
                      disabled={
                        !studio.ready || studio.pending || !(result?.tree ?? studio.parsed?.root)
                      }
                      onClick={() => {
                        const root = result?.tree ?? studio.parsed?.root;
                        if (!root) return;
                        setGrammarReport({
                          raw: draft?.raw ?? passage.sourceExpression,
                          root:
                            !root.evaluation &&
                            result?.surface &&
                            result.evaluationStatus !== 'partial'
                              ? { ...root, evaluation: { status: 'ok', surface: result.surface } }
                              : root,
                          selectedNodeId: root.id,
                          revisionId: draft?.revisionId,
                          failures: result?.failures,
                        });
                      }}
                    >
                      <RefreshCw size={13} /> Corrigir gramática / árvore
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="agreement-bar">
              {project.mode === 'local' && (
                <button
                  className="compare-toggle"
                  aria-expanded={compareOpen}
                  aria-controls="saved-reference"
                  onClick={() => setCompareOpen((value) => !value)}
                >
                  {compareOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {compareOpen ? 'Recolher referência' : 'Comparar referência'}
                </button>
              )}
              <span
                className={comparison?.kind === 'exact' ? 'agreement-exact' : 'agreement-other'}
              >
                {comparison?.kind === 'exact' ? (
                  <Check size={13} />
                ) : (
                  <span className="status-dot" />
                )}
                {comparison?.kind === 'exact'
                  ? 'Forma coincide'
                  : comparison?.kind === 'different'
                    ? 'Resultado mudou'
                    : comparison?.kind === 'normalized'
                      ? 'Diferença de normalização'
                      : 'Sem comparação'}
              </span>
              <span className="agreement-separator" />
              <span>
                Minha etapa <strong>{statusLabels[stage].toLowerCase()}</strong>
              </span>
              <span className="agreement-separator" />
              <span>
                {project.mode === 'example'
                  ? 'Motor do exemplo registrado'
                  : 'Motor local identificado'}
              </span>
            </div>
            {(studio.renderError || studio.conflict) && (
              <p role="alert" className="inline-error">
                {studio.conflict
                  ? 'A fonte mudou desde este rascunho. Compare as duas versões abaixo; ambas foram preservadas.'
                  : studio.renderError}
              </p>
            )}
            {studio.renderError && (
              <div className="evaluation-retry">
                <button
                  className="button small"
                  disabled={studio.pending}
                  onClick={studio.retryEvaluation}
                >
                  Tentar avaliar novamente
                </button>
                <button
                  className="button small"
                  disabled={studio.busy}
                  onClick={() => void studio.refresh()}
                >
                  Atualizar motor e avaliar
                </button>
              </div>
            )}
            {studio.conflict && (
              <div className="recovery-note">
                <h3>Conciliar versões</h3>
                <p>Fonte atual</p>
                <pre>{passage.sourceExpression}</pre>
                <p>Seu rascunho</p>
                <pre>{draft?.raw}</pre>
                <table className="conflict-table">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Fonte atual</th>
                      <th>Seu rascunho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['diplomatic', 'Transcrição'],
                        ['normalized', 'Leitura normalizada'],
                        ['translation', 'Tradução'],
                        ['notes', 'Notas'],
                      ] as const
                    ).map(([key, label]) => (
                      <tr key={key}>
                        <th>{label}</th>
                        <td>{passage[key] || '—'}</td>
                        <td>{draft?.[key] || '—'}</td>
                      </tr>
                    ))}
                    {(
                      [
                        ['pt', 'Tradução em português'],
                        ['en', 'Tradução em inglês'],
                      ] as const
                    ).map(([language, label]) => (
                      <tr key={language}>
                        <th>{label}</th>
                        <td>{passage.translations?.[language] || '—'}</td>
                        <td>{draft?.translations?.[language] || '—'}</td>
                      </tr>
                    ))}
                    <tr>
                      <th>Página / fólio / linhas</th>
                      <td>
                        {[
                          passage.witness.printedPage,
                          passage.witness.folio,
                          passage.witness.textualLine,
                        ]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                      <td>
                        {[
                          draft?.locators?.printedPage,
                          draft?.locators?.folio,
                          draft?.locators?.line,
                        ]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                    </tr>
                    <tr>
                      <th>Seção / subseção</th>
                      <td>
                        {[passage.witness.section, passage.witness.subsection]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                      <td>
                        {[draft?.locators?.section, draft?.locators?.subsection]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <button className="button" onClick={() => studio.reconcileDraft()}>
                  Continuar meu rascunho sobre esta versão
                </button>
              </div>
            )}
            {orphaned > 0 && (
              <button className="archive-link" onClick={() => setArchiveOpen(true)}>
                Rascunhos preservados ({orphaned})
              </button>
            )}
          </div>
          {mode === 'analysis' && (
            <>
              <div className="projection-tabs" role="tablist" aria-label="Projeções da análise">
                {tabs.map((item) => (
                  <button
                    key={item}
                    role="tab"
                    aria-selected={tab === item}
                    className={tab === item ? 'active' : ''}
                    onClick={() => changeTab(item)}
                  >
                    {item === 'Código' && <Code2 size={13} />} {item}
                  </button>
                ))}
              </div>
              <div className="tab-content" role="tabpanel" aria-label={tab}>
                {analysis.preview ? (
                  <CandidateProjection
                    key={analysis.preview.revisionId}
                    candidate={analysis.preview}
                    sourceId={passage.sourceId}
                    engineFingerprint={project.engineFingerprint}
                    onReview={() => void reviewSource(true)}
                    reviewBusy={reviewBusy || studio.busy}
                    onEdit={async (change) => {
                      const candidate = analysis.preview!;
                      const accepted = await studio.acceptCandidate({
                        jobId: candidate.jobId,
                        candidateId: candidate.id,
                        candidateRevision: candidate.revisionId,
                        expectedDraftRevision: draft!.revisionId,
                      });
                      if (change && accepted.draft.passageId === passage.id)
                        studio.edit(change, accepted.draft.revisionId);
                      await analysis.selectCandidate(null);
                      setTab('Árvore');
                    }}
                    onClose={() => void analysis.selectCandidate(null)}
                    onSelect={analysis.focusCandidateNode}
                    selectedNodeId={analysis.feedbackNode?.nodeId}
                  />
                ) : (
                  <Projections
                    studio={studio}
                    tab={tab}
                    selected={selected}
                    select={setSelected}
                    onSurfaceHighlight={setSurfaceHighlight}
                    inspectLexeme={() => changeMode('lexicon')}
                    lexicalPreview={setPreview}
                    prepareDiagnostic={setGrammarReport}
                    openLaboratory={() => setLabOpen(true)}
                    translate={openTranslation}
                    askAI={(id) => {
                      setSelected(id);
                      layout.support('ai');
                      window.dispatchEvent(new Event('studio:explain-selection'));
                    }}
                  />
                )}
              </div>
              {draft?.analysis && <SelectionNote studio={studio} selected={selected} />}
            </>
          )}
          <DictionaryTab
            projectId={project.id}
            passageId={passage.id}
            sourceId={passage.sourceId}
            revisionId={draft?.revisionId ?? ''}
            engineFingerprint={project.engineFingerprint}
            active={mode === 'dictionary'}
            reference={dictionaryEvidence}
            disabled={project.mode !== 'local' || !studio.ready || studio.busy || studio.conflict}
            onInsert={(expression, expectedRevision) => {
              if (!studio.insertPiece(expression, expectedRevision)) return false;
              setMode('analysis');
              setTab('Árvore');
              setSelected('root');
              setNotice('Peça do dicionário adicionada à árvore.');
              return true;
            }}
          />
          {mode === 'lexicon' && (
            <div className="lexicon-workspace">
              <PassageLexicon
                projectId={project.id}
                sourceId={passage.sourceId}
                passageId={passage.id}
                revisionId={draft?.revisionId ?? ''}
                raw={draft?.raw ?? passage.sourceExpression}
                engineFingerprint={project.engineFingerprint}
                selectedNodeId={selected}
                disabled={!studio.ready || studio.pending || studio.conflict}
                onEdit={(raw, expectedRevision) => {
                  studio.edit({ raw }, expectedRevision);
                }}
                onPreview={setPreview}
                onSelectNode={setSelected}
                onRevealNode={(id) => {
                  setSelected(id);
                  changeMode('analysis');
                  changeTab('Árvore');
                }}
              />
              <details>
                <summary>Catálogo do projeto e dicionário Navarro</summary>
                <LexiconPanel studio={studio} onPreview={setPreview} selected={selected} />
              </details>
            </div>
          )}
          {mode === 'reading' && (
            <div className="reading-contribution">
              <span className="eyebrow">SUA CONTRIBUIÇÃO</span>
              <h3>Uma dúvida também merece registro.</h3>
              <p>
                Use a fonte ao lado para propor uma transcrição ou leitura. Acrescente o que ajuda
                outra pessoa a entender sua escolha.
              </p>
              <label className="editor-label">
                Tradução sem idioma informado
                <textarea
                  rows={3}
                  value={draft?.translation ?? ''}
                  disabled={!studio.ready}
                  placeholder="Uma interpretação possível em português…"
                  onChange={(e) => studio.edit({ translation: e.target.value })}
                />
              </label>
              <TranslationFields
                value={draft?.translations}
                disabled={!studio.ready}
                onChange={(translations) => studio.edit({ translations })}
              />
              <label className="editor-label">
                Nota de leitura
                <textarea
                  ref={note}
                  rows={5}
                  value={draft?.notes ?? ''}
                  disabled={!studio.ready}
                  placeholder="Uma letra incerta, uma alternativa, uma justificativa…"
                  onChange={(e) => studio.edit({ notes: e.target.value })}
                />
              </label>
              <div className="teaching-note">
                <Leaf size={18} />
                <p>
                  Seu rascunho pode ficar incompleto. Ele será guardado com a passagem e poderá ser
                  retomado depois.
                </p>
              </div>
            </div>
          )}
          {mode === 'review' && (
            <div className="review-view">
              {project.mode === 'local' && (
                <button
                  className="button"
                  disabled={!draft || !studio.ready || reviewBusy}
                  onClick={() => void reviewSource(!!analysis.preview)}
                >
                  <ClipboardCheck size={15} /> Commit to Ground Truth
                </button>
              )}
              <div className="section-intro">
                <div>
                  <h2>Compare antes de compartilhar</h2>
                  <p>
                    {comparison?.message ?? 'Esta passagem ainda não tem avaliação disponível.'}
                  </p>
                </div>
              </div>
              <div className="review-item">
                <span>Leitura proposta</span>
                <p>{draft?.normalized || 'Nenhuma leitura proposta.'}</p>
              </div>
              <div className="review-item">
                <span>Tradução proposta</span>
                <p>{draft?.translation || 'Ainda não informada.'}</p>
              </div>
              {(
                [
                  ['pt', 'Tradução em português'],
                  ['en', 'Tradução em inglês'],
                ] as const
              ).map(([language, label]) => (
                <div className="review-item" key={language}>
                  <span>{label}</span>
                  <p>{draft?.translations?.[language] || 'Ainda não informada.'}</p>
                </div>
              ))}
              <div className="review-item">
                <span>Nota de leitura</span>
                <p>{draft?.notes || 'Nenhuma nota adicionada.'}</p>
              </div>
              <div className="teaching-note">
                <ClipboardCheck size={19} />
                <div>
                  <strong>Pronto para uma revisão humana</strong>
                  <p>
                    Exporte a contribuição com a análise, a referência preservada e as versões
                    usadas. Cada passagem pode ser aprovada independentemente das anteriores.
                  </p>
                </div>
              </div>
              {project.mode === 'local' && (
                <div className="source-actions">
                  <button
                    className="button"
                    disabled={!draft || !studio.ready || reviewBusy}
                    onClick={() => void reviewSource(!!analysis.preview)}
                  >
                    {reviewBusy
                      ? 'Conferindo regressão…'
                      : analysis.preview
                        ? 'Usar e revisar proposta'
                        : 'Revisar edição da fonte'}
                  </button>
                  <button
                    className="button"
                    disabled={studio.busy}
                    onClick={() => void studio.refresh()}
                  >
                    Recarregar fonte e comparar rascunhos
                  </button>
                  <SourceRecovery onPreview={setPreview} />

                  <button
                    className="button"
                    onClick={() =>
                      void invoke<{
                        patch: string;
                        instructions: string;
                        repositories: unknown[];
                      }>('contribution_prepare', { passageId: passage.id, draft })
                        .then(setGitContribution)
                        .catch((e) => studio.setError(e.message))
                    }
                  >
                    Preparar contribuição Git
                  </button>
                </div>
              )}
              <button
                className="button primary"
                disabled={!studio.ready}
                onClick={() => exportContribution(studio)}
              >
                <ArrowDownToLine size={16} />
                Exportar contribuição
              </button>
            </div>
          )}
          {mode === 'analysis' && (
            <div className="quick-note">
              <MessageSquareText size={15} />
              <label>
                Nota de leitura
                <textarea
                  rows={1}
                  value={draft?.notes ?? ''}
                  disabled={!studio.ready}
                  placeholder="Deixe uma observação para a revisão…"
                  onChange={(e) => studio.edit({ notes: e.target.value })}
                />
              </label>
            </div>
          )}
          <footer className="workspace-footer">
            <span className="save-status" role="status">
              <span className={studio.saveState.includes('salvo') ? 'saved-dot' : 'status-dot'} />
              {studio.saveState}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Desfazer"
                title="Desfazer última edição desta passagem"
                disabled={!studio.canUndo || !studio.ready || studio.conflict}
                onClick={studio.undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="button"
                disabled={!draft || !studio.ready || studio.conflict}
                onClick={() => void studio.verify()}
              >
                <RefreshCw size={14} className={studio.busy ? 'spin' : ''} />
                Verificar
              </button>
              <button
                className="button primary"
                disabled={!studio.ready}
                onClick={() => void save()}
              >
                <Check size={15} />
                Salvar rascunho
              </button>
              {project.mode === 'local' && (
                <button
                  className="button"
                  disabled={!draft || !studio.ready || reviewBusy}
                  onClick={() => void reviewSource(!!analysis.preview)}
                >
                  <ClipboardCheck size={15} /> Commit to Ground Truth
                </button>
              )}
            </div>
          </footer>
          {(notice || studio.verification) && (
            <div className="notice" role="status">
              {notice || studio.verification}
            </div>
          )}
        </main>
      </div>
    </div>
  );
  const sourcePane = (
    <AnalysisSupport
      studio={studio}
      layout={layout}
      analysis={analysis}
      translationRequest={translationRequest}
      selectedNode={flattenNodes(studio.parsed?.root ?? null).find((node) => node.id === selected)}
      onEvidence={(value) => setEvidencePointer(value as unknown as Record<string, unknown>)}
      onPreview={() => {
        setMode('analysis');
        setTab('Árvore');
      }}
      onDictionary={(value) => {
        setDictionaryEvidence(value);
        setMode('dictionary');
      }}
      onFocusNode={(id, candidate) => {
        if (candidate)
          void analysis
            .openInEditor(candidate)
            .then(() => setSelected(id))
            .catch((error) =>
              studio.setError(error instanceof Error ? error.message : String(error)),
            );
        else setSelected(id);
        setMode('analysis');
        setTab('Árvore');
      }}
    />
  );
  if (studio.starting)
    return (
      <main className="startup-screen" aria-busy="true">
        <img src="./mark.svg" alt="" width={56} height={56} />
        <h1>Pydicate Studio</h1>
        <p role="status" aria-live="polite">
          {studio.setupProgress?.message ||
            studio.installation?.update.message ||
            'Abrindo seu espaço de trabalho…'}
        </p>
        <progress
          max={100}
          value={studio.setupProgress?.percent ?? studio.installation?.update.percent}
        />
      </main>
    );
  return (
    <div className="studio-app">
      <header className="app-header">
        <a
          href="#"
          className="brand"
          aria-label="Pydicate Studio, mesa de leitura"
          onClick={(e) => e.preventDefault()}
        >
          <img src="./mark.svg" alt="" />
          <span>
            Pydicate <strong>Studio</strong>
          </span>
          <span className="early-label">PRÉVIA</span>
        </a>
        <span className="header-divider" />
        <button className="project-switcher" onClick={() => setProjectDialog(true)}>
          <span className="project-icon">
            <BookOpen size={15} />
          </span>
          <span>{project.mode === 'example' ? 'Projeto de exemplo' : 'oldtupicorpus'}</span>
          <ChevronDown size={13} />
        </button>
        <div className="header-end">
          <button className="button small" onClick={() => setLearningView('lessons')}>
            <BookOpen size={15} /> Aprender
          </button>
          <button className="button small" onClick={() => setLearningView('reference')}>
            Referência
          </button>
          <button className="button small" onClick={() => setUsageOpen(true)}>
            Atividade
          </button>
          <button
            className="button small"
            aria-label="Alternar tema"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              track('ui.theme', { from: theme, to: next });
              setTheme(next);
            }}
          >
            {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <span className="local-indicator">
            <span />
            {project.mode === 'example' ? 'Exemplo avaliado' : 'Projeto local'}
          </span>
          <button
            className="icon-button help-button"
            aria-label="Informações do projeto"
            onClick={() => setDetails(!details)}
          >
            <CircleHelp size={19} />
          </button>
          <button className="button small" onClick={() => setProjectDialog(true)}>
            <FolderOpen size={15} /> <span>Abrir projeto</span>
          </button>
        </div>
      </header>
      {labOpen && (
        <Suspense fallback={<p role="status">Abrindo o laboratório…</p>}>
          <ParserLab
            project={project}
            onClose={() => setLabOpen(false)}
            onTransfer={
              studio.ready && project.mode === 'local'
                ? (source) => {
                    studio.edit({ raw: source }, draft?.revisionId);
                    setLabOpen(false);
                    changeTab('Árvore');
                    changeMode('analysis');
                  }
                : undefined
            }
          />
        </Suspense>
      )}
      {learningView && (
        <Suspense fallback={<p role="status">Abrindo o guia…</p>}>
          <LearningWorkspace
            project={project}
            initialView={learningView}
            onClose={() => setLearningView(null)}
          />
        </Suspense>
      )}
      {groundTruthNote && (
        <div role="status" className="notice-banner">
          <span>{groundTruthNote}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso da ground truth"
            onClick={() => setGroundTruthNote('')}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {studio.error && (
        <div role="alert" className="error-banner">
          <span>{studio.error}</span>
          <button
            className="icon-button"
            aria-label="Fechar mensagem"
            onClick={() => studio.setError('')}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <WorkspaceLayout
        layout={layout}
        panes={{ navigator: navigationPane, editor: editorPane, source: sourcePane }}
      />
      <footer className="app-status">
        <span>
          <span className="status-dot" />
          Seu trabalho fica neste dispositivo
        </span>
        <span>
          Português · Tupi antigo <span className="status-divider">/</span> Pydicate Studio
        </span>
      </footer>
      {usageOpen && <UsagePanel onClose={() => setUsageOpen(false)} />}
      {archiveOpen && <DraftArchive studio={studio} onClose={() => setArchiveOpen(false)} />}
      {preview && (
        <div
          className="review-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={sourceReviewTitle(preview)}
        >
          <section>
            <h2>{sourceReviewTitle(preview)}</h2>
            {reviewError && <p role="alert">{reviewError}</p>}
            {passageReview && (
              <label>
                <input
                  type="checkbox"
                  checked={approveOnSave}
                  disabled={reviewBusy}
                  onChange={(event) => setApproveOnSave(event.target.checked)}
                />{' '}
                Registrar também como ground truth
              </label>
            )}
            <SourceReviewContent
              preview={preview}
              hasChanges={previewHasChanges}
              currentPassageId={passage.id}
              draftRevisionId={draft?.revisionId}
              draftRaw={draft?.raw ?? passage.sourceExpression}
              engineFingerprint={project.engineFingerprint}
              result={result}
              pending={studio.pending}
              saveGroundTruth={passageReview && approveOnSave}
              acceptedReference={passage.acceptedReference}
            />
            <div>
              <button className="button" onClick={() => setPreview(null)} disabled={reviewBusy}>
                Voltar sem aplicar
              </button>
              <button
                className="button primary"
                disabled={
                  reviewBusy ||
                  !studio.ready ||
                  (passageReview && approveOnSave
                    ? studio.pending ||
                      !reviewedResult ||
                      reviewedResult.evaluationStatus === 'partial'
                    : !previewHasChanges)
                }
                onClick={() => {
                  setReviewBusy(true);
                  setGroundTruthNote('');
                  void studio
                    .applySource(
                      preview,
                      passageReview && approveOnSave ? reviewedResult! : undefined,
                    )
                    .then((outcome) => {
                      setPreview(null);
                      setEvidencePointer(null);
                      setReviewError('');
                      if (outcome?.approvalError) {
                        setGroundTruthNote(
                          (outcome.sourceApplied ? 'A fonte foi salva. ' : '') +
                            'A ground truth não foi salva: ' +
                            outcome.approvalError +
                            ' Abra a revisão novamente para tentar salvar a referência.',
                        );
                      } else if (outcome?.groundTruthSaved) {
                        track('review.status', { action: 'approve', source: 'source-review' });
                        if (outcome.draftSaveError)
                          setGroundTruthNote(
                            'A ground truth foi salva no corpus, mas não foi possível atualizar o rascunho local: ' +
                              outcome.draftSaveError,
                          );
                      }
                    })
                    .catch((e) => setReviewError(e.message))
                    .finally(() => setReviewBusy(false));
                }}
              >
                {reviewBusy
                  ? 'Salvando…'
                  : passageReview && approveOnSave
                    ? previewHasChanges
                      ? 'Salvar fonte e ground truth'
                      : 'Salvar ground truth'
                    : passageReview
                      ? 'Salvar somente a fonte'
                      : 'Aplicar edição revisada'}
              </button>
            </div>
          </section>
        </div>
      )}
      {gitContribution && (
        <div
          className="review-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Compartilhar contribuição Git"
        >
          <section>
            <h2>Compartilhar pelo Git</h2>
            <p>
              O patch inclui as diferenças locais da fonte e dos registros desde HEAD, inclusive
              trabalho anterior. Revise o conteúdo antes de compartilhar.
            </p>
            <pre>
              {gitContribution.patch ||
                'Nenhuma edição aplicada na fonte. Os rascunhos podem ser exportados separadamente.'}
            </pre>
            <p>{gitContribution.instructions}</p>
            <p>
              Em um clone de revisão: <code>git apply --check contribuicao.patch</code>, depois{' '}
              <code>git apply contribuicao.patch</code>. Crie seu commit e pull request nesse clone.
            </p>
            <button className="button" onClick={() => setGitContribution(null)}>
              Fechar
            </button>
            <button
              className="button primary"
              disabled={!gitContribution.patch}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([gitContribution.patch], { type: 'text/x-diff' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'contribuicao.patch';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Exportar patch Git revisado
            </button>
          </section>
        </div>
      )}
      {projectDialog && <ProjectDialog studio={studio} close={() => setProjectDialog(false)} />}
      {grammarReport && (
        <GrammarDiagnosticDialog
          key={`${project.id}:${passage.id}:${grammarReport.revisionId}:${grammarReport.fragmentId ?? 'main'}`}
          project={project}
          passage={passage}
          report={grammarReport}
          onClose={() => setGrammarReport(null)}
          onRefresh={studio.refresh}
          onSubmit={async (request) => {
            await flushLexicalNotes(project.id);
            const notebook = await invoke<{ records: LexicalNote[] }>('lexical_notes_list', {
              projectId: project.id,
            });
            const noteSnapshot = await analysisNoteSnapshot(
              notebook.records,
              passage.sourceId,
              passage.id,
            );
            await studio.persist();
            await invoke('analysis_submit', {
              projectId: project.id,
              passageId: passage.id,
              revisionId: grammarReport.revisionId,
              operationId: `${request.operationId}:${noteSnapshot}`,
              task: request.mode === 'engine' ? 'grammar-repair' : 'analyze',
              scope: 'passage',
              newConversation: true,
              ...(request.mode === 'engine'
                ? {
                    grammarRepair: {
                      ...request,
                      raw: grammarReport.raw,
                      revisionId: grammarReport.revisionId,
                      fragmentId: grammarReport.fragmentId,
                    },
                  }
                : {
                    description: `Forma pretendida: ${request.intendedSurface}\n\n${request.explanation}\n\nInvestigue como completar ou ajustar a árvore atual para essa análise.`,
                  }),
            });
            await analysis.openSubmittedConversation();
            layout.support('ai');
          }}
        />
      )}
      {details && (
        <aside className="project-details" aria-label="Informações do projeto">
          <div className="dialog-header">
            <h2>Sobre este projeto</h2>
            <button
              className="icon-button"
              aria-label="Fechar informações"
              onClick={() => setDetails(false)}
            >
              <X size={20} />
            </button>
          </div>
          <span className="tag">
            {project.mode === 'example' ? 'Exemplo incluído' : 'Repositórios locais'}
          </span>
          {project.diagnostics.map((diagnostic, i) => (
            <p key={i}>{diagnostic}</p>
          ))}
          <h3>Versões registradas</h3>
          {project.repositories.map((repo) => (
            <div className="repository" key={repo.name}>
              <strong>
                <GitBranch size={14} />
                {repo.name}
              </strong>
              <code>{repo.revision.slice(0, 12)}</code>
              <small>
                {repo.branch} · {repo.dirty ? 'com alterações locais' : 'sem alterações locais'}
              </small>
            </div>
          ))}
          <p className="field-hint">
            Este primeiro editor cobre participantes, negação e modo da construção de Araújo 0067.
            Aprovação editorial, sincronização Git e assistência de IA são etapas futuras.
          </p>
          <button
            className="button"
            onClick={() => {
              setDetails(false);
              changeTab('Histórico');
              changeMode('analysis');
            }}
          >
            <History size={15} />
            Ver origem da passagem
          </button>
        </aside>
      )}
    </div>
  );
}

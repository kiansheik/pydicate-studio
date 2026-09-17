import { useEffect, useRef, useState } from 'react';
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
  PanelLeftClose,
  RefreshCw,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { compareReference, expressionFor } from './domain/model';
import { SourcePane } from './components/SourcePane';
import { PhraseEditor, SelectionNote, nodeLabels } from './components/PhraseEditor';
import { useStudio } from './useStudio';
import type { Studio } from './useStudio';

const tabs = ['Construção', 'Morfemas', 'Árvore', 'Tradução', 'Histórico', 'Código'] as const;
type Tab = (typeof tabs)[number];
const statusLabels = {
  untranscribed: 'Por transcrever',
  analysis: 'Em análise',
  review: 'Precisa de revisão',
  approved: 'Aprovado',
  changed: 'Resultado mudou',
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
}: {
  studio: Studio;
  tab: Tab;
  selected: string;
  select: (id: string) => void;
}) {
  const { draft, passage, result } = studio;
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
            <h2>Uma interpretação em português</h2>
            <p>Registre sua tradução e preserve dúvidas para a revisão.</p>
          </div>
          <span className="tag">Proposta humana</span>
        </div>
        <label className="editor-label">
          Tradução proposta
          <textarea
            rows={7}
            disabled={!studio.ready || studio.conflict}
            value={draft?.translation ?? ''}
            onChange={(e) => studio.edit({ translation: e.target.value })}
            placeholder="Como você interpreta esta passagem?"
          />
        </label>
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
              {result?.origin === 'engine' ? 'Avaliação pelo motor local' : 'Resultado de exemplo'}
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
          void studio.openProject().then(close);
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
    </dialog>
  );
}

export default function App() {
  const studio = useStudio();
  const { project, passage, draft, result } = studio;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState<Tab>('Construção');
  const [selected, setSelected] = useState('object');
  const [mode, setMode] = useState<'analysis' | 'reading' | 'review'>('analysis');
  const [projectDialog, setProjectDialog] = useState(false);
  const [details, setDetails] = useState(false);
  const [sourceVisible, setSourceVisible] = useState(() => window.innerWidth > 700);
  const [notice, setNotice] = useState('');
  const note = useRef<HTMLTextAreaElement>(null);
  const activePassage = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activePassage.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [passage.id]);
  const comparison = result ? compareReference(result.surface, passage.acceptedReference) : null;
  const passages = project.passages.filter(
    (p) =>
      (filter !== 'editable' || p.analysis) &&
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
  async function save() {
    try {
      await studio.persist();
      setNotice('Rascunho salvo. A referência do corpus foi preservada.');
    } catch (e) {
      studio.setError(String(e));
    }
  }
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
      <div className="app-layout">
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
            <button
              className={filter === 'editable' ? 'active' : ''}
              onClick={() => setFilter('editable')}
            >
              Editor visual
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
                        <span className={`status-dot ${p.status}`} />
                        {statusLabels[p.status]}
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
          <div className="navigator-version">
            TUPI ANTIGO <span>v0.1</span>
          </div>
        </aside>
        <div className={`desk ${!sourceVisible ? 'source-hidden' : ''}`}>
          <header className="desk-header">
            <div className="breadcrumbs">
              <span>
                {passage.sourceId.includes('araujo') ? 'Araújo, 1686' : 'Corpus histórico'}
              </span>
              <ChevronRight size={13} />
              <strong>Passagem {String(passage.ordinal).padStart(4, '0')}</strong>
            </div>
            <div className="desk-nav">
              <button
                className="icon-button source-toggle"
                aria-label={sourceVisible ? 'Ocultar fonte' : 'Mostrar fonte'}
                onClick={() => setSourceVisible(!sourceVisible)}
              >
                <PanelLeftClose size={16} />
                <span className="source-toggle-label">
                  {sourceVisible ? 'Ocultar fonte' : 'Ver fonte'}
                </span>
              </button>
              <span className="desk-nav-divider" />
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
            {sourceVisible && <SourcePane studio={studio} />}
            <main className="analysis-pane" id="analysis">
              <div className="workspace-top">
                <div className="work-modes">
                  <button
                    className={mode === 'reading' ? 'active' : ''}
                    onClick={() => {
                      setMode('reading');
                      setTimeout(() => note.current?.focus(), 0);
                    }}
                  >
                    <FileText size={14} />
                    Contribuir uma leitura
                  </button>
                  <button
                    className={mode === 'analysis' ? 'active' : ''}
                    onClick={() => setMode('analysis')}
                  >
                    <GitBranch size={14} />
                    Montar a análise
                  </button>
                  <button
                    className={mode === 'review' ? 'active' : ''}
                    onClick={() => setMode('review')}
                  >
                    <ClipboardCheck size={14} />
                    Revisar
                  </button>
                </div>
                <div className="workspace-title">
                  <div>
                    <span className="eyebrow">
                      {mode === 'review'
                        ? 'LEITURA E EVIDÊNCIAS'
                        : mode === 'reading'
                          ? 'CADERNO DE LEITURA'
                          : 'ANÁLISE DA PASSAGEM'}
                    </span>
                    <h2>
                      {mode === 'review'
                        ? 'Cada decisão, à luz da fonte.'
                        : mode === 'reading'
                          ? 'O que você lê nesta passagem?'
                          : 'Da leitura à estrutura.'}
                    </h2>
                  </div>
                  <span className="tag amber">
                    <span className="status-dot" />
                    Em análise
                  </span>
                </div>
                <div className="comparison-grid">
                  <div className="reference-surface">
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
                      {result?.origin === 'engine' ? 'RESULTADO ATUAL' : 'RESULTADO DO EXEMPLO'}
                    </div>
                    <p data-testid="generated-surface" lang="tpw">
                      {studio.pending
                        ? 'Avaliando…'
                        : (result?.surface ??
                          (studio.renderError
                            ? 'Não foi possível avaliar'
                            : 'Avaliação indisponível'))}
                    </p>
                    <span className="surface-caption">
                      {result?.origin === 'engine'
                        ? 'Motor local · revisão atual'
                        : result
                          ? 'Resultado previamente avaliado'
                          : 'Disponível no editor de Araújo 0067'}
                    </span>
                  </div>
                </div>
                <div className="agreement-bar">
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
                    Revisão editorial <strong>pendente</strong>
                  </span>
                  <span className="agreement-separator" />
                  <span>
                    {project.mode === 'example'
                      ? 'Motor do exemplo registrado'
                      : 'Motor local identificado'}
                  </span>
                </div>
                {(studio.renderError || studio.conflict || orphaned > 0) && (
                  <p role="alert" className="inline-error">
                    {studio.conflict
                      ? 'A fonte mudou desde este rascunho. Exporte sua contribuição antes de reconciliar as versões.'
                      : studio.renderError ||
                        `${orphaned} rascunho(s) de versões anteriores foram preservados; a associação com as passagens exige revisão.`}
                  </p>
                )}
                {orphaned > 0 && (
                  <div className="recovery-note">
                    <button
                      className="button"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([JSON.stringify(studio.envelope, null, 2)], {
                            type: 'application/json',
                          }),
                        );
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'pydicate-rascunhos-preservados.json';
                        link.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      <ArrowDownToLine size={14} />
                      Exportar todos os rascunhos preservados
                    </button>
                  </div>
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
                        onClick={() => setTab(item)}
                      >
                        {item === 'Código' && <Code2 size={13} />} {item}
                      </button>
                    ))}
                  </div>
                  <div className="tab-content" role="tabpanel" aria-label={tab}>
                    <Projections
                      studio={studio}
                      tab={tab}
                      selected={selected}
                      select={setSelected}
                    />
                  </div>
                  {draft?.analysis && <SelectionNote studio={studio} selected={selected} />}
                </>
              )}
              {mode === 'reading' && (
                <div className="reading-contribution">
                  <span className="eyebrow">SUA CONTRIBUIÇÃO</span>
                  <h3>Uma dúvida também merece registro.</h3>
                  <p>
                    Use a fonte ao lado para propor uma transcrição ou leitura. Acrescente o que
                    ajuda outra pessoa a entender sua escolha.
                  </p>
                  <label className="editor-label">
                    Tradução proposta
                    <textarea
                      rows={3}
                      value={draft?.translation ?? ''}
                      disabled={!studio.ready || studio.conflict}
                      placeholder="Uma interpretação possível em português…"
                      onChange={(e) => studio.edit({ translation: e.target.value })}
                    />
                  </label>
                  <label className="editor-label">
                    Nota de leitura
                    <textarea
                      ref={note}
                      rows={5}
                      value={draft?.notes ?? ''}
                      disabled={!studio.ready || studio.conflict}
                      placeholder="Uma letra incerta, uma alternativa, uma justificativa…"
                      onChange={(e) => studio.edit({ notes: e.target.value })}
                    />
                  </label>
                  <div className="teaching-note">
                    <Leaf size={18} />
                    <p>
                      Seu rascunho pode ficar incompleto. Ele será guardado com a passagem e poderá
                      ser retomado depois.
                    </p>
                  </div>
                </div>
              )}
              {mode === 'review' && (
                <div className="review-view">
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
                        usadas. A aprovação de referências será integrada ao fluxo editorial do
                        corpus.
                      </p>
                    </div>
                  </div>
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
                      disabled={!studio.ready || studio.conflict}
                      placeholder="Deixe uma observação para a revisão…"
                      onChange={(e) => studio.edit({ notes: e.target.value })}
                    />
                  </label>
                </div>
              )}
              <footer className="workspace-footer">
                <span className="save-status" role="status">
                  <span
                    className={studio.saveState.includes('salvo') ? 'saved-dot' : 'status-dot'}
                  />
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
                    disabled={!draft?.analysis || !studio.ready || studio.conflict}
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
      </div>
      <footer className="app-status">
        <span>
          <span className="status-dot" />
          Seu trabalho fica neste dispositivo
        </span>
        <span>
          Português · Tupi antigo <span className="status-divider">/</span> Pydicate Studio
        </span>
      </footer>
      {projectDialog && <ProjectDialog studio={studio} close={() => setProjectDialog(false)} />}
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
              setTab('Histórico');
              setMode('analysis');
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

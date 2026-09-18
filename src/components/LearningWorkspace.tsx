import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  GraduationCap,
  Lightbulb,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { invoke, type ParsedExpression } from '../domain/authoring';
import { emptyCanvas } from '../domain/canvas';
import {
  lessonMatches,
  lessonStepMatches,
  matchesSearch,
  readProgress,
  type LearningLibrary,
  type Lesson,
  type LessonProgress,
} from '../domain/learning';
import type { RenderResult, StudioProject } from '../domain/types';
import compiled from '../generated/learning.json';
import { PydicateTree } from './RuntimeTree';
import { LessonQuestion } from './LessonQuestion';
import '../learning.css';

/** @studio-guide
{"id":"primeiros-passos","title":"Comece aqui: construir de dentro para fora","terms":["iniciante","tutorial","aprender","dez minutos","roteiro","passo a passo"],"body":"Pense primeiro no que quer dizer. Busque as peças pelo tupi ou pelo significado, forme conjuntos pequenos e confira como se realizam. Depois ligue esses conjuntos. Nem toda etapa intermediária é um enunciado completo; as anotações ajudam a conferir sujeito e objeto. Uma construção já nomeada pode ser reutilizada inteira.","ui":"Nas cinco lições, pratique: 1) buscar e vincular; 2) formar posse e escolher o escopo do modo; 3) omitir, ordenar e negar; 4) escolher uma variante e obter uma base nominal; 5) preparar peças soltas e reunir conjuntos. Use Próxima etapa para ver a orientação seguinte sem substituir sua árvore. Depois consulte helpers, formação nominal, subordinação, cópula e outros modos na referência. Desfazer recupera sua tentativa.","code":"arobiar * espirito_santo\n(ur * (nde * reino)).perm()\n-(+nde * mondarõ).imp()\n(mombeu * nhe).var(1).base_nominal()","related":["editor","lexico","escopo","var","base_nominal","helpers","referencia"]}
*/

/** @studio-guide
{"id":"escopo","title":"Selecionar o conjunto certo","terms":["árvore","escopo","parênteses","ligação","operação","selecionar"],"body":"Uma árvore torna visíveis os conjuntos dentro de conjuntos. Operar sobre uma palavra não é o mesmo que operar sobre a ligação que reúne duas palavras. Os parênteses do código e as ligações da árvore delimitam o mesmo escopo.","ui":"Selecione a peça para atuar sobre ela; selecione a ligação para atuar sobre o conjunto. No menu, Adicionar operação envolve a seleção. Confira a prévia e use Desfazer quando o escopo não for o pretendido.","code":"(ur * (nde * reino)).perm()","related":["vincular","var","base_nominal"]}
*/
/** @studio-guide
{"id":"lexico","title":"Buscar, reutilizar e inspecionar peças","terms":["léxico","dicionário","Navarro","alias","helper","reuso","arobiar","var_name"],"body":"O nome usado no código referencia uma entrada do léxico. Pode ser palavra, construção nomeada, alias ou helper. arobiar guarda +ixé * erobîar. .var() não cria uma variável: seleciona uma variante. Helpers como n(...) e v(...) precisam ser interpretados pela sua definição no projeto.","ui":"Use a busca de peças para encontrar formas, nomes ou significados. Inspecione a entrada antes de criar outra. O dicionário distingue sentidos; escolha o sentido correto. Alterações compartilhadas no léxico passam por revisão de publicação.","code":"arobiar * espirito_santo","related":["var","vincular","referencia"]}
*/
/** @studio-guide
{"id":"editor","title":"Peças soltas, árvore principal e código","terms":["UI","interface","editor","peça","conectar","desfazer","refazer","código"],"body":"A árvore principal realiza o enunciado. Peças soltas permitem preparar conjuntos antes de conectá-los. A expressão em código e a árvore representam a mesma análise. Um erro temporário não exige recomeçar nem apagar a tentativa.","ui":"Adicione uma peça pela busca, conecte pelo ponto de ligação ou use o menu da peça. Ao combinar, confira operador e ordem. Desfazer e Refazer recuperam alterações. No tutorial, Código da tentativa permite editar a expressão; as etapas-modelo podem substituir a tentativa com confirmação.","code":"(mombeu * nhe).var(1).base_nominal()","related":["escopo","lexico","referencia"]}
*/
/** @studio-guide
{"id":"referencia","title":"Forma, análise e referência não são a mesma coisa","terms":["ground truth","referência","concluída","publicar","aprovar","morfema","SUBJECT","OBJECT","erro"],"body":"A forma é a realização produzida pelo motor. A análise é a estrutura que a produziu. A referência é o registro revisado preservado no corpus. Dois códigos podem dar a mesma forma sem fazer a mesma afirmação gramatical. Confira as anotações SUBJECT e OBJECT; não infira papéis de uma tradução automática.","ui":"Compare a forma realizada, Morfemas e Código. No trabalho normal, revise a diferença antes de publicar na fonte. Aprovar Ground Truth é uma ação separada. As tentativas do tutorial nunca publicam nem aprovam registros.","code":"-(+nde * mondarõ).imp()","related":["editor","escopo"]}
*/
/** @studio-guide
{"id":"documentacao","title":"Como esta referência acompanha o código","terms":["documentação","implementação","build","docstring","comentário","gerar","agente"],"body":"O build reúne verbetes escritos em comentários do Studio, comentários e docstrings Python do motor e das fontes .tu.py, assinaturas Python e exemplos reais das fontes .tu.py. A lista de exemplos inclui suas operações e o estado da comparação com o registro salvo. Uma lição só fica disponível enquanto seu exemplo final conserva a mesma estrutura e coincide com uma referência aprovada.","ui":"Busque um assunto em Guia, uma assinatura em Implementação ou uma construção em Exemplos. Dentro de cada verbete há o caminho da fonte. No aplicativo desktop, a biblioteca é reconstruída para o projeto local aberto.","code":"npm run docs:build\nnpm run docs:check","related":["referencia"]}
*/

const bundled = compiled as unknown as LearningLibrary;

export function LearningWorkspace({
  project,
  onClose,
  initialView = 'lessons',
}: {
  project: StudioProject;
  onClose: () => void;
  initialView?: 'lessons' | 'reference';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [live, setLive] = useState<LearningLibrary | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const local = project.mode === 'local';
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!local) return;
    let current = true;
    setLive(null);
    setError('');
    void invoke<LearningLibrary>('learning_library', {
      projectId: project.id,
      engineFingerprint: project.engineFingerprint,
    })
      .then((value) => {
        if (current && value.engineFingerprint === project.engineFingerprint) setLive(value);
        else if (current) setError('A gramática mudou. Atualize o projeto e reabra o guia.');
      })
      .catch((reason) => {
        if (current) setError(String(reason));
      });
    return () => {
      current = false;
    };
  }, [local, project.id, project.engineFingerprint, retry]);
  const library = local ? live : bundled;
  return (
    <dialog
      className="learning-dialog"
      ref={dialog}
      aria-label="Aprender Pydicate"
      onCancel={onClose}
    >
      <header className="learning-header">
        <div>
          <GraduationCap size={21} />
          <h1>Aprender Pydicate</h1>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Voltar ao trabalho"
          title="Voltar ao trabalho"
        >
          <X size={20} />
        </button>
      </header>
      {library ? (
        <LearningContent
          key={`${project.id}:${library.engineFingerprint ?? library.contentId}`}
          library={library}
          project={project}
          initialView={initialView}
        />
      ) : (
        <div className="learning-loading" role="status">
          <p>{error || 'Conferindo exemplos e documentação no projeto local…'}</p>
          {error && (
            <button className="button" onClick={() => setRetry((value) => value + 1)}>
              <RefreshCw size={16} /> Tentar novamente
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}

function LearningContent({
  library,
  project,
  initialView,
}: {
  library: LearningLibrary;
  project: StudioProject;
  initialView: 'lessons' | 'reference';
}) {
  const [view, setView] = useState<'lessons' | 'reference'>(initialView);
  const [selected, setSelected] = useState(library.lessons[0].id);
  const [guide, setGuide] = useState('primeiros-passos');
  const storageKey = `studio-learning:v1:${project.id}:${library.engineFingerprint ?? library.contentId}:${library.documentationFingerprint ?? ''}`;
  const [progress, setProgress] = useState(() => readProgress(storageKey, library.lessons));
  const [storageError, setStorageError] = useState('');
  const lesson = library.lessons.find((item) => item.id === selected)!;
  function save(value: LessonProgress) {
    setProgress((previous) => {
      const next = { ...previous, [selected]: value };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        setStorageError('');
      } catch {
        setStorageError(
          'Não foi possível salvar o progresso neste navegador. A tentativa continua aberta.',
        );
      }
      return next;
    });
  }
  const openGuide = (id: string) => {
    setGuide(id);
    setView('reference');
  };
  return (
    <>
      <nav className="learning-tabs" aria-label="Área de aprendizagem">
        <button aria-pressed={view === 'lessons'} onClick={() => setView('lessons')}>
          <GraduationCap size={17} /> Cinco lições · 10 min
        </button>
        <button aria-pressed={view === 'reference'} onClick={() => setView('reference')}>
          <BookOpen size={17} /> Referência
        </button>
        <span>
          {library.verifiedCount} exemplos conferidos
          {project.mode === 'example' ? ' · registro da compilação' : ' · projeto local'}
        </span>
      </nav>
      {storageError && <p role="alert">{storageError}</p>}
      {view === 'reference' ? (
        <Reference library={library} selected={guide} onSelect={setGuide} />
      ) : (
        <div className="learning-body">
          <aside className="learning-nav" aria-label="Lições">
            {library.lessons.map((item, index) => (
              <button
                key={item.id}
                aria-current={item.id === selected ? 'step' : undefined}
                onClick={() => setSelected(item.id)}
              >
                <span className="lesson-number">
                  {progress[item.id]?.complete ? <Check size={16} /> : index + 1}
                </span>
                <span>
                  {item.title}
                  <small>
                    {item.minutes} min
                    {!item.available
                      ? ' · precisa de revisão'
                      : progress[item.id]?.complete
                        ? ' · concluída'
                        : ''}
                  </small>
                </span>
              </button>
            ))}
            <button onClick={() => openGuide('editor')}>
              <BookOpen size={17} /> Guia do editor
            </button>
            <p className="learning-boundary">Prática separada do corpus</p>
          </aside>
          <LessonPractice
            key={lesson.id}
            lesson={lesson}
            project={project}
            saved={progress[lesson.id]}
            onSave={save}
            openGuide={openGuide}
            onNext={() => {
              const next = library.lessons[library.lessons.indexOf(lesson) + 1];
              if (next) setSelected(next.id);
              else openGuide('referencia');
            }}
          />
        </div>
      )}
    </>
  );
}

function LessonPractice({
  lesson,
  project,
  saved,
  onSave,
  openGuide,
  onNext,
}: {
  lesson: Lesson;
  project: StudioProject;
  saved?: LessonProgress;
  onSave: (progress: LessonProgress) => void;
  openGuide: (id: string) => void;
  onNext: () => void;
}) {
  const initial = saved ?? { raw: lesson.steps[0].raw, step: 0 };
  const [state, setState] = useState<LessonProgress>(initial);
  const [undo, setUndo] = useState<LessonProgress[]>([]);
  const [redo, setRedo] = useState<LessonProgress[]>([]);
  const [hint, setHint] = useState(false);
  const [ask, setAsk] = useState(false);
  const [replace, setReplace] = useState<number | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [parsed, setParsed] = useState<ParsedExpression | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState(false);
  const passage = project.passages.find(
    (item) => item.sourceId === lesson.sourceId && item.ordinal === lesson.ordinal,
  );
  const local = project.mode === 'local' && !!passage && lesson.available;
  const step = lesson.steps[state.step];
  const revision = useRef(0);
  function change(next: LessonProgress) {
    setUndo((values) => [...values.slice(-49), state]);
    setRedo([]);
    setState(next);
    onSave(next);
    setChecked(false);
  }
  function install(index: number) {
    change({
      ...state,
      raw: lesson.steps[index].raw,
      canvas: emptyCanvas(),
      step: index,
      complete: false,
    });
    setReplace(null);
    setHint(false);
  }
  useEffect(() => {
    const ticket = ++revision.current;
    let current = true;
    setResult(null);
    setParsed(null);
    setError('');
    setChecked(false);
    if (!local) {
      setPending(false);
      return;
    }
    setPending(true);
    const timer = setTimeout(() => {
      const params = {
        passageId: passage.id,
        sourceId: lesson.sourceId,
        raw: state.raw,
        revisionId: `lesson:${ticket}`,
        engineFingerprint: project.engineFingerprint,
      };
      void invoke<ParsedExpression>('parse_expression', params)
        .then(async (value) => {
          if (!current) return;
          setParsed(value);
          if (!value.root)
            throw new Error(
              'A expressão ainda está incompleta. Confira o código ou use uma etapa-modelo.',
            );
          const evaluated = await invoke<RenderResult>('evaluate_expression', params);
          if (current) setResult(evaluated);
        })
        .catch((reason) => {
          if (current) setError(String(reason));
        })
        .finally(() => {
          if (current) setPending(false);
        });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [state.raw, lesson.sourceId, passage?.id, project.engineFingerprint, local]);
  const recorded = !local
    ? (lesson.steps.find((item) => item.raw === state.raw)?.evaluation ?? null)
    : null;
  const display = local ? result : recorded;
  const currentResult = result?.expression === state.raw;
  const matched = currentResult && lessonMatches(result, lesson);
  const stepMatched = currentResult && lessonStepMatches(result, step);
  const understood = state.answer === lesson.answer;
  return (
    <main className="lesson-practice">
      <header className="lesson-title">
        <div>
          <h2>{lesson.title}</h2>
          <p>{lesson.intro}</p>
        </div>
        <span>{lesson.minutes} min</span>
      </header>
      {!lesson.available && <p role="alert">{lesson.reason}</p>}
      {!local && (
        <p className="learning-boundary">
          Leitura dos exemplos da compilação. Abra este corpus no aplicativo desktop para editar e
          conferir sua tentativa no motor local.
        </p>
      )}
      <section className="lesson-step" aria-label="Etapa atual">
        <div className="lesson-step-heading">
          <strong>
            Etapa {state.step + 1} de {lesson.steps.length}: {step.title}
          </strong>
          <div className="learning-actions">
            <button
              className="button small"
              disabled={state.step === 0}
              title="Etapa anterior"
              aria-label="Etapa anterior"
              onClick={() => {
                change({ ...state, step: state.step - 1 });
                setHint(false);
              }}
            >
              <ArrowLeft size={17} /> Anterior
            </button>
            <button
              className="button small"
              disabled={state.step === lesson.steps.length - 1}
              title="Avançar a orientação mantendo sua árvore"
              aria-label="Próxima etapa"
              onClick={() => {
                change({ ...state, step: state.step + 1 });
                setHint(false);
              }}
            >
              Próxima etapa <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <p>{step.prompt}</p>
        {local && (
          <p className="lesson-step-status" role="status" aria-label="Montagem da etapa">
            {pending
              ? 'Conferindo a montagem…'
              : stepMatched
                ? step.partialExpected
                  ? 'Estrutura desta etapa conferida. A forma fica completa nas próximas operações.'
                  : state.step < lesson.steps.length - 1
                    ? 'Etapa conferida. Continue em Próxima etapa; sua árvore será mantida.'
                    : state.complete
                      ? 'Lição concluída. Você pode continuar ou explorar esta árvore.'
                      : 'Montagem conferida. Responda à pergunta para concluir a lição.'
                : 'Monte o conjunto descrito nesta etapa. Você pode consultar a dica ou abrir o modelo.'}
          </p>
        )}
        <div className="learning-actions">
          <button className="button" onClick={() => setHint(!hint)} aria-expanded={hint}>
            <Lightbulb size={16} /> Uma dica
          </button>
          <button className="button" onClick={() => setReplace(state.step)}>
            <Play size={15} /> Abrir modelo desta etapa
          </button>
          <button className="button" onClick={() => setReplace(0)}>
            <RotateCcw size={15} /> Recomeçar
          </button>
        </div>
        {hint && <p className="lesson-hint">{step.hint}</p>}
        {replace !== null && (
          <div className="lesson-confirm" role="group" aria-label="Substituir tentativa">
            <p>Substituir a tentativa pelo modelo? Você poderá desfazer.</p>
            <button className="button" onClick={() => install(replace)}>
              Substituir tentativa
            </button>
            <button className="button" onClick={() => setReplace(null)}>
              Manter tentativa
            </button>
          </div>
        )}
      </section>
      <div className="lesson-tree" aria-label="Árvore de prática">
        <PydicateTree
          raw={state.raw}
          evaluatedRoot={display?.tree}
          authoringRoot={parsed?.root ?? recorded?.tree}
          revisionId={`lesson:${revision.current}`}
          engineFingerprint={project.engineFingerprint}
          passageId={passage?.id}
          sourceId={lesson.sourceId}
          canvas={state.canvas}
          onChangeCanvas={
            local ? (edit) => change({ ...state, ...edit, complete: false }) : undefined
          }
          onChangeRaw={local ? (raw) => change({ ...state, raw, complete: false }) : undefined}
          onUndo={
            undo.length
              ? () => {
                  const next = undo.at(-1)!;
                  setRedo((values) => [...values, state]);
                  setUndo((values) => values.slice(0, -1));
                  setState(next);
                  onSave(next);
                }
              : undefined
          }
          onRedo={
            redo.length
              ? () => {
                  const next = redo.at(-1)!;
                  setUndo((values) => [...values, state]);
                  setRedo((values) => values.slice(0, -1));
                  setState(next);
                  onSave(next);
                }
              : undefined
          }
          canUndo={!!undo.length}
          canRedo={!!redo.length}
          failures={display?.failures}
          status={pending ? 'Conferindo a tentativa…' : error || undefined}
        />
      </div>
      <section className="lesson-results" aria-label="Comparação da tentativa">
        <div>
          <small>{local ? 'Sua tentativa' : 'Exemplo registrado'}</small>
          <p lang="tpw" data-testid="lesson-surface">
            {pending ? 'Avaliando…' : display?.surface || 'Ainda sem forma completa'}
          </p>
        </div>
        <div>
          <small>Referência salva</small>
          <p lang="tpw">{lesson.reference ?? 'Indisponível'}</p>
        </div>
      </section>
      {error && <p role="alert">{error}</p>}
      <details className="lesson-code">
        <summary>
          <Code2 size={15} /> Código da tentativa
        </summary>
        <label>
          Expressão da prática
          <textarea
            spellCheck={false}
            value={state.raw}
            readOnly={!local}
            rows={3}
            onChange={(event) => change({ ...state, raw: event.target.value, complete: false })}
          />
        </label>
        <details>
          <summary>Anotação do motor</summary>
          <pre>{display?.annotated || 'Sem anotação disponível.'}</pre>
        </details>
      </details>
      <fieldset className="lesson-check">
        <legend>{lesson.question}</legend>
        {lesson.choices.map((choice, index) => (
          <label key={choice}>
            <input
              type="radio"
              name={`answer-${lesson.id}`}
              checked={state.answer === index}
              onChange={() => change({ ...state, answer: index, complete: false })}
            />
            {choice}
          </label>
        ))}
        {state.answer !== undefined && (
          <p>
            {understood ? lesson.explanation : 'Vale rever a dica e observar o escopo da operação.'}
          </p>
        )}
      </fieldset>
      <div className="learning-actions">
        <button
          className="button primary"
          disabled={!local || pending || !currentResult}
          onClick={() => {
            setChecked(true);
            if (matched && understood) {
              const next = { ...state, complete: true };
              setState(next);
              onSave(next);
            }
          }}
        >
          <Check size={16} /> Conferir lição
        </button>
        {state.complete && (
          <button className="button" onClick={onNext}>
            Continuar <ArrowRight size={16} />
          </button>
        )}
        <button className="button" aria-expanded={ask} onClick={() => setAsk(!ask)}>
          <CircleHelp size={16} /> Tenho uma dúvida
        </button>
      </div>
      {checked && (
        <p role="status" aria-label="Conferência da lição">
          {matched && understood
            ? 'Lição concluída: estrutura, forma e resposta conferidas.'
            : !matched
              ? 'Ainda não é a construção do exemplo. Confira os conjuntos e a ordem das operações; a mesma grafia sozinha não basta.'
              : 'A construção confere. Falta responder à pergunta da lição.'}
        </p>
      )}
      {ask && (
        <section className="lesson-help">
          <h3>Consultar a referência</h3>
          <div className="learning-actions">
            {lesson.guides.map((id) => (
              <button className="button" key={id} onClick={() => openGuide(id)}>
                <BookOpen size={15} /> {id.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          {local && passage ? (
            <LessonQuestion
              key={lesson.id}
              lesson={lesson}
              raw={state.raw}
              project={project}
              passage={passage}
            />
          ) : (
            <p>As perguntas à IA ficam disponíveis com o projeto aberto no aplicativo desktop.</p>
          )}
        </section>
      )}
      <footer className="lesson-source">
        {lesson.recordId} · historic/{lesson.sourceId}.tu.py:{lesson.sourceLine}
      </footer>
    </main>
  );
}

function Reference({
  library,
  selected,
  onSelect,
}: {
  library: LearningLibrary;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'guides' | 'api' | 'examples'>('guides');
  const [api, setApi] = useState('');
  const [example, setExample] = useState('');
  const guides = library.guides.filter((item) =>
    matchesSearch(query, item.title, item.terms, item.body, item.ui, item.code),
  );
  const implementations = library.implementations.filter((item) =>
    matchesSearch(query, item.signature, item.owner, item.source, item.docstring, item.definition),
  );
  const examples = library.inventory.filter((item) =>
    matchesSearch(query, item.sourceId, item.raw, item.surface, item.features),
  );
  const guide = guides.find((item) => item.id === selected) ?? guides[0];
  const implementation = implementations.find((item) => item.id === api) ?? implementations[0];
  const source =
    examples.find((item) => `${item.sourceId}:${item.ordinal}` === example) ?? examples[0];
  const associated = guide
    ? library.implementations.filter((item) => guide.api?.includes(item.name))
    : [];
  function follow(id: string) {
    setQuery('');
    setKind('guides');
    onSelect(id);
  }
  return (
    <div className="reference-body">
      <aside className="reference-nav">
        <label className="reference-search">
          <Search size={17} />
          <input
            autoFocus
            aria-label="Buscar na referência"
            placeholder="Assunto, operação ou forma"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="reference-kinds" aria-label="Tipo de referência">
          {(['guides', 'api', 'examples'] as const).map((value, index) => (
            <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {['Guia', 'Implementação', 'Exemplos'][index]}
            </button>
          ))}
        </div>
        <p className="reference-count">
          {(kind === 'guides' ? guides : kind === 'api' ? implementations : examples).length}{' '}
          resultados
        </p>
        <div className="reference-list">
          {kind === 'guides' &&
            guides.map((item) => (
              <button
                key={item.id}
                aria-current={guide?.id === item.id ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
              >
                {item.title}
                <ChevronRight size={14} />
              </button>
            ))}
          {kind === 'api' &&
            implementations.map((item) => (
              <button
                key={item.id}
                aria-current={implementation?.id === item.id ? 'page' : undefined}
                onClick={() => setApi(item.id)}
              >
                <span>
                  {item.owner}
                  <code>{item.signature}</code>
                </span>
              </button>
            ))}
          {kind === 'examples' &&
            examples.map((item) => (
              <button
                key={`${item.sourceId}:${item.ordinal}`}
                aria-current={source === item ? 'page' : undefined}
                onClick={() => setExample(`${item.sourceId}:${item.ordinal}`)}
              >
                <span>
                  {item.surface || 'Forma indisponível'}
                  <small>
                    {item.sourceId} · {item.ordinal}
                  </small>
                </span>
              </button>
            ))}
        </div>
      </aside>
      <article className="reference-article" aria-label="Verbete da referência">
        {kind === 'guides' && guide ? (
          <>
            <h2>{guide.title}</h2>
            <p>{guide.body}</p>
            <h3>No editor</h3>
            <p>{guide.ui}</p>
            <h3>No código</h3>
            <pre>{guide.code}</pre>
            {!!associated.length && (
              <>
                <h3>Implementação no motor local</h3>
                <ul>
                  {associated.map((item) => (
                    <li key={item.id}>
                      <button
                        className="reference-link"
                        onClick={() => {
                          setQuery('');
                          setApi(item.id);
                          setKind('api');
                        }}
                      >
                        {item.owner}.{item.signature}
                      </button>
                      <small>{item.source}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!!guide.related?.length && (
              <>
                <h3>Veja também</h3>
                <div className="learning-actions">
                  {guide.related.map((id) => (
                    <button className="button" key={id} onClick={() => follow(id)}>
                      {library.guides.find((item) => item.id === id)?.title ?? id}
                    </button>
                  ))}
                </div>
              </>
            )}
            <footer>Documentação extraída de {guide.source}</footer>
          </>
        ) : kind === 'api' && implementation ? (
          <>
            <h2>
              {implementation.owner}.{implementation.name}
            </h2>
            <pre>{implementation.signature}</pre>
            <p>{implementation.source}</p>
            <p>
              {implementation.kind === 'helper'
                ? 'Helper definido na fonte; seus argumentos são construções.'
                : implementation.editorSupported
                  ? 'Operação presente no adaptador visual; a disponibilidade depende do tipo.'
                  : 'API interna do motor; não é necessariamente uma operação do editor.'}
            </p>
            {implementation.definition && <pre>{implementation.definition}</pre>}
            {library.guides
              .filter((item) => item.api?.includes(implementation.name))
              .map((item) => (
                <button key={item.id} className="button" onClick={() => follow(item.id)}>
                  <BookOpen size={15} /> {item.title}
                </button>
              ))}
            <details>
              <summary>Docstring original da implementação</summary>
              <pre>{implementation.docstring || 'Esta implementação ainda não tem docstring.'}</pre>
            </details>
          </>
        ) : kind === 'examples' && source ? (
          <>
            <h2 lang="tpw">{source.surface || 'Forma indisponível'}</h2>
            <p>
              {source.sourceId} · registro {source.ordinal}
            </p>
            <p>
              {source.status === 'verified'
                ? 'Coincide com a referência aprovada.'
                : 'Sem referência aprovada correspondente; não é um modelo de lição.'}
            </p>
            <pre>{source.raw}</pre>
            <h3>Estruturas presentes</h3>
            <div className="learning-actions">
              {source.features.map((feature) => (
                <button
                  key={feature}
                  className="button"
                  onClick={() => {
                    setQuery(feature.replace(/^\./, ''));
                    setKind('guides');
                  }}
                >
                  {feature}
                </button>
              ))}
            </div>
            <footer>
              historic/{source.sourceId}.tu.py:{source.line}
            </footer>
          </>
        ) : (
          <p>Nenhum resultado. Tente o nome da operação, um assunto ou uma forma sem acentos.</p>
        )}
      </article>
    </div>
  );
}

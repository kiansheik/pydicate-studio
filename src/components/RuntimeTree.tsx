import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Expand,
  Maximize2,
  Minus,
  Plus,
  Search,
  UnfoldVertical,
  Undo2,
  Redo2,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  edgePath,
  initialRuntimeOverview,
  layoutRuntimeTree,
  NODE_HEIGHT,
  runtimeHierarchy,
  searchRuntimeTree,
  runtimeProjection,
  editableRuntimeScopes,
  replaceRuntimeScope,
  zoomRuntimeAt,
  isOperationJunction,
  treeNodeWidth,
  treeNodeHeight,
  treeEvaluationPreview,
  type RuntimeGraph,
  type RuntimeNode,
  type RuntimePrimitive,
} from '../domain/runtime-tree';
import '../runtime-tree.css';
import { track } from '../domain/usage';
import { useAdvancedTools } from '../domain/preferences';
import { invoke, type AuthorNode } from '../domain/authoring';
import { expressionGraph } from '../domain/expression-tree';
import { TreeScopeEditor } from './TreeScopeEditor';
import { LexicalInput } from './LexicalInput';
import { operationTerm } from '../domain/operation-terms';
import { ExpressionCanvas } from './ExpressionCanvas';
import type { CanvasEdit, CanvasState } from '../domain/canvas';
import type { CanvasDiagnostic } from '../domain/grammar-diagnostic';
import type { EvaluationFailure } from '../domain/authoring';
import type { MorphemeSurfaceHighlight } from '../domain/morpheme-display';

interface TreeEditingProps {
  onLexicalPreview?: (preview: import('../domain/authoring').SourcePreview) => void;
  canvas?: CanvasState;
  onChangeCanvas?: (change: CanvasEdit) => void;
  onPrepareDiagnostic?: (report: CanvasDiagnostic) => void;
  engineFingerprint?: string;
  failures?: EvaluationFailure[];
  authoringRoot?: AuthorNode | null;
  raw?: string;
  revisionId?: string;
  passageId?: string;
  sourceId?: string;
  onChangeRaw?: (raw: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onInspectLexeme?: (name: string) => void;
  onAskAI?: (sourceNodeId: string) => void;
  onSurfaceHighlight?: (highlight: MorphemeSurfaceHighlight | null) => void;
}

function compact(text: string, length = 31) {
  return text.length > length ? text.slice(0, length - 1) + '…' : text;
}
function flagText(node: RuntimeNode) {
  const flags: string[] = [];
  if (node.attributes.negated) flags.push('negado');
  if (node.attributes.pro_drop) flags.push('não expresso');
  if (node.attributes.reduplicated) flags.push('reduplicado');
  if (node.attributes.mood) flags.push(String(node.attributes.mood));
  if (node.attributes._inflection) flags.push(String(node.attributes._inflection));
  if (node.attributes.variation_id !== null && node.attributes.variation_id !== undefined)
    flags.push('var. ' + node.attributes.variation_id);
  return flags.join(' · ');
}
function operationMeaning(node: RuntimeNode) {
  if (!isOperationJunction(node) || !node.expression) return null;
  return operationTerm({
    ...node.expression,
    label: node.label,
    runtimeType:
      typeof node.attributes.runtimeType === 'string' ? node.attributes.runtimeType : undefined,
    dispatch: typeof node.attributes.dispatch === 'string' ? node.attributes.dispatch : undefined,
    operandTypes:
      typeof node.attributes.operandTypes === 'string'
        ? node.attributes.operandTypes.split(' · ')
        : undefined,
  });
}
function Properties({ values }: { values: Record<string, RuntimePrimitive> }) {
  return (
    <dl className="runtime-properties">
      {Object.entries(values).map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>
            {value === null
              ? '∅'
              : typeof value === 'boolean'
                ? value
                  ? 'sim'
                  : 'não'
                : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The editable tree is the source program. Runtime objects are evidence only. */
type PydicateTreeProps = TreeEditingProps & {
  evaluatedRoot?: AuthorNode | null;
  selectedSourceNodeId?: string;
  onSelectSourceNode?: (id: string) => void;
  status?: string;
};
export function PydicateTree(props: PydicateTreeProps) {
  return props.onChangeCanvas ? (
    <ExpressionCanvas
      key={props.passageId ?? 'canvas'}
      {...props}
      onChangeCanvas={props.onChangeCanvas}
    />
  ) : (
    <LegacyPydicateTree {...props} />
  );
}
function LegacyPydicateTree({
  evaluatedRoot,
  selectedSourceNodeId,
  onSelectSourceNode,
  status,
  ...editing
}: PydicateTreeProps) {
  const graph = useMemo(
    () =>
      editing.authoringRoot
        ? expressionGraph(editing.authoringRoot, editing.raw ?? '', evaluatedRoot)
        : null,
    [editing.authoringRoot, editing.raw, evaluatedRoot],
  );
  const previous = useRef<{ passageId?: string; graph: RuntimeGraph } | null>(null);
  const [seed, setSeed] = useState('');
  if (graph) previous.current = { passageId: editing.passageId, graph };
  else if (previous.current?.passageId !== editing.passageId) previous.current = null;
  // Keep the last structure during parsing, but never its old realized forms.
  const visibleGraph = useMemo(
    () =>
      graph ??
      (previous.current && {
        ...previous.current.graph,
        nodes: previous.current.graph.nodes.map((node) => ({ ...node, evaluation: undefined })),
      }),
    [graph, editing.raw, editing.passageId],
  );
  return visibleGraph ? (
    <TreeCanvas
      key={editing.passageId ?? 'expression-tree'}
      graph={visibleGraph}
      sourceTree
      status={
        graph
          ? status
          : `${status || 'Aguardando uma expressão válida.'} Exibindo a última estrutura; a edição aguarda os trechos atuais.`
      }
      selectedSourceNodeId={selectedSourceNodeId}
      onSelectSourceNode={onSelectSourceNode}
      {...editing}
      authoringRoot={graph ? editing.authoringRoot : null}
    />
  ) : (
    <section className="runtime-tree runtime-tree-empty" aria-label="Árvore de operações Pydicate">
      <h2>Árvore de operações Pydicate</h2>
      <p>
        {status ||
          'Escreva uma palavra ou trecho em tupi para encontrar uma estrutura e começar a árvore.'}
      </p>
      {editing.onChangeRaw && !editing.raw?.trim() && (
        <form
          className="runtime-scope-editor"
          onSubmit={(event) => {
            event.preventDefault();
            if (seed.trim()) editing.onChangeRaw?.(seed.trim());
          }}
        >
          <div className="tree-input-field">
            Palavra ou expressão inicial
            <LexicalInput
              label="Palavra ou expressão inicial"
              value={seed}
              onChange={setSeed}
              passageId={editing.passageId}
              contextKey={editing.revisionId}
            />
          </div>
          <button disabled={!seed.trim()}>Criar árvore</button>
        </form>
      )}
      {editing.raw?.trim() && (
        <p className="field-hint">Confira a expressão na aba Código. O rascunho permanece salvo.</p>
      )}
    </section>
  );
}

export function RuntimeTree({
  graph,
  selectedSourceNodeId,
  onSelectSourceNode,
  status,
  ...editing
}: {
  graph?: RuntimeGraph;
  selectedSourceNodeId?: string;
  onSelectSourceNode?: (id: string) => void;
  status?: string;
} & TreeEditingProps) {
  const previous = useRef<{ passageId?: string; graph: RuntimeGraph } | null>(null);
  if (graph) previous.current = { passageId: editing.passageId, graph };
  else if (previous.current?.passageId !== editing.passageId) previous.current = null;
  const visibleGraph = graph ?? previous.current?.graph;
  // Keep the same canvas/fullscreen element while the next revision runs.
  // Editing still requires exact current AST spans; stale scopes are disabled.
  return visibleGraph ? (
    <TreeCanvas
      key={editing.passageId ?? 'tree'}
      graph={visibleGraph}
      status={
        !graph
          ? status || 'Aguardando a árvore desta revisão; exibindo a última análise válida.'
          : undefined
      }
      selectedSourceNodeId={selectedSourceNodeId}
      onSelectSourceNode={onSelectSourceNode}
      {...editing}
    />
  ) : (
    <section className="runtime-tree runtime-tree-empty" aria-label="Árvore do modelo Pydicate">
      <h2>Árvore do modelo Pydicate</h2>
      <p>{status || 'A árvore aparece depois que o motor gera esta análise.'}</p>
      <p className="field-hint">
        Ela mostra os objetos, argumentos, adjuntos e relações da análise realizada.
      </p>
    </section>
  );
}

function TreeCanvas({
  graph: completeGraph,
  sourceTree = false,
  selectedSourceNodeId,
  onSelectSourceNode,
  status,
  ...editing
}: {
  graph: RuntimeGraph;
  sourceTree?: boolean;
  selectedSourceNodeId?: string;
  onSelectSourceNode?: (id: string) => void;
  status?: string;
} & TreeEditingProps) {
  // Expandir tudo, Visão geral and the reference/realisation toggles together recorded five
  // uses in a month of work; they return with the secondary tools.
  const advancedTools = useAdvancedTools();
  const [showInternals, setShowInternals] = useState(false);
  const graph = useMemo(
    () => runtimeProjection(completeGraph, showInternals),
    [completeGraph, showInternals],
  );
  const hierarchy = useMemo(() => runtimeHierarchy(graph), [graph]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    initialRuntimeOverview(graph, 700, 520),
  );
  const layout = useMemo(() => layoutRuntimeTree(graph, collapsed), [graph, collapsed]);
  const [selected, setSelected] = useState(graph.rootId);
  useEffect(() => {
    if (!graph.nodes.some((item) => item.id === selected)) setSelected(graph.rootId);
  }, [graph, selected]);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [showLinks, setShowLinks] = useState(true);
  const [notice, setNotice] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const emittedSelection = useRef<string | undefined>(undefined);
  const handledSourceSelection = useRef<string | undefined>(undefined);
  const matches = useMemo(() => searchRuntimeTree(graph, query), [graph, query]);
  const matchedIds = new Set(matches.map((node) => node.id));
  const node = hierarchy.nodes.get(selected) ?? graph.nodes[0];
  const svg = useRef<SVGSVGElement>(null);
  const container = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 520 });
  const [camera, setCamera] = useState({ x: layout.width / 2, y: layout.height / 2, zoom: 1 });
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const [fitRequested, setFitRequested] = useState(1);
  const firstResultsFitted = useRef(false);
  useEffect(() => {
    if (sourceTree && !firstResultsFitted.current && graph.nodes.some((item) => item.evaluation)) {
      firstResultsFitted.current = true;
      setFitRequested((value) => value + 1);
    }
  }, [graph, sourceTree]);
  const initialOverviewApplied = useRef(false);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = {
        width: Math.max(200, entry.contentRect.width),
        height: Math.max(240, entry.contentRect.height),
      };
      if (!initialOverviewApplied.current) {
        initialOverviewApplied.current = true;
        setCollapsed(initialRuntimeOverview(graph, measured.width, measured.height));
      }
      setDimensions(measured);
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setCamera({
      x: layout.width / 2,
      y: layout.height / 2,
      zoom: Math.min(
        1.1,
        (dimensions.width - 72) / (layout.width + 24),
        (dimensions.height - 100) / (layout.height + 24),
      ),
    });
  }, [dimensions, fitRequested]); // Expanding a branch keeps the contributor's camera; Ajustar fits it.
  useEffect(() => {
    if (!selectedSourceNodeId || !initialOverviewApplied.current) return;
    if (emittedSelection.current === selectedSourceNodeId) {
      emittedSelection.current = undefined;
      handledSourceSelection.current = selectedSourceNodeId;
      return;
    }
    const mapped = graph.nodes.find(
      (item) =>
        (item.sourceNodeId === selectedSourceNodeId ||
          item.sourceOccurrences?.some((scope) => scope.sourceNodeId === selectedSourceNodeId)) &&
        (!editing.onChangeRaw ||
          editableRuntimeScopes(item, editing.authoringRoot, editing.raw ?? '').some(
            (scope) => scope.id === selectedSourceNodeId,
          )),
    );
    if (!mapped) return;
    const changed = handledSourceSelection.current !== selectedSourceNodeId;
    const initialRoot =
      handledSourceSelection.current === undefined && selectedSourceNodeId === 'root';
    handledSourceSelection.current = selectedSourceNodeId;
    setSelected(mapped.id);
    // A cross-pane request reveals its scope once. A later graph revision can
    // update the mapped object identity without overriding the user's camera.
    if (changed && !initialRoot) revealNode(mapped.id);
  }, [graph, selectedSourceNodeId, dimensions, editing.authoringRoot, editing.raw]);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    let finished: ReturnType<typeof setTimeout> | undefined;
    const wheel = (event: WheelEvent) => {
      // A hover does not claim page scrolling. Clicking or tabbing into the
      // canvas explicitly engages it; scrolling elsewhere stays untouched.
      if (document.activeElement !== element && !element.contains(document.activeElement)) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      setCamera((previous) =>
        zoomRuntimeAt(
          previous,
          Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.004),
          event.clientX - bounds.left - bounds.width / 2,
          event.clientY - bounds.top - bounds.height / 2,
        ),
      );
      clearTimeout(finished);
      finished = setTimeout(() => track('editor.operation', { action: 'tree.zoom' }), 350);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      clearTimeout(finished);
    };
  }, []);
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(
      () =>
        track('navigation.search', {
          view: 'tree',
          count: query.length,
          resultCount: matches.length,
        }),
      600,
    );
    return () => clearTimeout(timer);
  }, [query, matches.length]);
  function selectNode(id: string) {
    track('editor.selection', { action: 'tree.select' });
    setSelected(id);
    const runtimeNode = hierarchy.nodes.get(id);
    const scopes =
      runtimeNode && editing.onChangeRaw
        ? editableRuntimeScopes(runtimeNode, editing.authoringRoot, editing.raw ?? '')
        : undefined;
    const mapped = scopes
      ? (scopes.find((scope) => scope.id === runtimeNode?.sourceNodeId)?.id ??
        scopes[0]?.id ??
        'root')
      : (runtimeNode?.sourceNodeId ?? 'root');
    emittedSelection.current = mapped !== selectedSourceNodeId ? mapped : undefined;
    onSelectSourceNode?.(mapped);
  }
  function revealNode(id: string) {
    const nextCollapsed = new Set(collapsed);
    let parent = hierarchy.parent.get(id);
    while (parent) {
      nextCollapsed.delete(parent);
      parent = hierarchy.parent.get(parent);
    }
    const nextLayout = layoutRuntimeTree(graph, nextCollapsed);
    const point = nextLayout.positions.get(id);
    setCollapsed(nextCollapsed);
    if (point)
      setCamera({
        x: point.x + treeNodeWidth(point.node) / 2,
        y: point.y + NODE_HEIGHT / 2,
        zoom: 1,
      });
  }
  function focusNode(id: string, keyboard = false) {
    revealNode(id);
    selectNode(id);
    if (keyboard)
      requestAnimationFrame(() => {
        svg.current
          ?.querySelector<SVGGElement>(`[data-runtime-node="${CSS.escape(id)}"] > [aria-pressed]`)
          ?.focus({ preventScroll: true });
      });
  }
  function focusMatch(index: number) {
    if (!matches.length) return;
    const normalized = (index + matches.length) % matches.length;
    setMatchIndex(normalized);
    focusNode(matches[normalized].id);
  }
  function toggle(id: string) {
    track('editor.operation', { action: collapsed.has(id) ? 'tree.expand' : 'tree.collapse' });
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function zoom(factor: number) {
    track('editor.operation', { action: 'tree.zoom' });
    setCamera((previous) => ({
      ...previous,
      zoom: Math.min(2.5, Math.max(0.025, previous.zoom * factor)),
    }));
  }
  function exportSvg() {
    const original = svg.current;
    if (!original) return;
    track('editor.operation', { action: 'tree.export', count: layout.positions.size });
    const copy = original.cloneNode(true) as SVGSVGElement;
    const originals = [original, ...original.querySelectorAll('*')];
    const copies = [copy, ...copy.querySelectorAll('*')];
    // Inline computed SVG styles so the downloaded artifact is self-contained.
    originals.forEach((element, index) => {
      const computed = getComputedStyle(element);
      copies[index].setAttribute(
        'style',
        [
          'fill',
          'stroke',
          'stroke-width',
          'stroke-dasharray',
          'font-family',
          'font-size',
          'font-weight',
          'opacity',
          'paint-order',
        ]
          .map((property) => `${property}:${computed.getPropertyValue(property)}`)
          .join(';'),
      );
      copies[index].removeAttribute('tabindex');
      copies[index].removeAttribute('role');
    });
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('viewBox', `-32 -90 ${layout.width + 64} ${layout.height + 122}`);
    copy.setAttribute('width', String(layout.width + 64));
    copy.setAttribute('height', String(layout.height + 122));
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', '-32');
    background.setAttribute('y', '-90');
    background.setAttribute('width', String(layout.width + 64));
    background.setAttribute('height', String(layout.height + 122));
    background.setAttribute('fill', getComputedStyle(viewport.current!).backgroundColor);
    copy.insertBefore(background, copy.firstChild);
    const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    metadata.textContent = JSON.stringify({ application: 'Pydicate Studio', graph });
    copy.appendChild(metadata);
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(copy)], {
        type: 'image/svg+xml;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pydicate-arvore.svg';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const width = dimensions.width / camera.zoom;
  const height = dimensions.height / camera.zoom;
  const relations = graph.edges.filter(
    (edge) => edge.source === selected || edge.target === selected,
  );
  const selectedEvaluation = sourceTree && node ? treeEvaluationPreview(node) : null;
  const selectedMeaning = sourceTree && node ? operationMeaning(node) : null;
  return (
    <section
      ref={container}
      className={`runtime-tree${sourceTree ? ' expression-tree' : ''}`}
      aria-label={sourceTree ? 'Árvore de operações Pydicate' : 'Árvore do modelo Pydicate'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && document.fullscreenElement === container.current) {
          event.preventDefault();
          void document
            .exitFullscreen()
            .catch(() => setNotice('Use o botão de tela cheia para sair.'));
          return;
        }
        if (
          !(event.metaKey || event.ctrlKey) ||
          event.key.toLowerCase() !== 'z' ||
          (event.target as Element).closest('input,textarea,select')
        )
          return;
        if (event.shiftKey && editing.canRedo) {
          event.preventDefault();
          editing.onRedo?.();
        } else if (!event.shiftKey && editing.canUndo) {
          event.preventDefault();
          editing.onUndo?.();
        }
      }}
    >
      <div className="runtime-heading">
        <div>
          <h2>{sourceTree ? 'Árvore de operações Pydicate' : 'Árvore do modelo Pydicate'}</h2>
          <p>
            {sourceTree
              ? `${graph.nodes.filter((item) => !isOperationJunction(item)).length} elementos · ${graph.nodes.filter(isOperationJunction).length} operações`
              : `${graph.nodes.length} objetos · ${graph.edges.length} relações`}
            {showInternals ? ' · com cópias de realização' : ''}
          </p>
        </div>
        {advancedTools && (
          <button onClick={exportSvg} title="Baixar a árvore visível como SVG">
            <Download size={15} /> SVG
          </button>
        )}
      </div>
      <div className="runtime-toolbar">
        {advancedTools && (
          <form
            className="runtime-search"
            onSubmit={(event) => {
              event.preventDefault();
              focusMatch(matchIndex + (selected === matches[matchIndex]?.id ? 1 : 0));
            }}
          >
            <Search size={16} />
            <input
              aria-label="Buscar na árvore"
              placeholder={
                sourceTree
                  ? 'Buscar variável, operação, definição…'
                  : 'Buscar lexema, definição, traço…'
              }
              title={
                sourceTree
                  ? 'Busque variáveis, operadores ou definições lexicais. Use aspas para um nome exato, como "oré".'
                  : 'Use aspas para um nome exato, como "oré". Sem aspas, busca também definições e traços.'
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMatchIndex(0);
              }}
            />
            {query && (
              <span role="status">
                {matches.length ? `${matchIndex + 1}/${matches.length}` : '0'}
              </span>
            )}
            <button disabled={!matches.length} title="Localizar próxima correspondência">
              Ir
            </button>
          </form>
        )}
        <div className="runtime-tools">
          <button onClick={() => zoom(1 / 1.25)} aria-label="Diminuir árvore">
            <Minus size={15} />
          </button>
          <output aria-label="Zoom da árvore">{Math.round(camera.zoom * 100)}%</output>
          <button onClick={() => zoom(1.25)} aria-label="Ampliar árvore">
            <Plus size={15} />
          </button>
          <button
            onClick={() => {
              track('editor.operation', { action: 'tree.fit' });
              setFitRequested((value) => value + 1);
            }}
          >
            <Maximize2 size={15} /> Ajustar
          </button>
          <button
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await container.current?.requestFullscreen();
                track('editor.operation', { action: 'tree.fullscreen' });
                setNotice('');
              } catch {
                setNotice(
                  'Tela cheia indisponível nesta janela. Use os controles de zoom e arraste para navegar.',
                );
                track('editor.operation', { action: 'tree.fullscreen' }, { outcome: 'failed' });
              }
            }}
            aria-label="Árvore em tela cheia"
            title="Tela cheia; Esc para sair"
          >
            <Expand size={15} />
          </button>
        </div>
      </div>
      {status && (
        <p className="runtime-diagnostic" role="status">
          {status}
        </p>
      )}
      <div className="runtime-options">
        {editing.onChangeRaw && (
          <>
            <button
              disabled={!editing.canUndo}
              onClick={editing.onUndo}
              aria-label="Desfazer edição na árvore"
            >
              <Undo2 size={14} />
            </button>
            <button
              disabled={!editing.canRedo}
              onClick={editing.onRedo}
              aria-label="Refazer edição na árvore"
            >
              <Redo2 size={14} />
            </button>
          </>
        )}
        {advancedTools && (
          <>
            <button
              onClick={() => {
                track('editor.operation', { action: 'tree.expandAll', count: graph.nodes.length });
                setCollapsed(new Set());
                setFitRequested((value) => value + 1);
              }}
            >
              <UnfoldVertical size={14} /> Expandir tudo
            </button>
            <button
              onClick={() => {
                track('editor.operation', { action: 'tree.overview' });
                setCollapsed(
                  new Set(
                    [...hierarchy.depth].filter(([, depth]) => depth === 1).map(([id]) => id),
                  ),
                );
                setFitRequested((value) => value + 1);
              }}
            >
              <Expand size={14} /> Visão geral
            </button>
            {!sourceTree && (
              <label>
                <input
                  type="checkbox"
                  checked={showLinks}
                  onChange={(event) => {
                    track('editor.operation', { action: 'tree.references' });
                    setShowLinks(event.target.checked);
                  }}
                />{' '}
                Vínculos de referência
              </label>
            )}
            {completeGraph.edges.some((edge) => edge.kind === 'internal') && (
              <label>
                <input
                  type="checkbox"
                  checked={showInternals}
                  onChange={(event) => {
                    setShowInternals(event.target.checked);
                    setSelected(completeGraph.rootId);
                    setMatchIndex(0);
                    setFitRequested((value) => value + 1);
                  }}
                />{' '}
                Cópias de realização
              </label>
            )}
          </>
        )}
      </div>
      <div ref={viewport} className="runtime-viewport">
        <svg
          ref={svg}
          role="group"
          tabIndex={0}
          aria-label={
            sourceTree
              ? 'Diagrama interativo das operações Pydicate'
              : 'Diagrama interativo da análise realizada'
          }
          viewBox={`${camera.x - width / 2} ${camera.y - height / 2} ${width} ${height}`}
          onPointerDown={(event) => {
            if (!(event.target as Element).closest('[role="button"]'))
              event.currentTarget.focus({ preventScroll: true });
            if (
              event.button !== 0 ||
              (event.target as Element).closest('[data-runtime-node], [role="button"]')
            )
              return;
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              cameraX: camera.x,
              cameraY: camera.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || event.pointerId !== start.pointer) return;
            setCamera((previous) => ({
              ...previous,
              x: start.cameraX - (event.clientX - start.x) / previous.zoom,
              y: start.cameraY - (event.clientY - start.y) / previous.zoom,
            }));
          }}
          onPointerUp={() => {
            if (drag.current) track('editor.operation', { action: 'tree.pan' });
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <title>
            {sourceTree
              ? 'Operações da expressão Pydicate'
              : 'Estrutura efetiva do modelo Pydicate'}
          </title>
          <desc>
            {sourceTree
              ? 'Os cartões representam referências e valores. As operações ficam nas conexões entre ramos; selecione uma conexão para editar seu escopo.'
              : 'Selecione um constituinte para inspecionar seus traços.'}{' '}
            Use os círculos para recolher ramos. Arraste o fundo para mover a árvore.
          </desc>
          {layout.edges.map((edge) => {
            const crossLink = !layout.spanning.has(edge.id);
            if (crossLink && !showLinks) return null;
            const source = layout.positions.get(edge.source)!;
            const target = layout.positions.get(edge.target)!;
            const reference = crossLink || edge.kind === 'reference' || edge.kind === 'internal';
            return (
              <g
                key={edge.id}
                className={`runtime-edge ${reference ? 'is-reference' : ''} ${sourceTree ? 'expression-connection' : ''} ${sourceTree && selected === edge.source ? 'is-selected' : ''}`}
                role={sourceTree ? 'button' : undefined}
                tabIndex={sourceTree ? 0 : undefined}
                aria-label={
                  sourceTree ? `Editar conexão ${source.node.label}: ${edge.label}` : undefined
                }
                onClick={sourceTree ? () => selectNode(edge.source) : undefined}
                onKeyDown={
                  sourceTree
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectNode(edge.source);
                        }
                      }
                    : undefined
                }
              >
                <title>
                  {edge.label} · {edge.evidence}
                </title>
                <path d={edgePath(source, target, crossLink)} />
                {sourceTree && (
                  <path
                    className="expression-connection-hit"
                    d={edgePath(source, target, crossLink)}
                  />
                )}
                {!crossLink && (
                  <text x={target.x - 12} y={target.y + NODE_HEIGHT / 2 - 9} textAnchor="end">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {[...layout.positions.values()].map((position) => {
            const { node: current, x, y, children, hiddenCount } = position;
            const isSelected = selected === current.id;
            const junction = isOperationJunction(current);
            const nodeWidth = treeNodeWidth(current);
            const evaluation = sourceTree ? treeEvaluationPreview(current) : null;
            const meaning = sourceTree ? operationMeaning(current) : null;
            const operationWidth =
              junction && evaluation
                ? Math.min(
                    nodeWidth,
                    Math.max(56, Math.min(190, [...current.label].length * 8 + 24)),
                  )
                : nodeWidth;
            return (
              <g
                key={current.id}
                transform={`translate(${x} ${y})`}
                data-runtime-node={current.id}
                data-source-node={sourceTree ? current.id : undefined}
                data-source-operation={junction ? current.label : undefined}
                className={`runtime-node ${junction ? 'runtime-junction' : ''} category-${current.category} ${isSelected ? 'is-selected' : ''} ${matchedIds.has(current.id) ? 'is-match' : ''}`}
              >
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`${meaning ? `${meaning.label} (${current.label})` : current.label}, ${current.runtimeType}${flagText(current) ? ', ' + flagText(current) : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => selectNode(current.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectNode(current.id);
                    }
                    if (event.key === 'ArrowRight' && children.length) {
                      event.preventDefault();
                      if (!collapsed.has(current.id)) {
                        focusNode(children[0], true);
                        return;
                      }
                      setCollapsed((previous) => {
                        const next = new Set(previous);
                        next.delete(current.id);
                        return next;
                      });
                    }
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      if (children.length && !collapsed.has(current.id))
                        setCollapsed((previous) => new Set(previous).add(current.id));
                      else if (hierarchy.parent.has(current.id))
                        focusNode(hierarchy.parent.get(current.id)!, true);
                    }
                    if (event.key === 'Home') {
                      event.preventDefault();
                      focusNode(graph.rootId, true);
                    }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      const peers = hierarchy.children.get(
                        hierarchy.parent.get(current.id) ?? '',
                      ) ?? [graph.rootId];
                      const index = peers.indexOf(current.id);
                      focusNode(
                        peers[
                          (index + (event.key === 'ArrowDown' ? 1 : peers.length - 1)) %
                            peers.length
                        ],
                        true,
                      );
                    }
                  }}
                >
                  <title>
                    {current.label} · {current.runtimeType}\n{current.definition}\n
                    {current.expression?.code}
                    {meaning ? `\n${meaning.label}: ${meaning.description}` : ''}
                    {flagText(current)}
                    {evaluation ? `\n${evaluation.label}: ${evaluation.text}` : ''}
                  </title>
                  {junction ? (
                    <>
                      {meaning && (
                        <text
                          className="runtime-operation-name"
                          x={nodeWidth / 2}
                          y={19}
                          textAnchor="middle"
                        >
                          {compact(meaning.label, Math.max(10, Math.floor((nodeWidth - 16) / 5)))}
                        </text>
                      )}
                      {evaluation && (
                        <path className="runtime-result-connector" d={`M 0 50 H ${nodeWidth}`} />
                      )}
                      <rect
                        className="runtime-node-body"
                        x={(nodeWidth - operationWidth) / 2}
                        width={operationWidth}
                        height={40}
                        y={30}
                        rx={20}
                      />
                      <text
                        className="runtime-operation-label"
                        x={nodeWidth / 2}
                        y={56}
                        textAnchor="middle"
                      >
                        {compact(current.label, Math.floor((nodeWidth - 20) / 8))}
                      </text>
                      {evaluation && (
                        <g
                          className={`runtime-step-result${current.expression?.isRoot ? ' is-final' : ''}`}
                          data-evaluation-state={evaluation.status}
                        >
                          <title>
                            {evaluation.label}: {evaluation.text}
                          </title>
                          <rect
                            className="runtime-result-background"
                            x={0}
                            y={77}
                            width={nodeWidth}
                            height={treeNodeHeight(current) - 81}
                            rx={7}
                          />
                          <text className="runtime-result-caption" x={10} y={89}>
                            {evaluation.label}
                          </text>
                          <text className="runtime-result-text" x={10} y={108}>
                            {evaluation.lines.map((line, index) => (
                              <tspan key={index} x={10} dy={index === 0 ? 0 : 18}>
                                {line}
                              </tspan>
                            ))}
                          </text>
                        </g>
                      )}
                      {hiddenCount > 0 && (
                        <text
                          className="runtime-junction-count"
                          x={nodeWidth / 2}
                          y={evaluation ? treeNodeHeight(current) - 6 : 90}
                          textAnchor="middle"
                        >
                          {hiddenCount} partes
                        </text>
                      )}
                    </>
                  ) : (
                    <>
                      <rect
                        className="runtime-node-body"
                        width={nodeWidth}
                        height={treeNodeHeight(current)}
                        rx={12}
                      />
                      <path
                        className="runtime-node-accent"
                        d={`M 1 18 L 1 ${treeNodeHeight(current) - 18}`}
                      />
                      <text className="runtime-node-type" x={15} y={21}>
                        {current.runtimeType.toLocaleUpperCase('pt')}
                      </text>
                      <text className="runtime-node-label" x={15} y={46}>
                        {compact(current.label, 27)}
                      </text>
                      <text className="runtime-node-definition" x={15} y={66}>
                        {compact(
                          sourceTree && current.expression?.kind !== 'reference'
                            ? (current.expression?.code ?? '')
                            : current.definition || current.tag,
                          36,
                        )}
                      </text>
                      <text
                        className={`runtime-node-flags${evaluation ? ' runtime-step-result runtime-leaf-result' : ''}`}
                        data-evaluation-state={evaluation?.status}
                        x={15}
                        y={86}
                      >
                        {evaluation
                          ? evaluation.lines.map((line, index) => (
                              <tspan key={index} x={15} dy={index ? 18 : 0}>
                                {line}
                              </tspan>
                            ))
                          : compact(
                              sourceTree
                                ? current.attributes.runtimeType
                                  ? `Motor → ${current.attributes.runtimeType}`
                                  : 'Expressão preservada'
                                : flagText(current),
                              35,
                            )}
                      </text>
                    </>
                  )}
                </g>
                {children.length > 0 && (
                  <g
                    className="runtime-collapse"
                    role="button"
                    tabIndex={0}
                    aria-label={`${collapsed.has(current.id) ? 'Expandir' : 'Recolher'} ${current.label}`}
                    aria-expanded={!collapsed.has(current.id)}
                    transform={`translate(${nodeWidth + (junction ? 17 : 0)} ${NODE_HEIGHT / 2})`}
                    onClick={() => toggle(current.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggle(current.id);
                      }
                    }}
                  >
                    <circle r={12} />
                    <path
                      className="runtime-collapse-chevron"
                      d={
                        collapsed.has(current.id) ? 'M -3 -5 L 3 0 L -3 5' : 'M -5 -3 L 0 3 L 5 -3'
                      }
                    />
                    <title>
                      {hiddenCount
                        ? `${hiddenCount} constituintes recolhidos`
                        : `${children.length} ramos`}
                    </title>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        <span className="runtime-canvas-hint">
          Clique para focar · roda para zoom · arraste para mover
        </span>
        <span className="runtime-visible-count">
          {layout.positions.size} / {graph.nodes.length} visíveis
        </span>
      </div>
      {notice && (
        <p className="runtime-diagnostic" role="status">
          {notice}
        </p>
      )}
      {graph.diagnostics.map((message, index) => (
        <p key={index} className="runtime-diagnostic" role="status">
          {message}
        </p>
      ))}
      {node && (
        <aside className="runtime-inspector" aria-label="Constituinte selecionado">
          <div className="runtime-inspector-heading">
            <div>
              <small>
                {node.runtimeType}
                {!sourceTree && ` · ${node.category}`}
              </small>
              <h3>
                {selectedMeaning ? (
                  <>
                    {selectedMeaning.label} <code>{node.label}</code>
                  </>
                ) : (
                  node.label
                )}
              </h3>
            </div>
            <button
              onClick={() => setInspectorOpen((value) => !value)}
              aria-expanded={inspectorOpen}
              aria-label={
                inspectorOpen ? 'Recolher inspetor da árvore' : 'Expandir inspetor da árvore'
              }
            >
              {inspectorOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
          {selectedMeaning && (
            <p className="runtime-operation-description">{selectedMeaning.description}</p>
          )}
          {selectedEvaluation && (
            <section
              className="runtime-evaluation"
              data-evaluation-state={selectedEvaluation.status}
              aria-label={node.expression?.isRoot ? 'Resultado final' : 'Resultado desta etapa'}
            >
              <small>{node.expression?.isRoot ? 'Resultado final' : 'Resultado desta etapa'}</small>
              <p lang={selectedEvaluation.status === 'ok' ? 'tpw' : undefined}>
                {selectedEvaluation.text || selectedEvaluation.lines.join(' ')}
              </p>
              {selectedEvaluation.status === 'unavailable' && (
                <span>Esta etapa não pôde ser avaliada isoladamente.</span>
              )}
            </section>
          )}
          {inspectorOpen && (
            <>
              {editing.onChangeRaw &&
                (sourceTree ? (
                  <TreeScopeEditor
                    node={node}
                    {...editing}
                    selectedScopeId={selectedSourceNodeId}
                    onSelectScope={(id) => {
                      emittedSelection.current = id !== selectedSourceNodeId ? id : undefined;
                      onSelectSourceNode?.(id);
                    }}
                  />
                ) : (
                  <RuntimeScopeEditor
                    node={node}
                    {...editing}
                    selectedScopeId={selectedSourceNodeId}
                    onSelectScope={(id) => {
                      emittedSelection.current = id !== selectedSourceNodeId ? id : undefined;
                      onSelectSourceNode?.(id);
                    }}
                  />
                ))}
              {(!sourceTree || node.definition) && (
                <p>{node.definition || 'Sem definição lexical neste objeto.'}</p>
              )}
              {flagText(node) && <p className="runtime-inspector-flags">{flagText(node)}</p>}
              {node.engineRoles?.length ? (
                <div className="runtime-roles">
                  {node.engineRoles.map((role, index) => (
                    <p key={index}>
                      <strong>{role.role === 'subject' ? 'Sujeito' : 'Objeto'}:</strong>{' '}
                      {role.verbete || role.inflection || '∅'}{' '}
                      {role.expressed ? '(expresso)' : '(não expresso)'}{' '}
                      <small>{role.evidence}</small>
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="runtime-relations">
                {relations.map((edge) => (
                  <button
                    key={edge.id}
                    title={`${edge.field}: ${edge.evidence}`}
                    onClick={() => focusNode(edge.source === selected ? edge.target : edge.source)}
                  >
                    <span>
                      {edge.source === selected ? '→' : '←'} {edge.label}
                    </span>
                    <strong>
                      {
                        hierarchy.nodes.get(edge.source === selected ? edge.target : edge.source)
                          ?.label
                      }
                    </strong>
                  </button>
                ))}
              </div>
              <details
                onToggle={(event) => {
                  if (event.currentTarget.open)
                    track('editor.operation', { action: 'tree.traits' });
                }}
              >
                <summary>
                  {sourceTree ? 'Código e evidência do motor' : 'Traços do predicado'} (
                  {Object.keys(node.attributes).length})
                </summary>
                <Properties values={node.attributes} />
              </details>
              {Object.keys(node.morphology).length > 0 && (
                <details
                  onToggle={(event) => {
                    if (event.currentTarget.open)
                      track('editor.operation', { action: 'tree.morphology' });
                  }}
                >
                  <summary>Morfologia no motor ({Object.keys(node.morphology).length})</summary>
                  <Properties values={node.morphology} />
                </details>
              )}
              <p className="runtime-mapping">
                {sourceTree
                  ? 'Cartões: referências e valores. Conexões: operações, com seu escopo preservado. Esquerda e direita seguem o código; os papéis linguísticos vêm do motor.'
                  : node.sourceOccurrences?.length
                    ? `${node.sourceOccurrences.length} escopo(s) rastreado(s) durante a execução. Cópias preservam a origem; nomes iguais podem ser ocorrências distintas.`
                    : node.sourceNodeId === 'root'
                      ? 'Este nó corresponde à análise completa no código.'
                      : 'Nó interno do modelo realizado. O motor copia e expande construções; não há correspondência exata comprovada com um trecho de código.'}
              </p>
            </>
          )}
        </aside>
      )}
    </section>
  );
}

const treeOperations = [
  ['negate', 'Negar −'],
  ['hidden', 'Não expressar +'],
  ['*', 'Combinar *'],
  ['+', 'Acrescentar +'],
  ['/', 'Compor /'],
  ['@', 'Compor @'],
  ['==', 'Relacionar =='],
  ['!=', 'Relacionar !='],
  ['<<', 'Subordinar <<'],
  ['>>', 'Subordinar >>'],
  ['imp', 'Imperativo'],
  ['perm', 'Permissivo'],
  ['voc', 'Vocativo'],
  ['circ', 'Circunstancial'],
  ['var', 'Variante'],
  ['redup', 'Reduplicar'],
  ['base_nominal', 'Base nominal'],
  ['card', 'Cardinal'],
  ['ord', 'Ordinal'],
  ['inflection', 'Flexão'],
  ['compose', 'Composição'],
  ['copy', 'Copiar'],
] as const;
const binaryOperations = new Set(['*', '+', '/', '@', '==', '!=', '<<', '>>']);
const argumentOperations = new Set([...binaryOperations, 'circ', 'var', 'inflection', 'compose']);

function RuntimeScopeEditor({
  node,
  authoringRoot,
  raw = '',
  revisionId,
  passageId,
  onChangeRaw,
  onSelectScope,
  selectedScopeId,
  onInspectLexeme,
}: TreeEditingProps & {
  node: RuntimeNode;
  selectedScopeId?: string;
  onSelectScope: (id: string) => void;
}) {
  const scopes = editableRuntimeScopes(node, authoringRoot, raw);
  const [scopeId, setScopeId] = useState(scopes[0]?.id ?? '');
  const scope = scopes.find((item) => item.id === scopeId) ?? scopes[0];
  const [replacement, setReplacement] = useState(scope?.code ?? '');
  const [operation, setOperation] = useState('negate');
  const [argument, setArgument] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState('');
  const [expansion, setExpansion] = useState<{ name: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lookupIdentity = useRef('');
  lookupIdentity.current = `${revisionId}:${scope?.id}:${scope?.code}`;
  useEffect(() => {
    setScopeId(scopes[0]?.id ?? '');
    setEditing(false);
    setError('');
    setExpansion(null);
  }, [node.id, revisionId]);
  useEffect(() => {
    setReplacement(scope?.code ?? '');
    setExpansion(null);
    setLookup('');
    setArgument('');
  }, [passageId, scope?.id, scope?.code]);
  useEffect(() => {
    if (selectedScopeId && scopes.some((item) => item.id === selectedScopeId))
      setScopeId(selectedScopeId);
  }, [selectedScopeId, node.id, revisionId, authoringRoot, raw]);

  if (!scope)
    return (
      <p className="runtime-edit-unmapped">
        {node.sourceOccurrences?.length || node.sourceNodeId === 'root'
          ? 'Aguardando a análise desta revisão para editar este escopo. O rascunho permanece salvo.'
          : 'Parte interna de uma construção reutilizada. Selecione a referência que a contém para criar uma cópia editável nesta ocorrência.'}
      </p>
    );
  function apply(value: string) {
    if (!scope || !onChangeRaw) return;
    try {
      onChangeRaw(replaceRuntimeScope(raw, scope, value));
      onSelectScope(scope.id);
      track('editor.operation', { action: 'tree.replace' });
      setError('');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  function applyOperation() {
    if (!scope) return;
    const base = `(${scope.code})`;
    const next =
      operation === 'negate'
        ? `-${base}`
        : operation === 'hidden'
          ? `+${base}`
          : binaryOperations.has(operation)
            ? `${base} ${operation} (${argument})`
            : `${base}.${operation}(${argumentOperations.has(operation) ? argument : ''})`;
    apply(next);
  }
  async function inspectExpansion() {
    if (!scope || !passageId) return;
    const identity = lookupIdentity.current;
    setBusy(true);
    setError('');
    try {
      const result = await invoke<{ safeOccurrenceExpansion?: string | null }>('lexicon_inspect', {
        passageId,
        name: scope.code,
      });
      if (identity !== lookupIdentity.current) return;
      if (result.safeOccurrenceExpansion)
        setExpansion({ name: scope.code, code: result.safeOccurrenceExpansion });
      else
        setError(
          'Esta definição depende do contexto ou de parâmetros. Inspecione-a no Léxico antes de substituir a referência.',
        );
    } catch (reason) {
      if (identity === lookupIdentity.current) setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const removable = scope.children.find(
    (child) => child.slot === 'receiver' || child.slot === 'operand',
  );
  return (
    <div className="runtime-scope-editor">
      <div className="runtime-scope-toolbar">
        <label>
          Editar escopo
          <select
            aria-label="Escopo editável na árvore"
            value={scope.id}
            onChange={(event) => {
              setScopeId(event.target.value);
              onSelectScope(event.target.value);
            }}
          >
            {scopes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id === 'root'
                  ? 'Análise completa'
                  : item.kind === 'reference'
                    ? `Referência ${item.code}`
                    : compact(item.code, 70)}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setEditing((value) => !value)} aria-expanded={editing}>
          <Pencil size={14} /> {editing ? 'Fechar edição' : 'Editar parte'}
        </button>
      </div>
      {editing && (
        <>
          <code className="runtime-source-preview">{scope.code}</code>
          <label>
            Substituir por
            <textarea
              aria-label="Expressão da parte na árvore"
              rows={Math.min(5, Math.max(2, replacement.split('\n').length))}
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              spellCheck={false}
            />
          </label>
          <button
            onClick={() => apply(replacement)}
            disabled={!replacement.trim() || replacement === scope.code}
          >
            Aplicar substituição
          </button>
          <div className="runtime-operation">
            <select
              aria-label="Operação na árvore"
              value={operation}
              onChange={(event) => {
                setOperation(event.target.value);
                setArgument(
                  event.target.value === 'var' ? '1' : event.target.value === 'circ' ? 'False' : '',
                );
              }}
            >
              {treeOperations
                .filter(
                  ([value]) =>
                    !node.methods ||
                    ['negate', 'hidden', ...binaryOperations].includes(value) ||
                    node.methods.includes(value),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
            {argumentOperations.has(operation) && (
              <LexicalInput
                label="Argumento da operação na árvore"
                value={argument}
                onChange={setArgument}
                passageId={passageId}
                contextKey={`${lookupIdentity.current}:${operation}`}
              />
            )}
            <button
              onClick={applyOperation}
              disabled={argumentOperations.has(operation) && !argument.trim()}
            >
              Aplicar operação
            </button>
          </div>
          {removable && (
            <button onClick={() => apply(removable.node.code)}>Retirar esta operação</button>
          )}
          <details className="runtime-lexical-insert">
            <summary>Reutilizar palavra ou trecho</summary>
            <LexicalInput
              label="Buscar léxico na árvore"
              value={lookup}
              onChange={setLookup}
              passageId={passageId}
              contextKey={lookupIdentity.current}
            />
            <button
              disabled={!lookup.trim()}
              onClick={() => {
                setReplacement(lookup);
                setArgument(lookup);
              }}
            >
              Usar estrutura escolhida
            </button>
            <small>Escolha a estrutura e aplique como substituição ou argumento.</small>
          </details>
          {scope.kind === 'reference' && (
            <div className="runtime-scope-toolbar">
              {onInspectLexeme && (
                <button onClick={() => onInspectLexeme(scope.code)}>Ver no Léxico</button>
              )}
              <button onClick={() => void inspectExpansion()} disabled={busy || !passageId}>
                {busy ? 'Conferindo…' : 'Preparar cópia desta ocorrência'}
              </button>
            </div>
          )}
          {expansion && (
            <div className="runtime-expansion">
              <p>
                Trocar <strong>{expansion.name}</strong> por sua definição nesta passagem. O motor
                confirmou a mesma estrutura; a definição compartilhada permanece no léxico.
              </p>
              <code className="runtime-source-preview">{expansion.code}</code>
              <button onClick={() => apply(expansion.code)}>
                Expandir somente esta ocorrência
              </button>
              <button onClick={() => setExpansion(null)}>Cancelar cópia</button>
            </div>
          )}
          <small className="runtime-edit-hint">
            A edição altera o rascunho e o motor valida a nova estrutura. Desfazer restaura a
            revisão anterior.
          </small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

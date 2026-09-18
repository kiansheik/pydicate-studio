import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Expand,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Search,
  Undo2,
} from 'lucide-react';
import {
  diagnosticText,
  flattenNodes,
  invoke,
  type AuthorNode,
  type EvaluationFailure,
  type ParsedExpression,
} from '../domain/authoring';
import {
  bindCanvasAddress,
  canvasPositionKey,
  createCanvasHole,
  editCanvas,
  emptyCanvas,
  isCanvasHole,
  isCanvasState,
  type CanvasAction,
  type CanvasAddress,
  type CanvasDocument,
  type CanvasEdit,
  type CanvasPoint,
  type CanvasState,
} from '../domain/canvas';
import { expressionGraph } from '../domain/expression-tree';
import {
  initialRuntimeOverview,
  isOperationJunction,
  NODE_HEIGHT,
  NODE_WIDTH,
  searchRuntimeTree,
  treeEvaluationPreview,
  treeNodeHeight,
  treeNodeWidth,
  zoomRuntimeAt,
  type RuntimeGraph,
  type TreePosition,
} from '../domain/runtime-tree';
import { operationTerm } from '../domain/operation-terms';
import {
  addTreeOperation,
  argumentTreeOperations,
  binaryTreeOperations,
  treeOperations,
} from '../domain/tree-operations';
import type { CanvasDiagnostic } from '../domain/grammar-diagnostic';
import type { RenderResult } from '../domain/types';
import { track } from '../domain/usage';
import { PredicatePalette } from './PredicatePalette';
import { PieceSearch, type PieceSearchHandle } from './PieceSearch';
import { canvasEdgePath, layoutCanvasTree } from '../domain/canvas-layout';
import { TreeScopeEditor } from './TreeScopeEditor';
import { InlineCallLabel } from './InlineCallLabel';
import '../expression-canvas.css';

export interface ExpressionCanvasProps {
  raw?: string;
  authoringRoot?: AuthorNode | null;
  evaluatedRoot?: AuthorNode | null;
  canvas?: CanvasState;
  onChangeCanvas: (change: CanvasEdit) => void;
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
  engineFingerprint?: string;
  selectedSourceNodeId?: string;
  onSelectSourceNode?: (id: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onInspectLexeme?: (name: string) => void;
  onAskAI?: (sourceNodeId: string) => void;
  onPrepareDiagnostic?: (report: CanvasDiagnostic) => void;
  failures?: EvaluationFailure[];
  status?: string;
}
interface FragmentResult {
  context: string;
  raw: string;
  root: AuthorNode | null;
  evaluatedRoot?: AuthorNode;
  failures?: EvaluationFailure[];
  error?: string;
  pending?: boolean;
}
interface Piece extends FragmentResult {
  id: string;
  x: number;
  y: number;
  graph: RuntimeGraph | null;
}
interface Positioned extends TreePosition {
  key: string;
  piece: Piece;
  address: CanvasAddress;
}
type Menu = { address: CanvasAddress; x: number; y: number };
type Palette = { target?: CanvasAddress; x: number; y: number; initialMode?: 'types' };
const clip = (value: string, size = 34) =>
  value.length > size ? value.slice(0, size - 1) + '…' : value;
const ROOT_POSITION = { x: 50, y: 80 };

function fallbackGraph(raw: string, error?: string): RuntimeGraph {
  return {
    version: 1,
    rootId: 'root',
    edges: [],
    diagnostics: [],
    nodes: [
      {
        id: 'root',
        label: error ? 'Trecho a corrigir' : 'Preparando peça…',
        runtimeType: 'Expressão',
        category: 'unsupported',
        definition: error ?? '',
        tag: '',
        attributes: { code: raw },
        morphology: {},
        expression: { kind: 'unsupported', code: raw, isRoot: true },
        evaluation: error ? { status: 'error', message: error } : undefined,
      },
    ],
  };
}

/** One source-backed forest: every loose piece is saved in the same draft and
 * every structural gesture is a single canonical source/forest transaction. */
export function ExpressionCanvas({
  raw = '',
  canvas,
  authoringRoot,
  evaluatedRoot,
  ...props
}: ExpressionCanvasProps) {
  const saved = canvas ?? emptyCanvas();
  const orientation = saved.layout ?? 'bottom-up';
  const evaluationContext = `${props.passageId}:${props.sourceId}:${props.engineFingerprint}`;
  const [fragmentResults, setFragmentResults] = useState<Record<string, FragmentResult>>({});
  const cache = useRef(new Map<string, FragmentResult>());
  const generation = useRef(0);
  const fragmentSignature = JSON.stringify(saved.fragments.map(({ id, raw: code }) => [id, code]));
  useEffect(() => {
    const ticket = ++generation.current;
    let current = true;
    const next: Record<string, FragmentResult> = {};
    const work = saved.fragments.filter((fragment) => {
      const key = `${evaluationContext}:${fragment.id}:${fragment.raw}`;
      const hit = cache.current.get(key);
      next[fragment.id] = hit ?? {
        context: evaluationContext,
        raw: fragment.raw,
        root: null,
        pending: true,
      };
      return !hit;
    });
    setFragmentResults(next);
    const timer = setTimeout(() => {
      // Bound subprocess pressure when reopening a forest with many pieces.
      let cursor = 0;
      const run = async () => {
        while (current && cursor < work.length) {
          const fragment = work[cursor++];
          const key = `${evaluationContext}:${fragment.id}:${fragment.raw}`;
          let result: FragmentResult = {
            context: evaluationContext,
            raw: fragment.raw,
            root: null,
          };
          try {
            const parsed = await invoke<ParsedExpression>('parse_expression', {
              passageId: props.passageId,
              sourceId: props.sourceId,
              raw: fragment.raw,
              revisionId: `piece:${fragment.id}:${ticket}`,
            });
            result = {
              context: evaluationContext,
              raw: fragment.raw,
              root: parsed.root,
              error: parsed.diagnostics.map(diagnosticText).join('\n') || undefined,
            };
            if (current && ticket === generation.current)
              setFragmentResults((values) => ({
                ...values,
                [fragment.id]: { ...result, pending: !!parsed.root },
              }));
            if (parsed.root) {
              const realized = await invoke<RenderResult>('evaluate_expression', {
                passageId: props.passageId,
                sourceId: props.sourceId,
                raw: fragment.raw,
                revisionId: `piece:${fragment.id}:${ticket}`,
                engineFingerprint: props.engineFingerprint,
              });
              result = { ...result, evaluatedRoot: realized.tree, failures: realized.failures };
            }
          } catch (reason) {
            result = {
              ...result,
              error: reason instanceof Error ? reason.message : String(reason),
            };
          }
          if (!current || ticket !== generation.current) return;
          cache.current.set(key, result);
          // Cache only the latest few revisions; persisted source remains authoritative.
          if (cache.current.size > 256) cache.current.delete(cache.current.keys().next().value!);
          setFragmentResults((values) => ({ ...values, [fragment.id]: result }));
        }
      };
      void Promise.all([run(), run()]);
    }, 160);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [fragmentSignature, props.passageId, props.sourceId, props.engineFingerprint]);

  const pieces = useMemo<Piece[]>(() => {
    const mainGraph = authoringRoot ? expressionGraph(authoringRoot, raw, evaluatedRoot) : null;
    const waiting = /^(Avaliando|Analisando|Aguardando)\b/u.test(props.status ?? '');
    const result: Piece[] = raw.trim()
      ? [
          {
            id: 'main',
            context: evaluationContext,
            raw,
            root: mainGraph ? authoringRoot! : null,
            evaluatedRoot: mainGraph ? (evaluatedRoot ?? undefined) : undefined,
            failures: props.failures,
            graph: mainGraph ?? fallbackGraph(raw, waiting ? undefined : props.status),
            ...ROOT_POSITION,
            error: waiting ? undefined : props.status,
            pending: waiting,
          },
        ]
      : [];
    for (const fragment of saved.fragments) {
      const evidence = fragmentResults[fragment.id];
      const current =
        evidence?.raw === fragment.raw && evidence.context === evaluationContext
          ? evidence
          : undefined;
      const graph = current?.root
        ? expressionGraph(current.root, fragment.raw, current.evaluatedRoot)
        : null;
      result.push({
        ...fragment,
        ...(current ?? { context: evaluationContext, root: null, pending: true }),
        graph: graph ?? fallbackGraph(fragment.raw, current?.error),
      });
    }
    return result;
  }, [
    raw,
    authoringRoot,
    evaluatedRoot,
    props.failures,
    props.status,
    saved.fragments,
    fragmentResults,
    evaluationContext,
  ]);
  const documentModel: CanvasDocument = {
    raw,
    canvas: saved,
    roots: Object.fromEntries(pieces.map((piece) => [piece.id, piece.root])),
  };
  const live = useRef(documentModel);
  live.current = documentModel;
  const session = `${props.passageId}:${props.revisionId}`;
  const liveSession = useRef(session);
  liveSession.current = session;
  const [selected, setSelected] = useState('main:root');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [combination, setCombination] = useState<{
    source: CanvasAddress;
    target: CanvasAddress;
    session: string;
  } | null>(null);
  const [combineOperator, setCombineOperator] = useState('*');
  const [combineOrder, setCombineOrder] = useState<'source-first' | 'target-first'>('target-first');
  const [operationArgument, setOperationArgument] = useState('1');
  const [operationPanel, setOperationPanel] = useState<CanvasAddress | null>(null);
  const [definitionPanel, setDefinitionPanel] = useState<CanvasAddress | null>(null);
  const [compositionDefinition, setCompositionDefinition] = useState('');
  const [reuseBaseDefinitions, setReuseBaseDefinitions] = useState(true);
  const [defining, setDefining] = useState(false);
  const definitionRequest = useRef(0);
  function closeDefinition() {
    definitionRequest.current++;
    setDefinitionPanel(null);
  }
  const [operation, setOperation] = useState('*');
  const [operationSide, setOperationSide] = useState<'left' | 'right'>('right');
  const [advanced, setAdvanced] = useState(false);
  const [staged, setStaged] = useState<{
    address: CanvasAddress;
    session: string;
    target?: boolean;
    mode?: 'swap';
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [camera, setCamera] = useState({ x: 500, y: 280, zoom: 1 });
  const [dimensions, setDimensions] = useState({ width: 900, height: 520 });
  const [dragPreview, setDragPreview] = useState<{
    keys: string[];
    dx: number;
    dy: number;
    target?: string;
  } | null>(null);
  const drag = useRef<{
    pointer: number;
    client: CanvasPoint;
    camera: typeof camera;
    address?: CanvasAddress;
    keys?: string[];
    session: string;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const container = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const pieceSearchElement = useRef<HTMLDivElement>(null);
  const pieceSearch = useRef<PieceSearchHandle>(null);
  const firstLayout = useRef(false);
  const firstEvidence = useRef(false);
  const knownFragments = useRef(new Set(saved.fragments.map((fragment) => fragment.id)));
  const [focusPiece, setFocusPiece] = useState<string | null>(null);
  const [focusSelection, setFocusSelection] = useState<string | null>(null);

  const layout = useMemo(() => {
    const positions = new Map<string, Positioned>();
    const edges: { id: string; source: string; target: string; label: string }[] = [];
    for (const piece of pieces) {
      if (!piece.graph) continue;
      const local = layoutCanvasTree(
        piece.graph,
        new Set(
          [...collapsed]
            .filter((key) => key.startsWith(piece.id + ':'))
            .map((key) => key.slice(piece.id.length + 1)),
        ),
        orientation,
      );
      for (const position of local.positions.values()) {
        const address = {
          fragmentId: piece.id === 'main' ? undefined : piece.id,
          nodeId: position.node.id,
        };
        const key = canvasPositionKey(address);
        const savedPoint = saved.positions[key];
        let inheritedOffset = { x: 0, y: 0 };
        if (!savedPoint) {
          let parentId = position.node.id;
          while (parentId.includes('/')) {
            parentId = parentId.slice(0, parentId.lastIndexOf('/'));
            const storedParent = saved.positions[`${piece.id}:${parentId}`];
            const defaultParent = local.positions.get(parentId);
            if (storedParent && defaultParent) {
              inheritedOffset = {
                x: storedParent.x - defaultParent.x - piece.x,
                y: storedParent.y - defaultParent.y - piece.y,
              };
              break;
            }
          }
        }
        positions.set(key, {
          ...position,
          key,
          piece,
          address,
          x: savedPoint?.x ?? position.x + piece.x + inheritedOffset.x,
          y: savedPoint?.y ?? position.y + piece.y + inheritedOffset.y,
        });
      }
      edges.push(
        ...local.edges.map((edge) => ({
          ...edge,
          id: piece.id + ':' + edge.id,
          source: piece.id + ':' + edge.source,
          target: piece.id + ':' + edge.target,
        })),
      );
    }
    const values = [...positions.values()];
    const minX = values.length ? Math.min(...values.map((p) => p.x - 30)) : 0;
    const minY = values.length ? Math.min(...values.map((p) => p.y - 45)) : 0;
    const maxX = values.length
      ? Math.max(...values.map((p) => p.x + treeNodeWidth(p.node) + 40))
      : 500;
    const maxY = values.length
      ? Math.max(...values.map((p) => p.y + treeNodeHeight(p.node) + 40))
      : 300;
    return { positions, edges, minX, minY, width: maxX - minX, height: maxY - minY };
  }, [pieces, collapsed, saved.positions, orientation]);
  const selectedPosition = layout.positions.get(selected);
  const selectedPiece =
    selectedPosition?.piece ?? pieces.find((piece) => selected.startsWith(piece.id + ':'));
  const selectedNode = selectedPosition?.node;
  const selectedRoot = selectedPiece?.root;
  const selectedScope = selectedRoot
    ? flattenNodes(selectedRoot).find((node) => selected === `${selectedPiece.id}:${node.id}`)
    : undefined;
  const selectedPreview = selectedNode ? treeEvaluationPreview(selectedNode) : null;
  const matches = useMemo(
    () =>
      new Set(
        pieces.flatMap((piece) =>
          piece.graph
            ? searchRuntimeTree(piece.graph, query).map((node) => `${piece.id}:${node.id}`)
            : [],
        ),
      ),
    [pieces, query],
  );
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(
      () =>
        track('navigation.search', {
          view: 'canvas',
          count: query.length,
          resultCount: matches.size,
        }),
      600,
    );
    return () => clearTimeout(timer);
  }, [query, matches.size]);
  useEffect(() => {
    const pieceId = selected.slice(0, selected.indexOf(':'));
    const piece = pieces.find((item) => item.id === pieceId);
    if (!piece) {
      if (pieces[0]) setSelected(`${pieces[0].id}:root`);
      return;
    }
    if (!piece.root || piece.graph?.nodes.some((node) => `${piece.id}:${node.id}` === selected))
      return;
    let parent = selected;
    while (parent.includes('/')) {
      parent = parent.slice(0, parent.lastIndexOf('/'));
      if (piece.graph?.nodes.some((node) => `${piece.id}:${node.id}` === parent)) {
        setSelected(parent);
        return;
      }
    }
    setSelected(`${piece.id}:root`);
  }, [pieces, selected]);

  function fit() {
    setCamera({
      x: layout.minX + layout.width / 2,
      y: layout.minY + layout.height / 2,
      zoom: Math.min(
        1.1,
        (dimensions.width - 70) / layout.width,
        (dimensions.height - 70) / layout.height,
      ),
    });
  }
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setDimensions({
        width: Math.max(250, entry.contentRect.width),
        height: Math.max(260, entry.contentRect.height),
      }),
    );
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Resizing a dock or entering fullscreen changes the usable viewport;
    // ordinary source/evaluation revisions retain the contributor's camera.
    if (firstLayout.current) fit();
  }, [dimensions.width, dimensions.height]);
  useEffect(() => {
    if (firstLayout.current || !pieces.some((piece) => piece.root)) return;
    firstLayout.current = true;
    const main = pieces.find((piece) => piece.id === 'main');
    if (main?.graph)
      setCollapsed(
        new Set(
          [...initialRuntimeOverview(main.graph, dimensions.width, dimensions.height)].map(
            (id) => 'main:' + id,
          ),
        ),
      );
    setFocusPiece('main');
  }, [pieces, dimensions]);
  useEffect(() => {
    if (firstEvidence.current || !evaluatedRoot) return;
    firstEvidence.current = true;
    if (!focusPiece) setFocusPiece('main');
  }, [evaluatedRoot]);
  useEffect(() => {
    const newPiece = saved.fragments.find((fragment) => !knownFragments.current.has(fragment.id));
    knownFragments.current = new Set(saved.fragments.map((fragment) => fragment.id));
    if (newPiece) {
      setSelected(`${newPiece.id}:root`);
      setFocusPiece(newPiece.id);
    }
  }, [saved.fragments]);
  useEffect(() => {
    if (!focusPiece) return;
    const point = layout.positions.get(focusPiece + ':root');
    if (!point || point.piece.pending) return;
    if (focusPiece === 'main' && saved.fragments.length === 0) fit();
    else
      setCamera({
        x: point.x + treeNodeWidth(point.node) / 2 + 80,
        y: point.y + treeNodeHeight(point.node) / 2,
        zoom: 0.85,
      });
    setFocusPiece(null);
  }, [focusPiece, layout, dimensions]);
  useEffect(() => {
    if (!focusSelection) return;
    const point = layout.positions.get(focusSelection);
    if (!point) return;
    setCamera((value) => ({
      ...value,
      x: point.x + treeNodeWidth(point.node) / 2,
      y: point.y + treeNodeHeight(point.node) / 2,
    }));
    setFocusSelection(null);
  }, [focusSelection, layout]);
  useEffect(() => {
    setMenu(null);
    setOperationPanel(null);
    closeDefinition();
    setPalette(null);
    setCombination(null);
    setStaged(null);
    setDragPreview(null);
    drag.current = null;
  }, [session]);
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!pieceSearchElement.current?.contains(target)) pieceSearch.current?.dismiss();
      const panel =
        target instanceof Element && target.closest('.canvas-floating-panel, .canvas-menu');
      if (panel && container.current?.contains(panel)) return;
      setMenu(null);
      setPalette(null);
      setOperationPanel(null);
      closeDefinition();
      setCombination(null);
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, []);
  useEffect(() => {
    const focusAddition = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.key.toLowerCase() !== 'k'
      )
        return;
      const editor = container.current;
      const visible = (element: Element) =>
        element.getClientRects().length > 0 &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]') &&
        getComputedStyle(element).visibility !== 'hidden';
      if (!editor || !visible(editor)) return;
      // Workspace panes stay mounted when hidden; only the visible tree owns
      // this shortcut, and an unrelated modal keeps its own keyboard context.
      if (
        [...document.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]')].some(
          (dialog) => !editor.contains(dialog) && visible(dialog),
        )
      )
        return;
      event.preventDefault();
      setMenu(null);
      setPalette(null);
      setOperationPanel(null);
      closeDefinition();
      setCombination(null);
      setStaged(null);
      drag.current = null;
      setDragPreview(null);
      setNotice('');
      pieceSearch.current?.focus({ selectAll: true });
    };
    document.addEventListener('keydown', focusAddition);
    return () => document.removeEventListener('keydown', focusAddition);
  }, []);
  useEffect(() => {
    const id = props.selectedSourceNodeId;
    if (!id || (selected.startsWith('main:') && selected === 'main:' + id)) return;
    const main = pieces.find((piece) => piece.id === 'main');
    if (main?.graph?.nodes.some((node) => node.id === id)) focusNode(main, id);
  }, [props.selectedSourceNodeId]);
  useEffect(() => {
    if (!menu) return;
    requestAnimationFrame(() =>
      menuElement.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(),
    );
  }, [menu]);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
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
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function bound(address: CanvasAddress): CanvasAddress {
    try {
      return bindCanvasAddress(live.current, address);
    } catch {
      const piece = pieces.find((piece) => piece.id === (address.fragmentId ?? 'main'));
      if (piece && address.nodeId === 'root') return { ...address, expectedRaw: piece.raw };
      throw new Error('Aguarde a árvore atual para editar esta parte.');
    }
  }
  function commit(action: CanvasAction, focusCanvas = true) {
    try {
      const next = editCanvas(live.current, action);
      if (
        action.type === 'argument' &&
        next.raw === live.current.raw &&
        JSON.stringify(next.canvas) === JSON.stringify(live.current.canvas ?? emptyCanvas())
      )
        return true;
      props.onChangeCanvas(next);
      setNotice('');
      setMenu(null);
      setStaged(null);
      if (focusCanvas) requestAnimationFrame(() => svg.current?.focus({ preventScroll: true }));
      track('editor.operation', { action: 'canvas.' + action.type });
      return true;
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  }
  function addPiece(expression: string, position = { x: camera.x, y: camera.y }) {
    if (liveSession.current !== session || !expression.trim()) return false;
    const current = live.current;
    if (!current.raw.trim() && !(current.canvas ?? emptyCanvas()).fragments.length) {
      props.onChangeCanvas({
        raw: expression,
        canvas: { ...(current.canvas ?? emptyCanvas()), layout: orientation },
      });
      setNotice('');
      track('editor.operation', { action: 'canvas.add' });
      requestAnimationFrame(() => svg.current?.focus({ preventScroll: true }));
      return true;
    }
    return commit({ type: 'add', raw: expression, position });
  }
  function select(position: Positioned) {
    setSelected(position.key);
    if (position.piece.id === 'main') props.onSelectSourceNode?.(position.node.id);
  }
  function focusNode(piece: Piece, id: string) {
    const key = `${piece.id}:${id}`;
    setCollapsed((values) => new Set([...values].filter((value) => !key.startsWith(value + '/'))));
    setSelected(key);
    setFocusSelection(key);
    if (piece.id === 'main') props.onSelectSourceNode?.(id);
    requestAnimationFrame(() => {
      const target = svg.current?.querySelector<SVGGElement>(
        `[data-canvas-key="${CSS.escape(key)}"] > [aria-pressed]`,
      );
      target?.focus({ preventScroll: true });
    });
  }
  function connectTo(position: Positioned) {
    if (!staged) {
      if (isCanvasHole(position.node.expression?.code ?? '')) {
        setPalette({ target: bound(position.address), x: position.x, y: position.y });
      } else {
        setStaged({ address: bound(position.address), session });
        setNotice('Selecione um encaixe para ligar, ou outra peça para trocar. Esc cancela.');
      }
      return;
    }
    if (staged.session !== liveSession.current) {
      setStaged(null);
      return;
    }
    const source = staged.target ? bound(position.address) : staged.address;
    const target = staged.target ? staged.address : bound(position.address);
    if (staged.mode === 'swap') commit({ type: 'swap', source, target });
    else connectOrCombine(source, target);
  }
  function connectOrCombine(source: CanvasAddress, target: CanvasAddress) {
    const targetNode = getScope(target).node;
    if (
      source.nodeId === 'root' &&
      target.nodeId === 'root' &&
      source.fragmentId !== target.fragmentId &&
      targetNode &&
      !isCanvasHole(targetNode)
    ) {
      setCombination({ source, target, session });
      setCombineOperator('*');
      setCombineOrder('target-first');
      setMenu(null);
      setStaged(null);
    } else commit({ type: 'connect', source, target });
  }
  async function defineComposition() {
    if (!definitionPanel || defining) return;
    const address = definitionPanel;
    const request = ++definitionRequest.current;
    const ticket = liveSession.current;
    const scope = getScope(address).node;
    if (!scope) return;
    setDefining(true);
    try {
      const result = await invoke<{ raw: string }>('composition_define', {
        passageId: props.passageId,
        sourceId: props.sourceId,
        revisionId: props.revisionId,
        engineFingerprint: props.engineFingerprint,
        raw: scope.code,
        definition: compositionDefinition,
        reuseBaseDefinitions,
      });
      if (ticket !== liveSession.current || request !== definitionRequest.current) return;
      if (commit({ type: 'replace', source: address, raw: result.raw })) {
        closeDefinition();
        setNotice(
          'Composição definida no rascunho. A revisão mostrará sua nova entrada no léxico.',
        );
      }
    } catch (error) {
      if (ticket === liveSession.current && request === definitionRequest.current)
        setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setDefining(false);
    }
  }

  function changeLayout(layout: 'horizontal' | 'bottom-up') {
    if (orientation === layout) return;
    props.onChangeCanvas({ raw, canvas: { ...saved, layout, positions: {} } });
    setFocusPiece(pieces.find((piece) => piece.id === 'main')?.id ?? pieces[0]?.id ?? 'main');
    track('editor.operation', { action: 'canvas.layout', category: layout });
  }
  function openMenu(position: Positioned, client?: CanvasPoint) {
    select(position);
    const bounds = viewport.current?.getBoundingClientRect();
    const x = client && bounds ? client.x - bounds.left : dimensions.width / 2;
    const y = client && bounds ? client.y - bounds.top : 45;
    setMenu({
      address: bound(position.address),
      x: Math.max(8, Math.min(x, dimensions.width - 248)),
      y: Math.max(8, Math.min(y, dimensions.height - 365)),
    });
  }
  function getScope(address: CanvasAddress) {
    const piece = pieces.find((item) => item.id === (address.fragmentId ?? 'main'));
    return {
      piece,
      node: flattenNodes(piece?.root ?? null).find((item) => item.id === address.nodeId),
    };
  }
  function addOperation() {
    if (!operationPanel) return;
    const { node } = getScope(operationPanel);
    if (!node) return;
    const argument = argumentTreeOperations.has(operation)
      ? operation === 'var'
        ? operationArgument || '1'
        : createCanvasHole()
      : '';
    if (
      commit({
        type: 'replace',
        source: operationPanel,
        raw: addTreeOperation(node.code, operation, argument, operationSide),
      })
    )
      setOperationPanel(null);
    closeDefinition();
  }
  function world(clientX: number, clientY: number): CanvasPoint {
    const bounds = svg.current!.getBoundingClientRect();
    return {
      x: camera.x + (clientX - bounds.left - bounds.width / 2) / camera.zoom,
      y: camera.y + (clientY - bounds.top - bounds.height / 2) / camera.zoom,
    };
  }
  function descendants(position: Positioned) {
    return [...layout.positions.values()]
      .filter(
        (point) =>
          point.piece.id === position.piece.id &&
          (point.node.id === position.node.id || point.node.id.startsWith(position.node.id + '/')),
      )
      .map((point) => point.key);
  }
  function startDrag(position: Positioned, event: React.PointerEvent<SVGGElement>) {
    if (event.button !== 0 || staged || (!position.piece.root && position.piece.id === 'main'))
      return;
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    select(position);
    setMenu(null);
    drag.current = {
      pointer: event.pointerId,
      client: { x: event.clientX, y: event.clientY },
      camera,
      address: bound(position.address),
      keys: descendants(position),
      session,
      moved: false,
    };
    svg.current?.setPointerCapture(event.pointerId);
  }
  function endDrag(event: React.PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
    if (!start.moved || start.session !== liveSession.current) {
      setDragPreview(null);
      return;
    }
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (start.address && dragPreview) {
      const target = dragPreview.target && layout.positions.get(dragPreview.target);
      if (target) connectOrCombine(start.address, bound(target.address));
      else {
        try {
          bindCanvasAddress(live.current, start.address);
          const positions = { ...saved.positions };
          const sourceKey = canvasPositionKey(start.address);
          for (const [key, point] of Object.entries(saved.positions)) {
            if (key === sourceKey || key.startsWith(sourceKey + '/'))
              positions[key] = { x: point.x + dragPreview.dx, y: point.y + dragPreview.dy };
          }
          for (const key of start.keys ?? []) {
            const point = layout.positions.get(key);
            if (point)
              positions[key] = { x: point.x + dragPreview.dx, y: point.y + dragPreview.dy };
          }
          const next = { ...saved, positions };
          if (!isCanvasState(next))
            throw new Error('Não foi possível salvar esta posição. Aproxime a peça da composição.');
          props.onChangeCanvas({ raw, canvas: next });
          track('editor.operation', { action: 'canvas.position' });
        } catch (reason) {
          setNotice(reason instanceof Error ? reason.message : String(reason));
        }
      }
    }
    setDragPreview(null);
  }
  function pointFor(position: Positioned) {
    return dragPreview?.keys.includes(position.key)
      ? { ...position, x: position.x + dragPreview.dx, y: position.y + dragPreview.dy }
      : position;
  }
  function exportSvg() {
    if (!svg.current) return;
    const original = svg.current;
    const copy = original.cloneNode(true) as SVGSVGElement;
    const originals = [original, ...original.querySelectorAll('*')];
    const copies = [copy, ...copy.querySelectorAll('*')];
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
    });
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute(
      'viewBox',
      `${layout.minX - 30} ${layout.minY - 30} ${layout.width + 60} ${layout.height + 60}`,
    );
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pydicate-composicao.svg';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const menuPosition = menu ? layout.positions.get(canvasPositionKey(menu.address)) : undefined;
  const viewWidth = dimensions.width / camera.zoom;
  const viewHeight = dimensions.height / camera.zoom;
  const menuAction = (type: 'detach' | 'duplicate' | 'remove' | 'make-main') => {
    if (!menu) return;
    commit({
      type,
      source: menu.address,
      position: menuPosition
        ? { x: menuPosition.x + 80, y: menuPosition.y + 200 }
        : { x: camera.x, y: camera.y },
    } as CanvasAction);
  };
  return (
    <section
      ref={container}
      className="runtime-tree expression-tree expression-canvas"
      aria-label="Árvore de operações Pydicate"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (menu || palette || operationPanel || combination || staged || drag.current) {
            setMenu(null);
            setPalette(null);
            setOperationPanel(null);
            closeDefinition();
            setCombination(null);
            setStaged(null);
            drag.current = null;
            setDragPreview(null);
            setNotice('');
            svg.current?.focus();
          } else if (document.fullscreenElement === container.current)
            void document.exitFullscreen();
          return;
        }
        if ((event.target as Element).closest('input,textarea,select,[contenteditable=true]'))
          return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) props.onRedo?.();
          else props.onUndo?.();
          return;
        }
        if (!selectedPosition || menu || palette || operationPanel || combination) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          commit({ type: 'remove', source: bound(selectedPosition.address) });
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          commit({
            type: 'duplicate',
            source: bound(selectedPosition.address),
            position: { x: selectedPosition.x + 60, y: selectedPosition.y + 190 },
          });
        }
        if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
          event.preventDefault();
          openMenu(selectedPosition);
        }
      }}
    >
      <div className="runtime-heading">
        <div>
          <h2>Árvore de operações Pydicate</h2>
          <p>
            Monte a leitura com peças · {saved.fragments.length}{' '}
            {saved.fragments.length === 1 ? 'peça solta' : 'peças soltas'}
          </p>
        </div>
        <button onClick={exportSvg}>SVG</button>
      </div>
      <div className="runtime-toolbar canvas-toolbar">
        <div className="canvas-piece-search" ref={pieceSearchElement}>
          <PieceSearch
            ref={pieceSearch}
            label="Adicionar peça"
            directInsert
            passageId={props.passageId}
            sourceId={props.sourceId}
            engineFingerprint={props.engineFingerprint}
            revisionId={props.revisionId}
            contextKey={session}
            onAdd={(expression) => addPiece(expression)}
          />
          <kbd className="canvas-search-shortcut" aria-hidden="true">
            {/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}
          </kbd>
        </div>
        <button
          className="canvas-manual-piece"
          onClick={() => {
            setPalette({ x: camera.x, y: camera.y, initialMode: 'types' });
          }}
        >
          Tipos de peça e código
        </button>
        <div className="runtime-tools">
          <button
            aria-label="Desfazer edição na árvore"
            disabled={!props.canUndo}
            onClick={props.onUndo}
          >
            <Undo2 size={15} />
          </button>
          <button
            aria-label="Refazer edição na árvore"
            disabled={!props.canRedo}
            onClick={props.onRedo}
          >
            <Redo2 size={15} />
          </button>
          <button
            aria-label="Diminuir árvore"
            onClick={() =>
              setCamera((value) => ({ ...value, zoom: Math.max(0.025, value.zoom / 1.25) }))
            }
          >
            <Minus size={15} />
          </button>
          <output aria-label="Zoom da árvore">{Math.round(camera.zoom * 100)}%</output>
          <button
            aria-label="Ampliar árvore"
            onClick={() =>
              setCamera((value) => ({ ...value, zoom: Math.min(2.5, value.zoom * 1.25) }))
            }
          >
            <Plus size={15} />
          </button>
          <button onClick={fit}>
            <Maximize2 size={15} />
            Ajustar
          </button>
          <button
            aria-label="Árvore em tela cheia"
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await container.current?.requestFullscreen();
              } catch {
                setNotice('Tela cheia indisponível nesta janela.');
              }
            }}
          >
            <Expand size={15} />
          </button>
        </div>
      </div>
      <div className="runtime-options canvas-view-options">
        <form
          className="runtime-search"
          onSubmit={(event) => {
            event.preventDefault();
            const keys = [...matches];
            const index = keys.indexOf(selected);
            const next = keys[(index + 1) % keys.length];
            if (!next) return;
            setSelected(next);
            setFocusSelection(next);
            setCollapsed(
              (values) => new Set([...values].filter((key) => !next.startsWith(key + '/'))),
            );
            setCamera((value) => ({ ...value, zoom: 1 }));
          }}
        >
          <Search size={15} />
          <input
            aria-label="Buscar na árvore"
            placeholder="Encontrar nesta composição…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && <small>{matches.size}</small>}
          <button disabled={!matches.size}>Ir</button>
        </form>
        <button
          aria-pressed={orientation === 'bottom-up'}
          onClick={() => changeLayout('bottom-up')}
        >
          De baixo para cima
        </button>
        <button
          aria-pressed={orientation === 'horizontal'}
          onClick={() => changeLayout('horizontal')}
        >
          Da esquerda para a direita
        </button>
        <button onClick={() => setCollapsed(new Set())}>Expandir tudo</button>
        <button
          onClick={() => {
            setCollapsed(
              new Set(
                pieces.flatMap((piece) =>
                  piece.graph
                    ? [
                        ...initialRuntimeOverview(piece.graph, dimensions.width, dimensions.height),
                      ].map((id) => `${piece.id}:${id}`)
                    : [],
                ),
              ),
            );
            setFocusPiece('main');
          }}
        >
          Visão geral
        </button>
        <span className="canvas-summary">
          Botão direito: ações · arraste peças para ligar ou trocar · arraste o fundo para navegar
        </span>
      </div>
      <div className="runtime-viewport canvas-viewport" ref={viewport}>
        <svg
          ref={svg}
          role="group"
          tabIndex={0}
          aria-label="Diagrama interativo das operações Pydicate"
          viewBox={`${camera.x - viewWidth / 2} ${camera.y - viewHeight / 2} ${viewWidth} ${viewHeight}`}
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target as Element).closest('[role=button]')) return;
            svg.current?.focus();
            setMenu(null);
            drag.current = {
              pointer: event.pointerId,
              client: { x: event.clientX, y: event.clientY },
              camera,
              session,
              moved: false,
            };
            svg.current?.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId) return;
            const dx = event.clientX - start.client.x;
            const dy = event.clientY - start.client.y;
            if (Math.abs(dx) + Math.abs(dy) < 5 && !start.moved) return;
            start.moved = true;
            if (start.address) {
              const hit = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest('[data-canvas-key]')
                ?.getAttribute('data-canvas-key');
              setDragPreview({
                keys: start.keys ?? [],
                dx: dx / camera.zoom,
                dy: dy / camera.zoom,
                target: hit && !start.keys?.includes(hit) ? hit : undefined,
              });
            } else
              setCamera((value) => ({
                ...value,
                x: start.camera.x - dx / value.zoom,
                y: start.camera.y - dy / value.zoom,
              }));
          }}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            drag.current = null;
            setDragPreview(null);
          }}
          onContextMenu={(event) => {
            if (!(event.target as Element).closest('[data-canvas-key]')) {
              event.preventDefault();
              const point = world(event.clientX, event.clientY);
              setPalette(point);
            }
          }}
        >
          <title>Composição Pydicate e peças soltas</title>
          <desc>
            Cada cartão ou ligação preserva uma etapa do código. Arraste uma peça para um encaixe
            vazio para conectar; sobre outra peça para trocar. O menu de contexto oferece as mesmas
            ações.
          </desc>
          {layout.edges.map((edge) => {
            const a = pointFor(layout.positions.get(edge.source)!);
            const b = pointFor(layout.positions.get(edge.target)!);
            return (
              <g key={edge.id} className="runtime-edge expression-connection">
                <path d={canvasEdgePath(a, b, orientation)} />
                <text
                  x={orientation === 'horizontal' ? b.x - 12 : b.x + treeNodeWidth(b.node) / 2 + 14}
                  y={orientation === 'horizontal' ? b.y + 41 : b.y - 23}
                  textAnchor={orientation === 'horizontal' ? 'end' : 'start'}
                >
                  {edge.label}
                </text>
              </g>
            );
          })}
          {[...layout.positions.values()].map((original) => {
            const point = pointFor(original);
            const node = point.node;
            const junction = isOperationJunction(node);
            const preview = treeEvaluationPreview(node);
            const nodeWidth = treeNodeWidth(node);
            const nodeHeight = treeNodeHeight(node);
            const operationWidth = Math.min(
              nodeWidth,
              Math.max(66, [...node.label].length * 8 + 24),
            );
            const hole = isCanvasHole(node.expression?.code ?? '');
            const meaning = junction
              ? operationTerm({
                  ...node.expression!,
                  label: node.label,
                  dispatch:
                    typeof node.attributes.dispatch === 'string'
                      ? node.attributes.dispatch
                      : undefined,
                  runtimeType:
                    typeof node.attributes.runtimeType === 'string'
                      ? node.attributes.runtimeType
                      : undefined,
                  operandTypes:
                    typeof node.attributes.operandTypes === 'string'
                      ? node.attributes.operandTypes.split(' · ')
                      : undefined,
                })
              : null;
            return (
              <g
                key={point.key}
                transform={`translate(${point.x} ${point.y})`}
                data-canvas-key={point.key}
                data-piece-id={point.piece.id}
                data-source-node={node.id}
                data-evaluation-state={preview?.status}
                className={`runtime-node canvas-node ${junction ? 'runtime-junction canvas-operation' : ''} ${hole ? 'canvas-hole' : ''} ${preview ? 'canvas-' + preview.status : ''} ${selected === point.key ? 'is-selected' : ''} ${matches.has(point.key) ? 'is-match' : ''} ${dragPreview?.target === point.key ? 'is-drop-target' : ''} ${dragPreview?.keys.includes(point.key) ? 'is-dragging' : ''}`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openMenu(point, { x: event.clientX, y: event.clientY });
                }}
              >
                {node.id === 'root' && (
                  <text className="canvas-piece-label" x={0} y={-15}>
                    {point.piece.id === 'main' ? 'RESULTADO PRINCIPAL' : 'PEÇA SOLTA'}
                  </text>
                )}
                <g
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === point.key}
                  onFocus={() => select(point)}
                  aria-label={`${hole ? 'Encaixe vazio' : (meaning?.label ?? node.label)}, ${point.piece.id === 'main' ? 'árvore principal' : 'peça solta'}`}
                  onPointerDown={(event) => startDrag(point, event)}
                  onClick={() => {
                    if (suppressClick.current) return;
                    if (staged) connectTo(point);
                    else select(point);
                  }}
                  onDoubleClick={() => {
                    select(point);
                    setAdvanced(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (staged) connectTo(point);
                      else select(point);
                    }
                    if (event.key === 'ArrowRight' && point.children.length) {
                      event.preventDefault();
                      if (collapsed.has(point.key))
                        setCollapsed(
                          (values) => new Set([...values].filter((key) => key !== point.key)),
                        );
                      else focusNode(point.piece, point.children[0]);
                    }
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      if (point.children.length && !collapsed.has(point.key))
                        setCollapsed((values) => new Set(values).add(point.key));
                      else if (node.id.includes('/'))
                        focusNode(point.piece, node.id.slice(0, node.id.lastIndexOf('/')));
                    }
                    if (event.key === 'Home') {
                      event.preventDefault();
                      focusNode(point.piece, 'root');
                    }
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      const parentId = node.id.slice(0, node.id.lastIndexOf('/'));
                      const siblings = layout.positions.get(`${point.piece.id}:${parentId}`)
                        ?.children ?? ['root'];
                      const index = siblings.indexOf(node.id);
                      focusNode(
                        point.piece,
                        siblings[
                          (index + (event.key === 'ArrowDown' ? 1 : siblings.length - 1)) %
                            siblings.length
                        ],
                      );
                    }
                  }}
                >
                  <title>
                    {node.expression?.code}
                    {preview ? `\n${preview.label}: ${preview.text}` : ''}
                  </title>
                  {junction ? (
                    <>
                      <text
                        className="runtime-operation-name"
                        x={nodeWidth / 2}
                        y={19}
                        textAnchor="middle"
                      >
                        {clip(
                          meaning?.label ?? node.label,
                          Math.max(12, Math.floor(nodeWidth / 5)),
                        )}
                      </text>
                      <rect
                        className="runtime-node-body"
                        x={(nodeWidth - operationWidth) / 2}
                        y={30}
                        width={operationWidth}
                        height={40}
                        rx={20}
                      />
                      {node.expression?.inlineCall ? (
                        <InlineCallLabel
                          key={`${point.key}:${session}`}
                          call={node.expression.inlineCall}
                          width={nodeWidth}
                          onBegin={() => {
                            select(point);
                            setNotice('');
                          }}
                          onReturnToCanvas={() => svg.current?.focus({ preventScroll: true })}
                          onCommit={(slot, text) => {
                            if (session !== liveSession.current) return false;
                            return commit(
                              {
                                type: 'argument',
                                source: { ...point.address, expectedRaw: point.piece.raw },
                                slot,
                                text,
                              },
                              false,
                            );
                          }}
                        />
                      ) : (
                        <text
                          className="runtime-operation-label"
                          x={nodeWidth / 2}
                          y={56}
                          textAnchor="middle"
                        >
                          {clip(node.label, 20)}
                        </text>
                      )}
                      {preview && (
                        <g
                          className={`runtime-step-result${point.piece.id === 'main' && node.id === 'root' ? ' is-final' : ''}`}
                          data-evaluation-state={preview.status}
                        >
                          <rect
                            className="runtime-result-background"
                            x={0}
                            y={77}
                            width={nodeWidth}
                            height={nodeHeight - 81}
                            rx={7}
                          />
                          <text className="runtime-result-caption" x={10} y={89}>
                            {node.id === 'root' && point.piece.id !== 'main'
                              ? 'Resultado da peça'
                              : preview.label}
                          </text>
                          <text className="runtime-result-text" x={10} y={108}>
                            {preview.lines.map((line, index) => (
                              <tspan key={index} x={10} dy={index ? 18 : 0}>
                                {line}
                              </tspan>
                            ))}
                          </text>
                        </g>
                      )}
                    </>
                  ) : (
                    <>
                      <rect
                        className="runtime-node-body"
                        width={NODE_WIDTH}
                        height={NODE_HEIGHT}
                        rx={12}
                      />
                      <path className="runtime-node-accent" d={`M 1 18 L 1 ${NODE_HEIGHT - 18}`} />
                      <text className="runtime-node-type" x={15} y={21}>
                        {hole ? 'ENCAIXE VAZIO' : node.runtimeType.toLocaleUpperCase('pt')}
                      </text>
                      <text className="runtime-node-label" x={15} y={46}>
                        {hole ? 'Adicionar uma peça' : clip(node.label, 27)}
                      </text>
                      <text className="runtime-node-definition" x={15} y={66}>
                        {clip(
                          hole
                            ? 'Arraste ou conecte uma peça aqui'
                            : node.definition || node.expression?.code || '',
                          36,
                        )}
                      </text>
                      <text
                        className="runtime-node-flags runtime-leaf-result"
                        data-evaluation-state={preview?.status}
                        x={15}
                        y={86}
                      >
                        {preview
                          ? clip(
                              preview.status === 'ok'
                                ? `→ ${preview.text || '∅'}`
                                : preview.lines.join(' '),
                              35,
                            )
                          : point.piece.pending
                            ? 'Avaliando esta peça…'
                            : 'Expressão preservada'}
                      </text>
                    </>
                  )}
                </g>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={hole ? 'Conectar no encaixe vazio' : `Conectar ${node.label}`}
                  onFocus={() => select(point)}
                  onClick={(event) => {
                    event.stopPropagation();
                    connectTo(point);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      connectTo(point);
                    }
                  }}
                >
                  <circle
                    className="canvas-port"
                    cx={orientation === 'horizontal' ? -8 : nodeWidth / 2}
                    cy={orientation === 'horizontal' ? 50 : -8}
                    r={7}
                  />
                </g>
                {point.children.length > 0 && (
                  <g
                    className="runtime-collapse"
                    role="button"
                    tabIndex={0}
                    aria-label={`${collapsed.has(point.key) ? 'Expandir' : 'Recolher'} ${node.label}`}
                    aria-expanded={!collapsed.has(point.key)}
                    transform={`translate(${nodeWidth + 17} 50)`}
                    onClick={() =>
                      setCollapsed((values) => {
                        const next = new Set(values);
                        if (next.has(point.key)) next.delete(point.key);
                        else next.add(point.key);
                        return next;
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setCollapsed((values) => {
                          const next = new Set(values);
                          if (next.has(point.key)) next.delete(point.key);
                          else next.add(point.key);
                          return next;
                        });
                      }
                    }}
                  >
                    <circle r={12} />
                    <path
                      className="runtime-collapse-chevron"
                      d={collapsed.has(point.key) ? 'M -3 -5 L 3 0 L -3 5' : 'M -5 -3 L 0 3 L 5 -3'}
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        <span className="runtime-canvas-hint canvas-hint">
          {staged
            ? staged.target
              ? 'Escolha a peça para preencher este encaixe · Esc cancela'
              : 'Escolha um encaixe ou peça de destino · Esc cancela'
            : dragPreview?.target
              ? 'Solte para conectar no encaixe ou trocar as duas partes'
              : 'Botão direito ou Shift F10: ações · roda: zoom'}
        </span>
        {menu && (
          <div
            ref={menuElement}
            role="menu"
            aria-label="Ações da peça"
            className="canvas-menu"
            style={{
              left: menu.x,
              top: menu.y,
              maxHeight: Math.max(180, dimensions.height - menu.y - 12),
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const items = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    'button:not(:disabled)',
                  ),
                ];
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                items[
                  (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
                ]?.focus();
              }
            }}
          >
            {props.onAskAI && (
              <button
                role="menuitem"
                disabled={!!menu.address.fragmentId || !menuPosition?.piece.root}
                onClick={() => {
                  props.onAskAI?.(menu.address.nodeId);
                  setMenu(null);
                }}
              >
                Perguntar à IA sobre este constituinte
              </button>
            )}
            <button
              role="menuitem"
              disabled={!menuPosition?.piece.root}
              onClick={() => {
                setOperationPanel(menu.address);
                setOperation('*');
                setOperationArgument('1');
                setOperationSide('right');
                setMenu(null);
              }}
            >
              Adicionar operação
            </button>
            <button
              role="menuitem"
              disabled={!menuPosition?.piece.root}
              onClick={() => {
                setOperationPanel(menu.address);
                setOperation('var');
                setOperationArgument('1');
                setMenu(null);
              }}
            >
              Escolher variante…
            </button>
            <button
              role="menuitem"
              disabled={!menuPosition?.piece.root}
              onClick={() => {
                const scope = getScope(menu.address).node;
                if (scope)
                  commit({
                    type: 'replace',
                    source: menu.address,
                    raw: addTreeOperation(scope.code, 'imp'),
                  });
              }}
            >
              Imperativo
            </button>
            <button
              role="menuitem"
              disabled={!menuPosition?.piece.root}
              onClick={() => {
                setDefinitionPanel(menu.address);
                setCompositionDefinition(
                  getScope(menu.address).node?.definition ??
                    (menu.address.nodeId === 'root' ? evaluatedRoot?.definition : '') ??
                    '',
                );
                setReuseBaseDefinitions(true);
                setMenu(null);
              }}
            >
              Definir significado do conjunto…
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setSelected(canvasPositionKey(menu.address));
                setAdvanced(true);
                setMenu(null);
              }}
            >
              Editar esta parte
            </button>
            <button
              role="menuitem"
              disabled={
                !menuPosition?.piece.root || isCanvasHole(menuPosition.node.expression?.code ?? '')
              }
              onClick={() => menuAction('duplicate')}
            >
              Duplicar trecho <kbd>⌘D</kbd>
            </button>
            <button
              role="menuitem"
              disabled={
                !menuPosition?.piece.root || isCanvasHole(menuPosition.node.expression?.code ?? '')
              }
              onClick={() => menuAction('detach')}
            >
              Soltar trecho
            </button>
            <button role="menuitem" onClick={() => menuAction('remove')}>
              Remover trecho <kbd>⌫</kbd>
            </button>
            <button
              role="menuitem"
              disabled={!menuPosition?.piece.root}
              onClick={() => {
                const target = isCanvasHole(menuPosition?.node.expression?.code ?? '');
                setStaged({ address: menu.address, session, target });
                setMenu(null);
                setNotice(
                  target
                    ? 'Selecione a peça que preencherá este encaixe. Esc cancela.'
                    : 'Selecione um encaixe para ligar, ou outra peça para trocar. Esc cancela.',
                );
              }}
            >
              Conectar ou trocar
            </button>
            <button
              role="menuitem"
              disabled={!menuPosition?.piece.root}
              onClick={() => {
                setStaged({ address: menu.address, session, mode: 'swap' });
                setMenu(null);
                setNotice('Selecione outra peça para trocar as posições na expressão.');
              }}
            >
              Trocar com outra peça
            </button>
            {staged && menuPosition && (
              <button role="menuitem" onClick={() => connectTo(menuPosition)}>
                Conectar aqui
              </button>
            )}
            <button
              role="menuitem"
              disabled={
                !menuPosition?.piece.root ||
                (!menu.address.fragmentId && menu.address.nodeId === 'root')
              }
              onClick={() => menuAction('make-main')}
            >
              Usar como resultado principal
            </button>
          </div>
        )}
        {palette && (
          <div
            role="dialog"
            aria-label="Adicionar peça"
            className="canvas-floating-panel canvas-predicate-panel"
          >
            <h3>{palette.target ? 'Preencher este encaixe' : 'Adicionar peça'}</h3>
            <PredicatePalette
              key={palette.initialMode ?? 'reuse'}
              initialMode={palette.initialMode}
              passageId={props.passageId}
              sourceId={props.sourceId}
              engineFingerprint={props.engineFingerprint}
              contextKey={session}
              revisionId={props.revisionId}
              onCancel={() => setPalette(null)}
              onAdd={(expression) => {
                const success = palette.target
                  ? commit({ type: 'replace', source: palette.target, raw: expression })
                  : addPiece(expression, { x: palette.x, y: palette.y });
                if (success) setPalette(null);
                return success;
              }}
            />
            <small>Peças soltas ficam salvas junto desta passagem.</small>
          </div>
        )}
        {definitionPanel && (
          <div role="dialog" aria-label="Definir composição" className="canvas-floating-panel">
            <h3>Significado desta composição</h3>
            <label>
              Definição do conjunto
              <textarea
                autoFocus
                value={compositionDefinition}
                onChange={(event) => setCompositionDefinition(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={reuseBaseDefinitions}
                onChange={(event) => setReuseBaseDefinitions(event.target.checked)}
              />
              Reutilizar definições das peças no léxico ou dicionário
            </label>
            <p>A revisão criará uma entrada para o conjunto, com o nome baseado na forma gerada.</p>
            <button
              disabled={defining || !compositionDefinition.trim()}
              onClick={() => void defineComposition()}
            >
              {defining ? 'Conferindo peças…' : 'Usar definição no rascunho'}
            </button>
            <button onClick={closeDefinition}>Cancelar</button>
          </div>
        )}
        {operationPanel && (
          <div role="dialog" aria-label="Adicionar operação" className="canvas-floating-panel">
            <h3>Adicionar operação</h3>
            <select
              aria-label="Operação na peça"
              value={operation}
              onChange={(event) => setOperation(event.target.value)}
            >
              {treeOperations.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {operation === 'var' && (
              <label>
                Número da variante
                <input
                  aria-label="Número da variante"
                  type="number"
                  step="1"
                  value={operationArgument}
                  onChange={(event) => setOperationArgument(event.target.value)}
                />
              </label>
            )}
            {binaryTreeOperations.has(operation) && (
              <label>
                Posição do novo encaixe
                <select
                  aria-label="Posição do novo encaixe"
                  value={operationSide}
                  onChange={(event) => setOperationSide(event.target.value as 'left' | 'right')}
                >
                  <option value="right">Depois da seleção</option>
                  <option value="left">Antes da seleção</option>
                </select>
              </label>
            )}
            <p>
              {argumentTreeOperations.has(operation) && operation !== 'var'
                ? 'A nova ligação terá um encaixe vazio para receber outra peça.'
                : 'A operação será aplicada à parte selecionada.'}
            </p>
            <div className="tree-scope-actions">
              <button onClick={addOperation}>Criar operação</button>
              <button onClick={() => setOperationPanel(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {combination && (
          <div
            role="dialog"
            aria-label="Combinar peças"
            className="canvas-floating-panel canvas-combination-panel"
          >
            <h3>Ligar estas duas peças</h3>
            <div className="canvas-combination-order">
              {(combineOrder === 'source-first'
                ? [combination.source, combination.target]
                : [combination.target, combination.source]
              ).map((address, index) => {
                const item = layout.positions.get(canvasPositionKey(address));
                const result = item && treeEvaluationPreview(item.node);
                return (
                  <div key={index}>
                    <small>{index === 0 ? 'Primeira peça' : 'Segunda peça'}</small>
                    <strong>
                      {result?.status === 'ok'
                        ? result.text || '∅'
                        : (getScope(address).node?.code ?? 'Peça')}
                    </strong>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() =>
                setCombineOrder((value) =>
                  value === 'source-first' ? 'target-first' : 'source-first',
                )
              }
            >
              Inverter ordem das peças
            </button>
            <label>
              Como ligar
              <select
                aria-label="Operação para combinar peças"
                value={combineOperator}
                onChange={(event) => setCombineOperator(event.target.value)}
              >
                {treeOperations
                  .filter(([value]) => binaryTreeOperations.has(value))
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <p>
              As duas peças formarão uma nova etapa. Você poderá continuar construindo a partir
              dela.
            </p>
            <div className="tree-scope-actions">
              <button
                onClick={() => {
                  if (combination.session !== liveSession.current) return;
                  if (
                    commit({
                      type: 'combine',
                      source: combination.source,
                      target: combination.target,
                      operator: combineOperator,
                      order: combineOrder,
                    })
                  ) {
                    const destination =
                      !combination.source.fragmentId || !combination.target.fragmentId
                        ? 'main'
                        : combination.target.fragmentId;
                    setSelected(`${destination}:root`);
                    setFocusPiece(destination);
                    setCombination(null);
                  }
                }}
              >
                Combinar peças
              </button>
              <button onClick={() => setCombination(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
      {notice && (
        <p className="runtime-diagnostic canvas-status" role="status">
          {notice}
        </p>
      )}
      {props.status && (
        <p className="runtime-diagnostic canvas-status" role="status">
          {props.status}
        </p>
      )}
      {selectedNode && (
        <aside className="canvas-inspector" aria-label="Constituinte selecionado">
          <div className="canvas-result-strip">
            <div>
              <strong>
                {selectedPiece?.id === 'main' && selectedNode.id === 'root'
                  ? 'Resultado principal'
                  : selectedPiece?.id !== 'main' && selectedNode.id === 'root'
                    ? 'Peça solta'
                    : selectedNode.label}
              </strong>
              <p data-evaluation-state={selectedPreview?.status}>
                {selectedPreview?.text ||
                  selectedPreview?.lines.join(' ') ||
                  selectedPiece?.error ||
                  'Aguardando a avaliação desta etapa.'}
              </p>
            </div>
            <button aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
              {advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}Detalhes e edição
            </button>
            {selectedRoot && props.onPrepareDiagnostic && (
              <button
                onClick={async () => {
                  if (document.fullscreenElement === container.current)
                    await document.exitFullscreen();
                  props.onPrepareDiagnostic?.({
                    raw: selectedPiece!.raw,
                    root: selectedPiece!.evaluatedRoot ?? selectedRoot,
                    selectedNodeId: selectedNode.id,
                    fragmentId: selectedPiece!.id === 'main' ? undefined : selectedPiece!.id,
                    revisionId: props.revisionId,
                    failures: selectedPiece!.failures,
                  });
                }}
              >
                <Copy size={15} />
                Corrigir gramática / árvore
              </button>
            )}
          </div>
          {advanced &&
            (selectedRoot && selectedScope ? (
              <TreeScopeEditor
                node={selectedNode}
                authoringRoot={selectedRoot}
                raw={selectedPiece!.raw}
                revisionId={props.revisionId}
                passageId={props.passageId}
                sourceId={props.sourceId}
                selectedScopeId={selectedScope.id}
                onSelectScope={(id) => setSelected(`${selectedPiece!.id}:${id}`)}
                onInspectLexeme={props.onInspectLexeme}
                onChangeRaw={(next) => {
                  if (selectedPiece!.id === 'main')
                    props.onChangeCanvas({
                      raw: next,
                      canvas: {
                        ...saved,
                        positions: Object.fromEntries(
                          Object.entries(saved.positions).filter(
                            ([key]) => !key.startsWith('main:'),
                          ),
                        ),
                      },
                    });
                  else
                    props.onChangeCanvas({
                      raw,
                      canvas: {
                        ...saved,
                        fragments: saved.fragments.map((fragment) =>
                          fragment.id === selectedPiece!.id ? { ...fragment, raw: next } : fragment,
                        ),
                        positions: Object.fromEntries(
                          Object.entries(saved.positions).filter(
                            ([key]) => !key.startsWith(selectedPiece!.id + ':'),
                          ),
                        ),
                      },
                    });
                }}
              />
            ) : (
              <FragmentRepair
                key={selectedPiece?.id + ':' + selectedPiece?.raw}
                raw={selectedPiece?.raw ?? ''}
                onApply={(next) =>
                  selectedPosition &&
                  commit({ type: 'replace', source: bound(selectedPosition.address), raw: next })
                }
              />
            ))}
        </aside>
      )}
    </section>
  );
}

function FragmentRepair({ raw, onApply }: { raw: string; onApply: (raw: string) => void }) {
  const [value, setValue] = useState(raw);
  return (
    <div className="tree-raw-replacement">
      <label>
        Corrigir expressão
        <textarea
          aria-label="Corrigir expressão da peça"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={3}
        />
      </label>
      <button disabled={value === raw} onClick={() => onApply(value)}>
        Aplicar correção
      </button>
    </div>
  );
}

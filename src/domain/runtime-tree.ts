import { flattenNodes, replaceNode, type AuthorNode, type NodeEvaluation } from './authoring';
import type { InlineCallArguments } from './inline-arguments';
import { clampZoom, type Camera } from './canvas-camera';
export type RuntimePrimitive = string | number | boolean | null;
export interface RuntimeSourceOccurrence {
  sourceNodeId: string;
  code: string;
  kind: string;
  start: number;
  end: number;
}
export interface RuntimeNode {
  id: string;
  label: string;
  runtimeType: string;
  category: string;
  definition: string;
  baseDefinition?: string;
  compositeDefinition?: string;
  inheritedDefinition?: string;
  tag: string;
  attributes: Record<string, RuntimePrimitive>;
  morphology: Record<string, RuntimePrimitive>;
  engineRoles?: {
    role: string;
    argumentIndex: number | null;
    verbete?: string;
    inflection?: string;
    expressed: boolean;
    evidence: string;
  }[];
  sourceNodeId?: string;
  sourceOccurrences?: RuntimeSourceOccurrence[];
  lexicalOrigins?: string[];
  methods?: string[];
  evaluation?: NodeEvaluation;
  /** The primary authoring tree describes source steps, not evaluated objects. */
  expression?: {
    kind: string;
    code: string;
    operator?: string;
    method?: string;
    isRoot?: boolean;
    inlineCall?: InlineCallArguments;
    /** The operation inside a transparent literal definition wrapper. */
    operationSourceNodeId?: string;
  };
}
export interface RuntimeEdge {
  id: string;
  source: string;
  target: string;
  field: string;
  index: number | null;
  label: string;
  kind: 'child' | 'reference' | 'internal';
  evidence: string;
}
export interface RuntimeGraph {
  version: 1;
  rootId: string;
  nodes: RuntimeNode[];
  edges: RuntimeEdge[];
  diagnostics: string[];
}

/** Runtime morphology copies are real objects, but not additional source
 * constituents. Keep them available as an explicit inspection layer. */
export function runtimeProjection(graph: RuntimeGraph, includeInternals = false): RuntimeGraph {
  if (includeInternals) return graph;
  const edges = graph.edges.filter((edge) => edge.kind !== 'internal');
  const reachable = new Set([graph.rootId]);
  const queue = [graph.rootId];
  const outgoing = new Map<string, RuntimeEdge[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  for (const id of queue) {
    for (const edge of outgoing.get(id) ?? []) {
      if (reachable.has(edge.target)) continue;
      reachable.add(edge.target);
      queue.push(edge.target);
    }
  }
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => reachable.has(node.id)),
    edges: edges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target)),
  };
}

export function editableRuntimeScopes(
  node: RuntimeNode,
  root: AuthorNode | null | undefined,
  raw: string,
): AuthorNode[] {
  const authored = new Map(flattenNodes(root ?? null).map((scope) => [scope.id, scope]));
  const occurrences =
    node.sourceOccurrences ??
    (node.sourceNodeId === 'root' && root
      ? [{ sourceNodeId: 'root', code: root.code, start: root.start, end: root.end }]
      : []);
  return occurrences.flatMap((occurrence) => {
    const scope = authored.get(occurrence.sourceNodeId);
    return scope &&
      scope.start === occurrence.start &&
      scope.end === occurrence.end &&
      scope.code === occurrence.code &&
      raw.slice(scope.start, scope.end) === scope.code
      ? [scope]
      : [];
  });
}

export function replaceRuntimeScope(raw: string, scope: AuthorNode, replacement: string): string {
  if (raw.slice(scope.start, scope.end) !== scope.code)
    throw new Error('A análise mudou. Aguarde a árvore atual antes de editar.');
  return replaceNode(raw, scope, replacement);
}

export type TreeCamera = Camera;
export function zoomRuntimeAt(
  camera: TreeCamera,
  factor: number,
  offsetX: number,
  offsetY: number,
): TreeCamera {
  const zoom = clampZoom(camera.zoom * factor);
  return {
    zoom,
    x: camera.x + offsetX / camera.zoom - offsetX / zoom,
    y: camera.y + offsetY / camera.zoom - offsetY / zoom,
  };
}
export const NODE_WIDTH = 242;
export const NODE_HEIGHT = 100;
const operationKinds = new Set(['binary', 'comparison', 'unary', 'method', 'call']);

/** Source operations label connections; lexical references retain full cards. */
export function isOperationJunction(node: RuntimeNode): boolean {
  return !!node.expression && operationKinds.has(node.expression.kind);
}

function operationLabelWidth(node: RuntimeNode): number {
  if (!isOperationJunction(node)) return NODE_WIDTH;
  return node.expression?.kind === 'method' || node.expression?.kind === 'call'
    ? Math.min(
        node.expression.inlineCall ? 360 : 190,
        Math.max(56, [...node.label].length * 8 + 24),
      )
    : 56;
}

const graphemeSegmenter = new Intl.Segmenter('pt', { granularity: 'grapheme' });
const graphemes = (text: string) =>
  [...graphemeSegmenter.segment(text)].map((part) => part.segment);
const previewUnits = (part: string) =>
  /[\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
    part,
  )
    ? 2
    : 1;
const previewLength = (parts: string[]) => parts.reduce((sum, part) => sum + previewUnits(part), 0);

function evaluationDisplay(node: RuntimeNode): string | undefined {
  const result = node.evaluation;
  if (!result) return undefined;
  if (result.status === 'unavailable') return 'Não foi possível avaliar';
  if (result.status === 'missing') return 'Encaixe vazio';
  if (result.status === 'error') return result.message;
  if (result.status === 'blocked') return 'Aguardando partes anteriores';
  if (result.status === 'ok') return result.surface === '' ? '∅ · forma vazia' : result.surface;
  if (result.status === 'value') return result.value === '' ? '∅ · valor vazio' : result.value;
  return result.message;
}

/** Reserve real space for the result, without turning its source operation
 * into a lexical card. Grapheme units never split Tupi accents or emoji. */
export function treeNodeWidth(node: RuntimeNode): number {
  const base = operationLabelWidth(node);
  const display = evaluationDisplay(node);
  if (!isOperationJunction(node) || display === undefined) return base;
  const maximum = node.expression?.isRoot ? 300 : 230;
  const minimum = node.expression?.isRoot ? 148 : 120;
  return Math.max(
    base,
    Math.min(maximum, Math.max(minimum, previewLength(graphemes(display)) * 8 + 24)),
  );
}

export interface TreeEvaluationPreview {
  status: NodeEvaluation['status'];
  /** Exact unabridged engine form, scalar, or failure message. */
  text: string;
  label: string;
  lines: string[];
  truncated: boolean;
}

/** Wrap the complete display form, preferring word boundaries and preserving
 * grapheme clusters in long words. Exact engine whitespace remains in text. */
export function treeEvaluationPreview(node: RuntimeNode): TreeEvaluationPreview | null {
  const result = node.evaluation;
  const display = evaluationDisplay(node);
  if (!result || display === undefined) return null;
  const text =
    result.status === 'ok'
      ? result.surface
      : result.status === 'value'
        ? result.value
        : result.message;
  const label =
    result.status === 'missing'
      ? 'Falta uma peça'
      : result.status === 'error'
        ? 'Erro nesta etapa'
        : result.status === 'blocked'
          ? 'Aguardando partes anteriores'
          : result.status === 'unavailable'
            ? 'Avaliação indisponível'
            : result.status === 'value'
              ? 'Valor'
              : node.expression?.isRoot
                ? 'Resultado final'
                : 'Resultado';
  const columns = Math.max(1, Math.floor((treeNodeWidth(node) - 24) / 8));
  const parts = graphemes(display.replace(/\s+/gu, ' ').trim());
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < parts.length) {
    let end = cursor;
    let used = 0;
    while (end < parts.length) {
      const units = previewUnits(parts[end]);
      if (end > cursor && used + units > columns) break;
      used += units;
      end++;
    }
    if (end < parts.length) {
      const space = parts.slice(cursor, end + 1).lastIndexOf(' ');
      if (space > 0) end = cursor + space;
    }
    lines.push(parts.slice(cursor, end).join('').trimEnd());
    cursor = end;
    while (parts[cursor] === ' ') cursor++;
  }
  return { status: result.status, text, label, lines, truncated: false };
}

export function treeNodeHeight(node: RuntimeNode): number {
  const preview = treeEvaluationPreview(node);
  if (!preview) return NODE_HEIGHT;
  const base = isOperationJunction(node) ? 130 : NODE_HEIGHT;
  return base + Math.max(0, preview.lines.length - 1) * 18;
}

const COLUMN_GAP = 130;
const ROW_GAP = 30;
export interface TreePosition {
  node: RuntimeNode;
  x: number;
  y: number;
  depth: number;
  children: string[];
  hiddenCount: number;
}

/** Select a spanning tree by actual graph identity, retaining extra links. */
export function runtimeHierarchy(graph: RuntimeGraph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, RuntimeEdge[]>();
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  const spanning = new Set<string>();
  const depth = new Map<string, number>([[graph.rootId, 0]]);
  const queue = [graph.rootId];
  const visited = new Set(queue);
  for (const id of queue) {
    for (const edge of outgoing.get(id) ?? []) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      queue.push(edge.target);
      parent.set(edge.target, id);
      depth.set(edge.target, (depth.get(id) ?? 0) + 1);
      children.set(id, [...(children.get(id) ?? []), edge.target]);
      spanning.add(edge.id);
    }
  }
  return { nodes, outgoing, parent, children, spanning, depth };
}

export function layoutRuntimeTree(graph: RuntimeGraph, collapsed: ReadonlySet<string>) {
  const hierarchy = runtimeHierarchy(graph);
  const positions = new Map<string, TreePosition>();
  const visibleIds = [graph.rootId];
  for (const id of visibleIds) {
    if (!collapsed.has(id)) visibleIds.push(...(hierarchy.children.get(id) ?? []));
  }
  const rowHeight = Math.max(
    NODE_HEIGHT,
    ...visibleIds.map((id) => {
      const node = hierarchy.nodes.get(id);
      return node ? treeNodeHeight(node) : NODE_HEIGHT;
    }),
  );
  let row = 0;
  const descendants = (id: string): number =>
    (hierarchy.children.get(id) ?? []).reduce((sum, child) => sum + 1 + descendants(child), 0);
  function place(id: string, depth: number, x: number): number {
    const node = hierarchy.nodes.get(id);
    if (!node) return 0;
    const children = hierarchy.children.get(id) ?? [];
    const visible = collapsed.has(id) ? [] : children;
    const childX = x + treeNodeWidth(node) + COLUMN_GAP;
    const childYs = visible.map((child) => place(child, depth + 1, childX));
    const y = childYs.length
      ? (childYs[0] + childYs[childYs.length - 1]) / 2
      : row++ * (rowHeight + ROW_GAP);
    positions.set(id, {
      node,
      x,
      y,
      depth,
      children,
      hiddenCount: collapsed.has(id) ? descendants(id) : 0,
    });
    return y;
  }
  place(graph.rootId, 0, 0);
  const edges = graph.edges.filter(
    (edge) => positions.has(edge.source) && positions.has(edge.target),
  );
  const width = positions.size
    ? Math.max(...[...positions.values()].map((p) => p.x + treeNodeWidth(p.node)))
    : NODE_WIDTH;
  const height = Math.max(
    NODE_HEIGHT,
    ...[...positions.values()].map((p) => p.y + treeNodeHeight(p.node)),
  );
  return { ...hierarchy, positions, edges, width, height };
}

/** Choose the deepest readable initial overview for the measured viewport.
 * Call only at initialization; contributor expansion is never overwritten.
 */
export function initialRuntimeOverview(graph: RuntimeGraph, width: number, height: number) {
  const full = layoutRuntimeTree(graph, new Set());
  const fits = (layout: { width: number; height: number }) =>
    Math.min((width - 72) / (layout.width + 24), (height - 100) / (layout.height + 24)) >= 0.65;
  if (fits(full)) return new Set<string>();
  const atDepth = (depth: number) =>
    new Set([...full.depth].filter(([, value]) => value === depth).map(([id]) => id));
  let lower = 1;
  let upper = Math.max(0, ...full.depth.values());
  // A dense first level may need a smaller initial scale. Hiding every
  // relationship would turn the initial diagram into a single opaque card.
  let result = atDepth(1);
  // Depth increases both dimensions monotonically; avoid walking a long chain
  // repeatedly when the viewport can only show its first few constituents.
  while (lower <= upper) {
    const depth = Math.floor((lower + upper) / 2);
    const collapsed = atDepth(depth);
    if (fits(layoutRuntimeTree(graph, collapsed))) {
      result = collapsed;
      lower = depth + 1;
    } else upper = depth - 1;
  }
  return result;
}

export function searchRuntimeTree(graph: RuntimeGraph, query: string): RuntimeNode[] {
  const fold = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt');
  const term = fold(query.trim());
  if (!term) return [];
  if (term.startsWith('"') && term.endsWith('"') && term.length > 2) {
    const exact = term.slice(1, -1);
    return graph.nodes.filter((node) =>
      [node.label, ...(node.lexicalOrigins ?? [])].some((name) => fold(name) === exact),
    );
  }
  return graph.nodes.filter((node) => {
    // Source search identifies the step itself. Searching full subtree source
    // or inherited runtime evidence would report each containing operation as
    // another occurrence of the same lexical variable.
    const values = node.expression
      ? [
          node.label,
          node.runtimeType,
          node.category,
          node.expression.kind === 'reference' ? node.definition : '',
          ...(node.lexicalOrigins ?? []),
        ]
      : [
          node.label,
          node.runtimeType,
          node.category,
          node.definition,
          node.tag,
          ...(node.lexicalOrigins ?? []),
          ...Object.entries(node.attributes).map(([key, value]) => `${key} ${value}`),
          ...Object.entries(node.morphology).map(([key, value]) => `${key} ${value}`),
        ];
    return fold(values.join(' ')).includes(term);
  });
}

export function edgePath(source: TreePosition, target: TreePosition, crossLink: boolean): string {
  const x1 = source.x + treeNodeWidth(source.node);
  const y1 = source.y + NODE_HEIGHT / 2;
  const x2 = target.x;
  const y2 = target.y + NODE_HEIGHT / 2;
  if (crossLink) {
    const lift = Math.min(source.y, target.y) - 24;
    return `M ${x1 - 20} ${source.y} C ${x1 + 35} ${lift - 50}, ${x2 - 35} ${lift - 50}, ${x2 + 20} ${target.y}`;
  }
  return `M ${x1} ${y1} C ${x1 + COLUMN_GAP / 2} ${y1}, ${x2 - COLUMN_GAP / 2} ${y2}, ${x2} ${y2}`;
}

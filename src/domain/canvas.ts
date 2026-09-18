import { flattenNodes, type AuthorNode } from './authoring';
import { expressionGraph } from './expression-tree';
import { editInlineArgument } from './inline-arguments';

export interface CanvasPoint {
  x: number;
  y: number;
}
export interface CanvasFragment extends CanvasPoint {
  id: string;
  raw: string;
}
export interface CanvasState {
  layout?: 'bottom-up' | 'horizontal';
  fragments: CanvasFragment[];
  /** Absolute node positions, keyed by main:nodeId or fragmentId:nodeId. */
  positions: Record<string, CanvasPoint>;
}
export interface CanvasAddress {
  fragmentId?: string;
  nodeId: string;
  /** Bind at pointer-down; a later source edit must invalidate the gesture. */
  expectedRaw?: string;
}
export interface CanvasDocument {
  raw: string;
  canvas?: CanvasState;
  roots: Record<string, AuthorNode | null | undefined>;
}
export interface CanvasEdit {
  raw: string;
  canvas: CanvasState;
}
export type CanvasAction =
  | {
      type: 'detach' | 'duplicate';
      source: CanvasAddress;
      fragmentId?: string;
      position?: CanvasPoint;
    }
  | { type: 'remove'; source: CanvasAddress }
  | { type: 'connect' | 'swap'; source: CanvasAddress; target: CanvasAddress }
  | {
      type: 'combine';
      source: CanvasAddress;
      target: CanvasAddress;
      operator: string;
      order?: 'source-first' | 'target-first';
    }
  | { type: 'add'; raw: string; fragmentId?: string; position?: CanvasPoint }
  | { type: 'position'; address: CanvasAddress; position: CanvasPoint }
  | { type: 'replace'; source: CanvasAddress; raw: string }
  | { type: 'argument'; source: CanvasAddress; slot: string | null; text: string }
  | { type: 'make-main'; source: CanvasAddress; position?: CanvasPoint };

export const CANVAS_LIMITS = Object.freeze({
  fragments: 128,
  raw: 100_000,
  totalRaw: 1_000_000,
  positions: 4096,
  coordinate: 1_000_000,
});
const forbidden = new Set(['main', '__proto__', 'prototype', 'constructor']);
const fragmentIdentifier = /^[A-Za-z0-9_-]{1,128}$/;
const holeIdentifier = /^__studio_slot_[a-fA-F0-9]+$/;

function object(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function point(value: unknown): value is CanvasPoint {
  return (
    object(value) &&
    keys(value, ['x', 'y']) &&
    ['x', 'y'].every(
      (axis) =>
        typeof value[axis] === 'number' &&
        Number.isFinite(value[axis]) &&
        Math.abs(value[axis]) <= CANVAS_LIMITS.coordinate,
    )
  );
}
function validFragmentId(value: unknown): value is string {
  return typeof value === 'string' && fragmentIdentifier.test(value) && !forbidden.has(value);
}
export function isCanvasState(value: unknown): value is CanvasState {
  if (
    !object(value) ||
    !keys(value, ['fragments', 'positions', 'layout']) ||
    (value.layout !== undefined && value.layout !== 'bottom-up' && value.layout !== 'horizontal') ||
    !Array.isArray(value.fragments) ||
    value.fragments.length > CANVAS_LIMITS.fragments ||
    !object(value.positions)
  )
    return false;
  const ids = new Set<string>();
  let total = 0;
  for (const fragment of value.fragments) {
    if (
      !object(fragment) ||
      !keys(fragment, ['id', 'raw', 'x', 'y']) ||
      !validFragmentId(fragment.id) ||
      ids.has(fragment.id) ||
      typeof fragment.raw !== 'string' ||
      fragment.raw.length > CANVAS_LIMITS.raw ||
      !point({ x: fragment.x, y: fragment.y })
    )
      return false;
    ids.add(fragment.id);
    total += fragment.raw.length;
  }
  if (
    total > CANVAS_LIMITS.totalRaw ||
    Object.keys(value.positions).length > CANVAS_LIMITS.positions
  )
    return false;
  return Object.entries(value.positions).every(([key, location]) => {
    const separator = key.indexOf(':');
    const container = key.slice(0, separator);
    const node = key.slice(separator + 1);
    return (
      separator > 0 &&
      key.length <= 4096 &&
      (container === 'main' || ids.has(container)) &&
      (node === 'root' || node.startsWith('root/')) &&
      !/[\s\u0000-\u001f]/u.test(node) &&
      point(location)
    );
  });
}
export function emptyCanvas(): CanvasState {
  return { fragments: [], positions: {} };
}
export function canvasPositionKey(address: CanvasAddress): string {
  return `${address.fragmentId ?? 'main'}:${address.nodeId}`;
}
function randomHex() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '');
  return Date.now().toString(16) + Math.random().toString(16).slice(2);
}
export function createCanvasHole(): string {
  return '__studio_slot_' + randomHex();
}
export function isCanvasHole(value: string | AuthorNode): boolean {
  return holeIdentifier.test(typeof value === 'string' ? value : value.code);
}
export function clearCanvasPositions(canvas: CanvasState, container = 'main'): CanvasState {
  return {
    ...canvas,
    positions: Object.fromEntries(
      Object.entries(canvas.positions).filter(([key]) => !key.startsWith(container + ':')),
    ),
  };
}
interface Scope {
  container: string;
  raw: string;
  node: AuthorNode;
  root: boolean;
  start: number;
  end: number;
  code: string;
}
function resolve(document: CanvasDocument, address: CanvasAddress, allowRawRoot = false): Scope {
  const container = address.fragmentId ?? 'main';
  const raw =
    container === 'main'
      ? document.raw
      : document.canvas?.fragments.find((fragment) => fragment.id === container)?.raw;
  const root = document.roots[container];
  if (raw === undefined || (address.expectedRaw !== undefined && address.expectedRaw !== raw))
    throw new Error('A estrutura mudou. Aguarde a árvore desta revisão antes de editar.');
  if (!root || !expressionGraph(root, raw)) {
    // A bound whole source can be repaired or discarded while incomplete.
    // There is no inferred child structure available for editing.
    if (allowRawRoot && address.nodeId === 'root' && address.expectedRaw === raw) {
      const node: AuthorNode = {
        id: 'root',
        kind: 'unsupported',
        label: 'Trecho preservado',
        code: raw,
        start: 0,
        end: raw.length,
        children: [],
      };
      return { container, raw, node, root: true, start: 0, end: raw.length, code: raw };
    }
    throw new Error('A estrutura mudou. Aguarde a árvore desta revisão antes de editar.');
  }
  const node = flattenNodes(root).find((item) => item.id === address.nodeId);
  if (!node) throw new Error('Esta parte não pertence à árvore atual.');
  const isRoot = node === root;
  return {
    container,
    raw,
    node,
    root: isRoot,
    start: isRoot ? 0 : node.start,
    end: isRoot ? raw.length : node.end,
    code: isRoot ? raw : node.code,
  };
}
export function bindCanvasAddress(document: CanvasDocument, address: CanvasAddress): CanvasAddress {
  const raw = address.fragmentId
    ? document.canvas?.fragments.find((fragment) => fragment.id === address.fragmentId)?.raw
    : document.raw;
  const bound = { ...address, expectedRaw: address.expectedRaw ?? raw };
  return { ...bound, expectedRaw: resolve(document, bound, true).raw };
}
function grouped(raw: string) {
  // A trailing Python comment must not consume the closing parenthesis.
  return '(' + raw + (raw.includes('#') && !raw.endsWith('\n') ? '\n' : '') + ')';
}

/** One source-safe transaction for the primary expression and its saved forest.
 * A fragment is a draft expression, never a new lexical definition or corpus row. */
export function editCanvas(document: CanvasDocument, action: CanvasAction): CanvasEdit {
  if (
    typeof document.raw !== 'string' ||
    document.raw.length > CANVAS_LIMITS.raw ||
    (document.canvas !== undefined && !isCanvasState(document.canvas))
  )
    throw new Error('O rascunho da área de trabalho é inválido.');
  let raw = document.raw;
  let canvas: CanvasState = {
    ...(document.canvas?.layout ? { layout: document.canvas.layout } : {}),
    fragments: (document.canvas?.fragments ?? []).map((fragment) => ({ ...fragment })),
    positions: Object.fromEntries(
      Object.entries(document.canvas?.positions ?? {}).map(([key, value]) => [key, { ...value }]),
    ),
  };
  const changes = new Map<string, { start: number; end: number; text: string }[]>();
  const remember = (scope: Scope, value: string, preserveExact = false) => {
    if (value === scope.code) return;
    const text = scope.root || preserveExact ? value : grouped(value);
    if (scope.raw.slice(scope.start, scope.end) === text) return;
    changes.set(scope.container, [
      ...(changes.get(scope.container) ?? []),
      { start: scope.start, end: scope.end, text },
    ]);
  };
  const remove = (scope: Scope) => remember(scope, scope.root ? '' : createCanvasHole(), true);
  const add = (code: string, id?: string, location: CanvasPoint = { x: 0, y: 0 }) => {
    const identifier = id ?? 'fragment-' + randomHex();
    if (
      !validFragmentId(identifier) ||
      canvas.fragments.some((fragment) => fragment.id === identifier)
    )
      throw new Error('O identificador deste trecho já está em uso ou é inválido.');
    canvas.fragments.push({ id: identifier, raw: code, ...location });
    return identifier;
  };
  const ensureFilled = (scope: Scope) => {
    if (isCanvasHole(scope.node)) throw new Error('Este lugar ainda não contém uma estrutura.');
  };
  if (action.type === 'add') {
    add(action.raw, action.fragmentId, action.position);
  } else if (action.type === 'position') {
    resolve(document, action.address);
    canvas.positions[canvasPositionKey(action.address)] = { ...action.position };
  } else {
    const source = resolve(
      document,
      action.source,
      action.type === 'remove' || action.type === 'replace',
    );
    if (action.type === 'argument') {
      const next = editInlineArgument(source.raw, source.node, action.slot, action.text);
      remember(
        { ...source, root: true, start: 0, end: source.raw.length, code: source.raw },
        next,
        true,
      );
    } else if (action.type === 'replace') {
      if (action.raw !== source.code && action.raw !== source.node.code) {
        if (!action.raw.trim()) remove(source);
        else
          remember(
            {
              ...source,
              root: false,
              start: source.node.start,
              end: source.node.end,
              code: source.node.code,
            },
            action.raw,
          );
      }
    } else if (action.type === 'remove') {
      if (source.root || !isCanvasHole(source.node)) remove(source);
    } else if (action.type === 'detach' || action.type === 'duplicate') {
      ensureFilled(source);
      add(source.code, action.fragmentId, action.position);
      if (action.type === 'detach') remove(source);
    } else if (action.type === 'make-main') {
      if (source.container !== 'main' || !source.root) {
        ensureFilled(source);
        remove(source);
        // Apply the source removal before moving the remaining primary tree aside.
        const mainChanges = changes.get('main');
        const remainder = mainChanges ? applySplices(document.raw, mainChanges) : document.raw;
        if (remainder.trim()) add(remainder, undefined, action.position);
        changes.delete('main');
        raw = source.code;
        canvas = clearCanvasPositions(canvas);
      }
    } else if (action.type === 'combine') {
      const target = resolve(document, action.target);
      if (!source.root || !target.root || source.container === target.container)
        throw new Error('Escolha duas peças independentes para criar uma nova operação.');
      if (!['*', '+', '/', '@', '==', '!=', '<<', '>>'].includes(action.operator))
        throw new Error('Escolha uma operação de ligação válida.');
      ensureFilled(source);
      ensureFilled(target);
      const left = action.order === 'source-first' ? source.code : target.code;
      const right = action.order === 'source-first' ? target.code : source.code;
      const combined = `${grouped(left)} ${action.operator} ${grouped(right)}`;
      const destination = source.container === 'main' ? source : target;
      const consumed = destination === source ? target : source;
      remember(destination, combined, true);
      remove(consumed);
    } else if (action.type === 'connect' || action.type === 'swap') {
      const target = resolve(document, action.target);
      if (
        source.container === target.container &&
        source.start === target.start &&
        source.end === target.end
      )
        return { raw, canvas };
      if (
        source.container === target.container &&
        source.start < target.end &&
        target.start < source.end
      )
        throw new Error('Uma parte não pode ser ligada ou trocada com uma estrutura que a contém.');
      ensureFilled(source);
      if (action.type === 'connect' && isCanvasHole(target.node)) {
        remove(source);
        remember(target, source.code);
      } else {
        remember(source, target.code);
        remember(target, source.code);
      }
    }
  }
  for (const [container, replacements] of changes) {
    const previous =
      container === 'main'
        ? document.raw
        : document.canvas!.fragments.find((fragment) => fragment.id === container)!.raw;
    const next = applySplices(previous, replacements);
    if (next === previous) continue;
    canvas = clearCanvasPositions(canvas, container);
    if (container === 'main') raw = next;
    else if (!next.trim())
      canvas.fragments = canvas.fragments.filter((fragment) => fragment.id !== container);
    else
      canvas.fragments = canvas.fragments.map((fragment) =>
        fragment.id === container ? { ...fragment, raw: next } : fragment,
      );
  }
  if (raw.length > CANVAS_LIMITS.raw || !isCanvasState(canvas))
    throw new Error('A área de trabalho excede os limites de trechos, texto ou posições.');
  return { raw, canvas };
}
function applySplices(raw: string, replacements: { start: number; end: number; text: string }[]) {
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  let previousStart = raw.length;
  for (const replacement of ordered) {
    if (replacement.end > previousStart) throw new Error('As partes da edição se sobrepõem.');
    raw = raw.slice(0, replacement.start) + replacement.text + raw.slice(replacement.end);
    previousStart = replacement.start;
  }
  return raw;
}

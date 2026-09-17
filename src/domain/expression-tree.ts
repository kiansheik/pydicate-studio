import type { AuthorNode } from './authoring';
import type { RuntimeGraph, RuntimeNode, RuntimePrimitive } from './runtime-tree';

const kindNames: Record<string, string> = {
  binary: 'Operação',
  unary: 'Operação unária',
  comparison: 'Relação',
  reference: 'Referência',
  method: 'Método',
  call: 'Chamada',
  literal: 'Valor',
  unsupported: 'Trecho preservado',
  hole: 'Encaixe vazio',
};

function sourceLabel(node: AuthorNode) {
  if (node.kind === 'hole' || /^__studio_slot_[0-9a-f]+$/i.test(node.code)) return 'Encaixe vazio';
  if (node.operator) return node.operator;
  if (node.kind === 'method') return `.${node.method ?? node.label}()`;
  if (node.kind === 'call') return `${node.method ?? node.lexicalReference ?? node.label}()`;
  return node.code;
}

function slotLabel(slot: string) {
  if (slot === 'left') return 'esquerda';
  if (slot === 'right') return 'direita';
  if (slot === 'operand') return 'operando';
  if (slot === 'receiver') return 'base';
  if (/^arg\d+$/.test(slot)) return `argumento ${Number(slot.slice(3)) + 1}`;
  if (slot.startsWith('kw:')) return `${slot.slice(3)} =`;
  return slot;
}

function sameSource(a: AuthorNode, b: AuthorNode): boolean {
  return (
    a.id === b.id &&
    a.start === b.start &&
    a.end === b.end &&
    a.code === b.code &&
    a.kind === b.kind &&
    a.operator === b.operator &&
    a.method === b.method &&
    a.children.length === b.children.length &&
    a.children.every(
      (child, index) =>
        child.slot === b.children[index].slot && sameSource(child.node, b.children[index].node),
    )
  );
}

/** A Python expression's AST omits wrapping parentheses and outer comments.
 * Accept that trivia, but never an older root which is only a prefix of raw. */
function surroundsRoot(root: AuthorNode, raw: string) {
  const trivia = (text: string) => text.replace(/#[^\r\n]*/g, '').replace(/\s/g, '');
  const before = trivia(raw.slice(0, root.start));
  const after = trivia(raw.slice(root.end));
  return /^\(*$/.test(before) && /^\)*$/.test(after) && before.length === after.length;
}

function validSource(root: AuthorNode, raw: string) {
  const ids = new Set<string>();
  const visit = (node: AuthorNode, parent?: AuthorNode): boolean => {
    if (
      ids.has(node.id) ||
      !Number.isInteger(node.start) ||
      !Number.isInteger(node.end) ||
      node.start < (parent?.start ?? 0) ||
      node.end > (parent?.end ?? raw.length) ||
      node.end <= node.start ||
      raw.slice(node.start, node.end) !== node.code
    )
      return false;
    ids.add(node.id);
    return node.children.every((child) => visit(child.node, node));
  };
  return visit(root) && surroundsRoot(root, raw);
}

/** One visible identity for every source step, including repeated references.
 * The source and UTF-16 spans remain the authoring authority. Runtime evidence
 * is optional and is attached only when the entire evaluated AST still matches.
 * A stale source tree yields null rather than a misleading editable projection. */
export function expressionGraph(
  root: AuthorNode,
  raw: string,
  evaluatedRoot?: AuthorNode | null,
): RuntimeGraph | null {
  if (!validSource(root, raw)) return null;
  const evidence =
    evaluatedRoot && validSource(evaluatedRoot, raw) && sameSource(root, evaluatedRoot)
      ? evaluatedRoot
      : undefined;
  const graph: RuntimeGraph = {
    version: 1,
    rootId: root.id,
    nodes: [],
    edges: [],
    diagnostics: [],
  };
  const visit = (source: AuthorNode, evaluated?: AuthorNode) => {
    const attributes: Record<string, RuntimePrimitive> = { code: source.code };
    if (evaluated) {
      for (const key of ['runtimeType', 'category', 'verbete', 'tag', 'dispatch'] as const) {
        if (evaluated[key] !== undefined) attributes[key] = evaluated[key]!;
      }
      if (evaluated.operandTypes?.length)
        attributes.operandTypes = evaluated.operandTypes.join(' · ');
    }
    const node: RuntimeNode = {
      id: source.id,
      label: sourceLabel(source),
      runtimeType: kindNames[source.kind] ?? 'Trecho preservado',
      category: source.kind,
      definition: evaluated?.definition ?? '',
      tag: '',
      attributes,
      morphology: {},
      engineRoles: evaluated?.engineRoles,
      evaluation: evaluated?.evaluation,
      sourceNodeId: source.id,
      sourceOccurrences: [
        {
          sourceNodeId: source.id,
          kind: source.kind,
          code: source.code,
          start: source.start,
          end: source.end,
        },
      ],
      lexicalOrigins:
        source.kind === 'reference'
          ? [source.code]
          : source.kind === 'call' && source.lexicalReference
            ? [source.lexicalReference]
            : [],
      expression: {
        kind: source.kind,
        code: source.code,
        operator: source.operator,
        method: source.method,
        isRoot: source.id === root.id,
      },
    };
    graph.nodes.push(node);
    if (source.kind === 'unsupported')
      graph.diagnostics.push(
        `Trecho preservado sem decomposição: ${source.code}. Esta construção precisa de um adaptador.`,
      );
    source.children.forEach((child, index) => {
      graph.edges.push({
        id: `${source.id}:${child.slot}:${index}`,
        source: source.id,
        target: child.node.id,
        field: child.slot,
        index,
        label: slotLabel(child.slot),
        kind: 'child',
        evidence: `${source.kind}.${child.slot}`,
      });
      visit(child.node, evaluated?.children[index].node);
    });
  };
  visit(root, evidence);
  return graph;
}

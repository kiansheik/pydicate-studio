import type { AuthorNode } from './authoring';
import type { RuntimeGraph, RuntimeNode, RuntimePrimitive } from './runtime-tree';
import { inlineCallArguments } from './inline-arguments';

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

function definitionValue(node: AuthorNode): AuthorNode | undefined {
  if (
    node.kind !== 'call' ||
    (node.method ?? node.lexicalReference ?? node.label) !== 'studio_define' ||
    node.children.length !== 2
  )
    return;
  const values = node.children.filter((child) => ['arg0', 'kw:value'].includes(child.slot));
  const definitions = node.children.filter((child) =>
    ['arg1', 'kw:definition'].includes(child.slot),
  );
  if (
    values.length === 1 &&
    definitions.length === 1 &&
    definitions[0].node.kind === 'literal' &&
    typeof definitions[0].node.value === 'string'
  )
    return values[0].node;
}

/** Literal definition wrappers annotate their value; they are not extra morphology steps. */
export function definitionBody(node: AuthorNode): AuthorNode {
  let body = node;
  let value = definitionValue(body);
  while (value) {
    body = value;
    value = definitionValue(body);
  }
  return body;
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

/** One visible identity for every construction step, including repeated references.
 * Scalar call arguments live inline on their operation instead of child cards.
 * Literal studio_define wrappers retain their exact edit scope on the value's
 * existing visible node rather than adding a non-morphological operation level.
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
    const body = definitionBody(source);
    const evaluatedBody = evaluated ? definitionBody(evaluated) : undefined;
    const inherited = evaluated ? definitionValue(evaluated) : undefined;
    const inlineCall = inlineCallArguments(body);
    const attributes: Record<string, RuntimePrimitive> = { code: source.code };
    if (evaluated) {
      for (const key of [
        'runtimeType',
        'category',
        'verbete',
        'tag',
        'dispatch',
        'lexicalStatus',
      ] as const) {
        const value = evaluated[key] ?? evaluatedBody?.[key];
        if (value !== undefined) attributes[key] = value;
      }
      const operandTypes = evaluated.operandTypes ?? evaluatedBody?.operandTypes;
      if (operandTypes?.length) attributes.operandTypes = operandTypes.join(' · ');
    }
    const node: RuntimeNode = {
      id: source.id,
      label: inlineCall?.label ?? sourceLabel(body),
      runtimeType: kindNames[body.kind] ?? 'Trecho preservado',
      category: body.kind,
      definition: evaluated?.definition ?? '',
      baseDefinition: evaluated?.baseDefinition,
      compositeDefinition: evaluated?.compositeDefinition,
      inheritedDefinition:
        inherited?.compositeDefinition ??
        inherited?.baseDefinition ??
        (evaluated?.baseDefinition !== undefined ? inherited?.definition : undefined),
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
        body.kind === 'reference'
          ? [body.code]
          : body.kind === 'call' && body.lexicalReference
            ? [body.lexicalReference]
            : [],
      expression: {
        kind: body.kind,
        code: source.code,
        operator: body.operator,
        method: body.method,
        isRoot: source.id === root.id,
        ...(body.id !== source.id ? { operationSourceNodeId: body.id } : {}),
        ...(inlineCall ? { inlineCall } : {}),
      },
    };
    graph.nodes.push(node);
    if (body.kind === 'unsupported')
      graph.diagnostics.push(
        `Trecho preservado sem decomposição: ${source.code}. Esta construção precisa de um adaptador.`,
      );
    body.children.forEach((child, index) => {
      if (inlineCall?.arguments.some((argument) => argument.sourceNodeId === child.node.id)) return;
      graph.edges.push({
        id: `${source.id}:${child.slot}:${index}`,
        source: source.id,
        target: child.node.id,
        field: child.slot,
        index,
        label: slotLabel(child.slot),
        kind: 'child',
        evidence: `${body.kind}.${child.slot}`,
      });
      visit(child.node, evaluatedBody?.children[index].node);
    });
  };
  visit(root, evidence);
  return graph;
}

import { flattenNodes, type AuthorNode } from './authoring';
import { definitionBody } from './expression-tree';

export interface OperationRemovalChoice {
  node: AuthorNode;
  slot: string;
}

function scalar(node: AuthorNode): boolean {
  return (
    node.kind === 'literal' ||
    (node.kind === 'unary' &&
      ['+', '-'].includes(node.operator ?? '') &&
      node.children.length === 1 &&
      node.children[0].node.kind === 'literal' &&
      typeof node.children[0].node.value === 'number')
  );
}

const methodParameters: Record<string, string | null> = {
  imp: null,
  perm: null,
  voc: null,
  redup: null,
  card: null,
  ord: null,
  copy: null,
  var: 'setter',
  inflection: 'setter',
  circ: 'val',
  base_nominal: 'annotated',
  compose: 'modifier',
};

/** Only roles described by the source adapter are eligible. In particular a
 * reference-valued method setting is not evidence of a predicate branch. */
export function operationRemovalChoices(node: AuthorNode): OperationRemovalChoice[] {
  const body = definitionBody(node);
  if (
    flattenNodes(node).some(
      (part) =>
        (part.id === body.id || body.id.startsWith(part.id + '/')) &&
        (part.capabilities as { edit?: boolean } | undefined)?.edit === false,
    )
  )
    return [];
  let branches: OperationRemovalChoice[];
  if (body.kind === 'unary') {
    if (body.children.length !== 1 || body.children[0].slot !== 'operand') return [];
    branches = body.children;
  } else if (body.kind === 'binary' || body.kind === 'comparison') {
    if (
      body.children.length !== 2 ||
      !['left', 'right'].every((slot) => body.children.some((child) => child.slot === slot))
    )
      return [];
    branches = body.children;
  } else if (body.kind === 'method') {
    const method = body.method ?? '';
    if (!Object.hasOwn(methodParameters, method)) return [];
    const receiver = body.children.filter((child) => child.slot === 'receiver');
    const args = body.children.filter((child) => child.slot !== 'receiver');
    const parameter = methodParameters[method];
    if (
      receiver.length !== 1 ||
      args.length > 1 ||
      args.some((child) => !parameter || !['arg0', 'kw:' + parameter].includes(child.slot))
    )
      return [];
    if (method !== 'compose' && args.some((child) => !scalar(child.node))) return [];
    branches = method === 'compose' ? [...receiver, ...args] : receiver;
  } else return [];
  // A scalar in a structural role is not a documented predicate operation.
  // Refuse this shape rather than silently discarding a visible operand.
  if (branches.some((child) => child.node.kind === 'unsupported' || scalar(child.node))) return [];
  return branches.filter((child) => child.node.kind !== 'hole');
}

/** Keep comments in the removed syntax once, without mistaking a hash in a
 * Python string (including triple-quoted strings) for a comment. Child source
 * spans already preserve their own comments, including branches moved aside. */
export function removalSource(
  operation: AuthorNode,
  chosen: AuthorNode,
  branches: OperationRemovalChoice[],
): string {
  const raw = operation.code;
  const comments: string[] = [];
  let index = 0;
  while (index < raw.length) {
    const preserved = branches.find(
      ({ node }) => node.start <= operation.start + index && operation.start + index < node.end,
    );
    if (preserved) {
      index = preserved.node.end - operation.start;
      continue;
    }
    const char = raw[index];
    if (char === '"' || char === "'") {
      const quote = raw.startsWith(char.repeat(3), index) ? char.repeat(3) : char;
      index += quote.length;
      while (index < raw.length) {
        if (raw[index] === '\\') index += 2;
        else if (raw.startsWith(quote, index)) {
          index += quote.length;
          break;
        } else index++;
      }
    } else if (char === '#') {
      const start = index;
      while (index < raw.length && raw[index] !== '\r' && raw[index] !== '\n') index++;
      comments.push(raw.slice(start, index));
      if (raw[index] === '\r' && raw[index + 1] === '\n') index += 2;
      else if (index < raw.length) index++;
    } else index++;
  }
  return comments.length ? `\n${comments.join('\n')}\n${chosen.code}\n` : chosen.code;
}

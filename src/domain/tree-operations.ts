import type { AuthorNode } from './authoring';
import { treeOperationTerm } from './operation-terms';

export const treeOperations = [
  '*',
  '+',
  '/',
  '@',
  '==',
  '!=',
  '<<',
  '>>',
  'negate',
  'hidden',
  'imp',
  'perm',
  'voc',
  'circ',
  'var',
  'redup',
  'base_nominal',
  'card',
  'ord',
  'inflection',
  'compose',
  'copy',
].map((value) => {
  const term = treeOperationTerm(value);
  return [value, `${term.label} · ${term.syntax}`] as const;
});

export const binaryTreeOperations = new Set(['*', '+', '/', '@', '==', '!=', '<<', '>>']);
export const argumentTreeOperations = new Set([...binaryTreeOperations, 'var', 'compose']);
export const optionalArgumentTreeOperations = new Set(['circ', 'base_nominal', 'inflection']);

/** This produces source for one operation, never a realized lexical entry. */
export function addTreeOperation(
  code: string,
  operation: string,
  argument = '',
  argumentSide: 'left' | 'right' = 'right',
): string {
  if (!treeOperations.some(([value]) => value === operation))
    throw new Error('Operação Pydicate não reconhecida.');
  if (argumentTreeOperations.has(operation) && !argument.trim())
    throw new Error('Escolha o argumento da operação.');
  const base = `(${code})`;
  if (operation === 'negate') return `-${base}`;
  if (operation === 'hidden') return `+${base}`;
  if (binaryTreeOperations.has(operation))
    return argumentSide === 'left'
      ? `(${argument}) ${operation} ${base}`
      : `${base} ${operation} (${argument})`;
  const acceptsArgument =
    argumentTreeOperations.has(operation) || optionalArgumentTreeOperations.has(operation);
  if (!acceptsArgument && argument.trim()) throw new Error('Esta operação não recebe argumento.');
  return `${base}.${operation}(${acceptsArgument ? argument : ''})`;
}

export function binaryTreeChildren(scope: AuthorNode) {
  if (scope.kind !== 'binary' && scope.kind !== 'comparison') return null;
  const left = scope.children.find((child) => child.slot === 'left')?.node;
  const right = scope.children.find((child) => child.slot === 'right')?.node;
  return left && right ? { left, right } : null;
}

export function changeTreeOperator(scope: AuthorNode, operation: string, swap = false): string {
  const children = binaryTreeChildren(scope);
  if (!children || !binaryTreeOperations.has(operation))
    throw new Error('Selecione uma operação com lados esquerdo e direito.');
  // A no-op preserves comments and whitespace byte for byte.
  if (!swap && operation === scope.operator) return scope.code;
  const { left, right } = children;
  const leftStart = left.start - scope.start;
  const leftEnd = left.end - scope.start;
  const rightStart = right.start - scope.start;
  const rightEnd = right.end - scope.start;
  if (
    leftStart < 0 ||
    leftEnd > rightStart ||
    rightEnd > scope.code.length ||
    scope.code.slice(leftStart, leftEnd) !== left.code ||
    scope.code.slice(rightStart, rightEnd) !== right.code
  )
    throw new Error('A expressão mudou. Aguarde a árvore atual antes de trocar a operação.');
  const between = scope.code.slice(leftEnd, rightStart);
  const candidates: { start: number; end: number }[] = [];
  let comment = false;
  for (let index = 0; index < between.length; index++) {
    const character = between[index];
    if (character === '\n' || character === '\r') comment = false;
    if (comment) continue;
    if (character === '#') {
      comment = true;
      continue;
    }
    const token = ['==', '!=', '<<', '>>', '*', '+', '/', '@'].find((value) =>
      between.startsWith(value, index),
    );
    if (token) {
      if (token === scope.operator) candidates.push({ start: index, end: index + token.length });
      else throw new Error('Não foi possível isolar o operador desta parte.');
      index += token.length - 1;
    }
  }
  if (candidates.length !== 1) throw new Error('Não foi possível isolar o operador desta parte.');
  const token = candidates[0];
  const nextBetween = between.slice(0, token.start) + operation + between.slice(token.end);
  // Keep source comments and delimiters, while grouping both operands explicitly:
  // changing precedence or swapping differently sized subtrees must not reparent them.
  return (
    scope.code.slice(0, leftStart) +
    `(${swap ? right.code : left.code})` +
    nextBetween +
    `(${swap ? left.code : right.code})` +
    scope.code.slice(rightEnd)
  );
}

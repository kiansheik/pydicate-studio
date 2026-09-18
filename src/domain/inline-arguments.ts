import type { AuthorNode } from './authoring';

export interface InlineArgument {
  slot: string;
  sourceNodeId: string;
  start: number;
  end: number;
  code: string;
  display: string;
  editText: string;
  kind: 'number' | 'string';
}
export interface InlineCallArguments {
  name: string;
  label: string;
  arguments: InlineArgument[];
  parts: { slot: string; display: string; argument?: InlineArgument }[];
  /** Exact insertion point inside a verified, otherwise empty argument list. */
  insertion?: { start: number; end: number };
}

/** Identify comments and delimiters without interpreting Python expressions.
 * The authoritative parser already checked syntax. Quoted text is skipped so
 * a parenthesis or # inside a literal can never become an edit location. */
function tokens(code: string) {
  const result: { text: string; start: number; end: number; comment?: boolean }[] = [];
  for (let index = 0; index < code.length; ) {
    const start = index;
    const char = code[index];
    if (/\s/u.test(char)) {
      index++;
      continue;
    }
    if (char === '#') {
      while (index < code.length && !/[\r\n]/.test(code[index])) index++;
      result.push({ text: code.slice(start, index), start, end: index, comment: true });
    } else if (char === '"' || char === "'") {
      const quote = code.startsWith(char.repeat(3), index) ? char.repeat(3) : char;
      index += quote.length;
      while (index < code.length && !code.startsWith(quote, index)) {
        index += code[index] === '\\' ? 2 : 1;
      }
      index = Math.min(code.length, index + quote.length);
      result.push({ text: code.slice(start, index), start, end: index });
    } else {
      index++;
      result.push({ text: char, start, end: index });
    }
  }
  return result;
}

function scalar(node: AuthorNode): Pick<InlineArgument, 'kind' | 'display' | 'editText'> | null {
  if (node.kind === 'literal' && typeof node.value === 'string') {
    return { kind: 'string', display: JSON.stringify(node.value), editText: node.value };
  }
  const numericLiteral =
    node.kind === 'literal' &&
    (typeof node.value === 'number' ||
      (node.value === undefined && /^\d+(?:\.\d*)?$/.test(node.code)));
  const operand =
    node.kind === 'unary' &&
    (node.operator === '+' || node.operator === '-') &&
    node.children.length === 1 &&
    scalar(node.children[0].node);
  const signedNumeric = operand && operand.kind === 'number';
  if (!numericLiteral && !signedNumeric) return null;
  // AST spans already omit ordinary wrapping parentheses. Retain explicit
  // numeric spelling (including large integers) without JS number conversion.
  const display = signedNumeric
    ? node.operator + operand.display
    : tokens(node.code)
        .filter((token) => !token.comment)
        .map((token) => token.text)
        .join('');
  return { kind: 'number', display, editText: display };
}

export function inlineCallArguments(scope: AuthorNode): InlineCallArguments | null {
  if (scope.kind !== 'method' && scope.kind !== 'call') return null;
  const name =
    (scope.kind === 'method' ? '.' : '') + (scope.method ?? scope.lexicalReference ?? scope.label);
  // Python's AST groups positional and keyword arguments. Their source spans
  // preserve the actual displayed order, including a starred positional arg.
  const children = scope.children
    .filter((child) => child.slot !== 'receiver')
    .sort((a, b) => a.node.start - b.node.start);
  const args: InlineArgument[] = [];
  const parts = children.map(({ slot, node }) => {
    const value = scalar(node);
    const argument = value
      ? { slot, sourceNodeId: node.id, start: node.start, end: node.end, code: node.code, ...value }
      : undefined;
    if (argument) args.push(argument);
    return {
      slot,
      display: (slot.startsWith('kw:') ? slot.slice(3) + '=' : '') + (argument?.display ?? '…'),
      ...(argument ? { argument } : {}),
    };
  });
  const result: InlineCallArguments = {
    name,
    label: `${name}(${parts.map((part) => part.display).join(', ')})`,
    arguments: args,
    parts,
  };
  if (!children.length) {
    const syntax = tokens(scope.code).filter((token) => !token.comment);
    const close = syntax.at(-1);
    const open = syntax.at(-2);
    // An empty call ends with two consecutive significant tokens: (). This
    // also rejects **kwargs, which the limited source AST does not decompose.
    if (open?.text === '(' && close?.text === ')') {
      const start = scope.start + open.end;
      result.insertion = { start, end: start };
    } else {
      // Do not imply an empty call when some unsupported argument is present.
      result.label = `${name}(…)`;
      result.parts = [{ slot: 'preserved', display: '…' }];
    }
  }
  return result;
}

/** Textbox values are data, never source expressions. A decimal comma has the
 * same meaning as a decimal point; any other text becomes a quoted string. */
export function scalarArgumentSource(text: string): string {
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)) return JSON.stringify(text);
  const normalized = trimmed.replace(',', '.');
  const sign = /^[+-]/.test(normalized) ? normalized[0] : '';
  const [integer, fraction] = normalized.slice(sign.length).split('.');
  const whole = integer.replace(/^0+(?=\d)/, '') || '0';
  return sign + whole + (fraction === undefined ? '' : '.' + (fraction || '0'));
}

/** Edit a current scalar occurrence without grouping or rebuilding its call.
 * A no-op preserves the original literal spelling and type, even for "123".
 * The containing canvas transaction supplies revision binding and undo. */
export function editInlineArgument(
  raw: string,
  scope: AuthorNode,
  slot: string | null,
  text: string,
): string {
  if (
    !Number.isInteger(scope.start) ||
    !Number.isInteger(scope.end) ||
    scope.start < 0 ||
    scope.end > raw.length ||
    scope.end <= scope.start ||
    raw.slice(scope.start, scope.end) !== scope.code
  )
    throw new Error('A expressão mudou. Aguarde a árvore atual antes de editar o argumento.');
  const call = inlineCallArguments(scope);
  const argument = slot === null ? undefined : call?.arguments.find((item) => item.slot === slot);
  const span = slot === null ? call?.insertion : argument;
  if (
    !span ||
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < scope.start ||
    span.end > scope.end ||
    span.end < span.start ||
    (argument && raw.slice(argument.start, argument.end) !== argument.code)
  )
    throw new Error('Este argumento não é um número ou texto editável nesta chamada.');
  if ((argument && text === argument.editText) || (slot === null && text === '')) return raw;
  const comments = argument ? tokens(argument.code).filter((token) => token.comment) : [];
  const replacement =
    scalarArgumentSource(text) +
    (comments.length ? ' ' + comments.map((token) => token.text + '\n').join('') : '');
  return raw.slice(0, span.start) + replacement + raw.slice(span.end);
}

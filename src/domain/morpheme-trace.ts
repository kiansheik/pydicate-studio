import type { RuntimeGraph, RuntimeNode } from './runtime-tree';

/** UTF-16 offsets into the exact, unnormalised evaluation.surface. */
export interface MorphemeRange {
  start: number;
  end: number;
}
export interface MorphemeTraceNode {
  ranges: MorphemeRange[];
  status: 'highlighted' | 'none' | 'ambiguous' | 'unavailable';
  reason?: string;
}
export interface MorphemeTrace {
  selectedId: string;
  mode: 'constituent' | 'change';
  nodes: Record<string, MorphemeTraceNode>;
}
interface Token extends MorphemeRange {
  text: string;
  tags: string[];
}
type Segmentation = { tokens: Token[] } | { reason: string };
interface Alignment {
  targets: (number | undefined)[];
  /** Tokens with more than one best assignment, including a possible omission. */
  ambiguous: Set<number>;
  unmatchedTargets: Set<number>;
  uncertainTargets: Set<number>;
}
const MAX_TOKENS = 192;
const MAX_TEXT = 24_000;
const MAX_ANCESTORS = 256;
const unavailable = (reason: string): MorphemeTraceNode => ({
  ranges: [],
  status: 'unavailable',
  reason,
});
const absent = (reason: string, ambiguous = false): MorphemeTraceNode => ({
  ranges: [],
  status: ambiguous ? 'ambiguous' : 'none',
  reason,
});

/** Postfixed engine tags describe the preceding surface, including consecutive
 * zero-surface tags. Untagged words and their exact offsets are retained. */
function segment(node: RuntimeNode | undefined): Segmentation {
  const evaluation = node?.evaluation as
    | (RuntimeNode['evaluation'] & { annotated?: string; morphologyDiagnostic?: string })
    | undefined;
  if (!evaluation || evaluation.status !== 'ok')
    return { reason: 'Este nó ainda não tem um resultado completo do motor.' };
  if (typeof evaluation.annotated !== 'string')
    return {
      reason:
        evaluation.morphologyDiagnostic ??
        'O motor não forneceu a forma anotada necessária para acompanhar os morfemas.',
    };
  if (evaluation.surface.length > MAX_TEXT || evaluation.annotated.length > MAX_TEXT)
    return { reason: 'Esta forma ultrapassa o limite do acompanhamento experimental.' };
  if (evaluation.morphologySegments) {
    const evidence = evaluation.morphologySegments;
    if (
      evidence.length > MAX_TOKENS ||
      evidence.some(
        (token, index) =>
          !Number.isInteger(token.start) ||
          !Number.isInteger(token.end) ||
          token.start < (evidence[index - 1]?.end ?? 0) ||
          token.end <= token.start ||
          evaluation.surface.slice(token.start, token.end) !== token.text,
      )
    )
      return { reason: 'Os trechos anotados não correspondem à forma desta etapa.' };
    return { tokens: evidence };
  }
  const tokens: Token[] = [];
  let stripped = '';
  let cursor = 0;
  const append = (text: string) => {
    const offset = stripped.length;
    for (const match of text.matchAll(/\S+/gu)) {
      const start = offset + match.index;
      tokens.push({ text: match[0], start, end: start + match[0].length, tags: [] });
    }
    stripped += text;
  };
  for (const match of evaluation.annotated.matchAll(/\[([^\[\]\r\n]+)\]/g)) {
    const text = evaluation.annotated.slice(cursor, match.index);
    if (/[\[\]]/.test(text))
      return { reason: 'A anotação do motor contém delimitadores que não podem ser alinhados.' };
    append(text);
    const preceding = tokens.at(-1);
    if (preceding?.end === stripped.length) preceding.tags.push(match[1]);
    cursor = match.index + match[0].length;
  }
  const tail = evaluation.annotated.slice(cursor);
  if (/[\[\]]/.test(tail))
    return { reason: 'A anotação do motor contém delimitadores que não podem ser alinhados.' };
  append(tail);
  if (stripped !== evaluation.surface) {
    // Older evaluations lack prepared spans. Annotation can omit or add word
    // spacing: align its unchanged letters onto the actual displayed surface.
    // No spelling, accent or punctuation normalization is performed.
    const positions = new Map<number, number>();
    let source = 0;
    let target = 0;
    while (source < stripped.length || target < evaluation.surface.length) {
      if (/\s/u.test(stripped[source] ?? '')) {
        source++;
        continue;
      }
      if (/\s/u.test(evaluation.surface[target] ?? '')) {
        target++;
        continue;
      }
      if (stripped[source] !== evaluation.surface[target])
        return { reason: 'A forma anotada não corresponde ao resultado deste nó.' };
      positions.set(source++, target++);
    }
    const projected: Token[] = [];
    for (const token of tokens) {
      const start = positions.get(token.start);
      const last = positions.get(token.end - 1);
      if (start === undefined || last === undefined) continue;
      for (const match of evaluation.surface.slice(start, last + 1).matchAll(/\S+/gu))
        projected.push({
          text: match[0],
          start: start + match.index,
          end: start + match.index + match[0].length,
          tags: token.tags,
        });
    }
    tokens.splice(0, tokens.length, ...projected);
  }
  if (tokens.length > MAX_TOKENS)
    return { reason: 'Esta forma ultrapassa o limite do acompanhamento experimental.' };
  return { tokens };
}

/** Tags can change grammatical role when a lexical item enters a clause.
 * Person/reflexive identity survives PRONOUN -> OBJECT/SUBJECT/POSSESSIVE;
 * other families only identify their own explicitly annotated morphemes. */
function tagIdentity(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const parts = tag.split(':');
  if (/^(?:PRONOUN|POSSESSIVE_PRONOUN|SUBJECT|OBJECT)(?:_PREFIX)?$/u.test(parts[0])) {
    const person = parts.find((part) => /^(?:[123]p(?:s|p|pe|pi)?|gen)$/u.test(part));
    if (person) return `PERSON:${person}`;
    if (parts.some((part) => /^(?:REFLEXIVE|refl)$/u.test(part))) return 'REFLEXIVE';
    if (parts.some((part) => /^(?:RECIPROCAL|recip)$/u.test(part))) return 'RECIPROCAL';
  }
  if (/^(?:PLURIFORM_PREFIX|CAUSATIVE_PREFIX|SUBSTANTIVE_SUFFIX)$/u.test(parts[0])) return parts[0];
  return tag;
}

function relatedRoot(a: string, b: string): boolean {
  // ROOT describes a category, not lexical identity. Require retained letters
  // at the stem edge before following a contextual root allomorph.
  const edge = changedEdges(a, b);
  const retained = edge.start + a.length - edge.fromEnd;
  return retained >= 2 && retained >= Math.min(a.length, b.length) / 2;
}

/** Match all morphemes of a child together, retaining every equally optimal
 * assignment. Exact letters dominate contextual allomorphs, while tags resolve
 * homographic prefixes/suffixes. Sibling evidence can reserve target occurrences. */
function align(
  from: Token[],
  to: Token[],
  options: {
    rootChange?: boolean;
    singleTokenDelta?: boolean;
    excludedTargets?: Set<number>;
  } = {},
): Alignment {
  const n = from.length;
  const m = to.length;
  const exactWeight = (Math.min(n, m) + 1) * 32;
  const weight = (i: number, j: number) => {
    if (options.excludedTargets?.has(j)) return 0;
    const source = from[i];
    const target = to[j];
    const sameTag = !!source.tags[0] && source.tags[0] === target.tags[0];
    const identity = tagIdentity(source.tags[0]);
    const sameIdentity = !!identity && identity === tagIdentity(target.tags[0]);
    if (source.text === target.text) return exactWeight + (sameTag ? 16 : sameIdentity ? 12 : 0);
    if (sameIdentity && identity !== 'ROOT') return sameTag ? 16 : 12;
    if (
      ((sameTag && identity === 'ROOT') ||
        (!source.tags.length && n === 1 && target.tags[0] === 'ROOT')) &&
      (options.rootChange || relatedRoot(source.text, target.text))
    )
      return 8;
    return options.singleTokenDelta && n === 1 && m === 1 ? 1 : 0;
  };
  const width = m + 1;
  const before = new Int32Array((n + 1) * width);
  const after = new Int32Array((n + 1) * width);
  const at = (i: number, j: number) => i * width + j;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const match = weight(i, j);
      before[at(i + 1, j + 1)] = Math.max(
        before[at(i, j + 1)],
        before[at(i + 1, j)],
        match ? before[at(i, j)] + match : 0,
      );
    }
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const match = weight(i, j);
      after[at(i, j)] = Math.max(
        after[at(i + 1, j)],
        after[at(i, j + 1)],
        match ? after[at(i + 1, j + 1)] + match : 0,
      );
    }
  const best = after[0];
  const targets: (number | undefined)[] = Array(n).fill(undefined);
  const ambiguous = new Set<number>();
  const matchedBy = Array.from({ length: m }, () => [] as number[]);
  const maySkipTarget = new Set<number>();
  for (let i = 0; i < n; i++) {
    const choices: number[] = [];
    let maySkip = false;
    for (let j = 0; j <= m; j++) {
      if (before[at(i, j)] + after[at(i + 1, j)] === best) maySkip = true;
      if (
        j < m &&
        weight(i, j) &&
        before[at(i, j)] + weight(i, j) + after[at(i + 1, j + 1)] === best
      ) {
        choices.push(j);
        matchedBy[j].push(i);
      }
    }
    if (choices.length === 1 && !maySkip) targets[i] = choices[0];
    else if (choices.length) ambiguous.add(i);
  }
  for (let j = 0; j < m; j++)
    for (let i = 0; i <= n; i++)
      if (before[at(i, j)] + after[at(i, j + 1)] === best) {
        maySkipTarget.add(j);
        break;
      }
  return {
    targets,
    ambiguous,
    unmatchedTargets: new Set(matchedBy.flatMap((sources, j) => (sources.length ? [] : [j]))),
    uncertainTargets: new Set(
      matchedBy.flatMap((sources, j) =>
        sources.length && (sources.length !== 1 || maySkipTarget.has(j)) ? [j] : [],
      ),
    ),
  };
}

function ranges(values: MorphemeRange[]): MorphemeRange[] {
  const sorted = values
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const result: MorphemeRange[] = [];
  for (const value of sorted) {
    const previous = result.at(-1);
    if (previous && value.start <= previous.end) previous.end = Math.max(previous.end, value.end);
    else result.push({ start: value.start, end: value.end });
  }
  return result;
}
const overlap = (a: MorphemeRange, b: MorphemeRange) => ({
  start: Math.max(a.start, b.start),
  end: Math.min(a.end, b.end),
});

/** Compare graphemes, preserving UTF-16 boundaries even for combining marks and
 * surrogate pairs. This finds unchanged edges, not an inferred edit history. */
function changedEdges(a: string, b: string) {
  const segmenter = new Intl.Segmenter('pt', { granularity: 'grapheme' });
  const left = [...segmenter.segment(a)].map((part) => part.segment);
  const right = [...segmenter.segment(b)].map((part) => part.segment);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  )
    suffix++;
  return {
    start: left.slice(0, prefix).join('').length,
    fromEnd: a.length - left.slice(left.length - suffix).join('').length,
    toEnd: b.length - right.slice(right.length - suffix).join('').length,
  };
}

function operationDelta(before: Token[], after: Token[]): MorphemeTraceNode {
  const alignment = align(before, after, { rootChange: true, singleTokenDelta: true });
  const highlighted: MorphemeRange[] = [...alignment.unmatchedTargets].map((index) => after[index]);
  let deletion = false;
  let changed = false;
  alignment.targets.forEach((target, index) => {
    if (target === undefined) {
      if (!alignment.ambiguous.has(index)) deletion = true;
      return;
    }
    const a = before[index];
    const b = after[target];
    if (a.text === b.text) return;
    changed = true;
    const edge = changedEdges(a.text, b.text);
    if (edge.toEnd > edge.start)
      highlighted.push({ start: b.start + edge.start, end: b.start + edge.toEnd });
    else deletion = true;
  });
  const uncertain = alignment.ambiguous.size > 0 || alignment.uncertainTargets.size > 0;
  const result = ranges(highlighted);
  if (result.length)
    return {
      ranges: result,
      status: 'highlighted',
      ...(uncertain
        ? {
            reason:
              'Apenas as mudanças inequívocas foram destacadas; há correspondências ambíguas.',
          }
        : {}),
    };
  if (uncertain)
    return absent(
      'As repetições não permitem distinguir quais morfemas esta operação mudou.',
      true,
    );
  return absent(
    deletion || changed
      ? 'A mudança remove superfície, mas não acrescenta um trecho que possa ser destacado.'
      : 'Esta operação não altera a superfície. Não há morfema novo para destacar.',
  );
}

function propagate(
  from: Token[],
  to: Token[],
  selected: MorphemeTraceNode,
  rootChange: boolean,
  excludedTargets: Set<number>,
  ambiguousSources: Set<number>,
): MorphemeTraceNode {
  if (!selected.ranges.length) return { ...selected, ranges: [] };
  const alignment = align(from, to, { rootChange, excludedTargets });
  const highlighted: MorphemeRange[] = [];
  let uncertain = false;
  let missing = false;
  from.forEach((token, index) => {
    const pieces = selected.ranges
      .map((range) => overlap(range, token))
      .filter((r) => r.end > r.start);
    if (!pieces.length) return;
    if (ambiguousSources.has(index)) {
      uncertain = true;
      return;
    }
    const target = alignment.targets[index];
    if (target === undefined) {
      if (alignment.ambiguous.has(index)) uncertain = true;
      else missing = true;
      return;
    }
    const next = to[target];
    if (token.text === next.text) {
      highlighted.push(
        ...pieces.map((piece) => ({
          start: next.start + piece.start - token.start,
          end: next.start + piece.end - token.start,
        })),
      );
      return;
    }
    if (pieces.some((piece) => piece.start === token.start && piece.end === token.end)) {
      highlighted.push(next);
      return;
    }
    const edge = changedEdges(token.text, next.text);
    for (const piece of pieces) {
      const local = { start: piece.start - token.start, end: piece.end - token.start };
      const prefix = overlap(local, { start: 0, end: edge.start });
      if (prefix.end > prefix.start)
        highlighted.push({ start: next.start + prefix.start, end: next.start + prefix.end });
      const suffix = overlap(local, { start: edge.fromEnd, end: token.text.length });
      if (suffix.end > suffix.start)
        highlighted.push({
          start: next.start + edge.toEnd + suffix.start - edge.fromEnd,
          end: next.start + edge.toEnd + suffix.end - edge.fromEnd,
        });
      const middle = overlap(local, { start: edge.start, end: edge.fromEnd });
      if (middle.end <= middle.start) continue;
      if (middle.start === edge.start && middle.end === edge.fromEnd) {
        if (edge.toEnd > edge.start)
          highlighted.push({ start: next.start + edge.start, end: next.start + edge.toEnd });
        else missing = true;
      } else uncertain = true;
    }
  });
  const result = ranges(highlighted);
  const reason = uncertain
    ? 'As correspondências ambíguas foram omitidas; só os trechos inequívocos são destacados.'
    : missing
      ? 'Parte da contribuição não pôde ser alinhada nesta etapa e nas seguintes.'
      : selected.reason;
  if (result.length)
    return { ranges: result, status: 'highlighted', ...(reason ? { reason } : {}) };
  return absent(
    uncertain
      ? 'Há mais de uma correspondência possível; nenhum trecho foi escolhido por adivinhação.'
      : 'A contribuição selecionada não tem correspondência segura nesta etapa.',
    uncertain,
  );
}

/** Experimental comparison of adjacent engine results, never authoritative
 * morpheme ownership. Callers must supply only revision/engine-current evidence.
 * Tracing stops at an unavailable or ambiguous step instead of jumping directly
 * to a matching substring at the sentence root. */
export function traceMorphemes(graph: RuntimeGraph, selectedId: string): MorphemeTrace {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const selected = nodes.get(selectedId);
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'child' || !nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
    parents.set(edge.target, [...(parents.get(edge.target) ?? []), edge.source]);
  }
  const changeBase = (node: RuntimeNode | undefined) => {
    const direct = graph.edges.filter((edge) => edge.kind === 'child' && edge.source === node?.id);
    const kind = node?.expression?.kind;
    const field = kind === 'unary' ? 'operand' : 'receiver';
    if (kind === 'unary' || kind === 'method')
      return { change: true, bases: direct.filter((edge) => edge.field === field) };
    // Source helpers with one structural argument are unary transformations.
    // Constructor/scalar-only calls have no such branch; class constructors
    // (capitalized callable names) retain their cumulative constituent view.
    const callable = node?.expression?.method;
    const helper =
      kind === 'call' &&
      !!callable &&
      !/^[A-Z]/u.test(callable) &&
      direct.length === 1 &&
      /^(arg\d+|kw:)/.test(direct[0].field);
    return { change: helper, bases: helper ? direct : [] };
  };
  const selectedBase = changeBase(selected);
  const isChange = selectedBase.change;
  const result: MorphemeTrace = {
    selectedId,
    mode: isChange ? 'change' : 'constituent',
    nodes: {},
  };
  if (!selected) return result;
  const segmentations = new Map<string, Segmentation>();
  const tokens = (id: string) => {
    let value = segmentations.get(id);
    if (!value) {
      value = segment(nodes.get(id));
      segmentations.set(id, value);
    }
    return value;
  };
  const own = tokens(selectedId);
  if ('reason' in own) result.nodes[selectedId] = unavailable(own.reason);
  else if (isChange) {
    const bases = selectedBase.bases;
    const base = bases.length === 1 ? tokens(bases[0].target) : undefined;
    result.nodes[selectedId] = !base
      ? unavailable('Não foi possível identificar uma base única para comparar esta operação.')
      : 'reason' in base
        ? unavailable(`A base da operação não pode ser comparada: ${base.reason}`)
        : operationDelta(base.tokens, own.tokens);
  } else {
    const ownRanges = ranges(own.tokens);
    result.nodes[selectedId] = ownRanges.length
      ? { ranges: ownRanges, status: 'highlighted' }
      : absent('Este resultado não contém morfemas com superfície.');
  }
  const ancestors = new Set([selectedId]);
  for (const id of ancestors) {
    for (const parent of parents.get(id) ?? []) ancestors.add(parent);
    if (ancestors.size > MAX_ANCESTORS) {
      result.nodes[selectedId] = unavailable(
        'Esta árvore ultrapassa o limite do acompanhamento experimental.',
      );
      return result;
    }
  }
  const visiting = new Set<string>();
  const visit = (id: string): MorphemeTraceNode => {
    if (result.nodes[id]) return result.nodes[id];
    if (visiting.has(id))
      return unavailable('A árvore contém um ciclo; o acompanhamento foi interrompido.');
    visiting.add(id);
    const descendants = [
      ...new Set((children.get(id) ?? []).filter((child) => ancestors.has(child))),
    ];
    let nodeResult: MorphemeTraceNode;
    const ownTokens = tokens(id);
    if ('reason' in ownTokens) nodeResult = unavailable(ownTokens.reason);
    else if (descendants.length !== 1)
      nodeResult = unavailable(
        'Mais de um caminho liga este nó à seleção; não há uma ocorrência única.',
      );
    else {
      const childId = descendants[0];
      const child = visit(childId);
      const childTokens = tokens(childId);
      // A sibling's uniquely preserved morpheme belongs to that sibling.
      // Reserve it before matching a changed/allomorphic contribution, so a
      // root cannot drift onto a similar-looking word elsewhere in the clause.
      const excludedTargets = new Set<number>();
      const ambiguousSources = new Set<number>();
      const childAlignment =
        'reason' in childTokens ? undefined : align(childTokens.tokens, ownTokens.tokens);
      const exactMatches = (parts: Token[], alignment: Alignment) =>
        alignment.targets.flatMap((target, index) =>
          target !== undefined && parts[index].text === ownTokens.tokens[target].text
            ? [{ target, index }]
            : [],
        );
      const ownMatches =
        childAlignment && !('reason' in childTokens)
          ? exactMatches(childTokens.tokens, childAlignment)
          : [];
      let duplicateChild = false;
      for (const sibling of children.get(id) ?? []) {
        if (sibling === childId) continue;
        const siblingTokens = tokens(sibling);
        if ('reason' in siblingTokens) continue;
        if (
          !('reason' in childTokens) &&
          childTokens.tokens.length === siblingTokens.tokens.length &&
          childTokens.tokens.every(
            (token, index) =>
              token.text === siblingTokens.tokens[index].text &&
              tagIdentity(token.tags[0]) === tagIdentity(siblingTokens.tokens[index].tags[0]),
          )
        ) {
          duplicateChild = true;
          continue;
        }
        const siblingAlignment = align(siblingTokens.tokens, ownTokens.tokens);
        const siblingMatches = exactMatches(siblingTokens.tokens, siblingAlignment);
        for (const { target } of siblingMatches) {
          const competing = ownMatches.find((match) => match.target === target);
          if (competing && ownMatches.length > siblingMatches.length) continue;
          if (competing && ownMatches.length === siblingMatches.length) {
            ambiguousSources.add(competing.index);
            continue;
          }
          excludedTargets.add(target);
        }
      }
      nodeResult =
        'reason' in childTokens
          ? unavailable(childTokens.reason)
          : duplicateChild
            ? absent('Peças irmãs idênticas não distinguem a ocorrência deste morfema.', true)
            : propagate(
                childTokens.tokens,
                ownTokens.tokens,
                child,
                changeBase(nodes.get(id)).change,
                excludedTargets,
                ambiguousSources,
              );
    }
    visiting.delete(id);
    result.nodes[id] = nodeResult;
    return nodeResult;
  };
  for (const id of ancestors) visit(id);
  return result;
}

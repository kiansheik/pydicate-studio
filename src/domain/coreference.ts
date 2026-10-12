import { flattenNodes, type AuthorNode } from './authoring';
import type { Draft, Passage } from './types';

/** Coreference is a source annotation. `studio_anchor(value, "label")` marks an
 * antecedent anywhere in the same work; `studio_ref(form, "label")` marks a form
 * (usually the pro-drop `+ae`) that refers back to it. Neither changes the
 * realized form; Python evaluates both as copies of their value. */
export type CoreferenceRole = 'anchor' | 'reference';
export const COREFERENCE_CALLS: Record<CoreferenceRole, string> = {
  anchor: 'studio_anchor',
  reference: 'studio_ref',
};
/** Must agree with `COREFERENCE_LABEL` in python/authoring_runtime.py. */
export const COREFERENCE_LABEL = /^[\p{L}\p{N}_][\p{L}\p{N}_'-]{0,39}$/u;
export const REFERENTIAL_PRONOUN = '+ae';

export interface CoreferenceWrapper {
  role: CoreferenceRole;
  label: string;
  value: AuthorNode;
}

function callName(node: AuthorNode) {
  return node.method ?? node.lexicalReference ?? node.label;
}

/** Only the literal two-argument form is a link; anything else stays a plain call. */
export function coreferenceWrapper(node: AuthorNode): CoreferenceWrapper | undefined {
  if (node.kind !== 'call' || node.children.length !== 2) return;
  const name = callName(node);
  const role = (Object.keys(COREFERENCE_CALLS) as CoreferenceRole[]).find(
    (key) => COREFERENCE_CALLS[key] === name,
  );
  const [value, label] = node.children;
  if (
    !role ||
    value.slot !== 'arg0' ||
    label.slot !== 'arg1' ||
    label.node.kind !== 'literal' ||
    typeof label.node.value !== 'string'
  )
    return;
  return { role, label: label.node.value, value: value.node };
}

function argument(code: string) {
  // A trailing comment must not consume the label argument.
  return code.includes('#') && !code.endsWith('\n') ? code + '\n' : code;
}
export function coreferenceSource(role: CoreferenceRole, code: string, label: string) {
  if (!COREFERENCE_LABEL.test(label))
    throw new Error('Use um rótulo curto de letras, números, _, - ou apóstrofo, sem espaços.');
  return `${COREFERENCE_CALLS[role]}(${argument(code)}, ${JSON.stringify(label)})`;
}
export function referentialPronoun(label: string) {
  return coreferenceSource('reference', REFERENTIAL_PRONOUN, label);
}

/** Every link written in one piece of source, read from its parsed tree. */
export function coreferenceLinks(root: AuthorNode | null | undefined) {
  return flattenNodes(root ?? null).flatMap((node) => {
    const link = coreferenceWrapper(node);
    return link ? [{ role: link.role, label: link.label, sourceNodeId: node.id }] : [];
  });
}

function labelBase(text: string) {
  return [...text.normalize('NFC')]
    .filter((character) => /[\p{L}\p{N}_]/u.test(character))
    .slice(0, 16)
    .join('');
}
/** A readable default: the first named piece of the structure, numbered when taken. */
export function suggestCoreferenceLabel(node: AuthorNode, taken: Iterable<string>) {
  const used = new Set(taken);
  let base = '';
  for (const item of flattenNodes(node)) {
    if (coreferenceWrapper(item) || /^__studio_slot_/.test(item.code)) continue;
    const literal = item.children.find(
      (child) => child.node.kind === 'literal' && typeof child.node.value === 'string',
    )?.node.value;
    const candidate =
      item.kind === 'reference'
        ? item.code
        : item.kind === 'call' && typeof literal === 'string' && /^[A-Z]/.test(callName(item))
          ? literal
          : '';
    if (candidate && candidate !== 'ae' && !candidate.startsWith('studio_')) {
      base = labelBase(candidate);
      if (base) break;
    }
  }
  base ||= 'ref';
  if (!used.has(base)) return base;
  for (let index = 2; ; index += 1) if (!used.has(base + index)) return base + index;
}

/** Locate literal coreference calls in unparsed source from other passages.
 * Strings and comments are skipped; only a plain string label is accepted. */
export function scanCoreferences(raw: string) {
  const links: { role: CoreferenceRole; label: string }[] = [];
  const names = new Map(
    (Object.keys(COREFERENCE_CALLS) as CoreferenceRole[]).map((role) => [
      COREFERENCE_CALLS[role],
      role,
    ]),
  );
  const skipString = (index: number) => {
    const quote = raw[index];
    const triple = raw.slice(index, index + 3) === quote.repeat(3);
    const close = triple ? quote.repeat(3) : quote;
    let cursor = index + close.length;
    while (cursor < raw.length) {
      if (raw[cursor] === '\\') cursor += 2;
      else if (raw.startsWith(close, cursor)) return cursor + close.length;
      else if (!triple && raw[cursor] === '\n') return cursor;
      else cursor += 1;
    }
    return raw.length;
  };
  const skip = (index: number) => {
    if (raw[index] === '#') {
      const end = raw.indexOf('\n', index);
      return end < 0 ? raw.length : end;
    }
    if (raw[index] === '"' || raw[index] === "'") return skipString(index);
    return index;
  };
  /** The final top-level argument of the call opened at `open`, if it is a plain string. */
  const lastArgument = (open: number) => {
    let depth = 0;
    let start = open + 1;
    for (let cursor = open; cursor < raw.length; ) {
      const next = skip(cursor);
      if (next !== cursor) {
        cursor = next;
        continue;
      }
      const character = raw[cursor];
      if ('([{'.includes(character)) depth += 1;
      else if (')]}'.includes(character)) {
        depth -= 1;
        if (depth === 0) {
          const text = raw
            .slice(start, cursor)
            .replace(/#[^\n]*/g, '')
            .trim();
          const match = /^(["'])([^"'\\\n]*)\1$/.exec(text);
          return match?.[2];
        }
      } else if (character === ',' && depth === 1) start = cursor + 1;
      cursor += 1;
    }
  };
  for (let cursor = 0; cursor < raw.length; ) {
    const next = skip(cursor);
    if (next !== cursor) {
      cursor = next;
      continue;
    }
    const word = /^[A-Za-z_]\w*/.exec(raw.slice(cursor, cursor + 64));
    if (!word || (cursor > 0 && /[\w.]/.test(raw[cursor - 1]))) {
      cursor += word ? word[0].length : 1;
      continue;
    }
    const role = names.get(word[0]);
    const open =
      cursor + word[0].length + (/^\s*/.exec(raw.slice(cursor + word[0].length))?.[0].length ?? 0);
    if (role && raw[open] === '(') {
      const label = lastArgument(open);
      if (label !== undefined && COREFERENCE_LABEL.test(label)) links.push({ role, label });
    }
    cursor += word[0].length;
  }
  return links;
}

export interface WorkCoreference {
  role: CoreferenceRole;
  label: string;
  passageId: string;
  ordinal: number;
  title: string;
  /** The passage's own text, so a contributor can recognize the antecedent. */
  text: string;
}

/** Links saved in other passages of the same work (drafts win over published source). */
export function collectWorkCoreferences(
  passages: Passage[],
  drafts: Record<string, Draft | undefined>,
  sourceId: string,
  currentPassageId?: string,
): WorkCoreference[] {
  const result: WorkCoreference[] = [];
  for (const passage of passages) {
    if (passage.sourceId !== sourceId || passage.id === currentPassageId) continue;
    const draft = drafts[passage.id];
    const sources = [
      draft?.raw ?? passage.sourceExpression,
      ...(draft?.canvas?.fragments ?? []).map((fragment) => fragment.raw),
    ];
    const seen = new Set<string>();
    for (const raw of sources)
      for (const link of scanCoreferences(raw ?? '')) {
        const key = link.role + ':' + link.label;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          ...link,
          passageId: passage.id,
          ordinal: passage.ordinal,
          title: passage.title,
          text: draft?.normalized || passage.normalized || draft?.diplomatic || passage.diplomatic,
        });
      }
  }
  return result;
}

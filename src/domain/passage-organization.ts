import type { DraftEnvelope, Passage } from './types';

/** Apply shared list order, then insert unranked pending rows at their anchors. */
export function organizePassages(passages: Passage[], envelope: DraftEnvelope): Passage[] {
  const result: Passage[] = [];
  for (const sourceId of new Set(passages.map((p) => p.sourceId))) {
    const source = passages.filter((p) => p.sourceId === sourceId);
    const organization = (p: Passage) =>
      envelope.drafts[p.id]?.organization ??
      envelope.drafts[p.id.replace(/^passage:/, 'pending:')]?.organization;
    if (!source.some((p) => organization(p))) {
      result.push(...source);
      continue;
    }
    const pendingDraft = (p: Passage) =>
      envelope.drafts[p.id]?.pending ??
      envelope.drafts[p.id.replace(/^passage:/, 'pending:')]?.pending;
    const pending = source.filter(
      (p) => !organization(p) && (p.id.startsWith('pending:') || pendingDraft(p)),
    );
    const ordered = source
      .filter((p) => !pending.includes(p))
      .sort(
        (a, b) =>
          (organization(a)?.position ?? Number.MAX_SAFE_INTEGER) -
          (organization(b)?.position ?? Number.MAX_SAFE_INTEGER),
      );
    const waiting = [...pending];
    for (let attempts = 0; waiting.length && attempts <= waiting.length; attempts++) {
      const item = waiting.shift()!;
      const anchor = pendingDraft(item)?.beforePassageId;
      const before =
        anchor && !source.some((p) => p.id === anchor)
          ? anchor.replace(/^pending:/, 'passage:')
          : anchor;
      if (before && waiting.some((p) => p.id === before) && attempts < waiting.length) {
        waiting.push(item);
        continue;
      }
      attempts = -1;
      const index = ordered.findIndex((p) => p.id === before);
      ordered.splice(index < 0 ? ordered.length : index, 0, item);
    }
    result.push(...ordered.filter((p) => !organization(p)?.deleted));
  }
  return result;
}

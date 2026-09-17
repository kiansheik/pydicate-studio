import { draftConflicts } from './model';
import type { DraftEnvelope, StudioProject } from './types';

export interface StructureDraft {
  passageId: string;
  sourceId: string;
  raw: string;
  revisionId: string;
  fragmentId?: string;
}

/** Only analyses with a known current namespace can enter the reuse index.
 * Human readings, notes and archived/conflicting drafts are never sent. */
export function structureDrafts(project: StudioProject, envelope: DraftEnvelope): StructureDraft[] {
  if (project.id !== envelope.projectId || project.mode !== 'local') return [];
  const passages = new Map(project.passages.map((passage) => [passage.id, passage]));
  return Object.values(envelope.drafts).flatMap((draft) => {
    const passage = passages.get(draft.passageId);
    if (passage && draftConflicts(draft, passage)) return [];
    // Legacy pending envelopes predate explicit source metadata; Araújo was their only source.
    const isPending =
      draft.passageId.startsWith('pending:') &&
      project.passages.some((item) => item.sourceId === 'araujo_catecismo_1686');
    if (!passage && !isPending) return [];
    const context = {
      passageId: draft.passageId,
      sourceId: passage?.sourceId ?? 'araujo_catecismo_1686',
      revisionId: draft.revisionId,
    };
    const entries: StructureDraft[] = [];
    if (draft.raw?.trim() && draft.raw !== passage?.sourceExpression)
      entries.push({ ...context, raw: draft.raw });
    for (const fragment of draft.canvas?.fragments ?? [])
      if (fragment.raw.trim())
        entries.push({ ...context, fragmentId: fragment.id, raw: fragment.raw });
    return entries;
  });
}

type SearchContext = { projectId: string; engineFingerprint: string; drafts: StructureDraft[] };
let currentContext: (() => SearchContext | undefined) | undefined;

/** Read at request time, including edits not yet flushed to disk. */
export function registerStructureContext(read: () => SearchContext | undefined) {
  currentContext = read;
  return () => {
    if (currentContext === read) currentContext = undefined;
  };
}

export function withStructureContext(method: string, params: Record<string, unknown>) {
  if (method !== 'structure_search' && method !== 'structure_resolve') return params;
  const context = currentContext?.();
  return context ? { ...params, ...context } : params;
}

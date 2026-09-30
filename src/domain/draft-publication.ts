import type { Draft, StudioProject } from './types';

function content(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(content);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, content(item)]),
    );
  return value;
}

/** Workflow and list metadata can change without changing the expression revision. */
export function matchesPublicationBaseline(
  draft: Draft | undefined,
  change: NonNullable<StudioProject['draftPublication']>['changes'][number],
): boolean {
  return (
    (draft?.revisionId ?? null) === change.expectedRevisionId &&
    (change.expectedDraft === undefined ||
      JSON.stringify(content(draft ?? null)) === JSON.stringify(content(change.expectedDraft)))
  );
}

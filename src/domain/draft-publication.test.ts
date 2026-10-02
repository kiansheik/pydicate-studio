import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { createDraft } from './model';
import { matchesPublicationBaseline } from './draft-publication';
import type { Draft, StudioProject } from './types';

function receipt(
  draft: Draft | null,
): NonNullable<StudioProject['draftPublication']>['changes'][number] {
  return {
    id: draft?.passageId ?? 'passage:new',
    version: 2,
    draft: null,
    expectedRevisionId: draft?.revisionId ?? null,
    expectedDraft: draft,
  };
}

describe('publication refresh baseline', () => {
  it('preserves local workflow and organization edits with unchanged expression revisions', () => {
    const baseline = createDraft(createExampleProject().passages[0]);
    const change = receipt(baseline);
    expect(matchesPublicationBaseline(baseline, change)).toBe(true);
    expect(
      matchesPublicationBaseline(
        { ...baseline, workflow: { stage: 'complete', updatedAt: '2026-09-30T22:00:00Z' } },
        change,
      ),
    ).toBe(false);
    expect(
      matchesPublicationBaseline(
        { ...baseline, organization: { sourceId: 'example', position: 2, deleted: false } },
        change,
      ),
    ).toBe(false);
  });

  it('accepts JSON-equivalent restored drafts without depending on object property order', () => {
    const baseline = createDraft(createExampleProject().passages[0]);
    const restored = Object.fromEntries(Object.entries(baseline).reverse()) as Draft;
    expect(
      matchesPublicationBaseline(restored, receipt(JSON.parse(JSON.stringify(baseline)))),
    ).toBe(true);
  });

  it('accepts a new remote row only while there is no local draft for it', () => {
    const change = receipt(null);
    expect(matchesPublicationBaseline(undefined, change)).toBe(true);
    expect(
      matchesPublicationBaseline(createDraft(createExampleProject().passages[0]), change),
    ).toBe(false);
  });
});

import type { Draft, DraftEnvelope, Passage, StudioProject } from './types';
import { emptySourcePassage, projectSources } from './sources';
import { createDraft, updateDraft } from './model';
import { organizePassages } from './passage-organization';

/** Continue the same book location; turning the physical PDF page is explicit. */
export function nextPassageLocators(
  previous: Passage,
  draft?: Draft,
): NonNullable<Draft['locators']> {
  return {
    printedPage: draft?.locators?.printedPage ?? previous.witness.printedPage ?? '',
    folio: draft?.locators?.folio ?? previous.witness.folio ?? '',
    line: draft?.locators?.line ?? String(previous.witness.textualLine ?? ''),
    section: draft?.locators?.section ?? previous.witness.section ?? '',
    subsection: draft?.locators?.subsection ?? previous.witness.subsection ?? '',
    ...((draft?.locators?.prayerName ?? previous.witness.prayerName) != null
      ? { prayerName: draft?.locators?.prayerName ?? previous.witness.prayerName! }
      : {}),
  };
}

/** Continue the source location, never passage-specific reading or AI input. */
export function nextPassageContext(previous: Passage, draft?: Draft) {
  return { locators: nextPassageLocators(previous, draft) };
}

/** An existing passage with any authored material keeps its own draft intact. */
export function prefillEmptyNextPassage(
  previous: Passage,
  next: Passage,
  previousDraft: Draft | undefined,
  nextDraft: Draft,
): Draft {
  if (
    previous.sourceId !== next.sourceId ||
    next.ordinal !== previous.ordinal + 1 ||
    nextDraft.pending
  )
    return nextDraft;
  const authored = (draft: Draft) =>
    [draft.raw, draft.diplomatic, draft.normalized, draft.translation, draft.notes].some(
      (value) => !!value?.length,
    ) ||
    Object.values(draft.translations ?? {}).some((value) => !!value?.length) ||
    Object.values(draft.aiInput ?? {}).some((value) => !!value?.length) ||
    !!draft.analysis ||
    !!draft.workflow ||
    !!draft.aiAcceptances?.length ||
    !!draft.canvas?.fragments.length ||
    !!Object.keys(draft.canvas?.positions ?? {}).length;
  const baseline = createDraft(next);
  if (authored(nextDraft) || authored(baseline) || next.acceptedReference !== null)
    return nextDraft;
  // Keep even a location-only edit, including an explicit clearing of a source locator.
  if (
    Object.entries(nextDraft.locators ?? {}).some(
      ([key, value]) =>
        value !== (baseline.locators?.[key as keyof NonNullable<Draft['locators']>] ?? ''),
    )
  )
    return nextDraft;
  const context = nextPassageContext(previous, previousDraft);
  return updateDraft(nextDraft, {
    ...context,
    locators: {
      ...context.locators,
      ...Object.fromEntries(
        Object.entries(nextDraft.locators ?? {}).filter(([, value]) => !!value),
      ),
    },
  });
}

/** Project local shells into the same passage list without pretending they are published. */
export function projectWithPending(project: StudioProject, envelope: DraftEnvelope): StudioProject {
  const passages = project.passages.filter((passage) => !passage.id.startsWith('pending:'));
  if (project.id !== envelope.projectId || project.mode !== 'local')
    return { ...project, passages };
  const pending = Object.values(envelope.drafts)
    .filter((draft) => draft.passageId.startsWith('pending:'))
    .sort(
      (a, b) =>
        (a.pending?.ordinal ?? Number.MAX_SAFE_INTEGER) -
        (b.pending?.ordinal ?? Number.MAX_SAFE_INTEGER),
    );
  const waiting = [...pending];
  for (let attempts = 0; waiting.length && attempts <= pending.length; attempts++) {
    const draft = waiting.shift()!;
    const beforeId = draft.pending?.beforePassageId;
    if (
      beforeId?.startsWith('pending:') &&
      !passages.some((p) => p.id === beforeId) &&
      waiting.some((d) => d.passageId === beforeId) &&
      attempts < pending.length
    ) {
      waiting.push(draft);
      continue;
    }
    attempts = 0;
    const sourceId = draft.pending?.sourceId ?? 'araujo_catecismo_1686';
    const siblings = passages.filter((passage) => passage.sourceId === sourceId);
    const source = projectSources(project).find((item) => item.id === sourceId);
    const previous =
      siblings.find((p) => p.id === draft.pending?.previousPassageId) ??
      siblings.at(-1) ??
      (source ? emptySourcePassage(source) : undefined);
    if (!previous) continue;
    const locators = draft.locators ?? nextPassageLocators(previous);
    const insertion = beforeId ? passages.findIndex((p) => p.id === beforeId) : -1;
    passages.splice(insertion < 0 ? passages.length : insertion, 0, {
      ...previous,
      id: draft.passageId,
      legacyId: draft.passageId,
      ordinal: Math.max(0, ...siblings.map((passage) => passage.ordinal)) + 1,
      title: draft.normalized || draft.diplomatic || 'Nova passagem',
      sourceExpression: '',
      sourceFingerprint: 'pending',
      legacyExpressionFingerprint: undefined,
      acceptedReference: null,
      referenceProvenance: 'none',
      diplomatic: '',
      normalized: '',
      translation: '',
      translations: undefined,
      notes: '',
      analysis: null,
      status: 'analysis',
      witness: {
        ...previous.witness,
        printedPage: locators.printedPage ?? '',
        folio: locators.folio ?? '',
        textualLine: locators.line ?? '',
        section: locators.section ?? '',
        subsection: locators.subsection ?? '',
        ...(locators.prayerName != null ? { prayerName: locators.prayerName } : {}),
        pdfPage: null,
        region: null,
      },
      sourceMetadata: {},
      studioMetadata: {},
    });
  }
  const ordinals = new Map<string, number>();
  return {
    ...project,
    passages: organizePassages(passages, envelope).map((p) => {
      const ordinal = (ordinals.get(p.sourceId) ?? 0) + 1;
      ordinals.set(p.sourceId, ordinal);
      return { ...p, ordinal };
    }),
  };
}

/** Resolve a local position to the next published identity, never a guessed ordinal. */
export function pendingInsertionContexts(
  project: StudioProject,
  envelope?: DraftEnvelope,
): Record<string, { beforePassageId: string | null }> {
  return Object.fromEntries(
    project.passages.flatMap((p, index) =>
      p.id.startsWith('pending:')
        ? [
            [
              p.id,
              {
                beforePassageId:
                  envelope?.drafts[p.id]?.pending?.beforePassageId &&
                  !project.passages.some(
                    (next) => next.id === envelope.drafts[p.id].pending?.beforePassageId,
                  )
                    ? envelope.drafts[p.id].pending!.beforePassageId!
                    : (project.passages
                        .slice(index + 1)
                        .find(
                          (next) => next.sourceId === p.sourceId && !next.id.startsWith('pending:'),
                        )?.id ?? null),
              },
            ],
          ]
        : [],
    ),
  );
}

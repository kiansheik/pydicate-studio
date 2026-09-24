import type { Draft, DraftEnvelope, Passage, StudioProject } from './types';

/** Continue the same book location; turning the physical PDF page is explicit. */
export function nextPassageLocators(
  previous: Passage,
  draft?: Draft,
): NonNullable<Draft['locators']> {
  return {
    printedPage: draft?.locators?.printedPage ?? previous.witness.printedPage ?? '',
    folio: draft?.locators?.folio ?? previous.witness.folio ?? '',
    line: '',
    section: draft?.locators?.section ?? previous.witness.section ?? '',
    subsection: draft?.locators?.subsection ?? previous.witness.subsection ?? '',
  };
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
    const previous =
      passages.find((p) => p.id === draft.pending?.previousPassageId) ?? siblings.at(-1);
    if (!previous) continue;
    const locators = draft.locators ?? nextPassageLocators(previous);
    const insertion = beforeId ? passages.findIndex((p) => p.id === beforeId) : -1;
    passages.splice(insertion < 0 ? passages.length : insertion, 0, {
      ...previous,
      id: draft.passageId,
      legacyId: draft.passageId,
      ordinal: Math.max(...siblings.map((passage) => passage.ordinal)) + 1,
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
    passages: passages.map((p) => {
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

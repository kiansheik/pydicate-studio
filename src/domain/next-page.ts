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
  for (const draft of pending) {
    const sourceId = draft.pending?.sourceId ?? 'araujo_catecismo_1686';
    const siblings = passages.filter((passage) => passage.sourceId === sourceId);
    const previous = siblings.at(-1);
    if (!previous) continue;
    const locators = draft.locators ?? nextPassageLocators(previous);
    passages.push({
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
  return { ...project, passages };
}

import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { createDraft, validateDraftEnvelope } from './model';
import { nextPassageLocators, projectWithPending } from './next-page';
import type { Draft, DraftEnvelope, StudioProject } from './types';

function project(): StudioProject {
  const example = createExampleProject();
  return {
    ...example,
    mode: 'local',
    passages: example.passages.slice(0, 2).map((passage, index) => ({
      ...passage,
      id: `passage:${index}`,
      sourceId: 'araujo_catecismo_1686',
      ordinal: index + 1,
      witness: {
        ...passage.witness,
        printedPage: '20',
        folio: '10v',
        textualLine: '4–8',
        section: 'Doutrina',
        subsection: 'Orações',
        pdfPage: 9,
        region: [1, 2, 3, 4],
      },
    })),
  };
}
function pending(source = project(), suffix = 'a', ordinal = 3): Draft {
  return {
    ...createDraft({
      ...source.passages.at(-1)!,
      id: `pending:${suffix}`,
      sourceFingerprint: 'pending',
      sourceExpression: '',
      analysis: null,
    }),
    pending: {
      sourceId: 'araujo_catecismo_1686',
      previousPassageId: source.passages.at(-1)!.id,
      ordinal,
    },
    canvas: { layout: 'bottom-up', fragments: [], positions: {} },
  };
}
describe('next-passage shells', () => {
  it('continues the latest edited page and section, clearing only the line locator', () => {
    const previous = project().passages[1];
    const draft = {
      ...createDraft(previous),
      locators: {
        printedPage: '21–22',
        folio: '',
        line: '9–12',
        section: 'Nova seção',
        subsection: 'Perguntas',
      },
    };
    expect(nextPassageLocators(previous, draft)).toEqual({
      printedPage: '21–22',
      folio: '',
      line: '',
      section: 'Nova seção',
      subsection: 'Perguntas',
    });
    expect(nextPassageLocators(previous)).toEqual({
      printedPage: '20',
      folio: '10v',
      line: '',
      section: 'Doutrina',
      subsection: 'Orações',
    });
  });
  it('projects stable pending shells once without copying source text, reference approval or PDF geometry', () => {
    const source = project();
    const first = pending(source);
    const second = {
      ...pending(source, 'b', 4),
      pending: { ...first.pending!, previousPassageId: first.passageId, ordinal: 4 },
      locators: { printedPage: '21', section: 'Capítulo', subsection: 'Fim' },
    };
    const envelope: DraftEnvelope = {
      version: 1,
      projectId: source.id,
      drafts: { [second.passageId]: second, [first.passageId]: first },
    };
    const before = structuredClone({ source, envelope });
    const projected = projectWithPending(source, envelope);
    expect(projected.passages.map((passage) => passage.id)).toEqual([
      'passage:0',
      'passage:1',
      first.passageId,
      second.passageId,
    ]);
    const last = projected.passages.at(-1)!;
    expect(last).toMatchObject({
      sourceExpression: '',
      acceptedReference: null,
      referenceProvenance: 'none',
      analysis: null,
      diplomatic: '',
      normalized: '',
      translation: '',
      notes: '',
      status: 'analysis',
      witness: {
        printedPage: '21',
        pdfPage: null,
        region: null,
        section: 'Capítulo',
        subsection: 'Fim',
      },
    });
    expect(projectWithPending(projected, envelope)).toEqual(projected);
    expect({ source, envelope }).toEqual(before);
    expect(projectWithPending(source, { ...envelope, projectId: 'other' }).passages).toEqual(
      source.passages,
    );
  });
  it('restores older unbound pending drafts without deleting them or inventing a published expression', () => {
    const source = project();
    const legacy = pending(source);
    delete legacy.pending;
    delete legacy.locators;
    legacy.raw = 'incomplete(';
    legacy.notes = 'Preservar leitura';
    const envelope: DraftEnvelope = {
      version: 1,
      projectId: source.id,
      drafts: { [legacy.passageId]: legacy },
    };
    expect(validateDraftEnvelope(envelope)).toBe(true);
    const restored = projectWithPending(source, envelope).passages.at(-1)!;
    expect(restored.id).toBe(legacy.passageId);
    expect(restored.sourceExpression).toBe('');
    expect(restored.witness.printedPage).toBe('20');
    expect(legacy.raw).toBe('incomplete(');
  });
  it('validates pending provenance without allowing approval metadata or invalid source identities', () => {
    const source = project();
    const draft = pending(source);
    const wrap = (value: Draft) => ({
      version: 1,
      projectId: source.id,
      drafts: { [value.passageId]: value },
    });
    expect(validateDraftEnvelope(wrap(draft))).toBe(true);
    for (const patch of [
      { sourceId: '../wrong' },
      { ordinal: 0 },
      { ordinal: 1.2 },
      { previousPassageId: '' },
      { approved: true },
    ])
      expect(
        validateDraftEnvelope(wrap({ ...draft, pending: { ...draft.pending!, ...patch } })),
      ).toBe(false);
    expect(validateDraftEnvelope(wrap({ ...draft, passageId: 'passage:published' }))).toBe(false);
  });
});

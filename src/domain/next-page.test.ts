import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { createDraft, validateDraftEnvelope } from './model';
import {
  nextPassageLocators,
  nextPassageContext,
  prefillEmptyNextPassage,
  projectWithPending,
} from './next-page';
import type { Draft, DraftEnvelope, StudioProject } from './types';
import { emptySourcePassage } from './sources';

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
  it('copies only source locators and prayer, never passage-specific content', () => {
    const previous = project().passages[0];
    const draft = {
      ...createDraft(previous),
      locators: { prayerName: 'Pai-nosso', printedPage: '27', line: '3–5' },
      translations: { pt: 'Nosso pai', en: 'Our father' },
      aiInput: { tentativeReading: 'tuba', meaning: 'pai', constraints: 'Conservar grafia' },
      notes: 'Nota desta passagem',
      workflow: { stage: 'complete' as const, updatedAt: new Date().toISOString() },
    };
    const context = nextPassageContext(previous, draft);
    expect(context).toEqual({
      locators: { ...nextPassageLocators(previous, draft), prayerName: 'Pai-nosso' },
    });
    for (const key of [
      'diplomatic',
      'normalized',
      'translation',
      'translations',
      'aiInput',
      'raw',
      'notes',
      'analysis',
      'workflow',
      'aiAcceptances',
      'canvas',
    ])
      expect(context).not.toHaveProperty(key);
  });
  it('prefills only an empty immediate same-source next passage and preserves every authored field', () => {
    const previous = project().passages[0];
    const next = {
      ...project().passages[1],
      sourceExpression: '',
      diplomatic: '',
      normalized: '',
      translation: '',
      translations: undefined,
      notes: '',
      analysis: null,
      acceptedReference: null,
      witness: { ...previous.witness, printedPage: null, folio: null, textualLine: null },
    };
    const blank = createDraft(next);
    const donor = {
      ...createDraft(previous),
      diplomatic: 'Última leitura',
      locators: { printedPage: '29', prayerName: 'Ave-Maria' },
    };
    expect(prefillEmptyNextPassage(previous, next, donor, blank)).toMatchObject({
      diplomatic: '',
      normalized: '',
      translation: '',
      raw: '',
      locators: { printedPage: '29', prayerName: 'Ave-Maria' },
    });
    for (const changes of [
      { diplomatic: 'salva' },
      { normalized: 'salva' },
      { translation: 'salva' },
      { notes: 'nota' },
      { raw: 'amen' },
      { translations: { pt: 'salva' } },
      { aiInput: { tentativeReading: '', meaning: '', constraints: 'instrução' } },
      { locators: { printedPage: '30' } },
      { canvas: { fragments: [{ id: 'saved', raw: 'amen', x: 0, y: 0 }], positions: {} } },
      { workflow: { stage: 'complete' as const, updatedAt: new Date().toISOString() } },
    ]) {
      const saved = { ...blank, ...changes };
      expect(prefillEmptyNextPassage(previous, next, donor, saved)).toBe(saved);
    }
    expect(prefillEmptyNextPassage(previous, { ...next, sourceId: 'other' }, donor, blank)).toBe(
      blank,
    );
    expect(prefillEmptyNextPassage(previous, { ...next, ordinal: 3 }, donor, blank)).toBe(blank);
    expect(
      prefillEmptyNextPassage(previous, { ...next, diplomatic: 'Source text' }, donor, blank),
    ).toBe(blank);
  });
  it('restores the first draft in an empty source without borrowing another source witness', () => {
    const source = project();
    const catalogue = { id: 'manuscrito', title: 'Meu manuscrito', year: '1750' };
    source.sources = [catalogue];
    const draft = createDraft({ ...emptySourcePassage(catalogue), id: 'pending:first' });
    draft.pending = { sourceId: catalogue.id, ordinal: 1, beforePassageId: null };
    const envelope: DraftEnvelope = {
      version: 1,
      projectId: source.id,
      drafts: { [draft.passageId]: draft },
    };
    const projected = projectWithPending(source, envelope);
    expect(projected.passages.at(-1)).toMatchObject({
      id: draft.passageId,
      sourceId: 'manuscrito',
      ordinal: 1,
      sourceExpression: '',
      acceptedReference: null,
      referenceProvenance: 'none',
      witness: {
        title: 'Meu manuscrito',
        year: '1750',
        pdfPage: null,
        region: null,
        printedPage: '',
      },
    });
    expect(projectWithPending(projected, envelope)).toEqual(projected);
    draft.pending.sourceId = 'missing';
    expect(projectWithPending(source, envelope).passages).toEqual(source.passages);
  });
  it('continues the latest edited page, section and literal line locator without incrementing', () => {
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
      line: '9–12',
      section: 'Nova seção',
      subsection: 'Perguntas',
    });
    expect(nextPassageLocators(previous)).toEqual({
      printedPage: '20',
      folio: '10v',
      line: '4–8',
      section: 'Doutrina',
      subsection: 'Orações',
    });
  });
  it('projects stable pending shells once without copying source text, reference approval or PDF geometry', () => {
    const source = project();
    source.passages.at(-1)!.translations = { pt: 'não herdar', en: 'do not inherit' };
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
    expect(last.translations).toBeUndefined();
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

it('places missed drafts between stable passages and preserves a chain of pending insertions', () => {
  const source = project();
  const first = pending(source, 'first');
  first.pending!.beforePassageId = source.passages[1].id;
  first.pending!.previousPassageId = source.passages[0].id;
  const second = pending(source, 'second');
  second.pending!.beforePassageId = first.passageId;
  const result = projectWithPending(source, {
    version: 1,
    projectId: source.id,
    drafts: { [first.passageId]: first, [second.passageId]: second },
  });
  expect(result.passages.map((p) => p.id)).toEqual([
    source.passages[0].id,
    second.passageId,
    first.passageId,
    source.passages[1].id,
  ]);
  expect(result.passages.at(-1)!.acceptedReference).toBe(source.passages[1].acceptedReference);
});

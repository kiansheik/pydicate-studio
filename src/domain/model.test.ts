import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserDraftKey,
  compareReference,
  createDraft,
  draftConflicts,
  expressionFor,
  isCurrentRender,
  readBrowserDrafts,
  updateDraft,
  validateDraftEnvelope,
  writeBrowserDrafts,
} from './model';
import type { DraftEnvelope, ImperativeAnalysis, Passage, RenderResult } from './types';

const analysis: ImperativeAnalysis = {
  kind: 'imperative',
  predicate: 'apiti',
  subject: 'nde',
  object: 'moro',
  hiddenSubject: true,
  mood: 'imperative',
  negated: true,
};

function passage(): Passage {
  return {
    id: 'passage:stable-id',
    legacyId: 'araujo_catecismo_1686:0067',
    sourceId: 'araujo_catecismo_1686',
    ordinal: 67,
    title: 'Araújo 0067',
    sourceExpression: '-(+nde * apiti * moro).imp()',
    sourceFingerprint: 'source:v1',
    acceptedReference: 'eporoapiti umẽ',
    referenceProvenance: 'legacy',
    diplomatic: '',
    normalized: '',
    translation: '',
    notes: '',
    witness: { title: 'Araújo', year: '1686', printedPage: '5', pdfPage: null, region: null },
    status: 'review',
    analysis: { ...analysis },
  };
}

describe('independent drafts', () => {
  it('keeps baseline, source bytes, editorial status and original draft untouched', () => {
    const source = passage();
    const sourceBefore = structuredClone(source);
    const draft = createDraft(source);
    const draftBefore = structuredClone(draft);
    const edited = updateDraft(draft, {
      diplomatic: 'Uma leitura?',
      analysis: { ...analysis, negated: false },
    });
    expect(source).toEqual(sourceBefore);
    expect(draft).toEqual(draftBefore);
    expect(edited.revisionId).not.toBe(draft.revisionId);
    expect(edited.sourceFingerprint).toBe(source.sourceFingerprint);
    expect(edited).not.toHaveProperty('acceptedReference');
    expect(edited).not.toHaveProperty('status');
    expect(edited.analysis).not.toBe(source.analysis);
  });

  it('stores reading contributions for unknown expressions without inventing a visual analysis', () => {
    const source = {
      ...passage(),
      sourceExpression: 'custom_helper(foo)  # preserve me',
      analysis: null,
    };
    const edited = updateDraft(createDraft(source), { notes: 'Verificar o referente.' });
    expect(edited.analysis).toBeNull();
    expect(source.sourceExpression).toBe('custom_helper(foo)  # preserve me');
    expect(edited.notes).toBe('Verificar o referente.');
  });

  it('detects external source changes and rejects a draft from another passage', () => {
    const source = passage();
    const draft = createDraft(source);
    expect(draftConflicts(draft, source)).toBe(false);
    expect(draftConflicts(draft, { ...source, sourceFingerprint: 'source:v2' })).toBe(true);
    expect(draftConflicts(draft, { ...source, id: 'another-passage' })).toBe(true);
  });

  it('excludes stale revision, engine and expression results', () => {
    const draft = createDraft(passage());
    const result: RenderResult = {
      revisionId: draft.revisionId,
      engineFingerprint: 'engine:v1',
      expression: expressionFor(analysis),
      surface: 'eporoapiti umẽ',
      annotated: '',
      morphemes: [],
      origin: 'snapshot',
    };
    expect(isCurrentRender(result, draft, 'engine:v1')).toBe(true);
    expect(isCurrentRender(result, updateDraft(draft, { notes: 'mudou' }), 'engine:v1')).toBe(
      false,
    );
    expect(isCurrentRender(result, draft, 'engine:v2')).toBe(false);
    expect(
      isCurrentRender({ ...result, expression: '(+nde * apiti * moro).imp()' }, draft, 'engine:v1'),
    ).toBe(false);
    expect(isCurrentRender(undefined, draft, 'engine:v1')).toBe(false);
  });
});

describe('supported expression serialization', () => {
  it('preserves the exact outer-negation and imperative scope from Araújo 0067', () => {
    expect(expressionFor(analysis)).toBe('-(+nde * apiti * moro).imp()');
    expect(expressionFor({ ...analysis, negated: false })).toBe('(+nde * apiti * moro).imp()');
    expect(expressionFor({ ...analysis, hiddenSubject: false, mood: 'indicative' })).toBe(
      '-(nde * apiti * moro)',
    );
  });

  it('rejects unknown constructions instead of silently dropping them', () => {
    expect(() =>
      expressionFor({ ...analysis, predicate: 'potar' } as unknown as ImperativeAnalysis),
    ).toThrow();
    expect(() =>
      expressionFor({ ...analysis, unknownScope: true } as unknown as ImperativeAnalysis),
    ).toThrow();
  });
});

describe('reference comparison without editorial approval', () => {
  it('distinguishes exact equality, limited normalization, changed output and missing references', () => {
    expect(compareReference('eporoapiti umẽ', 'eporoapiti umẽ').kind).toBe('exact');
    expect(compareReference('eporoapiti umẽ.', 'eporoapiti umẽ').kind).toBe('normalized');
    expect(compareReference('  eporoapiti umẽ  ', 'eporoapiti umẽ')).toMatchObject({
      kind: 'normalized',
      message: expect.stringContaining('espaços'),
    });
    expect(compareReference('eporoapiti umẽ .', 'eporoapiti umẽ')).toMatchObject({
      kind: 'normalized',
      message: expect.stringContaining('espaços'),
    });
    expect(compareReference('eporoapiti  umẽ', 'eporoapiti umẽ').kind).toBe('different');
    expect(compareReference('eporoapiti umẽ...', 'eporoapiti umẽ').kind).toBe('different');
    expect(compareReference('eporoapiti', 'eporoapiti umẽ').kind).toBe('different');
    expect(compareReference('eporoapiti umẽ', null).kind).toBe('missing');
  });

  it('never strips meaningful diacritics or claims byte equality for Unicode variants', () => {
    expect(compareReference('ume', 'umẽ').kind).toBe('different');
    expect(compareReference('umẽ'.normalize('NFD'), 'umẽ'.normalize('NFC')).kind).toBe('different');
  });
});

describe('browser draft persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  function storage() {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    return values;
  }

  function envelope(): DraftEnvelope {
    const draft = createDraft(passage());
    return { version: 1, projectId: 'project:one', drafts: { [draft.passageId]: draft } };
  }

  it('round-trips drafts by project and validates passage identity', () => {
    storage();
    const data = envelope();
    expect(readBrowserDrafts(data.projectId)).toBeNull();
    writeBrowserDrafts(data);
    expect(readBrowserDrafts(data.projectId)).toEqual(data);
    expect(readBrowserDrafts('project:two')).toBeNull();
    expect(validateDraftEnvelope(data, 'project:two')).toBe(false);
    expect(
      validateDraftEnvelope({ ...data, drafts: { wrong: Object.values(data.drafts)[0] } }),
    ).toBe(false);
  });

  it('preserves corrupted saved data instead of replacing it after a load failure', () => {
    const values = storage();
    const data = envelope();
    const key = browserDraftKey(data.projectId);
    values.set(key, '{broken');
    expect(() => readBrowserDrafts(data.projectId)).toThrow(/preservados/);
    expect(() => writeBrowserDrafts(data)).toThrow(/preservados/);
    expect(values.get(key)).toBe('{broken');
  });

  it('rejects unsupported versions, extra editorial fields and invalid analyses', () => {
    const data = envelope();
    const draft = Object.values(data.drafts)[0]!;
    expect(validateDraftEnvelope({ ...data, version: 2 })).toBe(false);
    expect(
      validateDraftEnvelope({
        ...data,
        drafts: { [draft.passageId]: { ...draft, status: 'approved' } },
      }),
    ).toBe(false);
    expect(
      validateDraftEnvelope({
        ...data,
        drafts: { [draft.passageId]: { ...draft, analysis: { ...analysis, predicate: 'potar' } } },
      }),
    ).toBe(false);
  });
});

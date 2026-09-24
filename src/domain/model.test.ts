import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserDraftKey,
  compareReference,
  createDraft,
  draftConflicts,
  expressionFor,
  isCurrentRender,
  readBrowserDrafts,
  restoreDraft,
  samePassageReading,
  updateDraft,
  validateDraftEnvelope,
  writeBrowserDrafts,
} from './model';
import type { DraftEnvelope, ImperativeAnalysis, Passage, RenderResult } from './types';
import type { CanvasState } from './canvas';

function canvas(): CanvasState {
  return {
    fragments: [{ id: 'orphan', raw: '(emi * tym) # rascunho 🦜', x: 430, y: -80 }],
    positions: { 'main:root': { x: 10, y: 20 }, 'orphan:root': { x: 450, y: -50 } },
  };
}

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
  it('changes raw and its detached forest atomically without touching the prior revision', () => {
    const draft = { ...createDraft(passage()), canvas: canvas() };
    const before = structuredClone(draft);
    const nextCanvas = { ...canvas(), positions: { 'main:root': { x: 90, y: 70 } } };
    const edited = updateDraft(draft, { raw: 'no * __studio_slot_a1', canvas: nextCanvas });
    expect(edited.raw).toBe('no * __studio_slot_a1');
    expect(edited.canvas).toEqual(nextCanvas);
    expect(edited.analysis).toBeNull();
    expect(edited.revisionId).not.toBe(draft.revisionId);
    expect(draft).toEqual(before);
    nextCanvas.fragments[0].raw = 'future change';
    expect(edited.canvas!.fragments[0].raw).toBe('(emi * tym) # rascunho 🦜');
    expect(restoreDraft(edited, passage()).canvas).toEqual(edited.canvas);
  });

  it('invalidates only main positions after external source edits and keeps all orphan work', () => {
    const draft = { ...createDraft(passage()), canvas: canvas() };
    const edited = updateDraft(draft, { raw: 'no + tym' });
    expect(edited.canvas).toEqual({
      ...canvas(),
      positions: { 'orphan:root': { x: 450, y: -50 } },
    });
    expect(updateDraft(draft, { notes: 'nota' }).canvas).toEqual(canvas());
    expect(updateDraft(draft, { raw: draft.raw }).canvas).toEqual(canvas());
    expect(() =>
      updateDraft(draft, { canvas: { ...canvas(), positions: { 'main:root': { x: NaN, y: 0 } } } }),
    ).toThrow(/inválidos/);
  });
  it('migrates proved first-version drafts while preserving revision, notes and imperative edits', () => {
    const source = { ...passage(), legacyExpressionFingerprint: 'source:legacy' };
    const old = createDraft(source);
    delete old.raw;
    delete old.locators;
    old.sourceFingerprint = 'source:legacy';
    old.analysis = { ...analysis, negated: false };
    const restored = restoreDraft(old, source);
    expect(restored.raw).toBe('(+nde * apiti * moro).imp()');
    expect(restored.revisionId).toBe(old.revisionId);
    expect(draftConflicts(restored, source)).toBe(false);
    expect(old.raw).toBeUndefined();
    const edited = restoreDraft({ ...old, notes: 'My retained note' }, source);
    expect(edited.notes).toBe('My retained note');
    expect(draftConflicts(edited, source)).toBe(true);
    expect(
      restoreDraft({ ...old, sourceFingerprint: 'unrelated-source' }, source).raw,
    ).toBeUndefined();
  });
  it('validates local completion independently of reference approval', () => {
    const draft = {
      ...createDraft(passage()),
      workflow: { stage: 'complete' as const, updatedAt: new Date().toISOString() },
    };
    const envelope = { version: 1, projectId: 'p', drafts: { [draft.passageId]: draft } };
    expect(validateDraftEnvelope(envelope)).toBe(true);
    expect(
      validateDraftEnvelope({
        ...envelope,
        drafts: {
          [draft.passageId]: { ...draft, workflow: { ...draft.workflow, stage: 'approved' } },
        },
      }),
    ).toBe(false);
  });
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

  it('round-trips partial main expressions, incomplete orphan text and layout after restart', () => {
    storage();
    const data = envelope();
    const draft = Object.values(data.drafts)[0];
    data.drafts[draft.passageId] = updateDraft(draft, {
      raw: 'tym * __studio_slot_a1',
      canvas: {
        ...canvas(),
        fragments: [
          ...canvas().fragments,
          { id: 'unfinished', raw: 'helper( # continuar', x: 800, y: 40 },
        ],
      },
    });
    writeBrowserDrafts(data);
    const restored = readBrowserDrafts(data.projectId)!;
    expect(restored).toEqual(data);
    expect(restoreDraft(restored.drafts[draft.passageId], passage()).canvas).toEqual(
      data.drafts[draft.passageId].canvas,
    );
  });

  it('refuses invalid saved canvas data instead of discarding orphan fragments during autosave', () => {
    const values = storage();
    const data = envelope();
    const id = Object.keys(data.drafts)[0];
    data.drafts[id].canvas = canvas();
    const malformed = structuredClone(data);
    malformed.drafts[id].canvas!.fragments[0].id = 'main';
    const saved = JSON.stringify(malformed);
    values.set(browserDraftKey(data.projectId), saved);
    expect(validateDraftEnvelope(malformed)).toBe(false);
    expect(() => readBrowserDrafts(data.projectId)).toThrow(/preservados/);
    expect(() => writeBrowserDrafts(data)).toThrow(/preservados/);
    expect(values.get(browserDraftKey(data.projectId))).toBe(saved);
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

describe('independent passage translations', () => {
  it('preserves both languages, clears one, roundtrips drafts, and never labels legacy text', () => {
    const source = { ...passage(), translation: 'unlabelled earlier text' };
    const old = createDraft(source);
    expect(old.translations).toBeUndefined();
    const next = updateDraft(old, {
      translations: { pt: ' primeira\n\nsegunda ', en: 'first\nsecond' },
    });
    expect(next.translation).toBe(source.translation);
    expect(old.translations).toBeUndefined();
    const saved = {
      version: 1 as const,
      projectId: 'translation-test',
      drafts: { [source.id]: next },
    };
    const reloaded = JSON.parse(JSON.stringify(saved));
    expect(validateDraftEnvelope(reloaded, saved.projectId)).toBe(true);
    expect(reloaded.drafts[source.id].translations).toEqual(next.translations);
    const cleared = updateDraft(next, { translations: { ...next.translations, pt: '' } });
    expect(cleared.translations).toEqual({ pt: '', en: 'first\nsecond' });
    expect(cleared.translation).toBe(source.translation);
    expect(() => updateDraft(next, { translations: { pt: 7 } as never })).toThrow();
    expect(() => updateDraft(next, { translations: { fr: 'bonjour' } as never })).toThrow();
  });
});

it('migrates the previous editorial fingerprint without discarding unsaved work', () => {
  const source = { ...passage(), legacyEditorialFingerprint: 'old-editorial' };
  const draft = {
    ...createDraft(source),
    sourceFingerprint: 'old-editorial',
    raw: 'other * tree',
    notes: 'unsaved',
    canvas: canvas(),
  };
  const restored = restoreDraft(draft, source);
  expect(restored).toEqual({ ...draft, sourceFingerprint: source.sourceFingerprint });
  expect(draftConflicts(restored, source)).toBe(false);
});

it('formatting migration requires matching human text, translations and locators', () => {
  const source = passage();
  const draft = createDraft(source);
  expect(samePassageReading(draft, source)).toBe(true);
  for (const change of [
    { notes: 'new note' },
    { translations: { pt: 'new' } },
    { locators: { ...draft.locators, section: 'new section' } },
    { diplomatic: 'new text' },
  ])
    expect(samePassageReading({ ...draft, ...change }, source)).toBe(false);
});

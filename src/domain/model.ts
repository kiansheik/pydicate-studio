import type { Draft, DraftEnvelope, ImperativeAnalysis, Passage, RenderResult } from './types';
import { clearCanvasPositions, isCanvasState } from './canvas';
import { isPassageTranslations, sameTranslations } from './translations';

type DraftChanges = Partial<
  Pick<
    Draft,
    | 'diplomatic'
    | 'normalized'
    | 'translation'
    | 'translations'
    | 'notes'
    | 'analysis'
    | 'raw'
    | 'locators'
    | 'canvas'
    | 'aiInput'
  >
>;
export type ReferenceComparison = {
  kind: 'exact' | 'normalized' | 'different' | 'missing';
  message: string;
};

let revisionCounter = 0;

function revisionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  revisionCounter += 1;
  return `draft-${Date.now().toString(36)}-${revisionCounter}-${Math.random().toString(36).slice(2)}`;
}

export function isImperativeAnalysis(value: unknown): value is ImperativeAnalysis {
  if (!isObject(value)) return false;
  return (
    value.kind === 'imperative' &&
    value.predicate === 'apiti' &&
    value.subject === 'nde' &&
    value.object === 'moro' &&
    typeof value.hiddenSubject === 'boolean' &&
    typeof value.negated === 'boolean' &&
    (value.mood === 'imperative' || value.mood === 'indicative') &&
    hasOnlyKeys(value, [
      'kind',
      'predicate',
      'subject',
      'object',
      'hiddenSubject',
      'mood',
      'negated',
    ])
  );
}

/** Serializes the supported structure only. Morphology is always evaluated by Python. */
export function expressionFor(analysis: ImperativeAnalysis): string {
  if (!isImperativeAnalysis(analysis))
    throw new Error('Esta construção ainda não tem um editor visual.');
  const clause = `(${analysis.hiddenSubject ? '+' : ''}nde * apiti * moro)`;
  const mood = analysis.mood === 'imperative' ? '.imp()' : '';
  return `${analysis.negated ? '-' : ''}${clause}${mood}`;
}

export function createDraft(passage: Passage): Draft {
  return {
    passageId: passage.id,
    locators: {
      printedPage: passage.witness.printedPage ?? '',
      folio: passage.witness.folio ?? '',
      line: passage.witness.textualLine == null ? '' : String(passage.witness.textualLine),
      section: passage.witness.section ?? '',
      subsection: passage.witness.subsection ?? '',
    },
    raw: passage.sourceExpression,
    revisionId: revisionId(),
    sourceFingerprint: passage.sourceFingerprint,
    diplomatic: passage.diplomatic,
    normalized: passage.normalized,
    translation: passage.translation,
    ...(passage.translations ? { translations: { ...passage.translations } } : {}),
    notes: passage.notes,
    analysis: passage.analysis ? { ...passage.analysis } : null,
    updatedAt: new Date().toISOString(),
  };
}

/** Baselines, source identity and approval are deliberately outside a draft's editable fields. */
export function updateDraft(draft: Draft, changes: DraftChanges): Draft {
  if (changes.translations !== undefined && !isPassageTranslations(changes.translations))
    throw new Error('Traduções por idioma inválidas.');
  if (changes.canvas !== undefined && !isCanvasState(changes.canvas))
    throw new Error('A área de trabalho contém dados inválidos.');
  const raw =
    changes.raw !== undefined
      ? changes.raw
      : changes.analysis
        ? expressionFor(changes.analysis)
        : draft.raw;
  const next = {
    ...draft,
    ...(changes.aiInput !== undefined ? { aiInput: { ...changes.aiInput } } : {}),
    locators: changes.locators ?? draft.locators,
    raw,
    ...(changes.canvas !== undefined
      ? { canvas: structuredClone(changes.canvas) }
      : raw !== draft.raw && draft.canvas
        ? { canvas: clearCanvasPositions(draft.canvas) }
        : {}),
    diplomatic: changes.diplomatic ?? draft.diplomatic,
    normalized: changes.normalized ?? draft.normalized,
    translation: changes.translation ?? draft.translation,
    ...(changes.translations !== undefined ? { translations: { ...changes.translations } } : {}),
    notes: changes.notes ?? draft.notes,
    analysis:
      changes.raw !== undefined
        ? null
        : changes.analysis === undefined
          ? draft.analysis
          : changes.analysis,
    revisionId: revisionId(),
    updatedAt: new Date().toISOString(),
  };
  if (next.analysis) next.analysis = { ...next.analysis };
  return next;
}

export function draftConflicts(draft: Draft, passage: Passage): boolean {
  return draft.passageId !== passage.id || draft.sourceFingerprint !== passage.sourceFingerprint;
}

/** Upgrade only a proved legacy source identity; preserve all human work and revisions. */
export function restoreDraft(saved: Draft | undefined, passage: Passage): Draft {
  if (!saved) return createDraft(passage);
  const legacy = saved.sourceFingerprint === passage.legacyExpressionFingerprint;
  const sameSource = saved.sourceFingerprint === passage.sourceFingerprint;
  if (saved.passageId !== passage.id || (!legacy && !sameSource)) return saved;
  const humanUnchanged =
    (['diplomatic', 'normalized', 'translation', 'notes'] as const).every(
      (field) => saved[field] === passage[field],
    ) && sameTranslations(saved.translations, passage.translations);
  return {
    ...saved,
    raw: saved.raw ?? (saved.analysis ? expressionFor(saved.analysis) : passage.sourceExpression),
    locators: { ...createDraft(passage).locators, ...saved.locators },
    sourceFingerprint:
      sameSource || (legacy && humanUnchanged)
        ? passage.sourceFingerprint
        : saved.sourceFingerprint,
  };
}

function normalizeReference(value: string): string {
  // Matches authoring.records.normalize_surface: trim, remove ONE final .;:!?, trim.
  return value
    .trim()
    .replace(/[.;:!?]$/, '')
    .trim();
}

function normalizationRemovesWhitespace(value: string): boolean {
  const withoutPunctuation = value.trim().replace(/[.;:!?]$/, '');
  return value !== value.trim() || withoutPunctuation !== withoutPunctuation.trim();
}

export function compareReference(actual: string, expected: string | null): ReferenceComparison {
  if (expected === null) return { kind: 'missing', message: 'Sem referência salva para comparar.' };
  if (actual === expected) {
    return {
      kind: 'exact',
      message: 'Resultado idêntico à referência salva. A revisão editorial continua independente.',
    };
  }
  if (normalizeReference(actual) === normalizeReference(expected)) {
    const edgeWhitespace =
      normalizationRemovesWhitespace(actual) || normalizationRemovesWhitespace(expected);
    return {
      kind: 'normalized',
      message: edgeWhitespace
        ? 'Coincide após normalização; há espaços nas extremidades e pode haver diferença na pontuação final. Não é igualdade exata.'
        : 'Coincide apenas após retirar a pontuação final. Não é igualdade exata.',
    };
  }
  return {
    kind: 'different',
    message: 'O resultado difere da referência salva; a referência foi preservada.',
  };
}

export function isCurrentRender(
  result: RenderResult | null | undefined,
  draft: Draft,
  engineFingerprint: string,
): boolean {
  return (
    !!result &&
    result.revisionId === draft.revisionId &&
    result.engineFingerprint === engineFingerprint &&
    result.expression === (draft.raw ?? (draft.analysis ? expressionFor(draft.analysis) : ''))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isDraft(value: unknown, passageId: string): value is Draft {
  if (!isObject(value)) return false;
  return (
    value.passageId === passageId &&
    passageId.length > 0 &&
    typeof value.revisionId === 'string' &&
    value.revisionId.length > 0 &&
    typeof value.sourceFingerprint === 'string' &&
    value.sourceFingerprint.length > 0 &&
    ['diplomatic', 'normalized', 'translation', 'notes'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    (value.translations === undefined || isPassageTranslations(value.translations)) &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    (value.raw === undefined || (typeof value.raw === 'string' && value.raw.length <= 100000)) &&
    (value.canvas === undefined || isCanvasState(value.canvas)) &&
    (value.aiInput === undefined ||
      (isObject(value.aiInput) &&
        hasOnlyKeys(value.aiInput, ['tentativeReading', 'meaning', 'constraints']) &&
        ['tentativeReading', 'meaning', 'constraints'].every(
          (key) =>
            typeof (value.aiInput as Record<string, unknown>)[key] === 'string' &&
            String((value.aiInput as Record<string, unknown>)[key]).length <= 100000,
        ))) &&
    (value.aiAcceptances === undefined ||
      (Array.isArray(value.aiAcceptances) &&
        value.aiAcceptances.length <= 1000 &&
        value.aiAcceptances.every(
          (receipt) =>
            isObject(receipt) &&
            [
              'operationId',
              'jobId',
              'candidateId',
              'candidateRevision',
              'baseRevisionId',
              'revisionId',
              'at',
            ].every(
              (key) => typeof receipt[key] === 'string' && String(receipt[key]).length <= 256,
            ),
        ))) &&
    (value.pending === undefined ||
      (passageId.startsWith('pending:') &&
        isObject(value.pending) &&
        hasOnlyKeys(value.pending, [
          'sourceId',
          'previousPassageId',
          'beforePassageId',
          'ordinal',
        ]) &&
        (value.pending.beforePassageId === undefined ||
          value.pending.beforePassageId === null ||
          (typeof value.pending.beforePassageId === 'string' &&
            value.pending.beforePassageId.length > 0 &&
            value.pending.beforePassageId.length <= 200)) &&
        typeof value.pending.sourceId === 'string' &&
        /^[a-zA-Z0-9_-]{1,200}$/.test(value.pending.sourceId) &&
        Number.isSafeInteger(value.pending.ordinal) &&
        Number(value.pending.ordinal) > 0 &&
        (value.pending.previousPassageId === undefined ||
          (typeof value.pending.previousPassageId === 'string' &&
            value.pending.previousPassageId.length > 0 &&
            value.pending.previousPassageId.length <= 200)))) &&
    (value.locators === undefined ||
      (isObject(value.locators) &&
        hasOnlyKeys(value.locators, ['printedPage', 'folio', 'line', 'section', 'subsection']) &&
        Object.values(value.locators).every((v) => typeof v === 'string' && v.length <= 1000))) &&
    (value.analysis === null || isImperativeAnalysis(value.analysis)) &&
    (value.workflow === undefined ||
      (isObject(value.workflow) &&
        hasOnlyKeys(value.workflow, ['stage', 'updatedAt']) &&
        ['analysis', 'review', 'complete'].includes(String(value.workflow.stage)) &&
        typeof value.workflow.updatedAt === 'string' &&
        Number.isFinite(Date.parse(value.workflow.updatedAt)))) &&
    hasOnlyKeys(value, [
      'passageId',
      'revisionId',
      'sourceFingerprint',
      'diplomatic',
      'normalized',
      'translation',
      'translations',
      'notes',
      'analysis',
      'raw',
      'locators',
      'updatedAt',
      'workflow',
      'canvas',
      'pending',
      'aiInput',
      'aiAcceptances',
    ])
  );
}

export function validateDraftEnvelope(
  value: unknown,
  expectedProjectId?: string,
): value is DraftEnvelope {
  if (!isObject(value) || value.version !== 1 || !isObject(value.drafts)) return false;
  return (
    typeof value.projectId === 'string' &&
    value.projectId.length > 0 &&
    (expectedProjectId === undefined || value.projectId === expectedProjectId) &&
    hasOnlyKeys(value, ['version', 'projectId', 'drafts', 'storageRevision']) &&
    (value.storageRevision === undefined ||
      (Number.isSafeInteger(value.storageRevision) && Number(value.storageRevision) >= 0)) &&
    Object.entries(value.drafts).every(
      ([id, draft]) =>
        !['__proto__', 'prototype', 'constructor'].includes(id) && isDraft(draft, id),
    )
  );
}

export function browserDraftKey(projectId: string): string {
  return `pydicate-studio:drafts:v1:${projectId}`;
}

export function readBrowserDrafts(projectId: string): DraftEnvelope | null {
  const text = globalThis.localStorage.getItem(browserDraftKey(projectId));
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Os rascunhos salvos não puderam ser lidos. Os dados originais foram preservados.',
    );
  }
  if (!validateDraftEnvelope(parsed, projectId)) {
    throw new Error('Formato de rascunhos incompatível. Os dados originais foram preservados.');
  }
  return parsed;
}

export function writeBrowserDrafts(envelope: DraftEnvelope): void {
  if (!validateDraftEnvelope(envelope))
    throw new Error('Não foi possível salvar: o rascunho é inválido.');
  // Refuse to silently replace malformed/unsupported data even after the caller caught a load error.
  readBrowserDrafts(envelope.projectId);
  globalThis.localStorage.setItem(browserDraftKey(envelope.projectId), JSON.stringify(envelope));
}

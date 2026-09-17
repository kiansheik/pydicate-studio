import type { Draft, DraftEnvelope, ImperativeAnalysis, Passage, RenderResult } from './types';

type DraftChanges = Partial<
  Pick<Draft, 'diplomatic' | 'normalized' | 'translation' | 'notes' | 'analysis'>
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
    revisionId: revisionId(),
    sourceFingerprint: passage.sourceFingerprint,
    diplomatic: passage.diplomatic,
    normalized: passage.normalized,
    translation: passage.translation,
    notes: passage.notes,
    analysis: passage.analysis ? { ...passage.analysis } : null,
    updatedAt: new Date().toISOString(),
  };
}

/** Baselines, source identity and approval are deliberately outside a draft's editable fields. */
export function updateDraft(draft: Draft, changes: DraftChanges): Draft {
  const next = {
    ...draft,
    diplomatic: changes.diplomatic ?? draft.diplomatic,
    normalized: changes.normalized ?? draft.normalized,
    translation: changes.translation ?? draft.translation,
    notes: changes.notes ?? draft.notes,
    analysis: changes.analysis === undefined ? draft.analysis : changes.analysis,
    revisionId: revisionId(),
    updatedAt: new Date().toISOString(),
  };
  if (next.analysis) next.analysis = { ...next.analysis };
  return next;
}

export function draftConflicts(draft: Draft, passage: Passage): boolean {
  return draft.passageId !== passage.id || draft.sourceFingerprint !== passage.sourceFingerprint;
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
    draft.analysis !== null &&
    result.expression === expressionFor(draft.analysis)
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
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    (value.analysis === null || isImperativeAnalysis(value.analysis)) &&
    hasOnlyKeys(value, [
      'passageId',
      'revisionId',
      'sourceFingerprint',
      'diplomatic',
      'normalized',
      'translation',
      'notes',
      'analysis',
      'updatedAt',
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
    hasOnlyKeys(value, ['version', 'projectId', 'drafts']) &&
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

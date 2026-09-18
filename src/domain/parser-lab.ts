/** Hidden Tupi → Pydicate laboratory: renderer contract and pure helpers.
 *
 * Python owns the normalization profile. The mirror here exists only so the
 * textbox can preview the observation while typing; every analysis uses the
 * value Python computed. `parser-lab-fixtures.json` is checked by both sides,
 * so a divergence fails a test instead of silently steering the search.
 */
import fixtures from './parser-lab-fixtures.json';

export const LAB_ENABLED_KEY = 'studio-parser-lab-enabled';
export const LAB_PROFILE = 'lab-v1';
export const LAB_MAX_INPUT = 400;
/** Apostrophes are meaningful in Tupi orthography and are never removed. */
export const LAB_PUNCTUATION = '.,;:!?"“”«»()[]{}…—–-/\\|*_';

export interface LabInputProfile {
  profile: string;
  raw: string;
  normalized: string;
  removedPunctuation: string[];
  note: string;
}

export interface LabMorpheme {
  occurrence: number;
  surface: string;
  tags: string[];
  provenance: string;
}

export interface LabCandidate {
  schemaVersion: number;
  source: string;
  surface: string;
  normalized: string;
  route: string;
  family: string;
  bindings: Record<string, string>;
  spans: { type: string; start: number; end: number }[];
  score: number;
  scoreMeaning: string;
  features: Record<string, number>;
  completeness: 'complete' | 'partial' | 'unknown';
  annotated: string;
  morphemes: LabMorpheme[];
  provenance: Record<string, unknown> & {
    route?: string;
    label?: string;
    rootRule?: string;
    measuresGeneralization?: boolean;
    equivalentSources?: string[];
    occurrences?: { sourceId: string; ordinal: number; line: number }[];
  };
  editable: boolean;
  seconds: number;
}

export interface LabRejection {
  code: string;
  count: number;
  message: string;
  detail?: string;
}

export interface LabResult {
  schemaVersion: number;
  astSchemaVersion: number;
  input: LabInputProfile;
  context: LabContext;
  artifacts: {
    index: string | null;
    ranker: string | null;
    indexCounts?: Record<string, unknown>;
    indexRecipe?: Record<string, unknown>;
  };
  candidates: LabCandidate[];
  best: LabCandidate | null;
  rejections: LabRejection[];
  timings: Record<string, number>;
  status: 'complete' | 'partial' | 'unknown';
  message: string;
  configuration: {
    diagnostics?: {
      spans: number;
      assemblies: number;
      budgetExhausted: string | null;
      knownExpression: boolean;
    };
    ranker?: boolean;
    seconds?: number;
  };
  coordinateSystem: string;
  alignmentNote: string;
}

export interface LabContext {
  sourceId: string;
  line: number;
  answerFree: boolean;
  normalizerProfile: string;
  fingerprint: string;
  lexemeCount: number;
}

export interface LabArtifact {
  artifactId: string;
  kind: string;
  status: string;
  completed: boolean;
  createdAt?: string;
  counts: Record<string, number>;
  metrics: Record<string, unknown>;
  recipe: Record<string, unknown>;
  parents: string[];
  contextFingerprint: string | null;
}

export interface LabJob {
  id: string;
  stage: 'prepare' | 'train' | 'evaluate';
  profile: string | null;
  status: 'running' | 'cancelling' | 'cancelled' | 'succeeded' | 'failed' | 'interrupted';
  phase: string;
  progress: Record<string, unknown>[];
  startedAt: string;
  finishedAt: string | null;
  artifactId: string | null;
  error: string | null;
  result: { counts?: Record<string, number>; metrics?: Record<string, unknown> } | null;
}

export interface LabProfile {
  profile: string;
  label: string;
  description: string;
  families: string[];
  rootRules: string[];
  limits: Record<string, number>;
  holdout?: { lexemes?: string[]; families?: string[] };
  estimatedBytes: number | null;
  inventoryCounts: Record<string, number>;
}

export interface LabStatus {
  projectId: string;
  engineFingerprint: string;
  artifactRoot: string;
  artifacts: LabArtifact[];
  active: Record<string, string>;
  interrupted: { name: string; lastStage: string | null; counts: Record<string, number> }[];
  exists: boolean;
  profiles: LabProfile[];
  jobs: LabJob[];
  busy: boolean;
  workerRunning: boolean;
  note: string;
}

// Built from escapes: a formatter must not be able to flatten these classes
// into invisible literal control characters.
const APOSTROPHES = new RegExp('[\\u2019\\u02bc\\u2018]', 'g');
// Python's str.split() whitespace set, which is wider than the default JS one.
const WHITESPACE = new RegExp('[\\s\\u0085\\u001c-\\u001f]+', 'gu');
const COMBINING = /\p{M}/gu;

function stripPunctuation(value: string) {
  return Array.from(value)
    .map((character) => (LAB_PUNCTUATION.includes(character) ? ' ' : character))
    .join('');
}

/** Mirror of `parser_lab.normalization.normalize`. Python remains authoritative. */
export function normalizeLabInput(value: string) {
  return stripPunctuation(value)
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(WHITESPACE, '')
    .normalize('NFD')
    .replace(COMBINING, '');
}

export function previewLabInput(value: string): LabInputProfile & { error?: string } {
  const raw = value.normalize('NFC');
  const normalized = normalizeLabInput(raw);
  const removed = Array.from(new Set(Array.from(raw).filter((c) => LAB_PUNCTUATION.includes(c))));
  const error =
    raw.length > LAB_MAX_INPUT
      ? `Texto muito longo para o laboratório (máximo ${LAB_MAX_INPUT} caracteres).`
      : !normalized
        ? 'Escreva uma frase em tupi para analisar.'
        : undefined;
  return {
    profile: LAB_PROFILE,
    raw,
    normalized,
    removedPunctuation: removed.sort(),
    note: 'Espaços, maiúsculas e acentos são descartados. Ortografia histórica e correção de OCR não são aplicadas nesta versão.',
    ...(error ? { error } : {}),
  };
}

/** The committed cases both the Python and the renderer tests must satisfy. */
export const normalizationFixtures = fixtures as { input: string; normalized: string }[];

export function routeLabel(candidate: LabCandidate) {
  const route = String(candidate.provenance.route ?? candidate.route);
  if (route === 'retrieval') return 'Recuperada do corpus';
  if (route === 'composition') return 'Composta de fragmentos';
  if (route === 'neural') return 'Proposta por modelo';
  if (route === 'agent') return 'Proposta assistida';
  return 'Ordenada por classificador';
}

export function jobLabel(job: LabJob) {
  const stage =
    job.stage === 'prepare' ? 'Preparação' : job.stage === 'train' ? 'Treino' : 'Avaliação';
  const status = {
    running: 'em andamento',
    cancelling: 'cancelando',
    cancelled: 'cancelado',
    succeeded: 'concluído',
    failed: 'falhou',
    interrupted: 'interrompido',
  }[job.status];
  return `${stage} · ${status}`;
}

/** An artifact is usable only when complete *and* built under this engine. */
export function artifactUsable(artifact: LabArtifact, engineContextFingerprint: string | null) {
  if (!artifact.completed) return false;
  if (!engineContextFingerprint) return true;
  return artifact.contextFingerprint === engineContextFingerprint;
}

export function activeArtifact(status: LabStatus | null, kind: string) {
  if (!status) return null;
  const id = status.active?.[kind];
  return id ? (status.artifacts.find((item) => item.artifactId === id) ?? null) : null;
}

export function describeAmbiguity(result: LabResult | null) {
  if (!result) return '';
  const count = result.candidates.length;
  if (!count) return 'Nenhuma análise completa foi validada.';
  if (count === 1) return 'Uma análise completa foi validada nesta configuração.';
  return `${count} análises estruturalmente distintas foram validadas. A entrada é ambígua nesta configuração.`;
}

export function formatBytes(value: number | null | undefined) {
  if (!value && value !== 0) return 'desconhecido';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

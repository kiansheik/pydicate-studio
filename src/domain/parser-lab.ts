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

export interface LabLexicalHint {
  root: string;
  category: 'proper_noun' | 'noun' | 'intransitive_verb' | 'transitive_verb' | 'second_class_verb';
}

export interface LabLexicalEvidence {
  origin: 'navarro' | 'shared' | 'user-hypothesis';
  headword: string;
  definition?: string;
  lexicalStatus?: 'hypothetical';
  senseId?: string;
  category?: string;
  entryIndex?: number;
  optionalNumber?: string | number | null;
  scope?: 'component' | 'whole';
}

export const LAB_MAX_LEXICAL_HINTS = 8;

export const lexicalHintCategories: { value: LabLexicalHint['category']; label: string }[] = [
  { value: 'proper_noun', label: 'Nome próprio' },
  { value: 'noun', label: 'Substantivo' },
  { value: 'intransitive_verb', label: 'Verbo intransitivo' },
  { value: 'transitive_verb', label: 'Verbo transitivo' },
  { value: 'second_class_verb', label: 'Verbo de segunda classe' },
];

/** Blank rows are form controls, never inferred roots sent to the engine. */
export function lexicalHintsForRequest(hints: LabLexicalHint[]) {
  return hints.map((hint) => ({ ...hint, root: hint.root.trim() })).filter((hint) => hint.root);
}

export interface LabDecomposition {
  relation: 'surface-linked';
  source: string;
  dictionaryHeadword: string;
  senseId?: string;
  definition: string;
  span?: { type: string; start: number; end: number };
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
    /** 'presumed' until a contributor decides between co-generating readings.
     *  'not-preferred' means it was on screen when another was chosen — still a
     *  possible reading, just not the one preferred. */
    acceptance?: 'presumed' | 'confirmed' | 'not-preferred' | 'rejected';
    coGenerating?: boolean;
    /** Other sources the engine annotates identically: one answer, another spelling. */
    annotationIdenticalSources?: string[];
    annotationDifferenceFromBest?: AnnotationDifference[];
    lexicalStatus?: 'resolved' | 'provisional';
    lexicalEvidence?: LabLexicalEvidence[];
    decomposition?: LabDecomposition;
    decompositions?: LabDecomposition[];
  };
  editable: boolean;
  seconds: number;
}

/** Where two readings disagree in the grammar's own annotation. */
export interface AnnotationDifference {
  position: number;
  surface: string;
  left: string[] | null;
  right: string[] | null;
  onlyTags: boolean;
}

export interface LabFeedback {
  summary: {
    attempts: number;
    attemptsComplete: number;
    attemptsUnknown: number;
    judgments: number;
    verdicts: Record<string, number>;
    confirmedExamples: number;
    preferencePairs: number;
    coverageGaps: number;
    correctionsTheSearchNeverProposed: number;
    note: string;
  };
  coverageGaps: {
    normalized: string;
    attempts: number;
    rawInput: string;
    recognizedSpans: { start: number; end: number; text: string; types: string[] }[];
    rejections: string[];
  }[];
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
      truncated?: boolean;
      candidateTotal?: number;
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
  if (candidateDecompositions(candidate).length) return 'Análise decomposta';
  if (candidate.family === 'lexical') return 'Verbete direto';
  const route = String(candidate.provenance.route ?? candidate.route);
  if (route === 'retrieval') return 'Recuperada do corpus';
  if (route === 'composition') return 'Composta de fragmentos';
  if (route === 'morphology') return 'Reconstruída pela morfologia';
  if (route === 'neural') return 'Proposta por modelo';
  if (route === 'agent') return 'Proposta assistida';
  return 'Ordenada por classificador';
}

/** Display each linked constituent meaning once, including fragments nested in
 * a larger reading. The legacy singular field may repeat an array entry. */
export function candidateDecompositions(candidate: LabCandidate): LabDecomposition[] {
  const seen = new Set<string>();
  return [
    ...(candidate.provenance.decompositions ?? []),
    ...(candidate.provenance.decomposition ? [candidate.provenance.decomposition] : []),
  ].filter((item) => {
    const key = JSON.stringify([
      item.source,
      item.dictionaryHeadword,
      item.senseId,
      item.definition,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function candidateLexicalEvidence(candidate: LabCandidate): LabLexicalEvidence[] {
  const decompositions = candidateDecompositions(candidate);
  return (candidate.provenance.lexicalEvidence ?? []).filter(
    (evidence) =>
      evidence.scope !== 'whole' ||
      !decompositions.some(
        (item) =>
          item.dictionaryHeadword === evidence.headword &&
          item.definition === evidence.definition &&
          (!item.senseId || !evidence.senseId || item.senseId === evidence.senseId),
      ),
  );
}

/** The annotation difference between this reading and the first one, if any. */
export function annotationDifference(candidate: LabCandidate): AnnotationDifference[] {
  return candidate.provenance.annotationDifferenceFromBest ?? [];
}

/** Plain-language state of one reading for the contributor. */
export function acceptanceLabel(candidate: LabCandidate) {
  if (candidate.provenance.lexicalStatus === 'provisional')
    return 'Sintaxe provisória — raiz e significado a confirmar';
  const acceptance = candidate.provenance.acceptance ?? 'presumed';
  if (acceptance === 'confirmed') return 'Confirmada por você';
  if (acceptance === 'rejected') return 'Recusada por você';
  if (acceptance === 'not-preferred') return 'Leitura possível que você não escolheu';
  return candidate.provenance.coGenerating
    ? 'Leitura possível nesta busca — a forma não decide entre elas'
    : 'Leitura validada nesta busca';
}

export function lexicalEvidenceLabel(evidence: LabLexicalEvidence) {
  const scope =
    evidence.scope === 'whole'
      ? 'Significado do constituinte · '
      : evidence.scope === 'component'
        ? 'Peça da composição · '
        : '';
  const origin =
    evidence.origin === 'navarro'
      ? 'Navarro'
      : evidence.origin === 'shared'
        ? 'Léxico compartilhado'
        : 'Hipótese informada';
  const category =
    lexicalHintCategories.find((item) => item.value === evidence.category)?.label ??
    (
      {
        verb: 'Verbo',
        postposition: 'Posposição',
        adverb: 'Advérbio',
        pronoun: 'Pronome',
        adjective: 'Adjetivo',
        conjunction: 'Conjunção',
        interjection: 'Interjeição',
        particle: 'Partícula',
      } as Record<string, string>
    )[evidence.category ?? ''];
  const sense =
    evidence.optionalNumber !== undefined &&
    evidence.optionalNumber !== null &&
    evidence.optionalNumber !== ''
      ? ` · acepção ${evidence.optionalNumber}`
      : typeof evidence.entryIndex === 'number'
        ? ` · entrada ${evidence.entryIndex}`
        : '';
  const status = evidence.lexicalStatus === 'hypothetical' ? ' · hipótese não atestada' : '';
  return `${scope}${origin} · ${evidence.headword}${category ? ` (${category})` : ''}${sense}${status}: ${evidence.definition || 'significado não informado'}`;
}

export const DECOMPOSITION_NOTE =
  'A forma coincide com o verbete; a decomposição é uma hipótese a revisar.';

export function validationLabel(candidate: LabCandidate) {
  if (candidate.provenance.lexicalStatus === 'provisional')
    return 'O motor gera a forma inteira com a raiz e a categoria informadas. O significado e a existência dessa raiz continuam por confirmar.';
  return candidate.completeness === 'complete'
    ? 'Sintaxe editável, léxico resolvido, avaliação completa, forma idêntica à entrada normalizada.'
    : 'Análise incompleta.';
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
  return `${stage} · ${status}${job.status === 'running' && job.phase === 'lexicon' ? ' · carregando léxico e Navarro' : ''}`;
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
  const complete = result.candidates.filter(
    (candidate) => candidate.completeness === 'complete',
  ).length;
  const partial = count - complete;
  const readings = !count
    ? 'Nenhuma análise completa foi validada.'
    : !partial
      ? complete === 1
        ? 'Uma análise completa foi validada nesta busca.'
        : `${complete} análises estruturalmente distintas foram validadas nesta busca. A forma não decide entre elas.`
      : !complete
        ? `${partial === 1 ? 'Uma hipótese provisória gera' : `${partial} hipóteses provisórias geram`} a forma inteira; o léxico ainda precisa de confirmação.`
        : `${complete} ${complete === 1 ? 'análise completa e' : 'análises completas e'} ${partial} ${partial === 1 ? 'hipótese provisória foram encontradas' : 'hipóteses provisórias foram encontradas'} nesta busca.`;
  const diagnostics = result.configuration?.diagnostics;
  if (diagnostics?.truncated) {
    const total = diagnostics.candidateTotal;
    if (typeof total === 'number' && total > count)
      return `${readings} Exibindo ${count} de ${total} propostas; outras alternativas foram omitidas pelo limite de resultados.`;
    return `${readings} A busca atingiu seu limite; outras leituras podem existir.`;
  }
  if (diagnostics?.budgetExhausted)
    return `${readings} A busca atingiu seu limite; outras leituras podem existir.`;
  return readings;
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

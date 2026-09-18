import type { AuthorNode } from './authoring';
import type { CanvasState } from './canvas';
import type { RenderResult } from './types';
import type { Draft } from './types';
import type { EvidenceStatus } from './evidence';

export type AnalysisTask =
  | 'analyze'
  | 'translate-source'
  | 'translate-analysis'
  | 'explain'
  | 'revise'
  | 'grammar-repair';
export type AnalysisStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'needs-input'
  | 'ready-for-review'
  | 'blocked'
  | 'failed'
  | 'cancelled';
export const analysisLabels: Record<AnalysisStatus, string> = {
  queued: 'Na fila',
  running: 'Analisando',
  cancelling: 'Cancelando…',
  'needs-input': 'Precisa de você',
  'ready-for-review': 'Proposta pronta',
  blocked: 'Pausada',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};
export const analysisTasks: Record<AnalysisTask, string> = {
  analyze: 'Analisar passagem',
  'translate-source': 'Interpretar a fonte',
  'translate-analysis': 'Traduzir análise gerada',
  explain: 'Explicar seleção',
  revise: 'Revisar proposta',
  'grammar-repair': 'Corrigir gramática',
};
export interface AnalysisInput {
  description?: string;
  baseRevisionId: string;
  engineFingerprint: string;
  diplomatic: string;
  tentativeReading: string;
  meaning: string;
  reviewedTarget: string;
  task: AnalysisTask;
  scope: 'passage' | 'constituent';
  evidence?: {
    revision?: number;
    regions?: unknown[];
    images?: unknown[];
    assetId?: string;
    regionCount?: number;
    imageCount?: number;
    imagesSelected?: boolean;
  };
  provider?: string;
  model?: string;
  raw?: string;
}
export interface AnalysisJob {
  id: string;
  projectId: string;
  passageId: string;
  conversationId: string;
  input: AnalysisInput;
  status: AnalysisStatus;
  phase?: string;
  createdAt: string;
  updatedAt: string;
  error?: string | { message: string; code?: string };
  candidateIds: string[];
  questions: AnalysisQuestion[];
  summary?: string;
  events?: {
    type?: string;
    phase?: string;
    tool?: string;
    text?: string;
    at?: string;
    result?: unknown;
  }[];
  usage?: Record<string, number>;
  grammarVerification?: {
    surface?: string;
    intendedSurface?: string;
    matches?: boolean;
    error?: string;
    comparison?: ReturnType<typeof import('./grammar-regression').compareGrammarSnapshots>;
  };
  grammarEdits?: { id: string; path: string; oldText: string; newText: string }[];
}
export type AnalysisQuestion =
  | string
  | {
      id?: string;
      text: string;
      question?: string;
      candidateId?: string;
      candidateRevision?: string;
      nodeId?: string;
    };
export function preparedAnalysisInput(draft: Draft | undefined, evidence?: EvidenceStatus) {
  return (
    !!draft &&
    !!(
      draft.diplomatic.trim() ||
      draft.aiInput?.tentativeReading.trim() ||
      evidence?.passage?.regions.length
    )
  );
}
export interface AnalysisConversation {
  archived?: boolean;
  id: string;
  projectId: string;
  passageId: string;
  revision: number;
  composer: string;
  selectedCandidateId?: string;
  scrollTop?: number;
  turns: {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    jobId?: string;
    candidateId?: string;
    candidateRevision?: string;
    inputRevisionId: string;
    at: string;
  }[];
}
export function analysisActivity(job: AnalysisJob): string[] {
  const labels: Record<string, string> = {
    studio_guide: 'Guia de análise consultada',
    studio_context: 'Fonte e contexto consultados',
    studio_dictionary_search: 'Busca no dicionário',
    studio_dictionary_entry: 'Sentidos e exemplos consultados',
    studio_reuse_search: 'Busca de construções existentes',
    studio_reuse_resolve: 'Construção existente conferida',
    studio_lexicon_inspect: 'Léxico consultado',
    studio_candidate_create: 'Proposta criada',
    studio_candidate_edit: 'Estrutura ajustada',
    studio_candidate_evaluate: 'Proposta avaliada',
    studio_candidate_get: 'Proposta inspecionada',
    studio_candidate_propose: 'Proposta apresentada',
    studio_question: 'Pergunta para você',
    studio_evidence: 'Evidência consultada',
    grammar_context: 'Construção e contexto consultados',
    grammar_files: 'Regra localizada na gramática',
    grammar_read: 'Regra da gramática consultada',
    grammar_edit: 'Gramática corrigida e verificada',
    reload_engine: 'Gramática e corpus reavaliados',
    render_candidate: 'Contraste linguístico verificado',
  };
  return [
    ...new Set(
      (job.events ?? []).flatMap((event) =>
        event.tool && labels[event.tool] ? [labels[event.tool]] : [],
      ),
    ),
  ];
}
export interface AnalysisEvidence {
  kind?: string;
  label?: string;
  title?: string;
  text?: string;
  nodeId?: string;
  regionId?: string;
  headword?: string;
  entryId?: string | number;
  [key: string]: unknown;
}
export interface AnalysisCandidate {
  id: string;
  jobId: string;
  projectId: string;
  passageId: string;
  revisionId: string;
  raw: string;
  canvas?: CanvasState;
  tree?: AuthorNode;
  fragmentTrees?: { id: string; raw: string; root: AuthorNode | null }[];
  evaluation?: RenderResult & {
    fragments?: { id: string; result?: RenderResult; error?: { message: string } }[];
    error?: { message: string };
  };
  comparison?: {
    version?: number;
    diplomatic?: AnalysisComparison;
    tentative?: AnalysisComparison;
    reviewedTarget?: AnalysisComparison | null;
    exact?: boolean;
    spacingCase?: boolean;
    accentFolded?: boolean;
    [key: string]: unknown;
  };
  evidence: AnalysisEvidence[];
  rationale?: string;
  translation?: {
    text: string;
    language: 'pt';
    status: 'tentative';
    revisionId: string;
    expression: string;
    engineFingerprint: string;
    evaluatedSurface: string;
    uncertainties: string[];
  };
  uncertainties: string[];
  failures: (string | { message: string })[];
  status: 'scratch' | 'proposed';
  createdAt: string;
  updatedAt: string;
}
export function candidateTranslation(candidate: AnalysisCandidate) {
  const translation = candidate.translation;
  const evaluation = candidate.evaluation;
  return typeof translation?.text === 'string' &&
    !!translation.text.trim() &&
    Array.isArray(translation.uncertainties) &&
    translation.uncertainties.every((item) => typeof item === 'string') &&
    translation.language === 'pt' &&
    translation.status === 'tentative' &&
    evaluation?.evaluationStatus !== 'partial' &&
    !evaluation?.error &&
    translation.revisionId === candidate.revisionId &&
    translation.revisionId === evaluation?.revisionId &&
    translation.expression === candidate.raw &&
    translation.expression === evaluation?.expression &&
    translation.engineFingerprint === evaluation?.engineFingerprint &&
    translation.evaluatedSurface === evaluation?.surface
    ? translation
    : null;
}
export interface AnalysisComparison {
  version: number;
  actual: string;
  expected: string;
  exact: boolean;
  spacingCase: boolean;
  accentFolded: boolean;
}
export function comparisonLabel(
  value: { exact?: boolean; spacingCase?: boolean; accentFolded?: boolean } | undefined,
) {
  return value?.exact
    ? 'Coincide exatamente'
    : value?.spacingCase
      ? 'Coincide só ao ignorar espaços e maiúsculas'
      : value?.accentFolded
        ? 'Coincide só ao ignorar também os acentos'
        : 'Há diferenças na forma';
}
export function citationDetails(value: AnalysisEvidence): AnalysisEvidence {
  return value.entry && typeof value.entry === 'object' ? { ...value, ...value.entry } : value;
}
export interface AnalysisListing {
  version: 1;
  jobs: AnalysisJob[];
  conversations: AnalysisConversation[];
  candidates: AnalysisCandidate[];
  background: { running: boolean; detail: string };
}
export const emptyAnalysis = (): AnalysisListing => ({
  version: 1,
  jobs: [],
  conversations: [],
  candidates: [],
  background: { running: false, detail: '' },
});
export function analysisError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  if (error && typeof error === 'object' && 'error' in error) return analysisError(error.error);
  return String(error ?? '');
}
export function canAcceptCandidate(
  candidate: AnalysisCandidate,
  job: AnalysisJob | undefined,
  revisionId: string,
  engineFingerprint: string,
): boolean {
  return Boolean(
    job &&
    candidate.jobId === job.id &&
    candidate.projectId === job.projectId &&
    candidate.passageId === job.passageId &&
    job.status === 'ready-for-review' &&
    candidate.status === 'proposed' &&
    !!revisionId &&
    !!engineFingerprint &&
    candidate.evaluation?.revisionId === candidate.revisionId &&
    candidate.evaluation.expression === candidate.raw &&
    candidate.evaluation.engineFingerprint === job.input.engineFingerprint,
  );
}
export function analysisProgress(job: AnalysisJob): string {
  if (job.status !== 'running') return analysisLabels[job.status];
  const phase = job.phase ?? '';
  if (phase === 'provider-tools-check') return 'Verificando as ferramentas do Studio…';
  if (/dictionary|lexicon/.test(phase)) return 'Consultando o dicionário…';
  if (/search|construction|reuse/.test(phase)) return 'Buscando construções…';
  if (/evaluate|evaluation|render/.test(phase)) return 'Avaliando a proposta…';
  if (/compare/.test(phase)) return 'Comparando as formas…';
  if (/context|input/.test(phase)) return 'Preparando a fonte…';
  return analysisLabels[job.status];
}

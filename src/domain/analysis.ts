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
  steering?: {
    id: string;
    text: string;
    status: 'waiting' | 'sending' | 'delivered' | 'not-delivered' | 'unconfirmed';
    createdAt: string;
  }[];
  id: string;
  projectId: string;
  passageId: string;
  conversationId: string;
  parentJobId?: string;
  input: AnalysisInput;
  status: AnalysisStatus;
  phase?: string;
  attemptStartedAt?: string;
  deadlineAt?: string;
  createdAt: string;
  updatedAt: string;
  error?: string | { message: string; code?: string };
  candidateIds: string[];
  questions: AnalysisQuestion[];
  summary?: string;
  partialResponse?: string;
  currentAttemptId?: string;
  events?: {
    type?: string;
    phase?: string;
    tool?: string;
    text?: string;
    at?: string;
    result?: unknown;
    attemptId?: string;
  }[];
  usage?: Record<string, number>;
  grammarCandidate?: {
    id: string;
    engineFingerprint: string;
    expression: string;
    surface: string;
    intendedSurface: string;
    matches: boolean;
    evaluationStatus: string;
    validation: 'pending' | 'verified' | 'review-required';
  };
  grammarConfirmation?: { candidateId: string; at: string };
  grammarTimings?: Record<string, number>;
  grammarVerification?: {
    surface?: string;
    intendedSurface?: string;
    matches?: boolean;
    error?: string;
    regressionsHealthy?: boolean;
    parent?: {
      expression: string;
      surface?: string;
      evaluationStatus?: string;
      regressed?: boolean;
    };
    passage?: {
      expression: string;
      surface?: string;
      evaluationStatus?: string;
      regressed?: boolean;
    };
    comparison?: ReturnType<typeof import('./grammar-regression').compareGrammarSnapshots>;
  };
  grammarEdits?: {
    id: string;
    path: string;
    oldText: string;
    newText: string;
    rolledBack?: boolean;
  }[];
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
export function analysisStreamText(job: AnalysisJob): string {
  const deltas = (job.events ?? []).filter((event) => event.type === 'text-delta');
  const attempt = job.currentAttemptId ?? deltas.at(-1)?.attemptId;
  return deltas
    .filter((event) => !attempt || event.attemptId === attempt)
    .map((event) => event.text ?? '')
    .join('');
}
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
export interface AnalysisDetail {
  job: AnalysisJob;
  conversation: AnalysisConversation;
  candidates: AnalysisCandidate[];
}

export function mergeAnalysisDetails(
  listing: AnalysisListing,
  details: Map<string, AnalysisDetail>,
  conversations: Map<string, AnalysisConversation>,
): AnalysisListing {
  // The compact list contains only the last 20 events. The following detail
  // read can already be newer while text streams; retain that complete read.
  const currentDetails = [...details.values()].filter((detail) =>
    listing.jobs.some(
      (job) =>
        job.id === detail.job.id &&
        job.projectId === detail.job.projectId &&
        (detail.job.updatedAt > job.updatedAt ||
          (detail.job.updatedAt === job.updatedAt &&
            detail.job.currentAttemptId === job.currentAttemptId)),
    ),
  );
  return {
    ...listing,
    jobs: listing.jobs
      .map((job) => currentDetails.find((item) => item.job.id === job.id)?.job ?? job)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    conversations: listing.conversations.map((conversation) => {
      const cached = conversations.get(conversation.id);
      return cached && cached.revision >= conversation.revision
        ? cached
        : { ...conversation, turns: cached?.turns ?? conversation.turns };
    }),
    candidates: [
      ...listing.candidates.filter(
        (candidate) => !currentDetails.some((detail) => detail.job.id === candidate.jobId),
      ),
      ...currentDetails.flatMap((item) => item.candidates),
    ],
  };
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
    grammar_files: 'Arquivos da gramática listados',
    grammar_read: 'Regra da gramática consultada',
    grammar_edit: 'Gramática editada e reavaliada',
    reload_engine: 'Gramática e corpus reavaliados',
    render_candidate: 'Contraste linguístico avaliado',
  };
  const failures: Record<string, string> = {
    grammar_context: 'Falha ao consultar construção e contexto',
    grammar_files: 'Falha ao listar arquivos da gramática',
    grammar_read: 'Falha ao consultar regra da gramática',
    grammar_edit: 'Falha ao editar a gramática',
    reload_engine: 'Falha ao reavaliar a gramática',
    render_candidate: 'Falha ao avaliar contraste linguístico',
  };
  return [
    ...new Set(
      (job.events ?? []).flatMap((event) => {
        if (event.type !== 'tool-result' || !event.tool || !labels[event.tool]) return [];
        if (event.tool === 'grammar_edit' && rolledBackGrammarEdit(event.result))
          return ['Edição da gramática revertida'];
        return [
          failedToolResult(event.result)
            ? (failures[event.tool] ?? `Falha na ferramenta ${event.tool}`)
            : labels[event.tool],
        ];
      }),
    ),
  ];
}

function rolledBackGrammarEdit(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    result.rolledBack === true ||
    rolledBackGrammarEdit(result.receipt) ||
    rolledBackGrammarEdit(result.structuredContent)
  );
}

function failedToolResult(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  if (result.isError === true || result.error || result.verificationError) return true;
  if (result.structuredContent != null) return failedToolResult(result.structuredContent);
  // Older Codex app-server results lost MCP's isError flag. Recover only the
  // exact error envelope emitted by our gateway, not arbitrary response prose.
  if (!Array.isArray(result.content) || result.content.length !== 1) return false;
  const item = result.content[0];
  if (item?.type !== 'text' || typeof item.text !== 'string') return false;
  try {
    const error = JSON.parse(item.text);
    return (
      error !== null &&
      typeof error === 'object' &&
      typeof error.code === 'string' &&
      typeof error.message === 'string' &&
      Object.keys(error).every((key) => key === 'code' || key === 'message')
    );
  } catch {
    return false;
  }
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
/** analysis_submit_batch reports failures per passage instead of rejecting the whole set. */
export interface BatchError {
  passageId: string;
  message: string;
  code?: string;
}
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
  if (job.phase === 'grammar-draining')
    return 'Limite atingido; encerrando e verificando trabalho salvo…';
  if (job.status !== 'running') return analysisLabels[job.status];
  const phase = job.phase ?? '';
  if (phase === 'grammar-reload') return 'Recarregando a gramática…';
  if (phase === 'grammar-target') return 'Avaliando somente o alvo…';
  if (/^grammar-(context-check|parent|passage)$/.test(phase))
    return 'Verificando a árvore de contexto…';
  if (phase === 'grammar-corpus') return 'Forma avaliada; verificando outras passagens…';
  if (phase === 'grammar-checked') return 'Verificação concluída; finalizando a resposta…';
  if (phase === 'provider-tools-check') return 'Verificando as ferramentas do Studio…';
  if (/dictionary|lexicon/.test(phase)) return 'Consultando o dicionário…';
  if (/search|construction|reuse/.test(phase)) return 'Buscando construções…';
  if (/evaluate|evaluation|render/.test(phase)) return 'Avaliando a proposta…';
  if (/compare/.test(phase)) return 'Comparando as formas…';
  if (/context|input/.test(phase)) return 'Preparando a fonte…';
  return analysisLabels[job.status];
}

/** Small display projection; full tool bodies stay in durable history. */
export function analysisTechnicalLog(job: AnalysisJob): string {
  return JSON.stringify(
    (job.events ?? []).slice(-40).map((event) => ({
      type: event.type,
      phase: event.phase,
      tool: event.tool,
      at: event.at,
      ...(event.text ? { text: event.text.slice(0, 500) } : {}),
      ...(event.result !== undefined
        ? { result: 'Resultado completo preservado no histórico do servidor.' }
        : {}),
    })),
    null,
    2,
  );
}
export function analysisLiveness(job: AnalysisJob, time = Date.now()): string {
  const started = Date.parse(job.attemptStartedAt ?? job.createdAt);
  if (!Number.isFinite(started)) return '';
  const elapsed = Math.max(0, Math.floor((time - started) / 60000));
  const last = Date.parse(job.events?.at(-1)?.at ?? job.attemptStartedAt ?? job.createdAt);
  const quiet = Number.isFinite(last) ? Math.max(0, Math.floor((time - last) / 60000)) : 0;
  const deadline = Date.parse(job.deadlineAt ?? '');
  return (
    `${elapsed} min nesta tentativa` +
    (quiet >= 2 ? ` · Sem novo evento há ${quiet} min.` : '') +
    (Number.isFinite(deadline) && time >= deadline
      ? ' Limite atingido; aguardando encerramento e verificação segura. Você pode cancelar; retomar exige uma ação explícita.'
      : '')
  );
}

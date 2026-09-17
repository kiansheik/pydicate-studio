export type AIAction = 'translate' | 'explain' | 'propose' | 'investigate';
export type AIProvider = 'codex' | 'claude';
export type AIScope = 'passage' | 'constituent';

/** A selection is evidence only when its source span still matches this draft. */
export function aiSelection(value: unknown, raw: string) {
  if (!value || typeof value !== 'object') return null;
  const node = value as Record<string, unknown>;
  if (
    typeof node.id !== 'string' ||
    typeof node.code !== 'string' ||
    typeof node.start !== 'number' ||
    typeof node.end !== 'number' ||
    !Number.isInteger(node.start) ||
    !Number.isInteger(node.end) ||
    node.start < 0 ||
    node.end <= node.start ||
    node.end > raw.length ||
    raw.slice(node.start, node.end) !== node.code
  )
    return null;
  return { id: node.id, code: node.code, start: node.start, end: node.end };
}

export function aiRecordScope(record: AIRecord): AIScope | 'legacy-selection' | 'unknown' {
  const target = record.inputContext?.analysisTarget as Record<string, unknown> | undefined;
  const scope = target?.scope || record.context.scope;
  if (scope === 'passage' || scope === 'constituent') return scope;
  const selected = record.context.selectedNode as Record<string, unknown> | undefined;
  if (
    record.action === 'translate' &&
    typeof selected?.code === 'string' &&
    typeof record.context.raw === 'string' &&
    selected.code.trim() !== record.context.raw.trim()
  )
    return 'legacy-selection';
  return 'unknown';
}
export type AIPhase =
  | 'source_context'
  | 'mcp_context'
  | 'provider_connect'
  | 'provider_thread'
  | 'provider_submit'
  | 'provider_wait'
  | 'provider_reasoning'
  | 'provider_stream'
  | 'provider_retry'
  | 'completed'
  | 'failed'
  | 'cancelled';
export const aiPhaseLabels: Record<AIPhase, string> = {
  source_context: 'Lendo o contexto local…',
  mcp_context: 'Consultando a fonte no MCP…',
  provider_connect: 'Conectando ao provedor…',
  provider_thread: 'Preparando a conversa…',
  provider_submit: 'Enviando a solicitação…',
  provider_wait: 'Solicitação aceita; aguardando resposta…',
  provider_reasoning: 'O provedor está analisando…',
  provider_stream: 'Recebendo resposta…',
  provider_retry: 'O provedor informou uma reconexão…',
  completed: 'Resposta concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};
export interface AISuggestion {
  translation?: string;
  explanation?: string;
  expression?: string;
  rationale?: string;
  regressions: string[];
}
export interface AIRecord {
  version: 1;
  requestId: string;
  projectId: string;
  passageId: string;
  revisionId: string;
  provider: AIProvider;
  model: string;
  action: AIAction;
  context: Record<string, unknown>;
  inputHash: string | null;
  inputContext: Record<string, unknown> | null;
  text: string;
  suggestion: AISuggestion | null;
  status: 'streaming' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  acceptances: {
    kind: 'translation' | 'expression';
    text: string;
    revisionId: string;
    at: string;
    actor: 'human';
  }[];
  editorialApproval: null;
  reasoningEffort?: string | null;
  phase?: AIPhase;
  phaseStartedAt?: string;
  updatedAt?: string;
  deadlineAt?: string;
  progress?: { phase: AIPhase; at: string }[];
}
export interface AIStatus {
  config: { provider: AIProvider; models: Record<AIProvider, string>; reasoningEffort?: string };
  providers: {
    id: AIProvider;
    state: string;
    detail: string;
    model: string;
    models?: {
      id: string;
      name: string;
      default?: boolean;
      defaultReasoningEffort?: string;
      supportedReasoningEfforts?: string[];
    }[];
  }[];
}
export interface AIEvent {
  type: 'ai';
  requestId: string;
  projectId: string;
  passageId: string;
  revisionId: string;
  status: AIRecord['status'];
  text: string;
  result?: AIRecord;
}
export function isAIEvent(event: unknown): event is AIEvent {
  return Boolean(
    event &&
    typeof event === 'object' &&
    'type' in event &&
    event.type === 'ai' &&
    'requestId' in event &&
    typeof event.requestId === 'string',
  );
}
export function canAcceptAI(
  record: AIRecord,
  projectId: string,
  passageId: string,
  revisionId: string,
) {
  return (
    record.status === 'completed' &&
    record.projectId === projectId &&
    record.passageId === passageId &&
    record.revisionId === revisionId &&
    !(
      record.action === 'translate' &&
      ['constituent', 'legacy-selection'].includes(aiRecordScope(record))
    )
  );
}
export function mergeAIRecords(records: AIRecord[], record: AIRecord): AIRecord[] {
  const prior = records.find((item) => item.requestId === record.requestId);
  // A terminal result cannot be replaced by a delayed partial update.
  if (prior && prior.status !== 'streaming' && record.status === 'streaming') return records;
  if (
    prior?.status === record.status &&
    prior.updatedAt &&
    record.updatedAt &&
    prior.updatedAt > record.updatedAt
  )
    return records;
  if (
    prior?.status === 'streaming' &&
    record.status === 'streaming' &&
    prior.text.length > record.text.length
  )
    return records;
  return [record, ...records.filter((item) => item.requestId !== record.requestId)].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

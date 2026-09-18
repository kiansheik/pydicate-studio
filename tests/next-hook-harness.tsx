import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { useStudio, type Studio } from '../src/useStudio';
import { createExampleProject } from '../src/domain/example';
import type { DraftEnvelope, StudioProject } from '../src/domain/types';
import type { EvidenceStatus } from '../src/domain/evidence';
import { invoke, type AuthorNode, type SourcePreview } from '../src/domain/authoring';
import { GroundTruthPanel } from '../src/components/GroundTruthPanel';
import { NewPassageDialog } from '../src/components/NewPassageDialog';
import { LexiconPanel } from '../src/components/AuthoringEditor';
import {
  emptyAnalysis,
  type AnalysisListing,
  type AnalysisConversation,
} from '../src/domain/analysis';

// Explicitly simulated bridge: deterministic races, never linguistic evaluation evidence.
interface Request {
  id: number;
  method: string;
  params: Record<string, unknown>;
}
interface Pending extends Request {
  resolve: () => void;
  reject: (message: string) => void;
}
interface NextControl {
  project: StudioProject;
  openedProject: StudioProject;
  applyResult: StudioProject;
  requests: Request[];
  pending: Pending[];
  holds: { method: string; raw?: string }[];
  saved: Record<string, DraftEnvelope>;
  makeProject: typeof makeProject;
  release: (method: string, raw?: string) => void;
  reject: (method: string, message: string) => void;
  emit: (event: unknown) => void;
  preview?: SourcePreview;
  responses: Record<string, unknown>;
  trees: Record<string, AuthorNode | null>;
  evidence: Record<string, EvidenceStatus>;
  setAnalysis: (value: AnalysisListing) => void;
}
declare global {
  interface Window {
    __nextStudio: Studio;
    __nextControl: NextControl;
    __nextInvoke: typeof invoke;
  }
}

function makeProject(id = 'simulated:a', raw = 'alpha'): StudioProject {
  const fixture = createExampleProject();
  return {
    ...fixture,
    id,
    name: 'SIMULATED authoring contract project',
    mode: 'local',
    repositories: [],
    engineFingerprint: `simulated-engine:${id}`,
    diagnostics: ['SIMULATED bridge; this harness does not evaluate Old Tupi.'],
    passages: fixture.passages.slice(0, 2).map((passage, index) => ({
      ...passage,
      id: `passage-${index ? 'b' : 'a'}`,
      sourceId: 'araujo_catecismo_1686',
      ordinal: index + 1,
      sourceExpression: index ? 'beta' : raw,
      sourceFingerprint: `source:${id}:${index}`,
      acceptedReference: null,
      referenceProvenance: 'none',
      analysis: null,
      notes: '',
      diplomatic: '',
      normalized: '',
      translation: '',
    })),
  };
}
const listeners = new Set<(event: unknown) => void>();
const project = makeProject();
let analysisFixture: AnalysisListing =
  JSON.parse(localStorage.getItem('simulated-analysis') || 'null') ?? emptyAnalysis();
function saveAnalysisFixture() {
  localStorage.setItem('simulated-analysis', JSON.stringify(analysisFixture));
}
const control: NextControl = {
  project,
  openedProject: project,
  applyResult: project,
  requests: [],
  pending: [],
  holds: [],
  saved: {},
  responses: {},
  trees: {},
  evidence: {},
  setAnalysis(value) {
    analysisFixture = structuredClone(value);
    saveAnalysisFixture();
    control.emit({ type: 'analysis', projectId: project.id });
  },
  makeProject,
  release(method, raw) {
    const index = control.pending.findIndex(
      (request) => request.method === method && (raw === undefined || request.params.raw === raw),
    );
    if (index < 0) throw new Error(`No pending simulated ${method} ${raw || ''}`);
    control.pending.splice(index, 1)[0].resolve();
  },
  reject(method, message) {
    const index = control.pending.findIndex((request) => request.method === method);
    if (index < 0) throw new Error(`No pending simulated ${method}`);
    control.pending.splice(index, 1)[0].reject(message);
  },
  emit(event) {
    for (const listener of listeners) listener(event);
  },
};
window.__nextControl = control;
window.__nextInvoke = invoke;
let sequence = 0;
const aiConfig = {
  provider: 'codex',
  models: { codex: 'fixture-model', claude: 'fixture-model' },
  reasoningEffort: 'medium',
};
function answer(method: string, params: Record<string, unknown>): unknown {
  if (Object.hasOwn(control.responses, method)) return structuredClone(control.responses[method]);
  if (method === 'refresh_project') return structuredClone(control.project);
  if (method === 'draft_save') return undefined;
  if (method === 'analysis_list')
    return {
      ...structuredClone(analysisFixture),
      jobs: analysisFixture.jobs.map((job) => ({
        ...job,
        input: { ...job.input, evidence: undefined },
      })),
      conversations: analysisFixture.conversations
        .filter((conversation) => !conversation.archived)
        .map((conversation) => ({
          ...conversation,
          turns: [],
        })),
      candidates: [],
    };
  if (method === 'ai_status')
    return {
      config: structuredClone(aiConfig),
      providers: [],
    };
  if (method === 'ai_history') return [];
  if (method === 'ai_configure') {
    aiConfig.provider = String(params.provider);
    aiConfig.models[params.provider as 'codex' | 'claude'] = String(params.model);
    aiConfig.reasoningEffort = String(params.reasoningEffort);
    return structuredClone(aiConfig);
  }
  if (method === 'analysis_new_conversation') {
    const previous = analysisFixture.conversations.find(
      (item) => item.passageId === params.passageId && !item.archived,
    );
    if (previous) previous.archived = true;
    const next = {
      id: crypto.randomUUID(),
      projectId: String(params.projectId),
      passageId: String(params.passageId),
      revision: 0,
      composer: '',
      turns: [],
    };
    analysisFixture.conversations.push(next);
    saveAnalysisFixture();
    return structuredClone(next);
  }
  if (method === 'analysis_composer') {
    let conversation = analysisFixture.conversations.find(
      (item) =>
        item.passageId === params.passageId &&
        (params.conversationId ? item.id === params.conversationId : !item.archived),
    );
    if (!conversation) {
      conversation = {
        id: `conversation:${params.passageId}`,
        projectId: String(params.projectId),
        passageId: String(params.passageId),
        revision: 0,
        composer: '',
        turns: [],
      };
      analysisFixture.conversations.push(conversation);
    }
    if (params.text !== undefined) conversation.composer = String(params.text);
    if (params.selectedCandidateId !== undefined)
      conversation.selectedCandidateId = String(params.selectedCandidateId);
    if (params.scrollTop !== undefined) conversation.scrollTop = Number(params.scrollTop);
    conversation.revision++;
    saveAnalysisFixture();
    return structuredClone(conversation);
  }
  if (method === 'analysis_select_conversation') {
    const selected = analysisFixture.conversations.find(
      (item) => item.id === params.conversationId && item.passageId === params.passageId,
    );
    if (!selected) throw new Error('SIMULATED missing conversation');
    for (const thread of analysisFixture.conversations)
      if (thread.passageId === params.passageId) thread.archived = thread.id !== selected.id;
    saveAnalysisFixture();
    return structuredClone(selected);
  }
  if (method === 'analysis_get') {
    const job = analysisFixture.jobs.find((item) => item.id === params.jobId)!;
    return {
      job,
      candidates: analysisFixture.candidates.filter((item) => item.jobId === job.id),
      conversation: analysisFixture.conversations.find((item) => item.id === job.conversationId),
    };
  }
  if (method === 'analysis_accept') {
    const envelope = structuredClone(control.saved[String(params.projectId)]);
    const candidate = analysisFixture.candidates.find((item) => item.id === params.candidateId)!;
    const previous = envelope.drafts[candidate.passageId];
    if (
      previous.revisionId !== params.expectedDraftRevision ||
      candidate.revisionId !== params.candidateRevision
    )
      throw new Error('SIMULATED stale acceptance');
    const revisionId = crypto.randomUUID();
    const decision = {
      operationId: String(params.operationId),
      jobId: candidate.jobId,
      candidateId: candidate.id,
      candidateRevision: candidate.revisionId,
      baseRevisionId: previous.revisionId,
      revisionId,
      at: new Date().toISOString(),
    };
    const draft = {
      ...previous,
      raw: candidate.raw,
      canvas: candidate.canvas,
      revisionId,
      updatedAt: decision.at,
      aiAcceptances: [...(previous.aiAcceptances ?? []), decision],
    };
    envelope.drafts[candidate.passageId] = draft;
    control.saved[envelope.projectId] = structuredClone(envelope);
    localStorage.setItem(`simulated-next:${envelope.projectId}`, JSON.stringify(envelope));
    return { envelope, draft, decision };
  }
  if (method === 'analysis_submit') {
    const operations = JSON.parse(localStorage.getItem('simulated-analysis-operations') || '{}');
    const prior = operations[String(params.operationId)];
    if (prior) {
      if (prior.signature !== JSON.stringify(params))
        throw new Error('SIMULATED: operation conflict');
      return structuredClone(analysisFixture.jobs.find((job) => job.id === prior.jobId));
    }
    const saved = control.saved[String(params.projectId)]?.drafts[String(params.passageId)];
    if (!saved || saved.revisionId !== params.revisionId)
      throw new Error('SIMULATED: unsaved draft revision');
    if (params.newConversation) answer('analysis_new_conversation', params);
    const jobId = `job:${analysisFixture.jobs.length + 1}`;
    const candidateId = `candidate:${jobId}`;
    const revisionId = `candidate-revision:${jobId}`;
    const raw = 'beta';
    const tree: AuthorNode = {
      id: 'root',
      kind: 'reference',
      label: raw,
      code: raw,
      start: 0,
      end: raw.length,
      definition: 'SIMULATED dictionary sense',
      children: [],
    };
    const job = {
      id: jobId,
      projectId: String(params.projectId),
      passageId: String(params.passageId),
      conversationId:
        analysisFixture.conversations.find(
          (item) => item.passageId === params.passageId && !item.archived,
        )?.id ?? `conversation:${params.passageId}`,
      status: 'ready-for-review' as const,
      candidateIds: [candidateId],
      questions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      input: {
        description: String(
          params.description ||
            (params.grammarRepair as { explanation?: string })?.explanation ||
            '',
        ),
        baseRevisionId: saved.revisionId,
        engineFingerprint: project.engineFingerprint,
        diplomatic: saved.diplomatic,
        tentativeReading: saved.aiInput?.tentativeReading ?? '',
        meaning: saved.aiInput?.meaning ?? '',
        reviewedTarget: saved.normalized,
        task: params.task as 'analyze',
        scope: params.scope as 'passage',
        evidence: { revision: Number(params.evidenceRevision), regions: [] },
      },
    };
    if (params.task === 'grammar-repair') {
      const repair = params.grammarRepair as { intendedSurface: string } | undefined;
      job.input.tentativeReading = repair?.intendedSurface ?? saved.aiInput?.tentativeReading ?? '';
      job.candidateIds = [];
      Object.assign(job, {
        summary: 'Correção simulada pronta para revisão.',
        grammarVerification: {
          surface: job.input.tentativeReading,
          intendedSurface: job.input.tentativeReading,
          matches: true,
          comparison: {
            checked: 3,
            changed: [],
            baselineIssues: 1,
            newReferenceIssues: 0,
            sourceChanges: [],
          },
        },
      });
    }
    analysisFixture.jobs.unshift(job);
    analysisFixture.candidates.push({
      id: candidateId,
      jobId,
      projectId: job.projectId,
      passageId: job.passageId,
      revisionId,
      raw,
      tree,
      evaluation: {
        revisionId,
        expression: raw,
        engineFingerprint: project.engineFingerprint,
        surface: 'SIMULADO:beta',
        annotated: 'SIMULADO:beta',
        morphemes: [],
        origin: 'engine',
        tree,
      },
      comparison: { exact: false },
      evidence: [],
      rationale: 'SIMULATED proposal for interaction testing.',
      translation: {
        text: 'Pessoa: tradução sugerida pela fixture.',
        language: 'pt',
        status: 'tentative',
        revisionId,
        expression: raw,
        engineFingerprint: project.engineFingerprint,
        evaluatedSurface: 'SIMULADO:beta',
        uncertainties: ['Hipótese para revisão humana.'],
      },
      uncertainties: ['Fixture evidence only'],
      failures: [],
      status: 'proposed',
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
    const conversation = answer('analysis_composer', {
      projectId: params.projectId,
      passageId: params.passageId,
    }) as AnalysisConversation;
    conversation.turns.push({
      id: `turn:${jobId}`,
      role: 'user',
      text: String(params.description || 'Analisar passagem'),
      jobId,
      inputRevisionId: saved.revisionId,
      at: job.createdAt,
    });
    analysisFixture.conversations = analysisFixture.conversations.map((item) =>
      item.id === conversation.id ? conversation : item,
    );
    saveAnalysisFixture();
    operations[String(params.operationId)] = { jobId, signature: JSON.stringify(params) };
    localStorage.setItem('simulated-analysis-operations', JSON.stringify(operations));
    return structuredClone(job);
  }
  if (method === 'analysis_submit_batch') {
    const jobs = (params.items as Record<string, unknown>[]).map((item) =>
      answer('analysis_submit', item),
    );
    return { jobs, errors: [] };
  }
  if (method === 'analysis_cancel' || method === 'analysis_retry') {
    const job = analysisFixture.jobs.find((item) => item.id === params.jobId)!;
    job.status = method === 'analysis_cancel' ? 'cancelled' : 'queued';
    saveAnalysisFixture();
    return structuredClone(job);
  }
  if (method === 'session_restore')
    return {
      project: control.project,
      selectedPassageId:
        localStorage.getItem(`simulated-selection:${control.project.id}`) || undefined,
    };
  if (method === 'session_select') {
    localStorage.setItem(`simulated-selection:${control.project.id}`, String(params.passageId));
    return null;
  }
  if (method === 'evidence_status')
    return (
      control.evidence[String(params.passageId)] ?? {
        version: 1,
        revision: 0,
        projectId: params.projectId,
        sourceId: params.sourceId,
        asset: null,
        passage: null,
        retainedAssetCount: 0,
        guideCandidates: [],
      }
    );
  if (method === 'parse_expression')
    return {
      raw: params.raw,
      revisionId: params.revisionId,
      root: Object.hasOwn(control.trees, String(params.raw))
        ? structuredClone(control.trees[String(params.raw)])
        : params.raw === 'incomplete('
          ? null
          : {
              id: 'root',
              kind: 'reference',
              label: String(params.raw),
              code: params.raw,
              start: 0,
              end: String(params.raw).length,
              children: [],
            },
      diagnostics: params.raw === 'incomplete(' ? ['Simulated incomplete input diagnostic'] : [],
    };
  if (method === 'evaluate_expression')
    return {
      expression: params.raw,
      revisionId: params.revisionId,
      engineFingerprint: params.engineFingerprint,
      surface: `SIMULADO:${params.raw}`,
      annotated: `SIMULADO:${params.raw}`,
      morphemes: [],
      origin: 'engine',
    };
  if (method === 'source_preview' || method === 'source_new_preview')
    return {
      previewId: 'simulated-preview',
      kind: 'source',
      passageId: params.passageId,
      targetPassageId: params.newPassageId ?? params.passageId,
      sourceFingerprint: 'simulated-disk-v1',
      diff: `SIMULATED DIFF: ${params.raw}`,
    };
  if (method === 'source_apply') return control.applyResult;
  if (method === 'reference_status') {
    const passage = control.project.passages.find((item) => item.id === params.passageId);
    return {
      record: passage?.acceptedReference
        ? { surface: passage.acceptedReference, status: 'approved' }
        : null,
      recordPath: 'SIMULATED/records.jsonl',
      recordCount: 2,
      nextOrdinal: 3,
      canApproveSequentially: true,
    };
  }
  if (method === 'reference_approve') {
    control.project = {
      ...control.project,
      engineFingerprint: `${control.project.engineFingerprint}:approved`,
      passages: control.project.passages.map((passage) =>
        passage.id === params.passageId
          ? { ...passage, acceptedReference: String(params.reviewedSurface), status: 'approved' }
          : passage,
      ),
    };
    return { project: structuredClone(control.project), approval: { simulated: true } };
  }
  throw new Error(`Unexpected simulated operation: ${method}`);
}
async function bridgeRequest(method: string, params: Record<string, unknown> = {}) {
  const request = { id: ++sequence, method, params: structuredClone(params) };
  control.requests.push(request);
  const index = control.holds.findIndex(
    (hold) => hold.method === method && (hold.raw === undefined || hold.raw === params.raw),
  );
  if (index >= 0) {
    control.holds.splice(index, 1);
    return new Promise((resolve, reject) =>
      control.pending.push({
        ...request,
        resolve: () => resolve(structuredClone(answer(method, params))),
        reject: (message) => reject(new Error(message)),
      }),
    );
  }
  return structuredClone(answer(method, params));
}
window.studio = {
  invoke: bridgeRequest,
  onEvent(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async openProject() {
    return control.openedProject;
  },
  async refreshProject() {
    return (await bridgeRequest('refresh_project')) as StudioProject;
  },
  async loadDrafts(projectId) {
    const data = localStorage.getItem(`simulated-next:${projectId}`);
    return data ? (JSON.parse(data) as DraftEnvelope) : null;
  },
  async saveDrafts(envelope) {
    if (new URLSearchParams(location.search).has('analysis'))
      await bridgeRequest('draft_save', { envelope });
    control.saved[envelope.projectId] = structuredClone(envelope);
    localStorage.setItem(`simulated-next:${envelope.projectId}`, JSON.stringify(envelope));
  },
  async render() {
    throw new Error('Old fixed render is not part of the generic authoring contract.');
  },
};

function Harness() {
  const studio = useStudio();
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  window.__nextStudio = studio;
  return (
    <main>
      <h1>Simulated authoring race contracts</h1>
      <output data-testid="ready">{String(studio.ready)}</output>
      <output data-testid="project">{studio.project.id}</output>
      <output data-testid="passage">{studio.passage.id}</output>
      <output data-testid="revision">{studio.draft?.revisionId}</output>
      <output data-testid="tree">{studio.parsed?.root ? studio.parsed.raw : ''}</output>
      <output data-testid="surface">{studio.result?.surface || ''}</output>
      <output data-testid="source">{studio.passage.sourceExpression}</output>
      <output data-testid="conflict">{String(studio.conflict)}</output>
      <output data-testid="orphans">{studio.orphanDrafts.length}</output>
      <output data-testid="diagnostic">{studio.renderError}</output>
      <label>
        Pydicate simulado
        <textarea
          value={studio.draft?.raw || ''}
          onChange={(event) => studio.edit({ raw: event.target.value })}
        />
      </label>
      <label>
        Nota simulada
        <textarea
          value={studio.draft?.notes || ''}
          onChange={(event) => studio.edit({ notes: event.target.value })}
        />
      </label>
      <button onClick={studio.undo}>Desfazer simulado</button>
      <button onClick={studio.redo}>Refazer simulado</button>
      {new URLSearchParams(location.search).has('groundTruth') && (
        <GroundTruthPanel studio={studio} onReviewSource={() => {}} />
      )}
      {new URLSearchParams(location.search).has('lexicon') && (
        <LexiconPanel
          studio={studio}
          selected={new URLSearchParams(location.search).get('scope') ?? 'root'}
          onPreview={(preview) => {
            control.preview = preview;
          }}
        />
      )}
      {new URLSearchParams(location.search).has('newPassage') && (
        <>
          <button
            onClick={() =>
              setPendingDraftId(studio.pendingDrafts[0]?.passageId ?? studio.createPendingDraft())
            }
          >
            Nova leitura simulada
          </button>
          {pendingDraftId && (
            <NewPassageDialog
              studio={studio}
              draftId={pendingDraftId}
              onClose={() => setPendingDraftId(null)}
              onPreview={(preview) => {
                control.preview = preview;
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
if (new URLSearchParams(location.search).has('workspace')) {
  void (async () => {
    for (const href of ['/src/styles.css', '/src/authoring.css', '/src/theme.css']) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = href;
      document.head.append(style);
    }
    const { default: App } = await import('../src/App');
    createRoot(document.getElementById('root')!).render(<App />);
  })();
} else createRoot(document.getElementById('root')!).render(<Harness />);

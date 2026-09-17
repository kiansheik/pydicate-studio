import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { useStudio, type Studio } from '../src/useStudio';
import { createExampleProject } from '../src/domain/example';
import type { DraftEnvelope, StudioProject } from '../src/domain/types';
import { invoke, type AuthorNode, type SourcePreview } from '../src/domain/authoring';
import { GroundTruthPanel } from '../src/components/GroundTruthPanel';
import { NewPassageDialog } from '../src/components/NewPassageDialog';
import { LexiconPanel } from '../src/components/AuthoringEditor';

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
function answer(method: string, params: Record<string, unknown>): unknown {
  if (Object.hasOwn(control.responses, method)) return structuredClone(control.responses[method]);
  if (method === 'refresh_project') return structuredClone(control.project);
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
    return {
      version: 1,
      revision: 0,
      projectId: params.projectId,
      sourceId: params.sourceId,
      asset: null,
      passage: null,
      retainedAssetCount: 0,
      guideCandidates: [],
    };
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
        resolve: () => resolve(answer(method, params)),
        reject: (message) => reject(new Error(message)),
      }),
    );
  }
  return answer(method, params);
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

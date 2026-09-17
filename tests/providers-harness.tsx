import { createRoot } from 'react-dom/client';
import { AssistantPanel } from '../src/components/AssistantPanel';
import { createExampleProject } from '../src/domain/example';
import type { AIPhase, AIRecord } from '../src/domain/ai';
import '../src/styles.css';
import '../src/theme.css';

// Deliberately simulated UI fixture. Never opens a provider, network or corpus process.
const project = createExampleProject();
const passage = project.passages[0];
const raw = 'first_constituent + second_constituent + final_constituent';
let record: AIRecord | null = null;
const calls: string[] = [];
const listeners = new Set<(event: unknown) => void>();
function phase(value: AIPhase) {
  if (!record) throw new Error('Start a simulated request first.');
  record = { ...record, phase: value, updatedAt: new Date().toISOString() };
  for (const listener of listeners)
    listener({ type: 'ai', ...record, result: structuredClone(record) });
}
declare global {
  interface Window {
    __providerHarness: { calls: string[]; phase: typeof phase; request: () => AIRecord | null };
  }
}
window.__providerHarness = { calls, phase, request: () => record };
window.studio = {
  openProject: async () => project,
  refreshProject: async () => project,
  loadDrafts: async () => null,
  saveDrafts: async () => {},
  render: async () => {
    throw new Error('Not a linguistic rendering fixture.');
  },
  onEvent(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  invoke: async (method, params = {}) => {
    calls.push(method);
    if (method === 'ai_status')
      return {
        config: {
          provider: 'codex',
          models: { codex: 'synthetic', claude: 'synthetic' },
          reasoningEffort: 'medium',
        },
        providers: [
          {
            id: 'codex',
            state: 'available',
            detail: 'SIMULATED provider; no usage',
            model: 'synthetic',
          },
        ],
      };
    if (method === 'ai_history') return record ? [structuredClone(record)] : [];
    if (method === 'ai_configure') return {};
    if (method === 'ai_start') {
      record = {
        version: 1,
        requestId: String(params.requestId),
        projectId: String(params.projectId),
        passageId: String(params.passageId),
        revisionId: String(params.revisionId),
        provider: 'codex',
        model: 'synthetic',
        action: 'translate',
        context: params.context as Record<string, unknown>,
        inputHash: null,
        inputContext: null,
        text: '',
        suggestion: null,
        status: 'streaming',
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        acceptances: [],
        editorialApproval: null,
      };
      phase('source_context');
      return { requestId: record.requestId };
    }
    if (method === 'ai_cancel' && record) {
      record = { ...record, status: 'cancelled', finishedAt: new Date().toISOString() };
      phase('cancelled');
      return { cancelled: true };
    }
    throw new Error(`Unexpected simulated operation: ${method}`);
  },
};
createRoot(document.getElementById('root')!).render(
  <AssistantPanel
    projectId={project.id}
    passage={passage}
    draft={{ revisionId: 'revision', diplomatic: '', normalized: '', translation: '', notes: '' }}
    raw={raw}
    selectedNode={{ id: 'root/left', start: 0, end: 17, code: 'first_constituent' }}
    evaluation={null}
    engineFingerprint={project.engineFingerprint}
    onAcceptExpression={() => {}}
    onAcceptTranslation={() => {}}
  />,
);

import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { AssistantPanel } from '../src/components/AssistantPanel';
import { createExampleProject } from '../src/domain/example';
import type { AIPhase, AIRecord } from '../src/domain/ai';
import type { PassageTranslations } from '../src/domain/types';
import { translationChange } from '../src/domain/translations';
import '../src/styles.css';
import '../src/theme.css';

// Deliberately simulated UI fixture. Never opens a provider, network or corpus process.
const project = createExampleProject();
const passage = project.passages[0];
const raw = 'first_constituent + second_constituent + final_constituent';
let record: AIRecord | null = null;
const calls: string[] = [];
const requests: { method: string; params: Record<string, unknown> }[] = [];
const translationOnly = new URLSearchParams(location.search).has('translation');
let releasePreview: (() => void) | undefined;
const listeners = new Set<(event: unknown) => void>();
function phase(value: AIPhase) {
  if (!record) throw new Error('Start a simulated request first.');
  record = { ...record, phase: value, updatedAt: new Date().toISOString() };
  for (const listener of listeners)
    listener({ type: 'ai', ...record, result: structuredClone(record) });
}
function complete() {
  if (!record) throw new Error('Start a simulated request first.');
  record = {
    ...record,
    status: 'completed',
    text: 'The whole tree.',
    suggestion: {
      translation: 'The whole tree.',
      explanation: 'Literal reading and possible alternatives.',
      regressions: [],
    },
    finishedAt: new Date().toISOString(),
  };
  phase('completed');
}
declare global {
  interface Window {
    __providerHarness: {
      calls: string[];
      requests: typeof requests;
      phase: typeof phase;
      request: () => AIRecord | null;
      complete: typeof complete;
      changeTree: () => void;
      changeEngine: () => void;
      releasePreview: () => void;
    };
  }
}
window.__providerHarness = {
  calls,
  requests,
  phase,
  request: () => record,
  complete,
  changeTree: () => {},
  changeEngine: () => {},
  releasePreview: () => releasePreview?.(),
};
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
    requests.push({ method, params: structuredClone(params) });
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
    if (method === 'ai_prompt_preview') {
      if (new URLSearchParams(location.search).has('delayed'))
        await new Promise<void>((resolve) => {
          releasePreview = resolve;
        });
      const context = params.context as Record<string, unknown>;
      return {
        prompt: `SIMULATED PROMPT: ${context.raw}; language: ${context.targetLanguage}`,
        targetLanguage: context.targetLanguage,
        analysisTarget: { scope: context.scope },
        inputHash: 'synthetic',
      };
    }
    if (method === 'ai_accept' && record) return structuredClone(record);
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
function Harness() {
  const [tree, setTree] = useState(raw);
  const [revision, setRevision] = useState('revision');
  const [engine, setEngine] = useState(project.engineFingerprint);
  const [translation, setTranslation] = useState(translationOnly ? 'Minha tradução humana.' : '');
  const [translations, setTranslations] = useState<PassageTranslations>(
    translationOnly
      ? { pt: 'Minha tradução em português.', en: 'My previous English translation.' }
      : {},
  );
  window.__providerHarness.changeTree = () => {
    setTree('changed_tree');
    setRevision('revision:changed');
  };
  window.__providerHarness.changeEngine = () => setEngine('engine:changed');
  return (
    <>
      <output aria-label="Tradução humana preservada">{translation}</output>
      <output aria-label="Tradução em português">{translations.pt}</output>
      <output aria-label="Tradução em inglês">{translations.en}</output>
      <AssistantPanel
        translationOnly={translationOnly}
        projectId={project.id}
        passage={passage}
        draft={{
          revisionId: revision,
          diplomatic: '',
          normalized: '',
          translation,
          translations,
          notes: '',
        }}
        raw={tree}
        selectedNode={{ id: 'root/left', start: 0, end: 17, code: 'first_constituent' }}
        evaluation={null}
        engineFingerprint={engine}
        onAcceptExpression={() => {}}
        onAcceptTranslation={(text, language) => {
          const change = translationChange({ translations }, text, language);
          if (change.translations) setTranslations(change.translations);
          else if (typeof change.translation === 'string') setTranslation(change.translation);
        }}
      />
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

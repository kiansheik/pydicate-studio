import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { DictionaryTab } from '../src/components/DictionaryTab';
import type { DictionaryPredicateResult } from '../src/components/DictionaryEntryCreation';

const fingerprint = 'sha256:' + 'a'.repeat(64);
const ready = (entryIndex: number, constructor = 'Noun'): DictionaryPredicateResult => ({
  status: 'ready',
  entry: {
    entryIndex,
    datasetFingerprint: fingerprint,
    headword: 'abá',
    optionalNumber: entryIndex,
    definition: 'Acepção exata ' + entryIndex,
    grammaticalInformation: ['s.'],
  },
  constructors: ['Noun', 'Pronoun'],
  diagnostics: [],
  engineFingerprint: 'engine-fixture',
  expression: `${constructor}("abá", definition="Acepção exata ${entryIndex}")`,
  evaluationStatus: 'complete',
  surface: 'abá',
});
interface Control {
  requests: { method: string; params: Record<string, unknown> }[];
  inserted: { expression: string; revision: string }[];
  hold: boolean;
  pending: { resolve: () => void }[];
  rejectInsertion: boolean;
  status: { available: boolean; url?: string; message?: string; datasetFingerprint?: string };
  send: (data: unknown, origin?: string, source?: 'frame' | 'parent') => void;
  setContext: (value: string) => void;
  frame?: HTMLIFrameElement;
}
declare global {
  interface Window {
    dictionaryControl: Control;
  }
}
const control: Control = {
  requests: [],
  inserted: [],
  hold: false,
  pending: [],
  rejectInsertion: false,
  status: {
    available: true,
    url: `studio://dictionary/nhe-enga/?projectId=dictionary-fixture&dataset=${encodeURIComponent(fingerprint)}`,
    datasetFingerprint: fingerprint,
  },
  send(data, origin = 'studio://dictionary', source = 'frame') {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin,
        source: source === 'frame' ? document.querySelector('iframe')!.contentWindow : window,
      }),
    );
  },
  setContext() {},
};
window.dictionaryControl = control;
window.studio = {
  invoke: async (method, params = {}) => {
    control.requests.push({ method, params: structuredClone(params) });
    if (method === 'dictionary_status') return structuredClone(control.status);
    if (method !== 'dictionary_predicate') throw new Error('Unexpected dictionary fixture method');
    const index = Number(params.entryIndex);
    const constructor = Object.hasOwn(params, 'constructor')
      ? String(params.constructor)
      : undefined;
    const result = ready(index, constructor);
    if (index === 2 && !constructor) {
      result.status = 'needs-choice';
      delete result.expression;
      delete result.evaluationStatus;
    }
    if (index === 3) {
      result.evaluationStatus = 'partial';
      result.failures = [
        {
          nodeId: 'root',
          stage: 'evaluation',
          expression: result.expression!,
          message: 'Precisa de contexto verbal.',
        },
      ];
    }
    if (index === 4) throw new Error('Dicionário mudou; atualize a consulta.');
    if (control.hold)
      return new Promise((resolve) => control.pending.push({ resolve: () => resolve(result) }));
    return result;
  },
} as typeof window.studio;
function Harness() {
  const [active, setActive] = useState(false);
  const [context, setContext] = useState('r1');
  const [count, setCount] = useState(0);
  control.setContext = setContext;
  return (
    <main>
      <button onClick={() => setActive(!active)}>{active ? 'Fechar aba' : 'Abrir aba'}</button>
      <DictionaryTab
        projectId="dictionary-fixture"
        passageId={`passage:${context}`}
        sourceId="araujo"
        revisionId={context}
        engineFingerprint="engine-fixture"
        active={active}
        onInsert={(expression, revision) => {
          if (control.rejectInsertion) return false;
          control.inserted.push({ expression, revision });
          setCount(control.inserted.length);
          return true;
        }}
      />
      <output id="insertions">{count}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

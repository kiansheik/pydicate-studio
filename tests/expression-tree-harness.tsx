import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { PydicateTree } from '../src/components/RuntimeTree';
import type { AuthorNode } from '../src/domain/authoring';

export interface OperationFixture {
  raw: string;
  root: AuthorNode | null;
  evaluatedRoot?: AuthorNode;
  status?: string;
  retainPreviousEvaluation?: boolean;
  engineFingerprint?: string;
}

declare global {
  interface Window {
    operationFixture: OperationFixture;
    operationUsage: unknown[];
  }
}

function Harness() {
  const initial = window.operationFixture;
  const [raw, setRaw] = useState(initial.raw);
  const [root, setRoot] = useState(initial.root);
  const [evaluatedRoot, setEvaluatedRoot] = useState(initial.evaluatedRoot);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState('root');
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const lastRequested = useRef(initial.raw);

  useEffect(() => {
    if (lastRequested.current === raw) return;
    lastRequested.current = raw;
    let current = true;
    void fetch('/__operation_parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    })
      .then((response) => response.json())
      .then((parsed: OperationFixture) => {
        if (current) {
          setRoot(parsed.root);
          if (parsed.evaluatedRoot || !initial.retainPreviousEvaluation)
            setEvaluatedRoot(parsed.evaluatedRoot);
          setPending(false);
        }
      });
    return () => {
      current = false;
    };
  }, [raw]);

  function update(next: string) {
    setRoot(null);
    setPending(true);
    setRevision((value) => value + 1);
    setRaw(next);
  }

  function edit(next: string) {
    if (next === raw) return;
    setHistory((values) => [...values, raw]);
    setFuture([]);
    update(next);
  }

  return (
    <main style={{ maxWidth: 1100, margin: 'auto', fontFamily: 'sans-serif' }}>
      <PydicateTree
        raw={raw}
        authoringRoot={root}
        evaluatedRoot={evaluatedRoot}
        passageId="operation-fixture"
        revisionId={`operation-${revision}`}
        engineFingerprint={initial.engineFingerprint}
        selectedSourceNodeId={selection}
        onSelectSourceNode={setSelection}
        status={pending ? 'Analisando esta revisão…' : initial.status}
        onChangeRaw={edit}
        onUndo={() => {
          if (!history.length) return;
          setFuture((values) => [...values, raw]);
          update(history.at(-1)!);
          setHistory(history.slice(0, -1));
        }}
        onRedo={() => {
          if (!future.length) return;
          setHistory((values) => [...values, raw]);
          update(future.at(-1)!);
          setFuture(future.slice(0, -1));
        }}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
      />
      <label style={{ display: 'block', color: 'white' }}>
        Código de teste
        <textarea
          aria-label="Código de teste"
          value={raw}
          onChange={(event) => edit(event.target.value)}
        />
      </label>
      <output id="operation-raw">{raw}</output>
      <output id="operation-selection">{selection}</output>
      <output id="operation-parse-state">{pending ? 'pendente' : 'pronto'}</output>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

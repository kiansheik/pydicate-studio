import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { PydicateTree } from '../src/components/RuntimeTree';
import { invoke, type AuthorNode, type EvaluationFailure } from '../src/domain/authoring';
import { clearCanvasPositions, emptyCanvas, type CanvasEdit } from '../src/domain/canvas';
import type { CanvasDiagnostic } from '../src/domain/grammar-diagnostic';

export interface CanvasFixture extends CanvasEdit {
  root: AuthorNode | null;
  evaluatedRoot?: AuthorNode | null;
  failures?: EvaluationFailure[];
}
declare global {
  interface Window {
    canvasFixture: CanvasFixture;
    canvasSnapshot: CanvasEdit;
    canvasReplaceRaw: (raw: string) => void;
    canvasSetPassageId: (id: string) => void;
    canvasSetEngineFingerprint: (fingerprint: string) => void;
    canvasShowTree: (visible: boolean) => void;
    canvasDiagnostic?: CanvasDiagnostic;
    canvasClipboard?: string;
  }
}
const storageKey = 'canvas-browser-fixture';

function Harness() {
  const initial = window.canvasFixture;
  const [draft, setDraft] = useState<CanvasEdit>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored
      ? (JSON.parse(stored) as CanvasEdit)
      : { raw: initial.raw, canvas: initial.canvas ?? emptyCanvas() };
  });
  const [parsed, setParsed] = useState<AuthorNode | null>(
    draft.raw === initial.raw ? initial.root : null,
  );
  const [evaluated, setEvaluated] = useState<AuthorNode | null | undefined>(
    draft.raw === initial.raw ? initial.evaluatedRoot : undefined,
  );
  const [failures, setFailures] = useState(initial.failures);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [passageId, setPassageId] = useState('canvas-fixture');
  const [engineFingerprint, setEngineFingerprint] = useState('canvas-fixture-engine');
  const [showTree, setShowTree] = useState(true);
  const [selection, setSelection] = useState('root');
  const [history, setHistory] = useState<CanvasEdit[]>([]);
  const [future, setFuture] = useState<CanvasEdit[]>([]);
  const latest = useRef(draft);
  latest.current = draft;
  window.canvasSnapshot = draft;
  window.canvasSetPassageId = setPassageId;
  window.canvasSetEngineFingerprint = setEngineFingerprint;
  window.canvasShowTree = setShowTree;
  useEffect(() => {
    let current = true;
    setPending(true);
    setParsed(null);
    setEvaluated(undefined);
    void (async () => {
      const syntax = await invoke<{ root: AuthorNode | null }>('parse_expression', {
        raw: draft.raw,
        passageId,
        revisionId: String(revision),
      });
      if (!current) return;
      setParsed(syntax.root);
      if (syntax.root) {
        const result = await invoke<{ tree: AuthorNode; failures: EvaluationFailure[] }>(
          'evaluate_expression',
          {
            raw: draft.raw,
            passageId,
            revisionId: String(revision),
            engineFingerprint,
          },
        );
        if (!current) return;
        setEvaluated(result.tree);
        setFailures(result.failures);
      }
      setPending(false);
    })();
    return () => {
      current = false;
    };
  }, [draft.raw, passageId, engineFingerprint]);

  function apply(next: CanvasEdit) {
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return;
    setHistory((values) => [...values, structuredClone(latest.current)]);
    setFuture([]);
    update(next);
  }
  function update(next: CanvasEdit) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    setRevision((value) => value + 1);
    setDraft(next);
  }
  function changeRaw(raw: string) {
    apply({
      raw,
      canvas:
        raw === latest.current.raw
          ? latest.current.canvas
          : clearCanvasPositions(latest.current.canvas),
    });
  }
  window.canvasReplaceRaw = changeRaw;
  return (
    <main style={{ maxWidth: 1400, margin: 'auto', fontFamily: 'sans-serif' }}>
      {showTree && (
        <PydicateTree
          raw={draft.raw}
          canvas={draft.canvas}
          authoringRoot={parsed}
          evaluatedRoot={evaluated}
          failures={failures}
          passageId={passageId}
          revisionId={`canvas-${revision}`}
          engineFingerprint={engineFingerprint}
          selectedSourceNodeId={selection}
          onSelectSourceNode={setSelection}
          onChangeRaw={changeRaw}
          onChangeCanvas={apply}
          onPrepareDiagnostic={(report) => {
            window.canvasDiagnostic = report;
          }}
          status={pending ? 'Avaliando a estrutura…' : undefined}
          onUndo={() => {
            if (!history.length) return;
            setFuture((values) => [...values, draft]);
            update(history.at(-1)!);
            setHistory(history.slice(0, -1));
          }}
          onRedo={() => {
            if (!future.length) return;
            setHistory((values) => [...values, draft]);
            update(future.at(-1)!);
            setFuture(future.slice(0, -1));
          }}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
        />
      )}
      <output id="canvas-raw">{draft.raw}</output>
      <output id="canvas-state">{JSON.stringify(draft.canvas)}</output>
      <output id="canvas-ready">{pending ? 'pending' : 'ready'}</output>
      <output id="canvas-passage">{passageId}</output>
      <output id="canvas-engine">{engineFingerprint}</output>
      <output id="canvas-history">{history.length}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

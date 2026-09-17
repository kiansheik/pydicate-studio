import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { RuntimeTree } from '../src/components/RuntimeTree';
import type { RuntimeGraph } from '../src/domain/runtime-tree';
import type { AuthorNode } from '../src/domain/authoring';

declare global {
  interface Window {
    treeFixture: RuntimeGraph;
    treeUsage: unknown[];
    treeAuthoring?: { raw: string; root: AuthorNode };
    treeUpdateGraph?: (graph: RuntimeGraph) => void;
    treeInitialSelection?: string;
  }
}
function Harness() {
  const [selection, setSelection] = useState(window.treeInitialSelection ?? 'root');
  const [graph, setGraph] = useState(window.treeFixture);
  const [raw, setRaw] = useState(window.treeAuthoring?.raw ?? '');
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    window.treeUpdateGraph = setGraph;
  }, []);
  return (
    <main style={{ maxWidth: 1000, margin: 'auto', fontFamily: 'sans-serif' }}>
      <RuntimeTree
        graph={graph}
        selectedSourceNodeId={selection}
        onSelectSourceNode={setSelection}
        passageId="tree-fixture"
        raw={raw}
        authoringRoot={window.treeAuthoring?.root}
        onChangeRaw={
          window.treeAuthoring
            ? (next) => {
                setHistory((values) => [...values, raw]);
                setRaw(next);
              }
            : undefined
        }
        onUndo={() => {
          setRaw(history.at(-1)!);
          setHistory(history.slice(0, -1));
        }}
        canUndo={history.length > 0}
      />
      <output id="source-selection" style={{ color: 'white' }}>
        {selection}
      </output>
      <output id="raw-expression">{raw}</output>
      <button onClick={() => setSelection('root/right')} id="lexicon-reveal">
        Localizar ocorrência na estrutura
      </button>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

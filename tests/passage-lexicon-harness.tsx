import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PassageLexicon } from '../src/components/PassageLexicon';
import '../src/styles.css';
import '../src/theme.css';
function Harness() {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <div id="lexical-selection">{selected}</div>
      <div id="lexical-revealed">{revealed}</div>
      <PassageLexicon
        projectId="project:test"
        passageId="passage:1"
        sourceId="araujo"
        revisionId="revision:1"
        raw="compound * oré"
        engineFingerprint="engine:test"
        selectedNodeId={selected}
        onSelectNode={setSelected}
        onRevealNode={setRevealed}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

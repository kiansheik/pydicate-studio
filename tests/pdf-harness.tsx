import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PdfEvidence } from '../src/components/PdfEvidence';

function Harness() {
  const guideMode = new URLSearchParams(location.search).has('guide');
  const [pointers, setPointers] = useState(0);
  const [passage, setPassage] = useState(() =>
    guideMode ? localStorage.getItem('pdf-harness-passage') || 'passage:a' : 'passage:a',
  );
  function choosePassage(id: string) {
    if (guideMode) localStorage.setItem('pdf-harness-passage', id);
    setPassage(id);
  }
  return (
    <main style={{ maxWidth: 650, color: '#eee', background: '#1a1d24', fontFamily: 'sans-serif' }}>
      <nav>
        <button onClick={() => choosePassage('passage:a')}>Passagem A</button>
        <button onClick={() => choosePassage('passage:b')}>Passagem B</button>
        {guideMode && <button onClick={() => choosePassage('passage:c')}>Passagem C</button>}
      </nav>
      <PdfEvidence
        projectId="project:pdf-test"
        sourceId="araujo"
        passageId={passage}
        newPassageGuide={guideMode && passage !== 'passage:a'}
        previousPassageId={
          guideMode
            ? passage === 'passage:c'
              ? 'passage:b'
              : passage === 'passage:b'
                ? 'passage:a'
                : undefined
            : undefined
        }
        printedPage="26–27"
        folio="13v"
        lineLocator="4–9"
        onEvidence={() => setPointers((count) => count + 1)}
      />
      <output id="evidence-pointers">{pointers}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

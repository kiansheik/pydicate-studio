import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { PdfEvidence, type EvidencePreparation } from '../src/components/PdfEvidence';

function Harness() {
  const guideMode = new URLSearchParams(location.search).has('guide');
  const [pointers, setPointers] = useState(0);
  const [hidden, setHidden] = useState(false);
  const preparation = useRef<EvidencePreparation>(null);
  const [prepared, setPrepared] = useState('');
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
      <button onClick={() => setHidden(!hidden)}>Alternar apoio Fonte / IA</button>
      <button
        onClick={() =>
          void preparation.current
            ?.prepare()
            .then((value) => setPrepared(JSON.stringify(value)))
            .catch((error) => setPrepared(String(error)))
        }
      >
        Preparar evidência para análise
      </button>
      <output id="prepared-evidence">{prepared}</output>
      <div hidden={hidden}>
        <PdfEvidence
          preparationRef={preparation}
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
      </div>
      <output id="evidence-pointers">{pointers}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PassageLexicon } from '../src/components/PassageLexicon';
import { AssistantPanel } from '../src/components/AssistantPanel';
import { createExampleProject } from '../src/domain/example';
import type { SourcePreview } from '../src/domain/authoring';
import type { PassageLexiconInventory } from '../src/domain/passage-lexicon';
import '../src/styles.css';
import '../src/theme.css';
declare global {
  interface Window {
    __lexicalFixture: {
      requests: { method: string; params: Record<string, unknown> }[];
      inventory: PassageLexiconInventory;
      holdDefinition: boolean;
      releaseDefinition?: () => void;
      holdNotes?: boolean;
      releaseNotes?: () => void;
      failNotes?: boolean;
      failedNoteWrites?: number;
      holdDictionary?: boolean;
      releaseDictionary?: () => void;
    };
  }
}
function Harness() {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [raw, setRaw] = useState('compound * oré');
  const [revision, setRevision] = useState('revision:1');
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [showLexicon, setShowLexicon] = useState(true);
  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <div id="lexical-selection">{selected}</div>
      <div id="lexical-revealed">{revealed}</div>
      <output data-testid="lexical-raw">{raw}</output>
      <output data-testid="lexical-preview">{preview?.diff}</output>
      <button
        onClick={() => {
          setRaw('changed_during_request');
          setRevision('revision:changed');
        }}
      >
        Alterar rascunho simulado
      </button>
      <button onClick={() => setShowLexicon((visible) => !visible)}>
        {showLexicon ? 'Fechar léxico simulado' : 'Reabrir léxico simulado'}
      </button>
      {showLexicon && (
        <PassageLexicon
          projectId="project:test"
          passageId="passage:1"
          sourceId="araujo"
          revisionId={revision}
          raw={raw}
          engineFingerprint="engine:test"
          selectedNodeId={selected}
          onSelectNode={setSelected}
          onRevealNode={setRevealed}
          onEdit={(next, expected) => {
            if (expected !== revision) return false;
            setRaw(next);
            setRevision((previous) => previous + ':edit');
            return true;
          }}
          onPreview={setPreview}
        />
      )}
      {new URLSearchParams(location.search).has('translation') && (
        <AssistantPanel
          translationOnly
          projectId="project:test"
          passage={{ ...createExampleProject().passages[0], id: 'passage:1', sourceId: 'araujo' }}
          draft={{
            revisionId: revision,
            diplomatic: '',
            normalized: '',
            translation: '',
            notes: '',
          }}
          raw={raw}
          engineFingerprint="engine:test"
          selectedNode={null}
          evaluation={null}
          onAcceptExpression={() => {}}
          onAcceptTranslation={() => {}}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

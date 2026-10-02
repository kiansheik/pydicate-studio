import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PassageNavigator } from '../src/components/PassageNavigator';
import { createExampleProject } from '../src/domain/example';
import { createDraft } from '../src/domain/model';
import type { Draft } from '../src/domain/types';
import '../src/styles.css';
import '../src/theme.css';
import '../src/workspace.css';

const base = createExampleProject().passages[0];
const passages = ['a', 'b', 'c', 'd'].map((id, index) => ({
  ...base,
  id,
  sourceId: 'book',
  ordinal: index + 1,
  acceptedReference: `Leitura ${id}`,
  witness: {
    ...base.witness,
    section: index < 2 ? 'Primeira seção' : 'Última seção',
    subsection: index < 2 ? 'Subseção inicial' : 'Subseção final com um nome comprido',
  },
}));
const sources = [{ id: 'book', title: 'Fonte do ensaio', year: '1686' }];
function Harness() {
  const [selectedId, setSelectedId] = useState('d');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  return (
    <main>
      <label>
        Busca do ensaio
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <button
        onClick={() =>
          setDrafts({
            ...drafts,
            d: {
              ...createDraft(passages[3]),
              normalized: 'Resultado salvo',
              locators: { section: 'Seção editada', subsection: 'Subseção editada' },
            },
          })
        }
      >
        Editar localizador da última passagem
      </button>
      <output aria-label="Seleção">{selectedId}</output>
      <div
        className="workspace-pane-navigator"
        style={{ width: 260, height: 400, maxWidth: '100%' }}
      >
        <aside className="navigator" style={{ height: '100%' }}>
          <PassageNavigator
            projectId="fixture"
            passages={passages.filter((p) => !query || p.acceptedReference.includes(query))}
            drafts={drafts}
            sources={sources}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filterKey={query}
            revealMatches={!!query}
            submissions={{
              c: {
                id: 'submitted:c',
                projectId: 'fixture',
                passageId: 'c',
                revisionId: 'saved',
                draftRevisionId: 1,
                submittedAt: 1,
                author: 'Fixture',
                status: 'submitted',
              },
            }}
          />
        </aside>
      </div>
    </main>
  );
}
document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(<Harness />);

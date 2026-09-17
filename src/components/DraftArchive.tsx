import { useState } from 'react';
import { X } from 'lucide-react';
import { expressionFor } from '../domain/model';
import type { Studio } from '../useStudio';
export function DraftArchive({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>();
  const rows = studio.orphanDrafts.map((draft) => ({
    draft,
    raw: draft.raw ?? (draft.analysis ? expressionFor(draft.analysis) : ''),
    hasText: !!(
      draft.raw ||
      draft.analysis ||
      draft.diplomatic ||
      draft.normalized ||
      draft.translation ||
      draft.notes
    ),
  }));
  const populated = rows.filter((row) => row.hasText);
  const matches = populated.filter(({ draft, raw }) =>
    [raw, draft.notes, draft.diplomatic, draft.normalized, draft.translation, draft.passageId]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const active = matches.find((row) => row.draft.passageId === selected);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(studio.envelope, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pydicate-rascunhos-preservados.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="modal-backdrop">
      <section
        className="draft-archive"
        role="dialog"
        aria-modal="true"
        aria-label="Rascunhos preservados"
      >
        <header>
          <h2>Rascunhos preservados</h2>
          <button
            className="icon-button"
            aria-label="Fechar rascunhos preservados"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <p>
          {populated.length} com texto ou análise; {rows.length - populated.length} registros
          antigos sem conteúdo recuperável no rascunho. Todos continuam preservados na exportação.
        </p>
        <label className="editor-label">
          Buscar no arquivo
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="archive-content">
          <div>
            {matches.map(({ draft, raw }) => (
              <button
                className="archive-item"
                key={draft.passageId}
                aria-pressed={selected === draft.passageId}
                onClick={() => setSelected(draft.passageId)}
              >
                <strong>
                  {(
                    draft.diplomatic ||
                    draft.normalized ||
                    raw ||
                    draft.notes ||
                    draft.translation
                  ).slice(0, 100)}
                </strong>
                <small>
                  {new Date(draft.updatedAt).toLocaleDateString('pt-BR')} ·{' '}
                  {draft.passageId.slice(-12)}
                </small>
              </button>
            ))}
            {!matches.length && <p>Nenhum rascunho com conteúdo nesta busca.</p>}
          </div>
          {active && (
            <article>
              <h3>Comparar com a passagem {studio.passage.ordinal}</h3>
              <pre>{active.raw || 'Sem análise salva'}</pre>
              {active.draft.diplomatic && <p>{active.draft.diplomatic}</p>}
              {active.draft.normalized && <p>{active.draft.normalized}</p>}
              <p>{active.draft.notes}</p>
              <p>{active.draft.translation}</p>
              <p>
                A associação preserva o original e cria uma cópia nesta passagem. Evidências e
                respostas de IA não são movidas.
              </p>
              <button
                className="button"
                onClick={() => {
                  studio.reconcileDraft(active.draft.passageId);
                  onClose();
                }}
              >
                Associar cópia à passagem {studio.passage.ordinal}
              </button>
            </article>
          )}
        </div>
        <button className="button" onClick={download}>
          Exportar todos os rascunhos preservados
        </button>
      </section>
    </div>
  );
}

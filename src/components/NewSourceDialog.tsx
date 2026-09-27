import { useEffect, useRef, useState } from 'react';
import type { Studio } from '../useStudio';
import { projectSources, sourceSlug } from '../domain/sources';

export function NewSourceDialog({
  studio,
  onClose,
  onCreated,
}: {
  studio: Studio;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const sourceId = fileName ?? sourceSlug(title);
  const exists = projectSources(studio.project).some(
    (source) => source.id.toLowerCase() === sourceId.toLowerCase(),
  );
  useEffect(() => {
    titleInput.current?.focus();
  }, []);
  return (
    <div
      className="review-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Nova fonte"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onClose();
      }}
    >
      <section className="new-source-dialog">
        <h2>Nova fonte</h2>
        <p>
          Comece um livro, manuscrito ou conjunto de textos. Depois de criar a fonte, anexe seu PDF
          no painel Fonte e registre a primeira passagem.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim() || exists || busy) return;
            setBusy(true);
            setError('');
            void studio
              .createSource({ sourceId, title: title.trim(), year: year.trim() })
              .then((id) => {
                if (id) onCreated();
              })
              .catch((reason) =>
                setError(reason instanceof Error ? reason.message : String(reason)),
              )
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Título da fonte
            <input
              ref={titleInput}
              required
              maxLength={500}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Ano (opcional)
            <input
              maxLength={40}
              value={year}
              disabled={busy}
              onChange={(event) => setYear(event.target.value)}
            />
          </label>
          <label>
            Nome do arquivo .tu.py
            <input
              required
              pattern="[a-z][a-z0-9_]{0,79}"
              maxLength={80}
              value={sourceId}
              disabled={busy}
              onChange={(event) => setFileName(event.target.value)}
            />
          </label>
          <p className="field-hint">
            {sourceId}.tu.py · Transcrições e análises começam como rascunhos. A ground truth é
            salva após revisão.
          </p>
          {exists && (
            <p role="alert">
              Já existe uma fonte com esse nome de arquivo. Escolha outro nome ou abra a fonte
              existente.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="source-create-actions">
            <button type="button" className="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !title.trim() || exists}
            >
              {busy ? 'Criando fonte…' : 'Criar fonte'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

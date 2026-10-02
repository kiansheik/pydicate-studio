import { workspaceAutofill } from './domain/workspace-autofill';
import { useEffect, useRef, useState } from 'react';
import type { Studio } from './useStudio';

export function PassageManager({ studio, sourceId }: { studio: Studio; sourceId: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [target, setTarget] = useState(studio.passage.id);
  const [position, setPosition] = useState('1');
  if (!window.studio?.capabilities?.passageManagement) return null;
  const passages = studio.project.passages.filter((p) => p.sourceId === sourceId);
  const deleted = Object.values(studio.envelope.drafts).filter(
    (d) => d.organization?.sourceId === sourceId && d.organization.deleted,
  );
  const selected = passages.find((p) => p.id === target) ?? passages[0];
  const label = (id: string) => {
    const draft = studio.envelope.drafts[id];
    const source = studio.sourcePassages.find((p) => p.id === id);
    return (
      draft?.normalized ||
      draft?.diplomatic ||
      source?.acceptedReference ||
      draft?.raw ||
      'Por transcrever'
    );
  };
  async function act(
    action: 'reorder' | 'duplicate' | 'delete' | 'restore',
    id: string,
    destination?: number,
  ) {
    const orderedIds = passages.map((p) => p.id);
    if (action === 'reorder') {
      if (!Number.isInteger(destination) || destination! < 0 || destination! >= orderedIds.length) {
        setError(`Escolha uma posição entre 1 e ${orderedIds.length}.`);
        return;
      }
      orderedIds.splice(orderedIds.indexOf(id), 1);
      orderedIds.splice(destination!, 0, id);
    }
    if (
      action === 'delete' &&
      !window.confirm(
        `Excluir “${label(id)}” da lista? Você poderá restaurar em Excluídas. O registro na fonte e o histórico serão preservados.`,
      )
    )
      return;
    setWorking(true);
    setError('');
    try {
      const selectedId = await studio.managePassages({
        sourceId,
        passageId: id,
        orderedIds,
        action,
      });
      if (selectedId) setTarget(selectedId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <button
        className="button small"
        disabled={!studio.ready || studio.busy}
        onClick={() => {
          setTarget(studio.passage.id);
          setPosition(
            String(Math.max(1, passages.findIndex((p) => p.id === studio.passage.id) + 1)),
          );
          setOpen(true);
        }}
      >
        Organizar passagens
      </button>
      {open && (
        <dialog
          ref={dialog}
          aria-label="Organizar passagens"
          className="passage-manager"
          onCancel={(event) => {
            event.preventDefault();
            if (!working) setOpen(false);
          }}
        >
          <header>
            <h2>Organizar passagens</h2>
            <button className="button small" disabled={working} onClick={() => setOpen(false)}>
              Fechar
            </button>
          </header>
          <p>
            Administração da lista desta fonte. Excluir preserva a fonte e o histórico. Duplicar
            copia texto e árvore para um novo rascunho, sem aprovação nem recorte de PDF.
          </p>
          <label htmlFor="managed-passage">Passagem</label>
          <select
            {...workspaceAutofill}
            id="managed-passage"
            size={8}
            value={selected?.id ?? ''}
            onChange={(event) => {
              setTarget(event.target.value);
              setPosition(String(passages.findIndex((p) => p.id === event.target.value) + 1));
            }}
            disabled={working}
          >
            {passages.map((p, index) => (
              <option key={p.id} value={p.id}>
                {index + 1}. {label(p.id)}
              </option>
            ))}
          </select>
          {selected && (
            <fieldset disabled={working || studio.busy}>
              <legend>Ações da passagem {passages.indexOf(selected) + 1}</legend>
              <div className="passage-manager-actions">
                <button
                  className="button small"
                  disabled={passages.indexOf(selected) === 0}
                  onClick={() => void act('reorder', selected.id, passages.indexOf(selected) - 1)}
                >
                  ↑ Subir
                </button>
                <button
                  className="button small"
                  disabled={passages.indexOf(selected) === passages.length - 1}
                  onClick={() => void act('reorder', selected.id, passages.indexOf(selected) + 1)}
                >
                  ↓ Descer
                </button>
                <label>
                  Posição{' '}
                  <input
                    {...workspaceAutofill}
                    type="number"
                    min={1}
                    max={passages.length}
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                  />
                </label>
                <button
                  className="button small"
                  onClick={() => void act('reorder', selected.id, Number(position) - 1)}
                >
                  Mover
                </button>
                <button className="button small" onClick={() => void act('duplicate', selected.id)}>
                  Duplicar
                </button>
                <button className="button small" onClick={() => void act('delete', selected.id)}>
                  Excluir da lista
                </button>
              </div>
            </fieldset>
          )}
          {!!deleted.length && (
            <details>
              <summary>Excluídas ({deleted.length})</summary>
              {deleted.map((d) => (
                <div className="passage-manager-deleted" key={d.passageId}>
                  <span>{label(d.passageId)}</span>
                  <button
                    className="button small"
                    disabled={working}
                    onClick={() => void act('restore', d.passageId)}
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </details>
          )}
          {working && <p role="status">Salvando organização…</p>}
          {error && <p role="alert">{error}</p>}
        </dialog>
      )}
    </>
  );
}

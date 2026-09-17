import { useState } from 'react';
import { invoke, type SourcePreview } from '../domain/authoring';

interface RecoveryItem {
  id: string;
  path: string;
  createdAt?: string;
  kind: string;
  recoverable: boolean;
}
export function SourceRecovery({ onPreview }: { onPreview: (preview: SourcePreview) => void }) {
  const [items, setItems] = useState<RecoveryItem[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setMessage('');
    try {
      const result = await invoke<{ items: RecoveryItem[]; diagnostics: string[] }>(
        'source_recovery_list',
      );
      setItems(result.items);
      setMessage(result.diagnostics.join('\n'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary
        onClick={() => {
          if (items === null) void load();
        }}
      >
        Recuperar uma aplicação anterior
      </summary>
      <p>
        O Studio conserva os bytes anteriores a cada aplicação. A restauração gera outra diferença
        para revisão e exige que a fonte ainda corresponda à aplicação escolhida.
      </p>
      <button className="button" disabled={busy} onClick={() => void load()}>
        Atualizar recuperações
      </button>
      {items?.map((item) => (
        <article key={item.id}>
          <p>
            {item.path.split('/').slice(-2).join('/')} · {item.createdAt ?? item.id}
          </p>
          <button
            className="button"
            disabled={busy || !item.recoverable}
            onClick={() => {
              setBusy(true);
              void invoke<SourcePreview>('source_recover', { recoveryId: item.id })
                .then(onPreview)
                .catch((error) => setMessage(error.message))
                .finally(() => setBusy(false));
            }}
          >
            {item.recoverable
              ? 'Revisar restauração destes bytes'
              : 'Arquivo mudou; conciliação manual necessária'}
          </button>
        </article>
      ))}
      {items?.length === 0 && <p>Nenhuma aplicação recuperável registrada neste projeto.</p>}
      {message && <p role="alert">{message}</p>}
    </details>
  );
}

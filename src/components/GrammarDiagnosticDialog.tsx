import { useEffect, useRef, useState } from 'react';
import type { CanvasDiagnostic } from '../domain/grammar-diagnostic';
import { grammarDiagnostic } from '../domain/grammar-diagnostic';
import type { Passage, StudioProject } from '../domain/types';
import '../grammar-diagnostic.css';

export function GrammarDiagnosticDialog({
  project,
  passage,
  report,
  onClose,
}: {
  project: StudioProject;
  passage: Passage;
  report: CanvasDiagnostic;
  onClose: () => void;
}) {
  const { prompt } = grammarDiagnostic(project, passage, report);
  const [status, setStatus] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="grammar-diagnostic-dialog"
      onCancel={onClose}
      aria-label="Diagnóstico para corrigir a gramática"
    >
      <header>
        <h2>Levar o diagnóstico ao agente de código</h2>
        <button className="button" onClick={onClose} aria-label="Fechar diagnóstico">
          Fechar
        </button>
      </header>
      <p>
        O prompt reúne a expressão, as etapas que funcionam, a falha e o caminho da gramática local.
      </p>
      <textarea aria-label="Prompt de correção da gramática" readOnly value={prompt} rows={15} />
      <div className="grammar-diagnostic-actions">
        <button
          className="button primary"
          onClick={async () => {
            try {
              if (window.studio?.copyText) await window.studio.copyText(prompt);
              else await navigator.clipboard.writeText(prompt);
              setStatus(
                'Prompt copiado. Cole no seu agente de código para investigar a gramática.',
              );
            } catch {
              setStatus('Selecione o texto acima e copie com o teclado.');
            }
          }}
        >
          Copiar prompt
        </button>
        <button
          className="button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([prompt], { type: 'text/markdown;charset=utf-8' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = `pydicate-diagnostico-${passage.ordinal}.md`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            setStatus('Diagnóstico exportado.');
          }}
        >
          Exportar diagnóstico
        </button>
      </div>
      <p role="status">{status}</p>
    </dialog>
  );
}

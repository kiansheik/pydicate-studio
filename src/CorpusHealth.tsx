import { useEffect, useRef, useState } from 'react';
import { invoke } from './domain/authoring';
import type { Studio } from './useStudio';

type Issue = {
  ordinal: number;
  passageId?: string;
  kind: string;
  expected?: string;
  actual?: string;
  message?: string;
};
type Health = {
  busy?: boolean;
  activeRepairs: number;
  checkedAt?: string;
  durationMs?: number;
  totals?: {
    sources: number;
    lines: number;
    divergent: number;
    failures: number;
    pending: number;
    morphemes: number;
  };
  sources?: {
    sourceId: string;
    title: string;
    lines: number;
    approved: number;
    unreviewed: number;
    divergent: number;
    failed: number;
    pending: number;
    error?: string;
    issues: Issue[];
  }[];
  interruptedRepairs?: {
    id: string;
    passageId: string;
    error?: string;
    verified: boolean;
    checked: number;
  }[];
};

export function CorpusHealth({ studio }: { studio: Studio }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Health>();
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  if (studio.project.mode !== 'local' || !window.studio?.invoke) return null;
  async function check() {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      setReport(await invoke<Health>('corpus_health', { projectId: studio.project.id }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }
  function go(id: string) {
    studio.setSelectedId(id);
    setOpen(false);
  }
  return (
    <>
      <button
        className="button small corpus-health-button"
        disabled={loading || !studio.ready}
        onClick={() => void check()}
      >
        Saúde do corpus
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="corpus-health-dialog"
          aria-label="Saúde do corpus"
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <header>
            <h2>Saúde do corpus</h2>
            <button className="button small" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </header>
          <p>
            Verificação de leitura, sem IA e sem alterar passagens. Rascunhos pendentes são contados
            separadamente; as linhas salvas na fonte são reavaliadas pelo motor.
          </p>
          <button className="button small" disabled={loading} onClick={() => void check()}>
            Verificar novamente
          </button>
          {loading && <p role="status">Reavaliando o corpus…</p>}
          {error && <p role="alert">Verificação não concluída: {error}</p>}
          {report?.busy && (
            <p role="status">
              {report.activeRepairs} correção(ões) da gramática em andamento. Aguarde a conclusão
              para verificar uma versão estável.
            </p>
          )}
          {report?.totals && (
            <>
              <p>
                Verificado em {new Date(report.checkedAt!).toLocaleString('pt-BR')} ·{' '}
                {((report.durationMs ?? 0) / 1000).toFixed(1)} s
                {loading || error ? ' · Resultado anterior' : ''}
              </p>
              <p className="corpus-health-summary">
                <strong>{report.totals.lines}</strong> linhas ·{' '}
                <strong>{report.totals.sources}</strong> fontes ·{' '}
                <strong>{report.totals.divergent}</strong> divergências ·{' '}
                <strong>{report.totals.failures}</strong> falhas ·{' '}
                <strong>{report.totals.pending}</strong> rascunhos pendentes
              </p>
              <p>
                <strong>{report.totals.morphemes}</strong> formas de morfemas distintas nas linhas
                avaliadas (forma + etiqueta do motor; não é a contagem de lemas do dicionário).
              </p>
              <div className="corpus-health-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fonte</th>
                      <th>Linhas</th>
                      <th>Com referência</th>
                      <th>Sem referência</th>
                      <th>Pendentes</th>
                      <th>Divergências</th>
                      <th>Falhas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sources?.map((s) => (
                      <tr key={s.sourceId}>
                        <th>{s.title}</th>
                        <td>{s.lines}</td>
                        <td>{s.approved}</td>
                        <td>{s.unreviewed}</td>
                        <td>{s.pending}</td>
                        <td>{s.divergent}</td>
                        <td>{s.failed + Number(!!s.error)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.sources
                ?.filter((s) => s.error || s.issues.length)
                .map((s) => (
                  <section key={s.sourceId}>
                    <h3>{s.title}</h3>
                    {s.error && <p role="alert">{s.error}</p>}
                    {s.issues.map((i) => (
                      <div className="corpus-health-issue" key={i.ordinal}>
                        {i.passageId &&
                        studio.project.passages.some((p) => p.id === i.passageId) ? (
                          <button className="button small" onClick={() => go(i.passageId!)}>
                            Abrir linha {i.ordinal}
                          </button>
                        ) : (
                          <strong>Linha {i.ordinal}</strong>
                        )}
                        {i.kind === 'error' ? (
                          <p>Falha: {i.message}</p>
                        ) : (
                          <>
                            <p>Referência: {i.expected}</p>
                            <p>Resultado: {i.actual}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </section>
                ))}
              {!!report.interruptedRepairs?.length && (
                <details>
                  <summary>Correções interrompidas ({report.interruptedRepairs.length})</summary>
                  <p>
                    Registro histórico das tentativas; a verificação acima representa o corpus
                    atual.
                  </p>
                  {report.interruptedRepairs.map((j) => (
                    <p key={j.id}>
                      {j.error} · Última verificação salva:{' '}
                      {j.verified
                        ? `${j.checked} linhas verificadas; forma pretendida obtida`
                        : 'não concluída'}
                      {studio.project.passages.some((p) => p.id === j.passageId) && (
                        <button className="button small" onClick={() => go(j.passageId)}>
                          Abrir passagem
                        </button>
                      )}
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
        </dialog>
      )}
    </>
  );
}

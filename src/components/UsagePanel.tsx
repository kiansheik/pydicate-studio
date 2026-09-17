import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { invoke } from '../domain/authoring';
import { track } from '../domain/usage';
interface Status {
  enabled: boolean;
  directory: string;
  profileLabel: string;
  lastError?: string;
  bytes: number;
}
interface Report {
  totalEvents: number;
  sessions: { sessionId: string; firstAt: string; events: number; passages: number }[];
  actions: { event: string; count: number }[];
  errors: { event: string; errorCode: string; count: number; lastAt: string }[];
  latencies: { event: string; p95Ms: number }[];
  repeatedActionsWithin30Seconds: { event: string; count: number }[];
}
export function UsagePanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>();
  const [report, setReport] = useState<Report>();
  const [days, setDays] = useState(7);
  const [profile, setProfile] = useState('');
  const [error, setError] = useState('');
  const loadSequence = useRef(0);
  const currentDays = useRef(days);
  currentDays.current = days;
  const profileLoaded = useRef(false);
  async function load() {
    const sequence = ++loadSequence.current;
    try {
      const [nextStatus, nextReport] = await Promise.all([
        invoke<Status>('usage_status'),
        invoke<Report>('usage_report', { days }),
      ]);
      if (sequence !== loadSequence.current || days !== currentDays.current) return;
      setStatus(nextStatus);
      if (!profileLoaded.current) {
        setProfile(nextStatus.profileLabel || '');
        profileLoaded.current = true;
      }
      setReport(nextReport);
      setError('');
    } catch (reason) {
      if (sequence === loadSequence.current) setError(String(reason));
    }
  }
  useEffect(() => {
    void load();
  }, [days]);
  async function configure(patch: Record<string, unknown>) {
    try {
      await invoke('usage_configure', patch);
      await load();
    } catch (reason) {
      setError(String(reason));
    }
  }
  async function download() {
    try {
      const data = await invoke<{ filename: string; content: string }>('usage_export', { days });
      const url = URL.createObjectURL(new Blob([data.content], { type: 'application/x-ndjson' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      track('usage.export', { count: report?.totalEvents ?? 0 });
    } catch (reason) {
      setError(String(reason));
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="usage-panel" role="dialog" aria-modal="true" aria-label="Atividade local">
        <header>
          <div>
            <span className="eyebrow">CADERNO DE USO</span>
            <h2>Atividade local</h2>
          </div>
          <button className="icon-button" aria-label="Fechar atividade" onClick={onClose}>
            <X />
          </button>
        </header>
        <p>
          Navegação, edições agrupadas, etapas da IA, duração das operações e erros ficam neste
          dispositivo entre sessões. O registro começa nesta versão.
        </p>
        <p className="field-hint">
          Sem transcrições, prompts, respostas da IA ou credenciais. Para comparar usuários, cada
          instalação tem um identificador próprio; você pode exportar os registros.
        </p>
        {error && <p role="alert">{error}</p>}
        {status && (
          <>
            <label>
              <input
                type="checkbox"
                checked={status.enabled}
                onChange={(event) => void configure({ enabled: event.target.checked })}
              />{' '}
              Registrar atividade neste dispositivo
            </label>
            <label className="editor-label">
              Nome opcional do perfil
              <input
                value={profile}
                maxLength={40}
                onChange={(event) => setProfile(event.target.value)}
                onBlur={() => void configure({ profileLabel: profile })}
                placeholder="Meu perfil"
              />
            </label>
            {status.lastError && <p role="alert">Falha no registro: {status.lastError}</p>}
          </>
        )}
        <div className="usage-controls">
          <label>
            Período{' '}
            <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={1}>Hoje / últimas 24 horas</option>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={3650}>Todo o histórico retido</option>
            </select>
          </label>
          <button className="button" onClick={() => void load()}>
            Atualizar
          </button>
          <button className="button" onClick={() => void download()}>
            Exportar registros
          </button>
        </div>
        {report && (
          <>
            <div className="usage-totals">
              <strong>{report.sessions.length} sessões</strong>
              <strong>{report.totalEvents} eventos</strong>
              <strong>{report.errors.reduce((n, row) => n + row.count, 0)} erros</strong>
            </div>
            <h3>Erros observados</h3>
            {!report.errors.length ? (
              <p>Nenhum erro registrado neste período.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Operação</th>
                    <th>Diagnóstico</th>
                    <th>Vezes</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((row, index) => (
                    <tr key={index}>
                      <td>{row.event}</td>
                      <td>{row.errorCode}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3>Eventos mais frequentes</h3>
            <table>
              <tbody>
                {report.actions.slice(0, 12).map((row) => (
                  <tr key={row.event}>
                    <td>{row.event}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details>
              <summary>Demoras e ações repetidas</summary>
              <table>
                <tbody>
                  {report.latencies.slice(0, 8).map((row, index) => (
                    <tr key={index}>
                      <td>{row.event}</td>
                      <td>95% até {(row.p95Ms / 1000).toFixed(1)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul>
                {report.repeatedActionsWithin30Seconds.map((row) => (
                  <li key={row.event}>
                    {row.event}: {row.count} repetições em até 30 s
                  </li>
                ))}
              </ul>
              <p>
                Repetições são observações; podem ser trabalho intencional. Não medem desperdício
                nem qualidade editorial.
              </p>
            </details>
          </>
        )}
        {status && (
          <details>
            <summary>Arquivo para análise entre sessões</summary>
            <code>{status.directory}</code>
            <p>
              Arquivos JSONL locais, até 24 arquivos de aproximadamente 1 MiB, com rotação. O
              histórico exportado pode ser analisado por um agente.
            </p>
          </details>
        )}
      </section>
    </div>
  );
}

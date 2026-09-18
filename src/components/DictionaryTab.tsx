import { useEffect, useRef, useState } from 'react';
import { invoke } from '../domain/authoring';
import { DictionaryEntryCreation, type DictionarySelection } from './DictionaryEntryCreation';
import '../dictionary-tab.css';
import type { AnalysisEvidence } from '../domain/analysis';

interface DictionaryStatus {
  available: boolean;
  url?: string;
  message?: string;
  datasetFingerprint?: string;
}
interface Props {
  projectId: string;
  passageId: string;
  sourceId: string;
  revisionId: string;
  engineFingerprint?: string;
  disabled?: boolean;
  active: boolean;
  reference?: AnalysisEvidence | null;
  onInsert: (expression: string, expectedRevision: string) => boolean;
}
const dictionaryOrigin = 'studio://dictionary';
const dictionaryUrl = (projectId: string, fingerprint?: string) =>
  `${dictionaryOrigin}/nhe-enga/?projectId=${encodeURIComponent(projectId)}&dataset=${encodeURIComponent(fingerprint ?? '')}`;
function validStatus(status: DictionaryStatus, projectId: string) {
  if (!status.available || !/^sha256:[a-f0-9]{64}$/.test(status.datasetFingerprint ?? ''))
    return false;
  try {
    const url = new URL(status.url ?? dictionaryUrl(projectId, status.datasetFingerprint));
    return (
      url.protocol === 'studio:' &&
      url.hostname === 'dictionary' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/nhe-enga/' &&
      url.hash === '' &&
      url.searchParams.get('projectId') === projectId &&
      url.searchParams.get('dataset') === status.datasetFingerprint &&
      [...url.searchParams.keys()].every((key) => key === 'projectId' || key === 'dataset')
    );
  } catch {
    return false;
  }
}
function selectedEntry(
  data: unknown,
  fingerprint: string,
): data is DictionarySelection & { type: string; version: number } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const message = data as Record<string, unknown>;
  return (
    Object.keys(message).length === 4 &&
    Object.keys(message).every((key) =>
      ['type', 'version', 'entryIndex', 'datasetFingerprint'].includes(key),
    ) &&
    message.type === 'studio-dictionary-select' &&
    message.version === 1 &&
    Number.isSafeInteger(message.entryIndex) &&
    Number(message.entryIndex) >= 0 &&
    Number(message.entryIndex) <= 1_000_000 &&
    message.datasetFingerprint === fingerprint
  );
}

/** The site stays mounted across modes; only verified selections cross into authoring. */
export function DictionaryTab(props: Props) {
  const [visited, setVisited] = useState(props.active);
  const [status, setStatus] = useState<DictionaryStatus | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<DictionarySelection | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const contextKey = JSON.stringify([
    props.projectId,
    props.passageId,
    props.sourceId,
    props.revisionId,
    props.engineFingerprint,
  ]);
  useEffect(() => {
    if (props.active) setVisited(true);
  }, [props.active]);
  useEffect(() => {
    setSelection(null);
  }, [contextKey, props.active]);
  useEffect(() => {
    const reference = props.reference;
    if (!props.active || !reference || !status?.datasetFingerprint) return;
    if (
      Number.isSafeInteger(reference.entryIndex) &&
      reference.datasetFingerprint === status.datasetFingerprint
    )
      setSelection({
        entryIndex: Number(reference.entryIndex),
        datasetFingerprint: status.datasetFingerprint,
      });
  }, [props.reference, props.active, status?.datasetFingerprint]);
  useEffect(() => {
    if (!visited) return;
    let current = true;
    setStatus(null);
    setError('');
    setSelection(null);
    void invoke<DictionaryStatus>('dictionary_status', { projectId: props.projectId })
      .then((result) => {
        if (!current) return;
        if (result.available && !validStatus(result, props.projectId))
          throw new Error('O endereço ou a versão do dicionário local não pôde ser confirmado.');
        setStatus(result);
      })
      .catch((reason) => {
        if (current) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      current = false;
    };
  }, [visited, props.projectId, props.engineFingerprint, attempt]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (
        !latest.current.active ||
        latest.current.disabled ||
        !status?.available ||
        !status.datasetFingerprint ||
        !frame.current ||
        event.source !== frame.current.contentWindow ||
        event.origin !== dictionaryOrigin ||
        !selectedEntry(event.data, status.datasetFingerprint)
      )
        return;
      setSelection({
        entryIndex: event.data.entryIndex,
        datasetFingerprint: event.data.datasetFingerprint,
      });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [status]);
  if (!visited) return null;
  return (
    <section
      className="dictionary-tab"
      aria-label="Dicionário de tupi antigo"
      hidden={!props.active}
    >
      <header className="dictionary-tab-heading">
        <div>
          <h2>Dicionário</h2>
          <p>Pesquise um verbete e escolha sua acepção para adicionar uma peça à árvore.</p>
        </div>
        <button type="button" disabled={!status} onClick={() => setAttempt((value) => value + 1)}>
          Atualizar dicionário
        </button>
      </header>
      {props.reference && (
        <aside className="dictionary-evidence-reference" aria-label="Verbete citado pela IA">
          <strong>
            {props.reference.headword ||
              props.reference.title ||
              props.reference.label ||
              'Evidência do dicionário'}
          </strong>
          <p>{String(props.reference.definition ?? props.reference.text ?? '')}</p>
          <small>
            {props.reference.entryId !== undefined
              ? `Identidade da entrada: ${props.reference.entryId}. `
              : ''}
            Registro preservado com a proposta. A inserção usa a identidade e a versão verificadas
            do dicionário.
          </small>
        </aside>
      )}
      {selection && (
        <DictionaryEntryCreation
          selection={selection}
          projectId={props.projectId}
          passageId={props.passageId}
          sourceId={props.sourceId}
          revisionId={props.revisionId}
          engineFingerprint={props.engineFingerprint}
          contextKey={contextKey}
          active={props.active}
          disabled={props.disabled}
          onInsert={(expression, expectedRevision) =>
            expectedRevision === undefined ? false : props.onInsert(expression, expectedRevision)
          }
          onCancel={() => setSelection(null)}
        />
      )}
      {!status && !error && <p role="status">Abrindo o dicionário local…</p>}
      {(error || (status && !status.available)) && (
        <div className="dictionary-unavailable">
          <p role={error ? 'alert' : 'status'}>
            {error || status?.message || 'O dicionário não está disponível no projeto local.'}
          </p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {status?.available && (
        <iframe
          key={`${props.projectId}:${status.datasetFingerprint}`}
          ref={frame}
          title="Dicionário de tupi antigo"
          src={status.url ?? dictionaryUrl(props.projectId, status.datasetFingerprint)}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      )}
    </section>
  );
}

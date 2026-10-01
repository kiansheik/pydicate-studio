import { useEffect, useRef, useState } from 'react';
import { invoke } from '../domain/authoring';
import { DictionaryEntryCreation, type DictionarySelection } from './DictionaryEntryCreation';
import '../dictionary-tab.css';
import type { AnalysisEvidence } from '../domain/analysis';
import { markUsageActivity } from '../domain/usage';

interface DictionaryStatus {
  available: boolean;
  url?: string;
  message?: string;
  datasetFingerprint?: string;
}
export interface DictionaryNavigation {
  entryIndex?: number;
  datasetFingerprint?: string;
  query?: string;
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
  navigation?: DictionaryNavigation | null;
  onNavigationChange?: (navigation: DictionaryNavigation) => void;
  onInsert: (expression: string, expectedRevision: string) => boolean;
}
const dictionaryOrigin = 'studio://dictionary';
const navigationKey = (navigation?: DictionaryNavigation | null) =>
  JSON.stringify([
    navigation?.entryIndex ?? null,
    navigation?.datasetFingerprint ?? null,
    navigation?.query ?? '',
  ]);
const dictionaryUrl = (projectId: string, fingerprint?: string) =>
  `${dictionaryOrigin}/nhe-enga/?projectId=${encodeURIComponent(projectId)}&dataset=${encodeURIComponent(fingerprint ?? '')}`;
function validStatus(status: DictionaryStatus, projectId: string) {
  if (!status.available || !/^sha256:[a-f0-9]{64}$/.test(status.datasetFingerprint ?? ''))
    return false;
  try {
    const url = new URL(status.url ?? dictionaryUrl(projectId, status.datasetFingerprint));
    return (
      ((url.protocol === 'studio:' && url.hostname === 'dictionary' && url.port === '') ||
        (['https:', 'http:'].includes(url.protocol) && url.origin === window.location.origin)) &&
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
  const [frameReady, setFrameReady] = useState(false);
  const emittedNavigation = useRef<string | null>(null);
  const iframeNavigation = useRef<string | null>(null);
  const selectionNavigation = useRef<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const requestedNavigation = navigationKey(props.navigation);
  const controlledNavigation = props.navigation !== undefined;
  const staleNavigation =
    props.navigation?.entryIndex !== undefined &&
    !!status?.datasetFingerprint &&
    props.navigation.datasetFingerprint !== status.datasetFingerprint;
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
    ) {
      selectionNavigation.current = navigationKey(latest.current.navigation);
      setSelection({
        entryIndex: Number(reference.entryIndex),
        datasetFingerprint: status.datasetFingerprint,
      });
    }
  }, [props.reference, props.active, status?.datasetFingerprint]);
  useEffect(() => {
    if (!visited) return;
    let current = true;
    setStatus(null);
    setFrameReady(false);
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
    if (props.navigation === undefined) return;
    // Restoring a URL is consultation only. It must never instantiate the
    // creation component, which can insert an unambiguous entry automatically.
    if (emittedNavigation.current !== requestedNavigation) setSelection(null);
    emittedNavigation.current = null;
  }, [requestedNavigation, controlledNavigation]);
  useEffect(() => {
    if (
      !props.active ||
      !frameReady ||
      !status?.available ||
      props.navigation === undefined ||
      staleNavigation
    )
      return;
    // The iframe already rendered a real search/selection. Acknowledging its
    // URL state must not run that search a second time.
    const alreadyVisible = iframeNavigation.current === requestedNavigation;
    iframeNavigation.current = null;
    if (alreadyVisible) return;
    const navigation = props.navigation;
    if (
      navigation?.entryIndex !== undefined &&
      (!Number.isSafeInteger(navigation.entryIndex) ||
        navigation.entryIndex < 0 ||
        navigation.entryIndex > 1_000_000)
    )
      return;
    const origin =
      !status.url || status.url.startsWith('studio:')
        ? dictionaryOrigin
        : new URL(status.url).origin;
    frame.current?.contentWindow?.postMessage(
      {
        type: 'studio-dictionary-reveal',
        version: 1,
        entryIndex: navigation?.entryIndex ?? null,
        query: (navigation?.query ?? '').slice(0, 300),
        datasetFingerprint: status.datasetFingerprint,
      },
      origin,
    );
  }, [
    props.active,
    requestedNavigation,
    controlledNavigation,
    frameReady,
    status,
    staleNavigation,
  ]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (
        !latest.current.active ||
        !status?.available ||
        !status.datasetFingerprint ||
        !frame.current ||
        event.source !== frame.current.contentWindow ||
        event.origin !==
          (!status.url || status.url.startsWith('studio:')
            ? dictionaryOrigin
            : new URL(status.url!).origin)
      )
        return;
      const data =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : null;
      if (
        data?.type === 'studio-dictionary-activity' &&
        data.version === 1 &&
        data.datasetFingerprint === status.datasetFingerprint &&
        Object.keys(data).length === 3
      ) {
        markUsageActivity();
        return;
      }
      if (
        data?.type === 'studio-dictionary-ready' &&
        data.version === 1 &&
        data.datasetFingerprint === status.datasetFingerprint &&
        Object.keys(data).length === 3
      ) {
        setFrameReady(true);
        return;
      }
      if (
        data?.type === 'studio-dictionary-navigation' &&
        data.version === 1 &&
        data.datasetFingerprint === status.datasetFingerprint &&
        Object.keys(data).length === 5 &&
        typeof data.query === 'string' &&
        data.query.length <= 300 &&
        (data.entryIndex === null ||
          (Number.isSafeInteger(data.entryIndex) &&
            Number(data.entryIndex) >= 0 &&
            Number(data.entryIndex) <= 1_000_000))
      ) {
        const next: DictionaryNavigation = {
          ...(data.entryIndex !== null
            ? { entryIndex: Number(data.entryIndex), datasetFingerprint: status.datasetFingerprint }
            : {}),
          ...(data.query ? { query: data.query } : {}),
        };
        emittedNavigation.current = navigationKey(next);
        iframeNavigation.current = navigationKey(next);
        latest.current.onNavigationChange?.(next);
        if (data.entryIndex === null) setSelection(null);
        return;
      }
      if (latest.current.disabled || !selectedEntry(event.data, status.datasetFingerprint)) return;
      const next: DictionaryNavigation = {
        entryIndex: event.data.entryIndex,
        datasetFingerprint: event.data.datasetFingerprint,
        ...(latest.current.navigation?.query ? { query: latest.current.navigation.query } : {}),
      };
      emittedNavigation.current = navigationKey(next);
      iframeNavigation.current = navigationKey(next);
      selectionNavigation.current = navigationKey(next);
      latest.current.onNavigationChange?.(next);
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
      {staleNavigation && (
        <p role="status">
          O verbete deste link pertence a outra versão do dicionário. Pesquise novamente para
          conferir a entrada.
        </p>
      )}
      {selection &&
        (!controlledNavigation || selectionNavigation.current === requestedNavigation) && (
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
          onLoad={() => setFrameReady(true)}
          title="Dicionário de tupi antigo"
          src={status.url ?? dictionaryUrl(props.projectId, status.datasetFingerprint)}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      )}
    </section>
  );
}

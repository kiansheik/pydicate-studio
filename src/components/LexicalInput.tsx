import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { invoke } from '../domain/authoring';
import { track } from '../domain/usage';
import '../lexical-input.css';

export interface StructureSource {
  sourceId: string;
  ordinal?: number;
  passageId?: string;
  label: string;
  nodeId?: string;
  draft?: boolean;
}

export interface StructureCandidate {
  id: string;
  surface: string;
  expression: string;
  name?: string;
  definition?: string;
  kind: 'reference' | 'expression';
  source: StructureSource;
  match: 'exact' | 'prefix' | 'contains' | 'name' | 'definition' | 'relaxed' | 'segment';
}

interface StructureSearch {
  results: StructureCandidate[];
  total: number;
  indexFingerprint?: string;
  diagnostics?: (string | { message: string })[];
}

export interface ResolvedStructure {
  expression: string;
  surface: string;
  kind: 'reference' | 'expression';
  source: StructureSource;
}

export interface LexicalInputHandle {
  dismiss: () => void;
  focus: () => void;
}

export interface DictionaryLookupEntry {
  entryIndex: number;
  datasetFingerprint: string;
  headword: string;
  optionalNumber: string;
  definition: string;
  grammaticalInformation: string[];
  suggestedConstructor?: string;
  match: 'exact' | 'prefix' | 'contains' | 'definition' | 'relaxed';
}
interface DictionaryLookup {
  results: DictionaryLookupEntry[];
  total: number;
}

function storedQuery(key?: string) {
  try {
    return key ? (localStorage.getItem(key) ?? '') : '';
  } catch {
    return '';
  }
}

function sourceLabel(source: StructureSource) {
  const label = (source.label || source.sourceId)
    .replace(/araujo_catecismo_1686/g, 'Araújo')
    .replace(/bettendorff_catecismo_1687/g, 'Bettendorff');
  return [
    label,
    source.ordinal == null ||
    new RegExp(`(?:passagem\\s*|[#·:]\\s*)${source.ordinal}(?:\\b|$)`, 'i').test(label)
      ? ''
      : `passagem ${source.ordinal}`,
    source.draft ? 'rascunho' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Search text is never source code: only a resolved candidate or an explicit
 * code edit can supply an expression to the caller. */
export const LexicalInput = forwardRef<
  LexicalInputHandle,
  {
    value: string;
    onChange: (value: string) => void;
    label: string;
    passageId?: string;
    sourceId?: string;
    contextKey?: string;
    disabled?: boolean;
    dictionary?: {
      engineFingerprint?: string;
      onChoose: (entry: DictionaryLookupEntry) => void;
    };
    queryStorageKey?: string;
    onQueryChange?: () => void;
    showCode?: boolean;
    autoFocus?: boolean;
    closeOnBlur?: boolean;
    interactionActive?: boolean;
    onActivate?: () => void;
    onResolved?: (result: ResolvedStructure) => void;
    placeholder?: string;
    preserveQueryOnContextChange?: boolean;
  }
>(function LexicalInput(
  {
    value,
    onChange,
    label,
    passageId,
    sourceId,
    contextKey,
    disabled = false,
    dictionary,
    queryStorageKey,
    onQueryChange,
    showCode = true,
    autoFocus = false,
    closeOnBlur = true,
    interactionActive = true,
    onActivate,
    onResolved,
    placeholder = 'Escreva como se lê em tupi…',
    preserveQueryOnContextChange = false,
  },
  ref,
) {
  const id = useId();
  const [query, setQuery] = useState(() => storedQuery(queryStorageKey));
  const [open, setOpen] = useState(() => Boolean(storedQuery(queryStorageKey)));
  const [response, setResponse] = useState<StructureSearch | null>(null);
  const [dictionaryResponse, setDictionaryResponse] = useState<DictionaryLookup | null>(null);
  const [dictionarySearching, setDictionarySearching] = useState(false);
  const [dictionaryError, setDictionaryError] = useState('');
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const [refreshNotice, setRefreshNotice] = useState('');
  const [searchEpoch, setSearchEpoch] = useState(0);
  const [chosen, setChosen] = useState<ResolvedStructure | null>(null);
  const identity = `${passageId}:${sourceId}:${contextKey}:${dictionary?.engineFingerprint}:${query}:${interactionActive}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const request = useRef(0);
  const mounted = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const allowed = useRef(interactionActive && !disabled);
  allowed.current = interactionActive && !disabled;
  useImperativeHandle(
    ref,
    () => ({
      dismiss() {
        allowed.current = false;
        request.current++;
        setOpen(false);
        setChosen(null);
        setResponse(null);
        setDictionaryResponse(null);
        setSearching(false);
        setDictionarySearching(false);
        setResolving(false);
        setError('');
        setRefreshNotice('');
        setDictionaryError('');
      },
      focus() {
        input.current?.focus();
        setOpen(true);
      },
    }),
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);

  useEffect(() => {
    request.current++;
    if (!preserveQueryOnContextChange) setQuery(storedQuery(queryStorageKey));
    setChosen(null);
    setResponse(null);
    setError('');
    setRefreshNotice('');
    setSearching(false);
    setResolving(false);
    if (!preserveQueryOnContextChange) setOpen(Boolean(storedQuery(queryStorageKey)));
    setDictionaryResponse(null);
    setDictionaryError('');
  }, [
    passageId,
    sourceId,
    contextKey,
    queryStorageKey,
    dictionary?.engineFingerprint,
    preserveQueryOnContextChange,
  ]);

  useEffect(() => {
    if (!queryStorageKey) return;
    try {
      localStorage.setItem(queryStorageKey, query);
    } catch {
      /* optional convenience */
    }
  }, [query, queryStorageKey]);

  useEffect(() => {
    if (chosen && chosen.expression !== value) {
      setChosen(null);
      setQuery('');
    }
  }, [value, chosen]);

  useEffect(() => {
    setPreparing(false);
    if (!searching) return;
    const timer = setTimeout(() => setPreparing(true), 1500);
    return () => clearTimeout(timer);
  }, [searching]);

  useEffect(() => {
    if (open && (response?.results.length || dictionaryResponse?.results.length))
      document.getElementById(`${id}-candidate-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, response, dictionaryResponse, id]);

  useEffect(() => {
    const ticket = ++request.current;
    setResponse(null);
    setError('');
    setResolving(false);
    if (
      !interactionActive ||
      !open ||
      !query.trim() ||
      chosen ||
      disabled ||
      (!passageId && !sourceId)
    ) {
      setSearching(false);
      return;
    }
    let alive = true;
    const requestedIdentity = identity;
    setSearching(true);
    const timer = setTimeout(() => {
      void invoke<StructureSearch>('structure_search', {
        passageId,
        ...(sourceId ? { sourceId } : {}),
        query,
        limit: 8,
      })
        .then((result) => {
          if (!alive || ticket !== request.current || requestedIdentity !== currentIdentity.current)
            return;
          setResponse(result);
          setActive(0);
          track('lexicon.search', { source: 'rendered-form', resultCount: result.total });
        })
        .catch((reason: unknown) => {
          if (alive && ticket === request.current && requestedIdentity === currentIdentity.current)
            setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (alive && ticket === request.current && requestedIdentity === currentIdentity.current)
            setSearching(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    query,
    passageId,
    sourceId,
    contextKey,
    open,
    chosen,
    disabled,
    dictionary?.engineFingerprint,
    interactionActive,
    searchEpoch,
  ]);

  useEffect(() => {
    setDictionaryResponse(null);
    setDictionaryError('');
    if (!interactionActive || !dictionary || !open || !query.trim() || chosen || disabled) {
      setDictionarySearching(false);
      return;
    }
    let alive = true;
    const requestedIdentity = identity;
    setDictionarySearching(true);
    const timer = setTimeout(() => {
      void invoke<DictionaryLookup>('dictionary_lookup', {
        query,
        limit: 8,
        engineFingerprint: dictionary.engineFingerprint,
      })
        .then((result) => {
          if (!alive || requestedIdentity !== currentIdentity.current) return;
          setDictionaryResponse(result);
          track('lexicon.search', { source: 'dictionary', resultCount: result.total });
        })
        .catch((reason: unknown) => {
          if (alive && requestedIdentity === currentIdentity.current)
            setDictionaryError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (alive && requestedIdentity === currentIdentity.current) setDictionarySearching(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    query,
    passageId,
    sourceId,
    contextKey,
    open,
    chosen,
    disabled,
    Boolean(dictionary),
    dictionary?.engineFingerprint,
    interactionActive,
  ]);

  async function choose(candidate: StructureCandidate) {
    if (resolving || !allowed.current) return;
    const ticket = ++request.current;
    const requestedIdentity = currentIdentity.current;
    setResolving(true);
    setError('');
    setRefreshNotice('');
    try {
      const result = await invoke<ResolvedStructure>('structure_resolve', {
        passageId,
        ...(sourceId ? { sourceId } : {}),
        candidateId: candidate.id,
        indexFingerprint: response?.indexFingerprint,
      });
      if (
        !mounted.current ||
        !allowed.current ||
        ticket !== request.current ||
        requestedIdentity !== currentIdentity.current
      )
        return;
      onChange(result.expression);
      setChosen(result);
      setQuery(result.surface);
      setOpen(false);
      setResponse(null);
      track('lexicon.select', { source: 'rendered-form', category: result.kind, reused: true });
      onResolved?.(result);
    } catch (reason: unknown) {
      if (
        mounted.current &&
        ticket === request.current &&
        requestedIdentity === currentIdentity.current
      ) {
        if (
          reason &&
          typeof reason === 'object' &&
          'code' in reason &&
          reason.code === 'STALE_STRUCTURE_INDEX'
        ) {
          setChosen(null);
          setResponse(null);
          onChange('');
          setOpen(true);
          setRefreshNotice('As estruturas foram atualizadas. Escolha novamente nos resultados.');
          setSearchEpoch((value) => value + 1);
        } else setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (mounted.current && ticket === request.current) setResolving(false);
    }
  }

  const structures = response?.results ?? [];
  const dictionaryEntries = dictionaryResponse?.results ?? [];
  const candidates = [...structures, ...dictionaryEntries];
  function chooseDictionary(entry: DictionaryLookupEntry) {
    if (!allowed.current || resolving) return;
    setOpen(false);
    dictionary?.onChoose(entry);
    track('lexicon.select', { source: 'dictionary', category: 'entry', reused: false });
  }
  const showList = interactionActive && open && candidates.length > 0;
  return (
    <div
      className="lexical-input rendered-lookup"
      onBlur={(event) => {
        if (closeOnBlur && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input
        ref={input}
        aria-label={`${label}: buscar em tupi`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={`${id}-results`}
        aria-activedescendant={showList ? `${id}-candidate-${active}` : undefined}
        aria-describedby={`${id}-hint`}
        value={query}
        disabled={disabled}
        autoComplete="off"
        autoFocus={autoFocus}
        spellCheck={false}
        placeholder={placeholder}
        onFocus={() => {
          onActivate?.();
          if (!chosen) setOpen(true);
        }}
        onClick={() => {
          onActivate?.();
          if (!chosen) setOpen(true);
        }}
        onChange={(event) => {
          onActivate?.();
          request.current++;
          setQuery(event.target.value);
          setChosen(null);
          setOpen(true);
          setResponse(null);
          setDictionaryResponse(null);
          setError('');
          setRefreshNotice('');
          onChange('');
          onQueryChange?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            if (open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            onActivate?.();
            setOpen(true);
            if (candidates.length)
              setActive(
                (index) =>
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) %
                  candidates.length,
              );
          } else if (event.key === 'Enter' && query.trim()) {
            event.preventDefault();
            const candidate = candidates[active];
            if (showList && candidate) {
              if ('entryIndex' in candidate) chooseDictionary(candidate);
              else void choose(candidate);
            }
          }
        }}
      />
      <small id={`${id}-hint`} className="rendered-lookup-hint">
        {dictionary
          ? 'Busque em tupi ou pelo significado. Estruturas já usadas aparecem antes das entradas do dicionário.'
          : 'Espaços não importam. Busque também pelo significado ou nome conhecido.'}
      </small>
      <div className="rendered-lookup-popover">
        {interactionActive && refreshNotice && <p role="status">{refreshNotice}</p>}
        {interactionActive && open && searching && (
          <p role="status">
            {preparing
              ? 'Preparando as formas do projeto. A primeira busca pode levar alguns segundos.'
              : 'Buscando formas já usadas…'}
          </p>
        )}
        {showList && (
          <div className="rendered-lookup-results">
            <small>
              {dictionary ? (
                'Reutilizar uma estrutura ou criar uma peça do dicionário'
              ) : (
                <>
                  {response!.total}{' '}
                  {response!.total === 1 ? 'estrutura encontrada' : 'estruturas encontradas'}
                  {response!.total > structures.length ? ` · mostrando ${structures.length}` : ''}
                </>
              )}
            </small>
            <div id={`${id}-results`} role="listbox" aria-label={`Resultados: ${label}`}>
              {dictionary && !!structures.length && (
                <span className="lookup-group-label">Já usado no projeto</span>
              )}
              {structures.map((candidate, index) => (
                <button
                  key={candidate.id}
                  id={`${id}-candidate-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active === index}
                  disabled={resolving}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => void choose(candidate)}
                >
                  <strong>{candidate.surface || '∅ · forma vazia'}</strong>
                  {candidate.match === 'segment' && (
                    <span className="rendered-match-kind">
                      Trecho reconhecido · parte do que você escreveu
                    </span>
                  )}
                  {candidate.match === 'relaxed' && (
                    <span className="rendered-match-kind">Grafia aproximada</span>
                  )}
                  {candidate.definition && (
                    <span>
                      {candidate.kind === 'expression' ? 'Nota lexical: ' : ''}
                      {candidate.definition}
                    </span>
                  )}
                  <small>{sourceLabel(candidate.source)}</small>
                  <code title={candidate.expression}>{candidate.name ?? candidate.expression}</code>
                </button>
              ))}
              {!!dictionaryEntries.length && (
                <span className="lookup-group-label">Dicionário Navarro · criar peça</span>
              )}
              {dictionaryEntries.map((entry, index) => (
                <button
                  key={`${entry.datasetFingerprint}:${entry.entryIndex}`}
                  id={`${id}-candidate-${structures.length + index}`}
                  type="button"
                  role="option"
                  aria-selected={active === structures.length + index}
                  disabled={resolving}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(structures.length + index)}
                  onClick={() => chooseDictionary(entry)}
                >
                  <strong>
                    {entry.headword}
                    {entry.optionalNumber && <sup>{entry.optionalNumber}</sup>}
                  </strong>
                  {entry.match === 'relaxed' && (
                    <span className="rendered-match-kind">Grafia aproximada</span>
                  )}
                  <span>{entry.definition}</span>
                  <small>
                    {entry.grammaticalInformation?.join(' · ') || 'Escolher o tipo ao criar'} ·
                    Navarro
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
        {interactionActive && open && response && !candidates.length && !dictionarySearching && (
          <p role="status">
            {dictionary
              ? 'Nenhuma estrutura ou entrada encontrada. Tente uma parte menor ou o significado.'
              : 'Nenhuma estrutura encontrada. Tente uma parte menor ou o significado.'}
          </p>
        )}
        {interactionActive && open && dictionarySearching && (
          <p role="status">Consultando o dicionário Navarro…</p>
        )}
        {interactionActive && open && dictionaryError && (
          <p role="alert">Dicionário: {dictionaryError}</p>
        )}
        {interactionActive && open && !!response?.diagnostics?.length && (
          <details className="rendered-lookup-diagnostics">
            <summary>Algumas estruturas não puderam ser consultadas</summary>
            {response.diagnostics.map((diagnostic, index) => (
              <p key={index}>{typeof diagnostic === 'string' ? diagnostic : diagnostic.message}</p>
            ))}
          </details>
        )}
        {interactionActive && resolving && (
          <p role="status">Conferindo a estrutura nesta passagem…</p>
        )}
        {interactionActive && chosen && (
          <div className="rendered-lookup-chosen" role="status">
            <strong>{chosen.surface || '∅ · forma vazia'}</strong>
            <small>{sourceLabel(chosen.source)}</small>
            <span>Estrutura pronta para usar.</span>
          </div>
        )}
        {interactionActive && error && (
          <p role="alert" className="rendered-lookup-error">
            {error}
          </p>
        )}
      </div>
      {showCode && (
        <details className="rendered-lookup-code">
          <summary>Editar código Pydicate</summary>
          <input
            aria-label={label}
            value={value}
            disabled={disabled || resolving}
            spellCheck={false}
            autoComplete="off"
            placeholder="Variável, expressão ou valor"
            onChange={(event) => {
              request.current++;
              setQuery('');
              setChosen(null);
              setResponse(null);
              setError('');
              setOpen(false);
              onChange(event.target.value);
            }}
          />
        </details>
      )}
    </div>
  );
});

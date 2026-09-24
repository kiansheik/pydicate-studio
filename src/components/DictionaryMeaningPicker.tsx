import { useEffect, useRef, useState } from 'react';
import { invoke } from '../domain/authoring';
import './DictionaryMeaningPicker.css';

export interface DictionaryMeaningSelection {
  entryIndex: number;
  datasetFingerprint: string;
  headword: string;
  definition: string;
  optionalNumber?: string | number | null;
}
interface DictionaryMeaningEntry extends DictionaryMeaningSelection {
  match?: 'exact' | 'prefix' | 'contains' | 'definition' | 'relaxed';
  matchedField?: 'headword' | 'definition';
  matchedExcerpt?: string;
}
interface LookupResult {
  results: DictionaryMeaningEntry[];
  total: number;
  nextOffset?: number | null;
  datasetFingerprint: string;
  engineFingerprint?: string;
}
export interface DictionaryMeaningPickerProps {
  context: {
    passageId?: string;
    sourceId?: string;
    revisionId?: string;
    engineFingerprint?: string;
  };
  contextKey: string;
  initialQuery: string;
  disabled?: boolean;
  onSelect: (selection: DictionaryMeaningSelection) => void;
}

/** Consult dictionary senses without replacing the selected expression's morphology. */
export function DictionaryMeaningPicker(props: DictionaryMeaningPickerProps) {
  const identity = JSON.stringify([
    props.contextKey,
    props.context.passageId,
    props.context.sourceId,
    props.context.revisionId,
    props.context.engineFingerprint,
  ]);
  const live = useRef({ identity, disabled: props.disabled, onSelect: props.onSelect });
  live.current = { identity, disabled: props.disabled, onSelect: props.onSelect };
  const sequence = useRef(0);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(props.initialQuery.slice(0, 200));
  const [mode, setMode] = useState<'form' | 'meaning'>('form');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resultIdentity = useRef('');

  useEffect(() => {
    sequence.current++;
    setOpen(false);
    setQuery(props.initialQuery.slice(0, 200));
    setMode('form');
    setResult(null);
    setBusy(false);
    setError('');
  }, [identity, props.initialQuery]);
  useEffect(() => {
    if (props.disabled) {
      sequence.current++;
      setResult(null);
      setBusy(false);
    }
  }, [props.disabled]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  function clearResults() {
    sequence.current++;
    setResult(null);
    setBusy(false);
    setError('');
  }
  function close() {
    clearResults();
    setOpen(false);
  }
  async function search(offset = 0) {
    if (props.disabled || !query.trim()) return;
    const ticket = ++sequence.current;
    const requestedIdentity = identity;
    setBusy(true);
    setError('');
    if (!offset) setResult(null);
    const current = () =>
      mounted.current &&
      sequence.current === ticket &&
      live.current.identity === requestedIdentity &&
      !live.current.disabled;
    try {
      const response = await invoke<LookupResult>('dictionary_lookup', {
        ...props.context,
        query: query.trim(),
        limit: 12,
        offset,
        ...(mode === 'meaning' ? { matchField: 'definition' } : {}),
      });
      if (!current()) return;
      if (
        (props.context.engineFingerprint &&
          response.engineFingerprint !== props.context.engineFingerprint) ||
        response.results.some((entry) => entry.datasetFingerprint !== response.datasetFingerprint)
      )
        throw new Error('O dicionário ou o motor mudou. Consulte novamente antes de escolher.');
      if (offset && result?.datasetFingerprint !== response.datasetFingerprint)
        throw new Error('O dicionário mudou. Refaça a consulta para ver as acepções atuais.');
      resultIdentity.current = requestedIdentity;
      setResult({
        ...response,
        results: offset ? [...(result?.results ?? []), ...response.results] : response.results,
      });
    } catch (reason) {
      if (current()) {
        setResult(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  function select(entry: DictionaryMeaningEntry) {
    if (
      props.disabled ||
      busy ||
      resultIdentity.current !== live.current.identity ||
      !mounted.current
    )
      return;
    live.current.onSelect({
      entryIndex: entry.entryIndex,
      datasetFingerprint: entry.datasetFingerprint,
      headword: entry.headword,
      definition: entry.definition,
      optionalNumber: entry.optionalNumber,
    });
    close();
  }
  return (
    <section className="dictionary-meaning-picker" aria-label="Definições no Navarro">
      {!open ? (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => {
            setOpen(true);
            void search();
          }}
        >
          Consultar Navarro
        </button>
      ) : (
        <>
          <div className="dictionary-meaning-heading">
            <strong>Consultar Navarro</strong>
            <button type="button" aria-label="Fechar consulta Navarro" onClick={close}>
              Fechar
            </button>
          </div>
          <label>
            Tipo de consulta Navarro
            <select
              value={mode}
              disabled={props.disabled}
              onChange={(event) => {
                setMode(event.target.value as typeof mode);
                clearResults();
              }}
            >
              <option value="form">Forma</option>
              <option value="meaning">Significado</option>
            </select>
          </label>
          {mode === 'meaning' && (
            <p>
              A busca procura nas definições. Ao escolher, você usará a definição completa do
              verbete indicado.
            </p>
          )}
          <label>
            Forma ou significado a buscar
            <input
              type="search"
              value={query}
              maxLength={200}
              disabled={props.disabled}
              onChange={(event) => {
                setQuery(event.target.value);
                clearResults();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  close();
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  void search();
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy || props.disabled || !query.trim()}
            onClick={() => void search()}
          >
            Buscar no Navarro
          </button>
          {busy && <p role="status">Consultando o dicionário local…</p>}
          {error && <p role="alert">{error}</p>}
          {result && (
            <>
              <p role="status">
                {result.total === 1
                  ? '1 acepção encontrada.'
                  : result.total
                    ? `${result.total} acepções encontradas.`
                    : 'Nenhuma acepção encontrada.'}
              </p>
              <div className="dictionary-meaning-results">
                {result.results.map((entry) => {
                  const headwordMatch =
                    entry.matchedField === 'headword' ||
                    (!entry.matchedField &&
                      ['exact', 'prefix', 'contains'].includes(entry.match ?? ''));
                  return (
                    <article key={`${entry.datasetFingerprint}:${entry.entryIndex}`}>
                      <h5>
                        {entry.headword}
                        <sup>{entry.optionalNumber ?? ''}</sup>
                      </h5>
                      {headwordMatch || mode === 'meaning' ? (
                        <>
                          {mode === 'meaning' && (
                            <p className="dictionary-meaning-evidence">
                              Encontrado pelo significado
                            </p>
                          )}
                          <p className="dictionary-meaning-definition">{entry.definition}</p>
                          <button
                            type="button"
                            disabled={busy || props.disabled}
                            onClick={() => select(entry)}
                          >
                            Usar definição de {entry.headword}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="dictionary-meaning-evidence">Forma citada nesta entrada</p>
                          {entry.matchedExcerpt && <blockquote>{entry.matchedExcerpt}</blockquote>}
                          <p>
                            A definição do verbete pertence a {entry.headword}. Use o contexto
                            citado para revisar o significado desta composição.
                          </p>
                          <details>
                            <summary>Verbete completo</summary>
                            <p className="dictionary-meaning-definition">{entry.definition}</p>
                          </details>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
              {result.nextOffset != null && (
                <button
                  type="button"
                  disabled={busy || props.disabled}
                  onClick={() => void search(result.nextOffset!)}
                >
                  Ver mais acepções
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

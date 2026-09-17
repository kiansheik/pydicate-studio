import { useEffect, useRef, useState } from 'react';
import { invoke, type EvaluationFailure } from '../domain/authoring';
import './DictionaryEntryCreation.css';

export interface DictionarySelection {
  entryIndex: number;
  datasetFingerprint: string;
}
export interface DictionaryPredicateResult {
  status: 'ready' | 'needs-choice' | 'unavailable';
  entry: DictionarySelection & {
    headword: string;
    optionalNumber?: string | number | null;
    definition: string;
    grammaticalInformation: string[];
    dictionaryVid?: number;
  };
  constructors: string[];
  suggestedConstructor?: string;
  diagnostics: string[];
  engineFingerprint: string;
  expression?: string;
  evaluationStatus?: 'complete' | 'partial';
  surface?: string;
  failures?: EvaluationFailure[];
}
interface Props {
  selection: DictionarySelection;
  projectId?: string;
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
  engineFingerprint?: string;
  contextKey: string;
  disabled?: boolean;
  active?: boolean;
  onInsert: (expression: string, expectedRevision?: string) => boolean | void;
  onCancel: () => void;
}
const labels: Record<string, string> = {
  SizeSuffix: 'Sufixo de tamanho',
  Noun: 'Nome',
  ProperNoun: 'Nome próprio',
  Verb: 'Verbo',
  Pronoun: 'Pronome',
  Adverb: 'Advérbio',
  Postposition: 'Posposição',
  Interjection: 'Interjeição',
  Number: 'Número',
  Particle: 'Partícula',
  Conjunction: 'Conjunção',
  Demonstrative: 'Demonstrativo',
};
const staleMessage = 'A passagem ou a seleção mudou. Escolha o verbete novamente para inserir.';

/** Both dictionary surfaces use the same selected-sense conversion and revision guard. */
export function DictionaryEntryCreation(props: Props) {
  const { selection, active = true, disabled = false } = props;
  const identity = JSON.stringify([
    props.projectId,
    props.passageId,
    props.sourceId,
    props.revisionId,
    props.engineFingerprint,
    props.contextKey,
  ]);
  const bound = useRef({ selection, identity });
  if (bound.current.selection !== selection) bound.current = { selection, identity };
  const latest = useRef(props);
  latest.current = props;
  const liveIdentity = useRef(identity);
  liveIdentity.current = identity;
  const alive = useRef(true);
  const sequence = useRef(0);
  const completed = useRef(false);
  const [result, setResult] = useState<DictionaryPredicateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inserted, setInserted] = useState(false);
  const current = () =>
    alive.current &&
    bound.current.identity === liveIdentity.current &&
    latest.current.active !== false &&
    !latest.current.disabled;

  function insert(candidate: DictionaryPredicateResult, expectedRevision: string | undefined) {
    if (!current() || completed.current) {
      if (alive.current) setError(staleMessage);
      return;
    }
    if (
      candidate.status !== 'ready' ||
      !candidate.expression ||
      candidate.expression.length > 100_000
    )
      return;
    try {
      if (latest.current.onInsert(candidate.expression, expectedRevision) === false) {
        setError(staleMessage);
        return;
      }
      completed.current = true;
      setInserted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function prepare(constructor?: string) {
    if (!current()) {
      if (alive.current) setError(staleMessage);
      return;
    }
    const ticket = ++sequence.current;
    const requestedIdentity = identity;
    const revision = props.revisionId;
    setBusy(true);
    setError('');
    try {
      const response = await invoke<DictionaryPredicateResult>('dictionary_predicate', {
        ...selection,
        ...(props.projectId ? { projectId: props.projectId } : {}),
        ...(props.passageId ? { passageId: props.passageId } : {}),
        ...(props.sourceId ? { sourceId: props.sourceId } : {}),
        ...(props.revisionId ? { revisionId: props.revisionId } : {}),
        ...(props.engineFingerprint ? { engineFingerprint: props.engineFingerprint } : {}),
        ...(constructor ? { constructor } : {}),
      });
      if (!alive.current || ticket !== sequence.current) return;
      if (!current() || requestedIdentity !== liveIdentity.current) {
        setError(staleMessage);
        return;
      }
      if (
        response.entry?.entryIndex !== selection.entryIndex ||
        response.entry?.datasetFingerprint !== selection.datasetFingerprint ||
        (props.engineFingerprint && response.engineFingerprint !== props.engineFingerprint)
      )
        throw new Error('O dicionário ou o motor mudou. Atualize a consulta antes de inserir.');
      setResult(response);
      if (response.status === 'ready' && response.evaluationStatus === 'complete')
        insert(response, revision);
    } catch (reason) {
      if (alive.current && ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (alive.current && ticket === sequence.current) setBusy(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    completed.current = false;
    setResult(null);
    setBusy(false);
    setInserted(false);
    setError('');
    if (active && !disabled && bound.current.identity === identity) void prepare();
    else if (bound.current.identity !== identity) setError(staleMessage);
    return () => {
      alive.current = false;
      sequence.current++;
    };
    // A selected sense is bound to its original editing context; callbacks stay in latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, identity, active, disabled]);

  return (
    <section
      className="dictionary-entry-creation"
      aria-label="Adicionar verbete à árvore"
      aria-busy={busy}
    >
      <header>
        <strong>
          {result ? (
            <>
              {result.entry.headword}
              <sup>{result.entry.optionalNumber ?? ''}</sup>
            </>
          ) : (
            'Preparando o verbete…'
          )}
        </strong>
        <button
          type="button"
          className="dictionary-choice-close"
          onClick={props.onCancel}
          aria-label="Fechar escolha do verbete"
        >
          ×
        </button>
      </header>
      {result && <p className="dictionary-entry-definition">{result.entry.definition}</p>}
      {busy && <p role="status">Conferindo esta acepção no motor local…</p>}
      {inserted && <p role="status">Verbete adicionado à árvore.</p>}
      {error && <p role="alert">{error}</p>}
      {!inserted && result && (
        <>
          {result.status === 'needs-choice' && <p>Qual função esta acepção terá na construção?</p>}
          {result.status === 'unavailable' && (
            <p>Esta acepção precisa de outra definição antes de entrar na árvore.</p>
          )}
          {result.diagnostics.length > 0 && (
            <ul className="dictionary-entry-diagnostics">
              {result.diagnostics.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          )}
          {result.status !== 'ready' && result.constructors.length > 0 && (
            <div
              className="dictionary-constructor-choices"
              role="group"
              aria-label="Função do verbete"
            >
              {result.constructors.map((name) => (
                <button
                  type="button"
                  key={name}
                  disabled={busy || disabled || bound.current.identity !== identity}
                  onClick={() => void prepare(name)}
                >
                  {labels[name] ?? name}
                </button>
              ))}
            </div>
          )}
          {result.status === 'ready' && result.evaluationStatus === 'partial' && (
            <>
              <p className="dictionary-partial-label">
                Resultado parcial: esta peça ainda precisa de atenção na construção.
              </p>
              {!!result.failures?.length && (
                <ul className="dictionary-entry-diagnostics">
                  {result.failures.map((failure, index) => (
                    <li key={index}>{failure.message}</li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                disabled={busy || disabled || bound.current.identity !== identity}
                onClick={() => insert(result, props.revisionId)}
              >
                Adicionar à árvore com diagnóstico
              </button>
            </>
          )}
          {result.expression && (
            <details>
              <summary>Expressão preparada</summary>
              <code>{result.expression}</code>
            </details>
          )}
        </>
      )}
    </section>
  );
}

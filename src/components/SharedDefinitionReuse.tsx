import { useEffect, useRef, useState } from 'react';
import { invoke } from '../domain/authoring';
import type {
  SharedDefinitionCandidate,
  SharedDefinitionTarget,
} from '../domain/shared-definition';
import { workspaceAutofill } from '../domain/workspace-autofill';

/** Choosing a definition changes only this tab's proposal; publication stays reviewed. */
export function SharedDefinitionReuse(props: {
  target: SharedDefinitionTarget;
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
  engineFingerprint?: string;
  inactive?: boolean;
  disabled?: boolean;
  onChoose: (raw: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(props.target.name);
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    results?: SharedDefinitionCandidate[];
    total?: number;
    error?: string;
  }>();
  const identity = JSON.stringify([
    props.target,
    props.passageId,
    props.sourceId,
    props.revisionId,
    props.engineFingerprint,
    query,
    open,
    props.inactive,
    props.disabled,
  ]);
  const live = useRef(identity);
  const generation = useRef(0);
  live.current = identity;
  useEffect(() => {
    const version = ++generation.current;
    setSnapshot(undefined);
    if (!open || props.inactive || props.disabled || !query.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      void invoke<{ results: SharedDefinitionCandidate[]; total: number }>('lexicon_search', {
        passageId: props.passageId,
        sourceId: props.sourceId,
        revisionId: props.revisionId,
        engineFingerprint: props.engineFingerprint,
        definitionContext: props.target,
        includeLaterDefinitions: true,
        query,
        limit: 30,
      })
        .then((result) => {
          if (current && generation.current === version && live.current === identity)
            setSnapshot({ identity, ...result });
        })
        .catch((error) => {
          if (current && generation.current === version && live.current === identity)
            setSnapshot({ identity, error: String(error) });
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [identity]);
  const response = snapshot?.identity === identity ? snapshot : undefined;
  function choose(candidate: SharedDefinitionCandidate, copy: boolean) {
    if (
      props.disabled ||
      props.inactive ||
      live.current !== identity ||
      candidate.reuseBlockedReason ||
      !candidate.treeEdit?.editable
    )
      return;
    props.onChoose(copy ? candidate.treeEdit.expression : `${candidate.name}.copy()`);
    setOpen(false);
  }
  return (
    <details
      className="shared-definition-reuse"
      open={open}
      onToggle={(event) => {
        generation.current++;
        setSnapshot(undefined);
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>Substituir por peça existente</summary>
      <p>
        Faça <code>{props.target.name}</code> acompanhar outra definição, mantendo os nomes usados
        nas passagens. Ou copie a árvore para editar separadamente. A mudança fica neste rascunho
        até revisar e aplicar.
      </p>
      <label>
        Buscar definição pelo nome ou significado
        <input
          {...workspaceAutofill}
          value={query}
          disabled={props.disabled}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
        />
      </label>
      {open && query.trim() && !props.inactive && !props.disabled && !response && (
        <p role="status">Buscando definições…</p>
      )}
      {response?.error && <p role="alert">{response.error}</p>}
      {response?.results?.length === 0 && <p>Nenhuma definição encontrada.</p>}
      {!!response?.results?.length && (
        <ul className="shared-definition-results" aria-label="Definições para reutilizar">
          {response.results.map((candidate) => {
            const target = candidate.treeEdit;
            const reason =
              candidate.reuseBlockedReason ??
              (target?.editable
                ? undefined
                : (target?.reason ?? 'Esta peça não tem uma árvore editável.'));
            return (
              <li key={`${candidate.name}:${target?.editable ? target.declarationId : ''}`}>
                <strong>
                  <code>{candidate.name}</code>
                </strong>
                {(candidate.headword || candidate.surface) && (
                  <span lang="tpw">{candidate.headword || candidate.surface}</span>
                )}
                {candidate.definition && <p>{candidate.definition}</p>}
                {reason ? (
                  <p>{reason}</p>
                ) : (
                  <>
                    {candidate.availableInDefinition === false && (
                      <p>A revisão verificará esta peça e suas dependências compartilhadas.</p>
                    )}
                    <div className="shared-definition-choices">
                      <button disabled={props.disabled} onClick={() => choose(candidate, false)}>
                        Usar como referência
                      </button>
                      <button disabled={props.disabled} onClick={() => choose(candidate, true)}>
                        Copiar árvore
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {response?.total && response.total > (response.results?.length ?? 0) ? (
        <p>Refine a busca para encontrar mais definições.</p>
      ) : null}
    </details>
  );
}

import { useEffect, useRef, useState } from 'react';
import { invoke, type SourcePreview } from '../domain/authoring';
import type { RuntimeGraph } from '../domain/runtime-tree';
import { RuntimeTree } from './RuntimeTree';
import { OperationPreview } from './OperationPreview';

interface ReferenceInfo {
  name: string;
  definition: string;
  expression: string;
  sourcePath: string;
  line: number;
  runtimeTree?: RuntimeGraph;
  safeOccurrenceExpansion?: string | null;
  projectUses?: {
    uses: {
      sourceId: string;
      ordinal: number;
      line: number;
      expression: string;
      via: string[];
      direct: boolean;
    }[];
    diagnostics: string[];
  };
}

/** Inspect shared objects without replacing the source reference or creating an undo step. */
export function ReferenceInspector(props: {
  name: string;
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
  engineFingerprint?: string;
  onCopy: (raw: string) => void;
  onDefinition: (definition: string) => Promise<void>;
  onPreview?: (preview: SourcePreview) => void;
}) {
  const identity = JSON.stringify([
    props.name,
    props.passageId,
    props.sourceId,
    props.revisionId,
    props.engineFingerprint,
  ]);
  const [state, setState] = useState<{ identity: string; info?: ReferenceInfo; error?: string }>({
    identity,
  });
  const [definition, setDefinition] = useState('');
  const [scope, setScope] = useState('occurrence');
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState(false);
  const activeIdentity = useRef<string | null>(identity);
  activeIdentity.current = identity;
  useEffect(() => {
    let active = true;
    activeIdentity.current = identity;
    setState({ identity });
    setCopy(false);
    setScope('occurrence');
    setBusy(false);
    void invoke<ReferenceInfo>('lexicon_inspect', {
      name: props.name,
      passageId: props.passageId,
      sourceId: props.sourceId,
      revisionId: props.revisionId,
      engineFingerprint: props.engineFingerprint,
    })
      .then((info) => {
        if (active) {
          setState({ identity, info });
          setDefinition(info.definition ?? '');
        }
      })
      .catch((reason) => {
        if (active) setState({ identity, error: String(reason) });
      });
    return () => {
      active = false;
      activeIdentity.current = null;
    };
  }, [identity]);
  const info = state.identity === identity ? state.info : undefined;
  return (
    <section className="reference-inspector" aria-label={`Estrutura de ${props.name}`}>
      <h3>
        Dentro de <code>{props.name}</code>
      </h3>
      {!info && !state.error && <p role="status">Carregando a estrutura e seus usos…</p>}
      {state.identity === identity && state.error && <p role="alert">{state.error}</p>}
      {info && (
        <>
          <p>{info.definition || 'Significado não informado.'}</p>
          {info.runtimeTree && (
            <RuntimeTree
              graph={info.runtimeTree}
              status="Estrutura do objeto compartilhado · consulta"
            />
          )}
          <details>
            <summary>Expressão e origem</summary>
            <pre>{info.expression}</pre>
            <small>
              {info.sourcePath}:{info.line}
            </small>
          </details>
          <details open>
            <summary>Onde esta referência é usada ({info.projectUses?.uses.length ?? 0})</summary>
            <p>
              Dependências encontradas no código salvo, incluindo composições. Rascunhos locais e
              dependências dinâmicas não estão incluídos.
            </p>
            <ul>
              {info.projectUses?.uses.map((use) => (
                <li key={`${use.sourceId}:${use.ordinal}`}>
                  <strong>
                    {use.sourceId} · passagem {use.ordinal}
                  </strong>
                  {!use.direct && ` · por ${use.via.join(', ')}`}
                  <details>
                    <summary>Ver expressão · linha {use.line}</summary>
                    <code>{use.expression}</code>
                  </details>
                </li>
              ))}
            </ul>
            {info.projectUses?.diagnostics.map((message, index) => (
              <p key={index}>{message}</p>
            ))}
          </details>
          <button disabled={!info.safeOccurrenceExpansion || busy} onClick={() => setCopy(!copy)}>
            Preparar cópia para editar a árvore
          </button>
          {!info.safeOccurrenceExpansion && (
            <p>
              A declaração não reproduz com segurança o objeto atual. A estrutura acima continua
              disponível para consulta.
            </p>
          )}
          {copy && info.safeOccurrenceExpansion && (
            <div>
              <p>
                A cópia substitui só esta ocorrência. Você poderá editar suas operações na árvore;
                os nomes dos constituintes continuam ligados às respectivas entradas do léxico.
              </p>
              <OperationPreview
                raw={info.safeOccurrenceExpansion}
                passageId={props.passageId}
                sourceId={props.sourceId}
                revisionId={props.revisionId}
                engineFingerprint={props.engineFingerprint}
                contextKey={identity}
              />
              <button onClick={() => props.onCopy(info.safeOccurrenceExpansion!)}>
                Usar cópia nesta ocorrência
              </button>
            </div>
          )}
          <details>
            <summary>Editar significado desta referência</summary>
            <label>
              Significado
              <textarea
                aria-label="Significado da referência"
                value={definition}
                onChange={(event) => setDefinition(event.target.value)}
              />
            </label>
            <label>
              Onde muda
              <select
                aria-label="Alcance do significado da referência"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="occurrence">Só esta ocorrência</option>
                {props.onPreview && (
                  <option value={info.sourcePath.endsWith('/lexicon.tu.py') ? 'shared' : 'source'}>
                    {info.sourcePath.endsWith('/lexicon.tu.py')
                      ? 'Definição compartilhada'
                      : 'Deste ponto em diante nesta fonte'}
                  </option>
                )}
              </select>
            </label>
            <p>
              {scope === 'occurrence'
                ? 'Altera o significado desta ocorrência mantendo sua gramática.'
                : 'A alteração passa pela revisão da fonte e pela regressão do corpus. Confira os usos acima antes de aceitar.'}
            </p>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (scope === 'occurrence') await props.onDefinition(definition);
                  else {
                    const preview = await invoke<SourcePreview>('lexicon_update', {
                      name: props.name,
                      definition,
                      scope,
                      preserveGrammar: true,
                      passageId: props.passageId,
                      sourceId: props.sourceId,
                      revisionId: props.revisionId,
                      engineFingerprint: props.engineFingerprint,
                    });
                    if (activeIdentity.current === identity) props.onPreview?.(preview);
                  }
                } catch (reason) {
                  if (activeIdentity.current === identity)
                    setState((current) => ({ ...current, error: String(reason) }));
                } finally {
                  if (activeIdentity.current === identity) setBusy(false);
                }
              }}
            >
              {scope === 'occurrence'
                ? 'Aplicar significado nesta ocorrência'
                : 'Revisar alteração compartilhada'}
            </button>
          </details>
        </>
      )}
    </section>
  );
}

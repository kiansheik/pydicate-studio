import { useEffect, useRef, useState } from 'react';
import { invoke, type AuthorNode } from '../domain/authoring';
import {
  editableRuntimeScopes,
  replaceRuntimeScope,
  type RuntimeNode,
} from '../domain/runtime-tree';
import {
  addTreeOperation,
  argumentTreeOperations,
  binaryTreeChildren,
  binaryTreeOperations,
  changeTreeOperator,
  optionalArgumentTreeOperations,
  treeOperations,
} from '../domain/tree-operations';
import { track } from '../domain/usage';
import { operationTerm, treeOperationTerm } from '../domain/operation-terms';
import '../tree-scope-editor.css';
import { LexicalInput } from './LexicalInput';

export interface TreeScopeEditorProps {
  node: RuntimeNode;
  authoringRoot?: AuthorNode | null;
  raw?: string;
  revisionId?: string;
  passageId?: string;
  sourceId?: string;
  onChangeRaw?: (raw: string) => void;
  onSelectScope: (id: string) => void;
  selectedScopeId?: string;
  onInspectLexeme?: (name: string) => void;
}

const compact = (text: string, length = 80) =>
  text.length > length ? text.slice(0, length - 1) + '…' : text;

export function TreeScopeEditor({
  node,
  authoringRoot,
  raw = '',
  revisionId,
  passageId,
  sourceId,
  onChangeRaw,
  onSelectScope,
  selectedScopeId,
  onInspectLexeme,
}: TreeScopeEditorProps) {
  const scopes = editableRuntimeScopes(node, authoringRoot, raw);
  const scope = scopes.find((item) => item.id === selectedScopeId) ?? scopes[0];
  const [replacement, setReplacement] = useState(scope?.code ?? '');
  const [operation, setOperation] = useState('*');
  const [argument, setArgument] = useState('');
  const [argumentSide, setArgumentSide] = useState<'left' | 'right'>('right');
  const [replacementOperator, setReplacementOperator] = useState(scope?.operator ?? '*');
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState('');
  const [expansion, setExpansion] = useState<{ name: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const identity = `${passageId}:${revisionId}:${scope?.id}:${scope?.code}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  useEffect(() => {
    setReplacement(scope?.code ?? '');
    setReplacementOperator(scope?.operator ?? '*');
    setExpansion(null);
    setError('');
    setBusy(false);
    setLookup('');
    setArgument('');
  }, [identity, scope?.code, scope?.operator]);

  if (!scope)
    return (
      <p className="runtime-edit-unmapped">
        Aguardando a árvore desta revisão para editar esta parte. O rascunho permanece salvo.
      </p>
    );

  function apply(value: string, action = 'tree.replace') {
    if (!scope || !onChangeRaw) return;
    try {
      onChangeRaw(replaceRuntimeScope(raw, scope, value));
      onSelectScope(scope.id);
      track('editor.operation', { action });
      setArgument('');
      setError('');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function inspectExpansion() {
    if (!scope || !passageId) return;
    const requestedIdentity = currentIdentity.current;
    setBusy(true);
    setError('');
    try {
      const result = await invoke<{ safeOccurrenceExpansion?: string | null }>('lexicon_inspect', {
        passageId,
        sourceId,
        name: scope.code,
      });
      if (requestedIdentity !== currentIdentity.current) return;
      if (result.safeOccurrenceExpansion)
        setExpansion({ name: scope.code, code: result.safeOccurrenceExpansion });
      else
        setError(
          'Esta definição depende do contexto ou de parâmetros. Inspecione-a no Léxico antes de substituir a referência.',
        );
    } catch (reason) {
      if (requestedIdentity === currentIdentity.current) setError((reason as Error).message);
    } finally {
      if (requestedIdentity === currentIdentity.current) setBusy(false);
    }
  }

  const needsArgument = argumentTreeOperations.has(operation);
  const optionalArgument = optionalArgumentTreeOperations.has(operation);
  const isBinary = binaryTreeOperations.has(operation);
  const operationPreview =
    !needsArgument || argument.trim()
      ? addTreeOperation(scope.code, operation, argument, argumentSide)
      : '';
  const binaryChildren = binaryTreeChildren(scope);
  const selectedTerm = operationTerm({
    kind: scope.kind,
    operator: scope.operator,
    method: scope.method,
    label: scope.label,
    runtimeType:
      typeof node.attributes.runtimeType === 'string' ? node.attributes.runtimeType : undefined,
    dispatch: typeof node.attributes.dispatch === 'string' ? node.attributes.dispatch : undefined,
    operandTypes:
      typeof node.attributes.operandTypes === 'string'
        ? node.attributes.operandTypes.split(' · ')
        : undefined,
  });
  const newOperationTerm = treeOperationTerm(operation);
  const removable = scope.children.find(
    (child) => child.slot === 'receiver' || child.slot === 'operand',
  );
  return (
    <div className="tree-scope-editor">
      <span className="tree-scope-caption">
        Parte selecionada · {scope.kind === 'reference' ? 'referência' : selectedTerm.label}
      </span>
      <code className="runtime-source-preview tree-current-expression">{scope.code}</code>
      <fieldset className="tree-composer" disabled={!onChangeRaw}>
        <legend>Adicionar operação</legend>
        <label>
          Operação
          <select
            aria-label="Operação na árvore"
            value={operation}
            onChange={(event) => {
              setOperation(event.target.value);
              setArgument(event.target.value === 'var' ? '1' : '');
            }}
          >
            {treeOperations.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="tree-operation-help" aria-live="polite">
          {newOperationTerm.description}
        </p>
        {(needsArgument || optionalArgument) && (
          <div className="tree-input-field">
            {optionalArgument ? 'Argumento (opcional)' : 'Novo argumento'}
            <LexicalInput
              label="Argumento da operação na árvore"
              value={argument}
              onChange={setArgument}
              passageId={passageId}
              sourceId={sourceId}
              contextKey={`${identity}:${operation}`}
              disabled={!onChangeRaw}
            />
          </div>
        )}
        {isBinary && (
          <label>
            Posição do novo argumento
            <select
              aria-label="Posição do novo argumento"
              value={argumentSide}
              onChange={(event) => setArgumentSide(event.target.value as 'left' | 'right')}
            >
              <option value="left">À esquerda da seleção</option>
              <option value="right">À direita da seleção</option>
            </select>
          </label>
        )}
        {operationPreview && (
          <output aria-label="Prévia da operação" className="tree-operation-preview">
            <code>{operationPreview}</code>
          </output>
        )}
        <button
          className="tree-apply-operation"
          onClick={() => apply(operationPreview, 'tree.add-operation')}
          disabled={!operationPreview}
        >
          Aplicar operação
        </button>
      </fieldset>

      {(binaryChildren || removable) && (
        <details className="tree-modify-operation">
          <summary>Modificar ou retirar esta operação</summary>
          {binaryChildren ? (
            <>
              <label>
                Operador desta conexão
                <select
                  aria-label="Novo operador desta parte"
                  value={replacementOperator}
                  onChange={(event) => setReplacementOperator(event.target.value)}
                >
                  {treeOperations
                    .filter(([value]) => binaryTreeOperations.has(value))
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <p className="tree-operation-help">
                {treeOperationTerm(replacementOperator).description}
              </p>
              {replacementOperator !== scope.operator && (
                <code className="runtime-source-preview">
                  {changeTreeOperator(scope, replacementOperator)}
                </code>
              )}
              <div className="tree-scope-actions">
                <button
                  disabled={!onChangeRaw || replacementOperator === scope.operator}
                  onClick={() =>
                    apply(changeTreeOperator(scope, replacementOperator), 'tree.change-operator')
                  }
                >
                  Trocar operador
                </button>
                <button
                  disabled={!onChangeRaw}
                  onClick={() =>
                    apply(changeTreeOperator(scope, scope.operator!, true), 'tree.swap-operands')
                  }
                >
                  Inverter lados
                </button>
              </div>
              <span className="tree-scope-caption">Retirar a operação e manter somente:</span>
              <button
                className="tree-keep-child"
                disabled={!onChangeRaw}
                onClick={() => apply(binaryChildren.left.code, 'tree.keep-left')}
              >
                <span>Manter lado esquerdo</span>
                <code>{compact(binaryChildren.left.code)}</code>
              </button>
              <button
                className="tree-keep-child"
                disabled={!onChangeRaw}
                onClick={() => apply(binaryChildren.right.code, 'tree.keep-right')}
              >
                <span>Manter lado direito</span>
                <code>{compact(binaryChildren.right.code)}</code>
              </button>
            </>
          ) : (
            removable && (
              <>
                <code className="runtime-source-preview">{removable.node.code}</code>
                <button
                  disabled={!onChangeRaw}
                  onClick={() => apply(removable.node.code, 'tree.remove-operation')}
                >
                  Retirar esta operação
                </button>
              </>
            )
          )}
        </details>
      )}

      <details className="tree-lexical-insert">
        <summary>Reutilizar palavra ou trecho</summary>
        <LexicalInput
          label="Buscar léxico na árvore"
          value={lookup}
          onChange={setLookup}
          passageId={passageId}
          sourceId={sourceId}
          contextKey={identity}
          disabled={!onChangeRaw}
        />
        <div className="tree-scope-actions">
          <button
            onClick={() => setArgument(lookup)}
            disabled={!lookup.trim() || (!needsArgument && !optionalArgument)}
          >
            Usar como argumento
          </button>
          <button disabled={!onChangeRaw || !lookup.trim()} onClick={() => apply(lookup)}>
            Substituir seleção
          </button>
        </div>
      </details>
      {scope.kind === 'reference' && (
        <div className="tree-scope-actions">
          {onInspectLexeme && (
            <button onClick={() => onInspectLexeme(scope.code)}>Ver no Léxico</button>
          )}
          <button
            onClick={() => void inspectExpansion()}
            disabled={busy || !passageId || !onChangeRaw}
          >
            {busy ? 'Conferindo…' : 'Preparar cópia desta ocorrência'}
          </button>
        </div>
      )}
      {expansion && (
        <div className="runtime-expansion">
          <p>
            Expandir <strong>{expansion.name}</strong> nesta passagem. O motor confirmou a mesma
            estrutura; a definição compartilhada permanece no léxico.
          </p>
          <code className="runtime-source-preview">{expansion.code}</code>
          <button
            disabled={!onChangeRaw}
            onClick={() => apply(expansion.code, 'tree.expand-occurrence')}
          >
            Expandir somente esta ocorrência
          </button>
          <button onClick={() => setExpansion(null)}>Cancelar cópia</button>
        </div>
      )}
      <details className="tree-raw-replacement" open={scope.kind === 'literal'}>
        <summary>Substituir por expressão ou valor</summary>
        <textarea
          aria-label="Expressão da parte na árvore"
          rows={Math.min(5, Math.max(2, replacement.split('\n').length))}
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          spellCheck={false}
        />
        <button
          onClick={() => apply(replacement)}
          disabled={!onChangeRaw || !replacement.trim() || replacement === scope.code}
        >
          Aplicar substituição
        </button>
      </details>
      <small className="runtime-edit-hint">
        Altera o rascunho. Desfazer restaura a revisão anterior.
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

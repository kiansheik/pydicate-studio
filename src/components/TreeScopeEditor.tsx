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
import { OperationPreview } from './OperationPreview';
import { definitionBody } from '../domain/expression-tree';

export interface TreeScopeEditorProps {
  node: RuntimeNode;
  authoringRoot?: AuthorNode | null;
  raw?: string;
  revisionId?: string;
  passageId?: string;
  sourceId?: string;
  engineFingerprint?: string;
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
  engineFingerprint,
  onChangeRaw,
  onSelectScope,
  selectedScopeId,
  onInspectLexeme,
}: TreeScopeEditorProps) {
  const scopes = editableRuntimeScopes(node, authoringRoot, raw);
  const scope = scopes.find((item) => item.id === selectedScopeId) ?? scopes[0];
  const operationScope = scope ? definitionBody(scope) : undefined;
  const [replacement, setReplacement] = useState(scope?.code ?? '');
  const [operation, setOperation] = useState('*');
  const [argument, setArgument] = useState('');
  const [argumentSide, setArgumentSide] = useState<'left' | 'right'>('right');
  const [replacementOperator, setReplacementOperator] = useState(operationScope?.operator ?? '*');
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState('');
  const [expansion, setExpansion] = useState<{ name: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [replacementOpen, setReplacementOpen] = useState(operationScope?.kind === 'literal');
  const identity = JSON.stringify([
    passageId,
    sourceId,
    revisionId,
    engineFingerprint,
    scope?.id,
    scope?.code,
  ]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  useEffect(() => {
    setReplacement(scope?.code ?? '');
    setReplacementOperator(operationScope?.operator ?? '*');
    setExpansion(null);
    setError('');
    setBusy(false);
    setLookup('');
    setArgument('');
    setModifyOpen(false);
    setReuseOpen(false);
    setReplacementOpen(operationScope?.kind === 'literal');
  }, [identity, scope?.code, operationScope?.operator, operationScope?.kind]);

  if (!scope || !operationScope)
    return (
      <p className="runtime-edit-unmapped">
        Aguardando a árvore desta revisão para editar esta parte. O rascunho permanece salvo.
      </p>
    );

  function apply(value: string, action = 'tree.replace', target = scope) {
    if (!scope || !target || !onChangeRaw) return;
    try {
      onChangeRaw(replaceRuntimeScope(raw, target, value));
      onSelectScope(scope.id);
      track('editor.operation', { action });
      setArgument('');
      setError('');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  function preview(value: string, action: string, target = scope) {
    if (!target || !onChangeRaw) return null;
    // Evaluate the exact complete expression that confirmation will put in the draft.
    let proposedRaw = '';
    try {
      if (value.trim()) proposedRaw = replaceRuntimeScope(raw, target, value);
    } catch (reason) {
      return <p role="alert">{(reason as Error).message}</p>;
    }
    return (
      <>
        {proposedRaw && (
          <small className="runtime-edit-hint">Forma da peça inteira após esta alteração.</small>
        )}
        <OperationPreview
          raw={proposedRaw}
          passageId={passageId}
          sourceId={sourceId}
          revisionId={revisionId}
          engineFingerprint={engineFingerprint}
          contextKey={`${identity}:${action}:${target.id}`}
        />
      </>
    );
  }

  async function inspectExpansion() {
    if (!operationScope || !passageId) return;
    const requestedIdentity = currentIdentity.current;
    setBusy(true);
    setError('');
    try {
      const result = await invoke<{ safeOccurrenceExpansion?: string | null }>('lexicon_inspect', {
        passageId,
        sourceId,
        revisionId,
        engineFingerprint,
        name: operationScope.code,
      });
      if (requestedIdentity !== currentIdentity.current) return;
      if (result.safeOccurrenceExpansion)
        setExpansion({ name: operationScope.code, code: result.safeOccurrenceExpansion });
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
  const binaryChildren = binaryTreeChildren(operationScope);
  const selectedTerm = operationTerm({
    kind: operationScope.kind,
    operator: operationScope.operator,
    method: operationScope.method,
    label: operationScope.label,
    runtimeType:
      typeof node.attributes.runtimeType === 'string' ? node.attributes.runtimeType : undefined,
    dispatch: typeof node.attributes.dispatch === 'string' ? node.attributes.dispatch : undefined,
    operandTypes:
      typeof node.attributes.operandTypes === 'string'
        ? node.attributes.operandTypes.split(' · ')
        : undefined,
  });
  const newOperationTerm = treeOperationTerm(operation);
  const removable = operationScope.children.find(
    (child) => child.slot === 'receiver' || child.slot === 'operand',
  );
  return (
    <div className="tree-scope-editor">
      <span className="tree-scope-caption">
        Parte selecionada ·{' '}
        {operationScope.kind === 'reference' ? 'referência' : selectedTerm.label}
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
        {preview(operationPreview, 'add-operation')}
        <button
          className="tree-apply-operation"
          onClick={() => apply(operationPreview, 'tree.add-operation')}
          disabled={!operationPreview}
        >
          Aplicar operação
        </button>
      </fieldset>

      {(binaryChildren || removable) && (
        <details
          className="tree-modify-operation"
          open={modifyOpen}
          onToggle={(event) => setModifyOpen(event.currentTarget.open)}
        >
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
              {replacementOperator !== operationScope.operator && (
                <code className="runtime-source-preview">
                  {changeTreeOperator(operationScope, replacementOperator)}
                </code>
              )}
              {modifyOpen &&
                replacementOperator !== operationScope.operator &&
                preview(
                  changeTreeOperator(operationScope, replacementOperator),
                  'change-operator',
                  operationScope,
                )}
              <div className="tree-scope-actions">
                <button
                  disabled={!onChangeRaw || replacementOperator === operationScope.operator}
                  onClick={() =>
                    apply(
                      changeTreeOperator(operationScope, replacementOperator),
                      'tree.change-operator',
                      operationScope,
                    )
                  }
                >
                  Trocar operador
                </button>
                <button
                  disabled={!onChangeRaw}
                  onClick={() =>
                    apply(
                      changeTreeOperator(operationScope, operationScope.operator!, true),
                      'tree.swap-operands',
                      operationScope,
                    )
                  }
                >
                  Inverter lados
                </button>
              </div>
              <span className="tree-scope-caption">Retirar a operação e manter somente:</span>
              <button
                className="tree-keep-child"
                disabled={!onChangeRaw}
                onClick={() => apply(binaryChildren.left.code, 'tree.keep-left', operationScope)}
              >
                <span>Manter lado esquerdo</span>
                <code>{compact(binaryChildren.left.code)}</code>
              </button>
              <button
                className="tree-keep-child"
                disabled={!onChangeRaw}
                onClick={() => apply(binaryChildren.right.code, 'tree.keep-right', operationScope)}
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
                  onClick={() =>
                    apply(removable.node.code, 'tree.remove-operation', operationScope)
                  }
                >
                  Retirar esta operação
                </button>
              </>
            )
          )}
        </details>
      )}

      <details
        className="tree-lexical-insert"
        open={reuseOpen}
        onToggle={(event) => setReuseOpen(event.currentTarget.open)}
      >
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
        {reuseOpen && lookup.trim() && preview(lookup, 'reuse-expression')}
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
      {operationScope.kind === 'reference' && (
        <div className="tree-scope-actions">
          {onInspectLexeme && (
            <button onClick={() => onInspectLexeme(operationScope.code)}>Ver no Léxico</button>
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
          {preview(expansion.code, 'expand-occurrence', operationScope)}
          <button
            disabled={!onChangeRaw}
            onClick={() => apply(expansion.code, 'tree.expand-occurrence', operationScope)}
          >
            Expandir somente esta ocorrência
          </button>
          <button onClick={() => setExpansion(null)}>Cancelar cópia</button>
        </div>
      )}
      <details
        className="tree-raw-replacement"
        open={replacementOpen}
        onToggle={(event) => setReplacementOpen(event.currentTarget.open)}
      >
        <summary>Substituir por expressão ou valor</summary>
        <textarea
          aria-label="Expressão da parte na árvore"
          rows={Math.min(5, Math.max(2, replacement.split('\n').length))}
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          spellCheck={false}
        />
        {replacementOpen &&
          replacement.trim() &&
          replacement !== scope.code &&
          preview(replacement, 'replace-expression')}
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

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Code2, GitBranch, Plus, Redo2, Search, Undo2 } from 'lucide-react';
import {
  diagnosticText,
  flattenNodes,
  invoke,
  replaceNode,
  type AuthorNode,
  type SourcePreview,
} from '../domain/authoring';
import type { Studio } from '../useStudio';
import { LexicalInput } from './LexicalInput';
export { LexicalInput } from './LexicalInput';

const operations = [
  ['Negar esta parte', 'negate'],
  ['Manter subentendido', 'hidden'],
  ['Imperativo', 'imp'],
  ['Permissivo', 'perm'],
  ['Vocativo', 'voc'],
  ['Reduplicar', 'redup'],
  ['Nominalizar', 'base_nominal'],
  ['Escolher variante 1', 'var'],
  ['Circunstancial', 'circ'],
  ['Adicionar participante / complemento', '*'],
  ['Combinar elementos (+)', '+'],
  ['Compor radicais', '/'],
  ['Predicação / aposição', '@'],
  ['Predicação', '=='],
  ['Subordinar à direita', '>>'],
  ['Subordinar à esquerda', '<<'],
  ['Cardinal', 'card'],
  ['Ordinal', 'ord'],
  ['Copiar estrutura', 'copy'],
];
function StructuredNode({
  node,
  selected,
  onSelect,
  level = 0,
}: {
  node: AuthorNode;
  selected: string;
  onSelect: (id: string) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(level < 3);
  return (
    <div className={`author-node depth-${Math.min(level, 3)}`}>
      <button
        data-author-node={node.id}
        aria-pressed={selected === node.id}
        className={`author-node-heading ${selected === node.id ? 'is-selected' : ''}`}
        onClick={() => onSelect(node.id)}
      >
        <span className="author-node-kind">{node.runtimeType ?? node.category ?? node.kind}</span>
        <strong>{node.label}</strong>
        <code>{node.code.length > 100 ? node.code.slice(0, 100) + '…' : node.code}</code>
      </button>
      {node.definition && <p className="node-definition">{node.definition}</p>}
      {node.engineRoles?.length ? (
        <div className="engine-roles">
          {node.engineRoles.map((role, index) => (
            <span key={index} title={role.evidence}>
              <strong>{role.role === 'subject' ? 'Sujeito' : 'Objeto'}</strong>{' '}
              {role.verbete || role.inflection} ·{' '}
              {role.inferredByEngine
                ? 'inferido pelo motor'
                : role.expressed
                  ? 'expresso'
                  : 'subentendido explicitamente'}
            </span>
          ))}
        </div>
      ) : null}
      {node.operator && node.operandTypes && (
        <small className="node-dispatch" title={node.dispatch}>
          {node.operandTypes.join(` ${node.operator} `)} → {node.runtimeType}
        </small>
      )}
      {node.children.length > 0 && (
        <>
          <button className="text-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Recolher' : 'Expandir'} {node.children.length} partes
          </button>
          {expanded && (
            <div className="author-node-children">
              {node.children.map((child) => (
                <div className="author-slot" key={child.node.id}>
                  <span>
                    {(
                      {
                        left: 'Primeiro elemento',
                        right: 'Segundo elemento',
                        operand: 'Parte envolvida',
                        receiver: 'Base da operação',
                      } as Record<string, string>
                    )[child.slot] ?? child.slot}
                  </span>
                  <StructuredNode
                    node={child.node}
                    selected={selected}
                    onSelect={onSelect}
                    level={level + 1}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function AuthoringEditor({
  studio,
  selected,
  onSelect,
  codeOnly = false,
}: {
  studio: Studio;
  selected: string;
  onSelect: (id: string) => void;
  codeOnly?: boolean;
}) {
  const raw = studio.draft?.raw ?? studio.passage.sourceExpression;
  const nodes = flattenNodes(studio.parsed?.root ?? null);
  const node = nodes.find((n) => n.id === selected) ?? studio.parsed?.root;
  const [replacement, setReplacement] = useState('');
  const [argument, setArgument] = useState('');
  const [action, setAction] = useState('negate');
  const [showCode, setShowCode] = useState(codeOnly);
  const [expandedAlias, setExpandedAlias] = useState<AuthorNode | null>(null);
  const [error, setError] = useState('');
  const code = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setReplacement(node?.code ?? '');
    setExpandedAlias(null);
    setArgument('');
  }, [studio.passage.id, node?.id, node?.code]);
  useEffect(() => {
    if (codeOnly) setShowCode(true);
  }, [codeOnly]);
  function alter(value: string) {
    if (!node) return;
    studio.edit({ raw: replaceNode(raw, node, value) });
  }
  function applyOperation() {
    if (!node) return;
    const base = `(${node.code})`;
    const value =
      action === 'negate'
        ? `-${base}`
        : action === 'hidden'
          ? `+${base}`
          : action === 'var'
            ? `${base}.var(${argument || '1'})`
            : action === 'circ'
              ? `${base}.circ(${argument || 'False'})`
              : ['*', '+', '/', '@', '==', '>>', '<<'].includes(action)
                ? `${base} ${action} (${argument})`
                : `${base}.${action}()`;
    alter(value);
  }
  return (
    <div className="general-authoring">
      <div className="general-toolbar">
        <span>
          <GitBranch size={16} /> Estrutura editável
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Desfazer edição"
            disabled={!studio.canUndo}
            onClick={studio.undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Refazer edição"
            disabled={!studio.canRedo}
            onClick={studio.redo}
          >
            <Redo2 size={16} />
          </button>
          <button className="button" onClick={() => setShowCode(!showCode)}>
            <Code2 size={14} />
            {showCode ? 'Ocultar código' : 'Editar Pydicate'}
          </button>
        </div>
      </div>
      {(showCode || !studio.parsed?.root) && (
        <label className="editor-label raw-editor">
          Pydicate editável
          <textarea
            ref={code}
            spellCheck={false}
            aria-label="Pydicate editável"
            rows={Math.min(14, Math.max(4, raw.split('\n').length + 1))}
            value={raw}
            disabled={!studio.ready}
            onChange={(e) => {
              setShowCode(true);
              studio.edit({ raw: e.target.value });
            }}
            onSelect={(e) => {
              const target = e.currentTarget;
              const candidate = nodes
                .filter((n) => n.start <= target.selectionStart && n.end >= target.selectionEnd)
                .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
              if (candidate) onSelect(candidate.id);
            }}
          />
          <small>
            O texto incompleto também é salvo. A árvore só é atualizada para a mesma revisão válida.
          </small>
        </label>
      )}
      {studio.parsed?.diagnostics.length ? (
        <div role="status" className="inline-error">
          {studio.parsed.diagnostics.map((d, i) => (
            <p key={i}>{diagnosticText(d)}</p>
          ))}
        </div>
      ) : null}
      {studio.parsed?.root ? (
        <>
          {!codeOnly && (
            <StructuredNode node={studio.parsed.root} selected={selected} onSelect={onSelect} />
          )}
          <section className="constituent-editor">
            <h3>Parte selecionada</h3>
            <p>
              {node?.label} <small>{node?.runtimeType ?? node?.category}</small>
            </p>
            <div className="editor-label">
              Conteúdo desta parte
              <LexicalInput
                value={replacement}
                onChange={setReplacement}
                label="Conteúdo desta parte"
                passageId={studio.passage.id}
                sourceId={studio.passage.sourceId}
                contextKey={`${studio.draft?.revisionId}:${node?.id}`}
              />
            </div>
            <button
              className="button"
              disabled={!studio.ready || !node || !replacement.trim()}
              onClick={() => alter(replacement)}
            >
              Substituir esta parte
            </button>
            <div className="construction-operation">
              <label>
                Operação
                <select
                  aria-label="Operação na parte selecionada"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {operations.map(([label, value]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="editor-label">
                Participante ou parâmetro
                <LexicalInput
                  value={argument}
                  onChange={setArgument}
                  label="Participante ou parâmetro"
                  passageId={studio.passage.id}
                  sourceId={studio.passage.sourceId}
                  contextKey={`${studio.draft?.revisionId}:${node?.id}:${action}`}
                />
              </div>
              <button
                className="button"
                onClick={applyOperation}
                disabled={
                  !studio.ready ||
                  (['*', '+', '/', '@', '==', '>>', '<<'].includes(action) && !argument.trim())
                }
              >
                Aplicar operação
              </button>
            </div>
            {node && (node.kind === 'method' || node.kind === 'unary') && (
              <button
                className="button"
                onClick={() => {
                  const inner = node.children.find(
                    (child) => child.slot === 'receiver' || child.slot === 'operand',
                  );
                  if (inner) alter(inner.node.code);
                }}
              >
                Remover somente esta operação
              </button>
            )}
            <small className="field-hint">
              A operação preserva a parte interna e torna o novo escopo explícito. O motor valida a
              combinação de tipos.
            </small>
            {node?.kind === 'reference' && (
              <button
                className="text-button"
                onClick={() =>
                  void invoke<{
                    authoring?: { root: AuthorNode | null };
                    template?: { root: AuthorNode | null };
                  }>('lexicon_inspect', {
                    name: node.code,
                    passageId: studio.passage.id,
                    sourceId: studio.passage.sourceId,
                  })
                    .then((info) =>
                      setExpandedAlias(info.template?.root ?? info.authoring?.root ?? null),
                    )
                    .catch((e) => setError(e.message))
                }
              >
                <BookOpen size={14} />
                Inspecionar definição sem copiar
              </button>
            )}
            {expandedAlias && (
              <StructuredNode node={expandedAlias} selected="" onSelect={() => {}} />
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        </>
      ) : (
        <p className="field-hint">
          {studio.pending
            ? 'Analisando esta revisão…'
            : 'Corrija o texto acima para retomar a edição visual. Nenhum rascunho foi descartado.'}
        </p>
      )}
    </div>
  );
}

interface LexicalEntry {
  lexicalStatus?: 'hypothetical';
  parameters?: { name: string; default?: unknown; required?: boolean; kind?: string }[];
  authoring?: { root: AuthorNode | null };
  template?: { root: AuthorNode | null };
  id: string;
  name?: string;
  headword?: string;
  kind?: string;
  definition: string;
  expression?: string;
  category?: string;
  suggestedCategory?: string | null;
  runtimeType?: string;
  citation?: string;
  provenance?: unknown;
  uses?: number[];
}
export function LexiconPanel({
  studio,
  onPreview,
  selected,
}: {
  studio: Studio;
  onPreview: (preview: SourcePreview) => void;
  selected: string;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'lexicon' | 'dictionary'>('lexicon');
  const [results, setResults] = useState<LexicalEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<LexicalEntry | null>(null);
  const [headword, setHeadword] = useState('');
  const [definition, setDefinition] = useState('');
  const [category, setCategory] = useState('Noun');
  const [scope, setScope] = useState('source');
  const searchId = useRef(0);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [reuse, setReuse] = useState('');
  const [editScope, setEditScope] = useState('occurrence');
  const target =
    flattenNodes(studio.parsed?.root ?? null).find((node) => node.id === selected) ??
    studio.parsed?.root;
  useEffect(() => setReuse(''), [studio.passage.id, studio.draft?.revisionId, target?.id]);
  function useExpression(value: string) {
    const raw = studio.draft?.raw ?? studio.passage.sourceExpression;
    studio.edit({ raw: target ? replaceNode(raw, target, value) : value });
  }
  useEffect(() => {
    searchId.current++;
    setResults([]);
    setChosen(null);
    setError('');
  }, [studio.passage.id, mode]);
  async function search() {
    const ticket = ++searchId.current;
    setBusy(true);
    setError('');
    try {
      const data = await invoke<{ results: LexicalEntry[] }>(
        mode === 'lexicon' ? 'lexicon_search' : 'dictionary_search',
        { query, passageId: studio.passage.id, sourceId: studio.passage.sourceId, limit: 40 },
      );
      if (ticket === searchId.current) setResults(data.results);
    } catch (e) {
      if (ticket === searchId.current) setError(String(e));
    } finally {
      if (ticket === searchId.current) setBusy(false);
    }
  }
  function choose(entry: LexicalEntry) {
    setParameters({});
    setChosen(entry);
    if (mode === 'lexicon')
      void invoke<LexicalEntry>('lexicon_inspect', {
        name: entry.name,
        passageId: studio.passage.id,
        sourceId: studio.passage.sourceId,
      })
        .then((info) => {
          setChosen(info);
          setParameters(
            Object.fromEntries(
              (info.parameters ?? []).map((p) => [
                p.name,
                p.default == null ? '' : String(p.default),
              ]),
            ),
          );
        })
        .catch((e) => setError(e.message));
    setHeadword(entry.headword ?? entry.name ?? '');
    setDefinition(entry.definition);
    setCategory(
      entry.suggestedCategory ??
        (
          {
            noun: 'Noun',
            verb: 'Verb',
            adverb: 'Adverb',
            postposition: 'Postposition',
            propernoun: 'ProperNoun',
          } as Record<string, string>
        )[entry.category ?? ''] ??
        'Noun',
    );
  }
  return (
    <section className="lexicon-panel">
      <h2>Léxico e Navarro</h2>
      <div className="work-modes">
        <button
          className={mode === 'lexicon' ? 'active' : ''}
          onClick={() => {
            setMode('lexicon');
            setResults([]);
          }}
        >
          Definições do projeto
        </button>
        <button
          className={mode === 'dictionary' ? 'active' : ''}
          onClick={() => {
            setMode('dictionary');
            setResults([]);
          }}
        >
          Dicionário Navarro
        </button>
      </div>
      {mode === 'lexicon' && (
        <section className="lexicon-rendered-reuse" aria-label="Reutilizar pelo que se lê">
          <h3>Reutilizar pelo que se lê</h3>
          <p>Encontre palavras e trechos já construídos, inclusive partes de outras passagens.</p>
          <LexicalInput
            label="Palavra ou trecho para reutilizar"
            value={reuse}
            onChange={setReuse}
            passageId={studio.passage.id}
            sourceId={studio.passage.sourceId}
            contextKey={`${studio.draft?.revisionId}:${target?.id}`}
          />
          <p className="field-hint">Destino: {target?.label ?? 'análise inteira'}.</p>
          <button
            className="button"
            disabled={!studio.ready || studio.pending || !reuse.trim()}
            onClick={() => useExpression(reuse)}
          >
            Reutilizar na parte selecionada
          </button>
        </section>
      )}
      <details className="lexicon-definition-browser" open={mode === 'dictionary'}>
        <summary>
          {mode === 'dictionary'
            ? 'Consultar Navarro'
            : 'Inspecionar ou editar definições do projeto'}
        </summary>
        <form
          className="lexicon-search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            aria-label="Buscar no léxico ou Navarro"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Palavra tupi ou definição em português"
          />
          <button className="button" disabled={busy || !query.trim()}>
            <Search size={15} />
            {busy ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="lexicon-results">
          {results.map((entry) => (
            <article key={entry.id}>
              <div>
                <strong>{entry.name ?? entry.headword}</strong>
                <span className="tag">{mode === 'dictionary' ? 'Navarro' : entry.kind}</span>
              </div>
              <p>{entry.definition}</p>
              {entry.lexicalStatus === 'hypothetical' && <p>Raiz hipotética · não atestada</p>}
              <small>{entry.citation ?? entry.runtimeType ?? entry.category}</small>
              {entry.expression && <code>{entry.expression}</code>}
              {entry.uses && <small>Usos nas passagens: {entry.uses.join(', ') || 'nenhum'}</small>}
              <button className="button" onClick={() => choose(entry)}>
                {mode === 'dictionary' ? 'Usar esta acepção' : 'Inspecionar / reutilizar'}
              </button>
            </article>
          ))}
        </div>
      </details>
      {chosen && mode === 'lexicon' && (
        <div className="lexical-choice">
          <h3>{chosen.name}</h3>
          <p>
            Destino: {target?.label ?? 'análise inteira'}. A referência conserva a identidade; a
            cópia torna a construção independente.
          </p>
          {chosen.kind === 'helper' && (
            <div className="helper-parameters">
              <h4>Parâmetros da construção</h4>
              {chosen.parameters?.map((parameter) => (
                <div className="editor-label helper-parameter" key={parameter.name}>
                  {parameter.name}
                  <LexicalInput
                    label={`Parâmetro ${parameter.name}`}
                    passageId={studio.passage.id}
                    sourceId={studio.passage.sourceId}
                    value={parameters[parameter.name] ?? ''}
                    onChange={(value) => setParameters({ ...parameters, [parameter.name]: value })}
                    contextKey={`${chosen.id}:${studio.draft?.revisionId}`}
                  />
                </div>
              ))}
              <small>
                Busque cada palavra como ela é escrita em tupi; a construção usa as estruturas
                escolhidas.
              </small>
            </div>
          )}
          <button
            className="button"
            disabled={
              chosen.kind === 'helper' &&
              chosen.parameters?.some((p) => p.required && !parameters[p.name]?.trim())
            }
            onClick={() => {
              const expression =
                chosen.kind === 'helper'
                  ? `${chosen.name}(${(chosen.parameters ?? [])
                      .filter((p) => parameters[p.name]?.trim())
                      .map((p) => `${p.name}=${parameters[p.name]}`)
                      .join(', ')})`
                  : (chosen.name ?? chosen.expression ?? '');
              useExpression(expression);
            }}
          >
            Usar referência na parte selecionada
          </button>
          {chosen.kind !== 'helper' && (
            <button
              className="button"
              onClick={() => useExpression(chosen.expression ?? chosen.name ?? '')}
            >
              Copiar construção como ocorrência
            </button>
          )}
          {(chosen.template?.root ?? chosen.authoring?.root) && (
            <details>
              <summary>Estrutura da definição</summary>
              <StructuredNode
                node={(chosen.template?.root ?? chosen.authoring?.root)!}
                selected=""
                onSelect={() => {}}
              />
            </details>
          )}
          {chosen.kind !== 'helper' && (
            <details>
              <summary>Revisar definição existente</summary>
              <label>
                Definição revisada
                <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} />
              </label>
              <label>
                Alcance da revisão
                <select
                  aria-label="Alcance da revisão lexical"
                  value={editScope}
                  onChange={(e) => setEditScope(e.target.value)}
                >
                  <option value="occurrence">Só esta ocorrência</option>
                  <option value="source">Deste ponto em diante nesta fonte</option>
                  <option value="shared">Definição compartilhada</option>
                </select>
              </label>
              <p>
                Usos conhecidos: {chosen.uses?.join(', ') || 'nenhum'}. Revise a diferença antes de
                aplicar.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void invoke<SourcePreview & { raw?: string }>('lexicon_update', {
                    name: chosen.name,
                    definition,
                    scope: editScope,
                    passageId: studio.passage.id,
                  })
                    .then((value) => {
                      if (value.raw) useExpression(value.raw);
                      else onPreview(value);
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Revisar alteração lexical
              </button>
            </details>
          )}
        </div>
      )}
      <details open={!!chosen && mode === 'dictionary'}>
        <summary>
          <Plus size={14} />
          Criar definição revisada
        </summary>
        <label>
          Palavra
          <input
            aria-label="Palavra da nova definição"
            value={headword}
            onChange={(e) => setHeadword(e.target.value)}
          />
        </label>
        <label>
          Definição e classe gramatical
          <textarea
            aria-label="Definição lexical"
            rows={4}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
        </label>
        <label>
          Categoria
          <select
            aria-label="Categoria lexical"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {['Noun', 'Verb', 'ProperNoun', 'Adverb', 'Postposition'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Escopo
          <select
            aria-label="Escopo lexical"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="source">Só nesta fonte</option>
            <option value="shared">Léxico compartilhado</option>
          </select>
        </label>
        <p className="field-hint">
          Revise a categoria e retenha marcadores como (t), (s) e (m). A origem da acepção acompanha
          a definição; nenhuma palavra é criada para forçar um resultado.
        </p>
        <button
          className="button primary"
          disabled={!headword.trim() || !definition.trim() || busy}
          onClick={() => {
            setBusy(true);
            void invoke<SourcePreview>('lexicon_create', {
              headword,
              definition,
              category,
              scope,
              passageId: studio.passage.id,
              provenance: chosen
                ? { source: mode, id: chosen.id, citation: chosen.citation }
                : { source: 'human' },
            })
              .then(onPreview)
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Revisar definição e usos afetados
        </button>
      </details>
    </section>
  );
}

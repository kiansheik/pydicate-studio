import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { flattenNodes, type AuthorNode, type ParsedExpression } from './authoring';
import { expressionGraph } from './expression-tree';
import { editInlineArgument } from './inline-arguments';
import { editableRuntimeScopes, replaceRuntimeScope, searchRuntimeTree } from './runtime-tree';

/** Exercise the real concrete Python parser without importing the corpus or
 * engine, so source authoring does not depend on a successful realization. */
function parse(raw: string): AuthorNode {
  const result: ParsedExpression = JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        'import json, sys; from python.studio_authoring import expression_tree; print(json.dumps(expression_tree(sys.stdin.read())))',
      ],
      { input: raw, encoding: 'utf8' },
    ),
  );
  if (!result.root) throw new Error(JSON.stringify(result.diagnostics));
  return result.root;
}

describe('Pydicate source operation tree', () => {
  it('keeps every compound construction step instead of replacing it with its Classifier result', () => {
    const raw = '(pûera * (og * (emi * tym))) / ypy';
    const source = parse(raw);
    const evaluated = structuredClone(source);
    Object.assign(evaluated, {
      label: '/ · Classifier',
      runtimeType: 'Classifier',
      verbete: 'oemitymbûerypy',
      definition: 'resultado da composição',
    });
    const graph = expressionGraph(source, raw, evaluated)!;
    expect(graph.nodes.map((node) => node.label)).toEqual([
      '/',
      '*',
      'pûera',
      '*',
      'og',
      '*',
      'emi',
      'tym',
      'ypy',
    ]);
    expect(graph.nodes).toHaveLength(flattenNodes(source).length);
    expect(graph.nodes[0].runtimeType).toBe('Operação');
    expect(graph.nodes[0].attributes).toMatchObject({
      runtimeType: 'Classifier',
      verbete: 'oemitymbûerypy',
    });
    expect(graph.edges.filter((edge) => edge.source === 'root')).toMatchObject([
      { target: 'root/left', label: 'esquerda' },
      { target: 'root/right', label: 'direita' },
    ]);
    expect(graph.edges.every((edge) => edge.kind === 'child')).toBe(true);
    expect(graph.edges.some((edge) => /sujeito|objeto/.test(edge.label))).toBe(false);
    for (const node of graph.nodes) {
      const [scope] = editableRuntimeScopes(node, source, raw);
      expect(scope.id).toBe(node.id);
      expect(replaceRuntimeScope(raw, scope, scope.code)).toBe(raw);
    }
  });

  it('projects method bases, helper arguments, keywords, literals and unary operations in order', () => {
    const raw = 'helper(tym.imp(), prefix=emi, enabled=True, amount=-2)';
    const graph = expressionGraph(parse(raw), raw)!;
    expect(graph.nodes.map((node) => node.label)).toEqual([
      'helper(…, prefix=…, enabled=…, amount=-2)',
      '.imp()',
      'tym',
      'emi',
      'True',
    ]);
    expect(graph.edges.filter((edge) => edge.source === 'root').map((edge) => edge.label)).toEqual([
      'argumento 1',
      'prefix =',
      'enabled =',
    ]);
    expect(graph.edges.find((edge) => edge.source === 'root/arg0')).toMatchObject({
      target: 'root/arg0/receiver',
      label: 'base',
    });
    expect(graph.nodes.find((node) => node.label === '.imp()')?.expression).toMatchObject({
      kind: 'method',
      method: 'imp',
      code: 'tym.imp()',
    });
  });

  it('retains grouping, operand order and distinct occurrences of the same lexical variable', () => {
    const raw = '(tym / ypy) * (tym / ypy)';
    const root = parse(raw);
    const graph = expressionGraph(root, raw)!;
    expect(graph.nodes.map((node) => node.id)).toEqual(flattenNodes(root).map((node) => node.id));
    expect(searchRuntimeTree(graph, '"tym"').map((node) => node.id)).toEqual([
      'root/left/left',
      'root/right/left',
    ]);
    const right = graph.nodes.find((node) => node.id === 'root/right/left')!;
    const [scope] = editableRuntimeScopes(right, root, raw);
    const changed = replaceRuntimeScope(raw, scope, 'og * tym');
    expect(changed).toBe('(tym / ypy) * ((og * tym) / ypy)');
    const next = expressionGraph(parse(changed), changed)!;
    expect(next.nodes.find((node) => node.id === 'root/right/left')?.label).toBe('*');
    expect(next.edges.filter((edge) => edge.source === 'root/right/left')).toMatchObject([
      { target: 'root/right/left/left', label: 'esquerda' },
      { target: 'root/right/left/right', label: 'direita' },
    ]);
  });

  it('works before an unresolved expression realizes and ignores stale evaluated evidence', () => {
    const raw = 'new_construction * tym';
    const source = parse(raw);
    const old = parse('old_construction * tym');
    Object.assign(old, { runtimeType: 'Classifier', definition: 'old evidence' });
    Object.assign(old.children[1].node, { runtimeType: 'Verb', definition: 'old operand' });
    const graph = expressionGraph(source, raw, old)!;
    expect(graph.nodes.map((node) => node.label)).toEqual(['*', 'new_construction', 'tym']);
    expect(graph.nodes.every((node) => node.definition === '')).toBe(true);
    expect(graph.nodes.every((node) => node.attributes.runtimeType === undefined)).toBe(true);
  });

  it('attaches only exact revision evaluations while preserving lexical and operation identities', () => {
    const raw = '(emi * tym) / ypy';
    const source = parse(raw);
    const evaluated = structuredClone(source);
    evaluated.evaluation = { status: 'ok', surface: 'emitymypy' };
    evaluated.children[0].node.evaluation = { status: 'ok', surface: 'emityma' };
    evaluated.children[0].node.children[0].node.evaluation = { status: 'ok', surface: '' };
    evaluated.children[0].node.children[1].node.evaluation = {
      status: 'unavailable',
      message: 'Requer argumento nesta etapa',
    };
    const graph = expressionGraph(source, raw, evaluated)!;
    expect(graph.nodes.map((node) => node.label)).toEqual(['/', '*', 'emi', 'tym', 'ypy']);
    expect(graph.nodes[0].expression?.isRoot).toBe(true);
    expect(graph.nodes.slice(1).every((node) => node.expression?.isRoot === false)).toBe(true);
    expect(graph.nodes.map((node) => node.evaluation)).toEqual([
      { status: 'ok', surface: 'emitymypy' },
      { status: 'ok', surface: 'emityma' },
      { status: 'ok', surface: '' },
      { status: 'unavailable', message: 'Requer argumento nesta etapa' },
      undefined,
    ]);

    // Parsed nodes can themselves originate in a prior evaluated response.
    // Evidence must always come from the separately validated evaluated root.
    expect(expressionGraph(evaluated, raw)!.nodes.every((node) => !node.evaluation)).toBe(true);
    const stale = structuredClone(evaluated);
    stale.children[1].node.code = 'tym';
    expect(expressionGraph(source, raw, stale)!.nodes.every((node) => !node.evaluation)).toBe(true);
  });

  it('keeps scalar results distinct from a linguistic realization', () => {
    const raw = 'helper(enabled=False, amount=0)';
    const source = parse(raw);
    const evaluated = structuredClone(source);
    evaluated.children[0].node.evaluation = { status: 'value', value: 'False' };
    evaluated.children[1].node.evaluation = { status: 'value', value: '0' };
    const graph = expressionGraph(source, raw, evaluated)!;
    expect(graph.nodes.map((node) => node.evaluation)).toEqual([
      undefined,
      { status: 'value', value: 'False' },
    ]);
    expect(graph.nodes[0].expression?.inlineCall?.arguments).toMatchObject([
      { slot: 'kw:amount', display: '0', kind: 'number' },
    ]);
  });

  it('finds lexical occurrences and operation symbols without duplicating their ancestors or evidence', () => {
    const raw = '(tym / ypy) * (tym / ypy)';
    const source = parse(raw);
    const evaluated = structuredClone(source);
    for (const node of flattenNodes(evaluated)) {
      node.runtimeType = 'Classifier';
      node.verbete = 'oemitymbûerypy';
      node.definition = 'semear';
    }
    const graph = expressionGraph(source, raw, evaluated)!;
    const ids = (query: string) => searchRuntimeTree(graph, query).map((node) => node.id);
    expect(ids('tym')).toEqual(['root/left/left', 'root/right/left']);
    expect(ids('*')).toEqual(['root']);
    expect(ids('/')).toEqual(['root/left', 'root/right']);
    expect(ids('semear')).toEqual([
      'root/left/left',
      'root/left/right',
      'root/right/left',
      'root/right/right',
    ]);
    expect(ids('Classifier')).toEqual([]);
    expect(ids('oemitymbûerypy')).toEqual([]);
    // Evaluated-object inspection keeps its original broad evidence search.
    const runtime = {
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, expression: undefined })),
    };
    expect(searchRuntimeTree(runtime, 'Classifier')).toHaveLength(graph.nodes.length);
    expect(searchRuntimeTree(runtime, 'oemitymbûerypy')).toHaveLength(graph.nodes.length);
  });

  it('requires current UTF-16 spans, accepts outer trivia, and never edits a stale prefix tree', () => {
    const raw = '# leading (\n((helper("🌿", tym))) # trailing )\n';
    const source = parse(raw);
    const graph = expressionGraph(source, raw)!;
    expect(graph).not.toBeNull();
    const literal = graph.nodes[0].expression!.inlineCall!.arguments[0];
    expect(literal.end - literal.start).toBe(4);
    expect(editInlineArgument(raw, source, literal.slot, 'x')).toBe(
      '# leading (\n((helper("x", tym))) # trailing )\n',
    );
    expect(expressionGraph(source, raw + '+ emi')).toBeNull();
    expect(expressionGraph(source, ' ' + raw)).toBeNull();
    const corrupt = structuredClone(source);
    corrupt.children[0].node.start++;
    expect(expressionGraph(corrupt, raw)).toBeNull();
    const duplicate = structuredClone(source);
    duplicate.children[1].node.id = duplicate.children[0].node.id;
    expect(expressionGraph(duplicate, raw)).toBeNull();
  });

  it('preserves unsupported syntax explicitly without inventing an evaluated object', () => {
    const raw = '[tym, ypy]';
    const graph = expressionGraph(parse(raw), raw)!;
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ label: raw, runtimeType: 'Trecho preservado' });
    expect(graph.diagnostics).toEqual([expect.stringContaining('sem decomposição')]);
  });
});

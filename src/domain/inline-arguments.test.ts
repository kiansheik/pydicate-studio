import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { AuthorNode, ParsedExpression } from './authoring';
import { expressionGraph } from './expression-tree';
import { editInlineArgument, inlineCallArguments, scalarArgumentSource } from './inline-arguments';

function parse(raw: string): AuthorNode {
  const parsed: ParsedExpression = JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        'import json,sys;from python.studio_authoring import expression_tree;print(json.dumps(expression_tree(sys.stdin.read())))',
      ],
      { input: raw, encoding: 'utf8' },
    ),
  );
  if (!parsed.root) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.root;
}

describe('inline scalar call arguments', () => {
  it('folds scalar arguments into their operation while retaining predicate inputs and argument order', () => {
    const raw = 'helper(tym.var(((1))), "🌿", -2.5, label="îe", base=og * tym)';
    const root = parse(raw);
    const graph = expressionGraph(root, raw)!;
    expect(graph.nodes.map((node) => node.label)).toEqual([
      'helper(…, "🌿", -2.5, label="îe", base=…)',
      '.var(1)',
      'tym',
      '*',
      'og',
      'tym',
    ]);
    const call = graph.nodes[0].expression!.inlineCall!;
    expect(call.parts.map((part) => part.slot)).toEqual([
      'arg0',
      'arg1',
      'arg2',
      'kw:label',
      'kw:base',
    ]);
    expect(
      call.arguments.map((argument) => [
        argument.editText,
        raw.slice(argument.start, argument.end),
      ]),
    ).toEqual([
      ['🌿', '"🌿"'],
      ['-2.5', '-2.5'],
      ['îe', '"îe"'],
    ]);
    expect(graph.edges.filter((edge) => edge.source === 'root').map((edge) => edge.field)).toEqual([
      'arg0',
      'kw:base',
    ]);
  });

  it('keeps scalar expression nodes when they are operands rather than call parameters', () => {
    const raw = '(1 + 2) * tym.var(3)';
    expect(expressionGraph(parse(raw), raw)!.nodes.map((node) => node.label)).toEqual([
      '*',
      '+',
      '1',
      '2',
      '.var(3)',
      'tym',
    ]);
  });

  it('removes redundant grouping from signed numeric labels while preserving their source', () => {
    const raw = 'tym.var((-((2.5))))';
    const root = parse(raw);
    expect(inlineCallArguments(root)!.label).toBe('.var(-2.5)');
    expect(editInlineArgument(raw, root, 'arg0', '-2.5')).toBe(raw);
  });

  it('uses the full source AST for stale evidence rejection, including hidden scalar arguments', () => {
    const raw = 'tym.var(1)';
    const root = parse(raw);
    const evidence = structuredClone(root);
    evidence.evaluation = { status: 'ok', surface: 'tyma' };
    expect(expressionGraph(root, raw, evidence)!.nodes[0].evaluation).toEqual(evidence.evaluation);
    evidence.children[1].node.code = '2';
    expect(expressionGraph(root, raw, evidence)!.nodes[0].evaluation).toBeUndefined();
    root.children[1].node.start++;
    expect(expressionGraph(root, raw)).toBeNull();
  });

  it('preserves the original string type, numeric spelling, grouping and bytes when unchanged', () => {
    for (const raw of [
      'tym.var(((1)))',
      'helper(r"123")',
      "helper('🌿')",
      'helper(123456789012345678901234567890)',
      'helper(- # note\n 2)',
    ]) {
      const root = parse(raw);
      const argument = inlineCallArguments(root)!.arguments[0];
      expect(editInlineArgument(raw, root, argument.slot, argument.editText)).toBe(raw);
    }
  });

  it('edits one selected parameter without rebuilding or reordering other arguments', () => {
    const raw =
      '# 🌿\n((helper("tym", # preserve\n amount=(-2), base=tym.imp(), label="îe"))) # trailing\n';
    const root = parse(raw);
    const changed = editInlineArgument(raw, root, 'kw:amount', '-2,75');
    expect(changed).toBe(raw.replace('(-2)', '(-2.75)'));
    expect(parse(changed).children.map((child) => child.node.code)).toEqual([
      '"tym"',
      '-2.75',
      'tym.imp()',
      '"îe"',
    ]);
    expect(() => editInlineArgument(raw, root, 'kw:base', '42')).toThrow(/editável/);
    expect(() => editInlineArgument(' ' + raw, root, 'kw:amount', '42')).toThrow(/mudou/);
  });

  it('retains comments inside signed constants and concatenated strings during a real edit', () => {
    for (const raw of ['helper(- # signed 🌿\n 2, tym)', 'helper("a" # joined\n "b", tym)']) {
      const root = parse(raw);
      const changed = editInlineArgument(raw, root, 'arg0', 'îe');
      expect(changed.match(/#[^\n]*/g)).toEqual(raw.match(/#[^\n]*/g));
      const next = parse(changed);
      expect(next.children[0].node.value).toBe('îe');
      expect(next.children[1].node.code).toBe('tym');
    }
  });

  it('finds only truly empty parentheses and inserts before preserved comments', () => {
    const raw = 'helper("(#)").var( # value here\n )';
    const root = parse(raw);
    expect(inlineCallArguments(root)!.insertion).toEqual({
      start: raw.indexOf(' # value'),
      end: raw.indexOf(' # value'),
    });
    const changed = editInlineArgument(raw, root, null, '2,5');
    expect(changed).toBe('helper("(#)").var(2.5 # value here\n )');
    expect(parse(changed).children[1].node.value).toBe(2.5);
    expect(editInlineArgument(raw, root, null, '')).toBe(raw);
    const opaque = inlineCallArguments(parse('helper(**kwargs)'))!;
    expect(opaque.insertion).toBeUndefined();
    expect(opaque.label).toBe('helper(…)');
    expect(() => editInlineArgument('helper(tym)', parse('helper(tym)'), null, '2')).toThrow(
      /editável/,
    );
  });

  it('normalizes plain decimal input without precision loss and treats other text as string data', () => {
    for (const [input, expected] of [
      ['001', '1'],
      ['+002,5', '+2.5'],
      ['-,5', '-0.5'],
      ['.25', '0.25'],
      [' 2. ', '2.0'],
      ['123456789012345678901234567890', '123456789012345678901234567890'],
    ])
      expect(scalarArgumentSource(input)).toBe(expected);
    for (const input of ['îe', '2abc', '1,2,3', '1e3', '__import__("os")', "a'\\b\nc", '🌿', '']) {
      const root = parse(`helper(${scalarArgumentSource(input)})`);
      expect(root.children[0].node.kind).toBe('literal');
      expect(root.children[0].node.value).toBe(input);
    }
  });
});

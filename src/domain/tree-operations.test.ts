import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { AuthorNode } from './authoring';
import { replaceRuntimeScope } from './runtime-tree';
import { addTreeOperation, binaryTreeChildren, changeTreeOperator } from './tree-operations';

const leaf = (id: string, code: string, start: number): AuthorNode => ({
  id,
  code,
  start,
  end: start + code.length,
  kind: 'reference',
  label: code,
  children: [],
});

function parseSource(raw: string): AuthorNode {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        'import sys,json; sys.path.insert(0,"python"); from studio_authoring import expression_tree; print(json.dumps(expression_tree(json.load(sys.stdin))["root"]))',
      ],
      { input: JSON.stringify(raw), encoding: 'utf8' },
    ),
  ) as AuthorNode;
}

describe('source tree operations', () => {
  it('builds the classifier through each declared source operation without inventing a word', () => {
    let expression = 'tym';
    for (const reference of ['emi', 'og', 'pûera'])
      expression = addTreeOperation(expression, '*', reference, 'left');
    expression = addTreeOperation(expression, '/', 'ypy', 'right');
    expect(expression).toBe('((pûera) * ((og) * ((emi) * (tym)))) / (ypy)');
    expect(expression).not.toContain('oemitymbûerypy');
  });

  it('keeps operand order and grouping when adding noncommutative operations around a subtree', () => {
    expect(addTreeOperation('a + b', '/', 'c * d', 'left')).toBe('(c * d) / (a + b)');
    expect(addTreeOperation('a + b', '/', 'c * d', 'right')).toBe('(a + b) / (c * d)');
    expect(addTreeOperation('a == b', 'negate')).toBe('-(a == b)');
    expect(addTreeOperation('a + b', 'circ', 'False')).toBe('(a + b).circ(False)');
    expect(addTreeOperation('a + b', 'circ')).toBe('(a + b).circ()');
    expect(addTreeOperation('a', 'base_nominal', 'True')).toBe('(a).base_nominal(True)');
    expect(addTreeOperation('a', 'inflection')).toBe('(a).inflection()');
    expect(() => addTreeOperation('tym', '*')).toThrow('argumento');
    expect(() => addTreeOperation('tym', '__class__')).toThrow('não reconhecida');
  });

  it('changes only the selected occurrence and rejects obsolete spans', () => {
    const raw = '# 😀 preserve\n tym + tym';
    const start = raw.lastIndexOf('tym');
    const scope = leaf('root/right', 'tym', start);
    const edit = addTreeOperation(scope.code, '*', 'emi', 'left');
    expect(replaceRuntimeScope(raw, scope, edit)).toBe('# 😀 preserve\n tym + ((emi) * (tym))');
    expect(() => replaceRuntimeScope(raw.replace(/tym$/, 'ypy'), scope, edit)).toThrow('mudou');
    expect(replaceRuntimeScope(raw, scope, scope.code)).toBe(raw);
  });

  it('preserves both children while changing an operator and requires explicit removal choice', () => {
    const raw = 'a + b # original\n';
    const scope: AuthorNode = {
      ...leaf('root', raw, 0),
      kind: 'binary',
      operator: '+',
      children: [
        { slot: 'left', node: leaf('root/left', 'a', 0) },
        { slot: 'right', node: leaf('root/right', 'b', 4) },
      ],
    };
    expect(changeTreeOperator(scope, '+')).toBe(raw);
    expect(changeTreeOperator(scope, '/')).toBe('(a) / (b) # original\n');
    expect(changeTreeOperator(scope, '/', true)).toBe('(b) / (a) # original\n');
    const children = binaryTreeChildren(scope)!;
    expect(replaceRuntimeScope(raw, scope, children.left.code)).toBe('(a)');
    expect(replaceRuntimeScope(raw, scope, children.right.code)).toBe('(b)');
    expect(binaryTreeChildren(children.left)).toBeNull();
    expect(() => changeTreeOperator(children.left, '/')).toThrow('Selecione');
  });

  it('preserves actual Python operand boundaries and comments when precedence or order changes', () => {
    const raw = '# outer 😀\n((a) # keep + and / here\n  + # keep second +\n (b * c)) # tail\n';
    const scope = parseSource(raw);
    expect(replaceRuntimeScope(raw, scope, changeTreeOperator(scope, '+'))).toBe(raw);
    for (const swap of [false, true]) {
      const next = replaceRuntimeScope(raw, scope, changeTreeOperator(scope, '/', swap));
      const parsed = parseSource(next);
      expect(parsed.operator).toBe('/');
      expect(parsed.children.map((child) => child.node.code)).toEqual(
        swap ? ['b * c', 'a'] : ['a', 'b * c'],
      );
      expect(next.match(/#[^\n]*/g)).toEqual(raw.match(/#[^\n]*/g));
    }
  });
});

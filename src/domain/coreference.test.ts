import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { AuthorNode, ParsedExpression } from './authoring';
import { editCanvas, type CanvasDocument } from './canvas';
import {
  collectWorkCoreferences,
  coreferenceLinks,
  coreferenceSource,
  referentialPronoun,
  scanCoreferences,
  suggestCoreferenceLabel,
} from './coreference';
import { coreferenceWrappers, definitionBody, expressionGraph } from './expression-tree';
import type { Draft, Passage } from './types';

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

describe('coreference annotations', () => {
  it('collapse onto the wrapped node and expose the link as attributes', () => {
    const raw =
      'studio_anchor(studio_define(ikó * (studio_ref(+ae, "teko") * mbaé), "sentido"), "oiko")';
    const graph = expressionGraph(parse(raw), raw)!;
    expect(graph.nodes.map((node) => node.label)).toEqual(['*', 'ikó', '*', '+', 'ae', 'mbaé']);
    expect(graph.nodes[0].attributes).toMatchObject({ coreferenceAnchor: 'oiko' });
    expect(graph.nodes[0].attributes.coreferenceReference).toBeUndefined();
    const pronoun = graph.nodes.find((node) => node.label === '+')!;
    expect(pronoun.attributes).toMatchObject({ coreferenceReference: 'teko' });
    expect(pronoun.id).toBe(pronoun.sourceNodeId);
    expect(pronoun.expression?.code).toBe('studio_ref(+ae, "teko")');
  });

  it('finds the exact wrapper to relabel or remove, keeping meaning wrappers', () => {
    const raw = 'studio_anchor(studio_define(studio_ref(+ae, "A"), "x"), "B")';
    const root = parse(raw);
    const wrappers = coreferenceWrappers(root);
    expect(wrappers.map(({ role, label }) => [role, label])).toEqual([
      ['anchor', 'B'],
      ['reference', 'A'],
    ]);
    expect(wrappers[1].value.code).toBe('+ae');
    expect(definitionBody(root).code).toBe('+ae');
    expect(coreferenceLinks(root).map((link) => link.label)).toEqual(['B', 'A']);
  });

  it('only treats literal two-argument calls as links', () => {
    for (const raw of ['studio_ref(+ae, label)', 'studio_ref(+ae, "A", extra)']) {
      expect(coreferenceLinks(parse(raw))).toEqual([]);
    }
  });

  it('writes valid labelled source and rejects spaces', () => {
    expect(coreferenceSource('anchor', 'ikó * ae', "mba'e")).toBe(
      `studio_anchor(ikó * ae, "mba'e")`,
    );
    expect(referentialPronoun('teko')).toBe('studio_ref(+ae, "teko")');
    expect(coreferenceSource('anchor', 'abá # nota', 'A')).toBe('studio_anchor(abá # nota\n, "A")');
    expect(() => coreferenceSource('reference', '+ae', 'two words')).toThrow();
    parse(coreferenceSource('anchor', 'abá # nota', 'A'));
  });

  it('suggests a readable label from the first named piece', () => {
    const root = parse('(tekokatu * (+ae * mbaé)).base_nominal()');
    expect(suggestCoreferenceLabel(root, [])).toBe('tekokatu');
    expect(suggestCoreferenceLabel(root, ['tekokatu', 'tekokatu2'])).toBe('tekokatu3');
    expect(suggestCoreferenceLabel(parse('ProperNoun("Tupã")'), [])).toBe('Tupã');
    expect(suggestCoreferenceLabel(parse('+ae'), ['ref'])).toBe('ref2');
  });

  it('scans other passages without being fooled by strings or comments', () => {
    const raw = `studio_anchor((abá * Noun("studio_ref(x, 'no')")), "A") # studio_ref(+ae, "C")
      + studio_ref(
        +ae,  # pronome
        'B'
      ) + x.studio_ref(+ae, "D") + studio_ref(+ae, name)`;
    expect(scanCoreferences(raw)).toEqual([
      { role: 'anchor', label: 'A' },
      { role: 'reference', label: 'B' },
    ]);
  });

  it('indexes the rest of the work, preferring drafts and loose pieces', () => {
    const passage = (id: string, ordinal: number, sourceExpression: string, sourceId = 'work') =>
      ({
        id,
        ordinal,
        sourceId,
        sourceExpression,
        title: id,
        normalized: id + ' texto',
      }) as Passage;
    const passages = [
      passage('p1', 1, 'studio_anchor(abá, "old")'),
      passage('p2', 2, 'studio_ref(+ae, "A")'),
      passage('p3', 3, 'studio_anchor(abá, "Z")', 'other'),
      passage('p4', 4, 'studio_anchor(abá, "current")'),
    ];
    const drafts = {
      p1: {
        raw: 'studio_anchor(abá, "A")',
        canvas: {
          fragments: [{ id: 'f', raw: 'studio_ref(+ae, "A")', x: 0, y: 0 }],
          positions: {},
        },
      } as unknown as Draft,
    };
    expect(
      collectWorkCoreferences(passages, drafts, 'work', 'p4').map((link) => [
        link.passageId,
        link.role,
        link.label,
      ]),
    ).toEqual([
      ['p1', 'anchor', 'A'],
      ['p1', 'reference', 'A'],
      ['p2', 'reference', 'A'],
    ]);
  });

  it('anchors a structure and creates its pronoun in one canvas transaction', () => {
    const raw = 'ikó * ae';
    const document: CanvasDocument = { raw, roots: { main: parse(raw) } };
    const next = editCanvas(document, {
      type: 'replace',
      source: { nodeId: 'root' },
      raw: coreferenceSource('anchor', raw, 'oiko'),
      add: { raw: referentialPronoun('oiko'), position: { x: 10, y: 20 } },
    });
    expect(next.raw).toBe('(studio_anchor(ikó * ae, "oiko"))');
    expect(next.canvas.fragments).toMatchObject([{ raw: 'studio_ref(+ae, "oiko")', x: 10, y: 20 }]);
    expect(coreferenceLinks(parse(next.raw))).toMatchObject([{ role: 'anchor', label: 'oiko' }]);
  });
});

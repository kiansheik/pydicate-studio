import { describe, expect, it } from 'vitest';
import {
  layoutRuntimeTree,
  initialRuntimeOverview,
  runtimeHierarchy,
  searchRuntimeTree,
  runtimeProjection,
  editableRuntimeScopes,
  replaceRuntimeScope,
  zoomRuntimeAt,
  type RuntimeGraph,
  type RuntimeNode,
} from './runtime-tree';
import type { AuthorNode } from './authoring';

const node = (id: string, label = id): RuntimeNode => ({
  id,
  label,
  runtimeType: 'Noun',
  category: 'noun',
  definition: 'aldeia e moradia',
  tag: '[NOUN]',
  attributes: { negated: false },
  morphology: {},
});
const graph: RuntimeGraph = {
  version: 1,
  rootId: 'a',
  nodes: [node('a'), node('b', 'tábá'), node('c'), node('d')],
  diagnostics: [],
  edges: [
    {
      id: 'ab',
      source: 'a',
      target: 'b',
      field: 'arguments',
      index: 0,
      label: 'argumento 1',
      kind: 'child',
      evidence: 'arguments',
    },
    {
      id: 'ac',
      source: 'a',
      target: 'c',
      field: 'pre_adjuncts',
      index: 0,
      label: 'adjunto anterior 1',
      kind: 'child',
      evidence: 'pre_adjuncts',
    },
    {
      id: 'bd',
      source: 'b',
      target: 'd',
      field: 'compositions',
      index: 0,
      label: 'composição 1',
      kind: 'child',
      evidence: 'compositions',
    },
    {
      id: 'ca',
      source: 'c',
      target: 'a',
      field: 'principal',
      index: null,
      label: 'oração principal',
      kind: 'reference',
      evidence: 'principal',
    },
    {
      id: 'cd',
      source: 'c',
      target: 'd',
      field: 'arguments',
      index: 0,
      label: 'argumento 1',
      kind: 'reference',
      evidence: 'arguments',
    },
  ],
};
describe('runtime tree projection', () => {
  it('keeps first-level relationships visible when a dense root cannot fit at the preferred scale', () => {
    const dense: RuntimeGraph = {
      ...graph,
      rootId: 'root',
      nodes: [node('root'), ...Array.from({ length: 8 }, (_, index) => node(String(index)))],
      edges: Array.from({ length: 8 }, (_, index) => ({
        id: String(index),
        source: 'root',
        target: String(index),
        field: 'arguments',
        index,
        label: 'argumento',
        kind: 'child',
        evidence: 'arguments',
      })),
    };
    const overview = layoutRuntimeTree(dense, initialRuntimeOverview(dense, 886, 490));
    expect(overview.positions.size).toBe(9);
    expect(overview.edges.length).toBe(8);
  });
  it('hides real morphology-copy branches without merging distinct objects by label', () => {
    const fixture: RuntimeGraph = {
      ...graph,
      nodes: [...graph.nodes, node('copy', 'tábá'), node('copy-child')],
      edges: [
        ...graph.edges,
        {
          id: 'copy-edge',
          source: 'a',
          target: 'copy',
          field: 'arg0',
          index: null,
          label: 'cópia para realização',
          kind: 'internal',
          evidence: 'Postposition.arg0',
        },
        {
          id: 'copy-child-edge',
          source: 'copy',
          target: 'copy-child',
          field: 'arguments',
          index: 0,
          label: 'argumento',
          kind: 'child',
          evidence: 'arguments',
        },
      ],
    };
    const normal = runtimeProjection(fixture);
    expect(normal.nodes).toHaveLength(4);
    expect(searchRuntimeTree(normal, 'taba')).toHaveLength(1);
    expect(searchRuntimeTree(runtimeProjection(fixture, true), 'taba')).toHaveLength(2);
    expect(fixture.nodes).toHaveLength(6);
  });
  it('anchors zoom at the same model point even when clamped', () => {
    const before = { x: 50, y: 25, zoom: 1.2 };
    for (const factor of [0.7, 1.5, 100, 0.00001]) {
      const after = zoomRuntimeAt(before, factor, 177, -89);
      expect(after.x + 177 / after.zoom).toBeCloseTo(before.x + 177 / before.zoom);
      expect(after.y - 89 / after.zoom).toBeCloseTo(before.y - 89 / before.zoom);
    }
  });
  it('requires exact traced source spans and preserves UTF-16 scope in replacements', () => {
    const raw = 'a + (tábá * xe)';
    const scope: AuthorNode = {
      id: 'root/right',
      code: 'tábá * xe',
      start: 5,
      end: 14,
      kind: 'binary',
      label: '*',
      children: [],
    };
    scope.end = scope.start + scope.code.length;
    const runtime = {
      ...node('b'),
      sourceOccurrences: [
        {
          sourceNodeId: scope.id,
          code: scope.code,
          start: scope.start,
          end: scope.end,
          kind: scope.kind,
        },
      ],
    };
    expect(editableRuntimeScopes(runtime, scope, raw)).toEqual([scope]);
    expect(replaceRuntimeScope(raw, scope, 'oré')).toBe('a + ((oré))');
    expect(editableRuntimeScopes(runtime, scope, 'x ' + raw)).toEqual([]);
    expect(() => replaceRuntimeScope('x ' + raw, scope, 'oré')).toThrow('A análise mudou');
    expect(editableRuntimeScopes(node('unmapped'), scope, raw)).toEqual([]);
  });
  it('chooses a readable overview from actual viewport fit even for a short long-chain graph', () => {
    const chain: RuntimeGraph = {
      version: 1,
      rootId: '0',
      nodes: Array.from({ length: 11 }, (_, index) => node(String(index))),
      diagnostics: [],
      edges: Array.from({ length: 10 }, (_, index) => ({
        id: String(index),
        source: String(index),
        target: String(index + 1),
        field: 'arguments',
        index: 0,
        label: 'argumento',
        kind: 'child',
        evidence: 'arguments',
      })),
    };
    const narrow = initialRuntimeOverview(chain, 716, 577);
    const overview = layoutRuntimeTree(chain, narrow);
    expect(overview.positions.size).toBeLessThan(11);
    expect(
      Math.min((716 - 72) / (overview.width + 24), (577 - 100) / (overview.height + 24)),
    ).toBeGreaterThanOrEqual(0.65);
    expect(initialRuntimeOverview(graph, 2000, 1000).size).toBe(0);
    expect(layoutRuntimeTree(chain, new Set()).positions.size).toBe(11);
  });
  it('deduplicates shared and cyclic links while retaining cross-reference edges', () => {
    const hierarchy = runtimeHierarchy(graph);
    expect(hierarchy.parent.size).toBe(3);
    expect(hierarchy.spanning.has('ca')).toBe(false);
    const full = layoutRuntimeTree(graph, new Set());
    expect(full.positions.size).toBe(4);
    expect(full.edges.length).toBe(5);
    expect(full.positions.get('b')!.y).not.toBe(full.positions.get('c')!.y);
  });
  it('collapses only descendants and reports hidden objects without rewriting the graph', () => {
    const layout = layoutRuntimeTree(graph, new Set(['b']));
    expect(layout.positions.size).toBe(3);
    expect(layout.positions.has('d')).toBe(false);
    expect(layout.positions.get('b')!.hiddenCount).toBe(1);
    expect(graph.nodes.length).toBe(4);
  });
  it('finds lexemes and hidden morphology with accent-insensitive Portuguese search', () => {
    expect(searchRuntimeTree(graph, 'taba').map((value) => value.id)).toEqual(['b']);
    expect(searchRuntimeTree(graph, '"taba"').map((value) => value.id)).toEqual(['b']);
    expect(searchRuntimeTree(graph, '"moradia"')).toEqual([]);
    expect(searchRuntimeTree(graph, 'moradia').length).toBe(4);
    expect(searchRuntimeTree(graph, 'negated false').length).toBe(4);
    expect(searchRuntimeTree(graph, '').length).toBe(0);
  });
});

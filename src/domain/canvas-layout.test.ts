import { describe, expect, it } from 'vitest';
import { canvasEdgePath, layoutCanvasTree } from './canvas-layout';
import {
  layoutRuntimeTree,
  treeNodeHeight,
  treeNodeWidth,
  type RuntimeGraph,
  type RuntimeNode,
} from './runtime-tree';

const node = (id: string, kind = 'reference'): RuntimeNode => ({
  id,
  label: kind === 'binary' ? '*' : id,
  runtimeType: kind,
  category: kind,
  definition: '',
  tag: '',
  attributes: {},
  morphology: {},
  expression: { kind, code: id },
  evaluation: { status: 'ok', surface: id === 'root' ? 'temityma' : id },
});
const graph: RuntimeGraph = {
  version: 1,
  rootId: 'root',
  diagnostics: [],
  nodes: [node('root', 'binary'), node('root/left'), node('root/right')],
  edges: [
    {
      id: 'left',
      source: 'root',
      target: 'root/left',
      field: 'left',
      index: 0,
      label: 'esquerda',
      kind: 'child',
      evidence: 'source',
    },
    {
      id: 'right',
      source: 'root',
      target: 'root/right',
      field: 'right',
      index: 1,
      label: 'direita',
      kind: 'child',
      evidence: 'source',
    },
  ],
};

describe('canvas construction orientation', () => {
  it('places inputs below their result in source order without altering source or evaluations', () => {
    const before = structuredClone(graph);
    const layout = layoutCanvasTree(graph, new Set(), 'bottom-up');
    const parent = layout.positions.get('root')!;
    const left = layout.positions.get('root/left')!;
    const right = layout.positions.get('root/right')!;
    expect(parent.y + treeNodeHeight(parent.node)).toBeLessThan(left.y);
    expect(left.x + treeNodeWidth(left.node)).toBeLessThan(right.x);
    expect(parent.x + treeNodeWidth(parent.node) / 2).toBeGreaterThan(left.x);
    expect(graph).toEqual(before);
    expect(canvasEdgePath(parent, left, 'bottom-up')).toContain(
      `, ${left.x + treeNodeWidth(left.node) / 2} ${left.y}`,
    );
  });
  it('keeps long output boxes and wide parents apart in both orientations', () => {
    const fixture: RuntimeGraph = {
      ...graph,
      nodes: [
        node('root', 'binary'),
        node('left', 'binary'),
        node('right', 'binary'),
        node('left/child', 'binary'),
        node('right/child', 'binary'),
        node('long-reference'),
      ],
      edges: [
        ['root', 'left'],
        ['root', 'right'],
        ['root', 'long-reference'],
        ['left', 'left/child'],
        ['right', 'right/child'],
      ].map(([source, target], index) => ({
        ...graph.edges[0],
        id: String(index),
        source,
        target,
        index,
      })),
    };
    for (const current of fixture.nodes) {
      current.expression!.isRoot = current.id === 'root';
      current.evaluation = {
        status: 'ok',
        surface: current.id.endsWith('/child')
          ? 'a'
          : 'arobîar ybakype i îeupiragûera '.repeat(24).trim(),
      };
    }
    const before = structuredClone(fixture);
    for (const orientation of ['horizontal', 'bottom-up'] as const) {
      const layout = layoutCanvasTree(fixture, new Set(), orientation);
      const positions = [...layout.positions.values()];
      positions.forEach((first, index) => {
        expect(first.x + treeNodeWidth(first.node)).toBeLessThanOrEqual(layout.width);
        expect(first.y + treeNodeHeight(first.node)).toBeLessThanOrEqual(layout.height);
        for (const second of positions.slice(index + 1)) {
          const overlapX =
            first.x < second.x + treeNodeWidth(second.node) &&
            second.x < first.x + treeNodeWidth(first.node);
          const overlapY =
            first.y < second.y + treeNodeHeight(second.node) &&
            second.y < first.y + treeNodeHeight(first.node);
          expect(overlapX && overlapY).toBe(false);
        }
      });
      if (orientation === 'bottom-up') {
        for (const edge of layout.edges) {
          const parent = layout.positions.get(edge.source)!;
          const child = layout.positions.get(edge.target)!;
          expect(parent.y + treeNodeHeight(parent.node)).toBeLessThan(child.y);
        }
      }
    }
    expect(fixture).toEqual(before);
  });

  it('retains collapse identities and preserves the existing horizontal layout exactly', () => {
    const collapsed = layoutCanvasTree(graph, new Set(['root']), 'bottom-up');
    expect([...collapsed.positions.keys()]).toEqual(['root']);
    expect(collapsed.positions.get('root')!.hiddenCount).toBe(2);
    expect(layoutCanvasTree(graph, new Set(), 'horizontal')).toEqual(
      layoutRuntimeTree(graph, new Set()),
    );
  });
});

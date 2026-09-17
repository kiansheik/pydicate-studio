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
  it('retains collapse identities and preserves the existing horizontal layout exactly', () => {
    const collapsed = layoutCanvasTree(graph, new Set(['root']), 'bottom-up');
    expect([...collapsed.positions.keys()]).toEqual(['root']);
    expect(collapsed.positions.get('root')!.hiddenCount).toBe(2);
    expect(layoutCanvasTree(graph, new Set(), 'horizontal')).toEqual(
      layoutRuntimeTree(graph, new Set()),
    );
  });
});

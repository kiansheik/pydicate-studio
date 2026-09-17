import {
  layoutRuntimeTree,
  NODE_HEIGHT,
  treeNodeHeight,
  treeNodeWidth,
  type RuntimeGraph,
  type TreePosition,
} from './runtime-tree';

export type CanvasLayout = 'horizontal' | 'bottom-up';

/** Inputs form the lower branches; each operation and its result sit above
 * their inputs. Node identities and source operand order remain unchanged. */
export function layoutCanvasTree(
  graph: RuntimeGraph,
  collapsed: ReadonlySet<string>,
  orientation: CanvasLayout,
) {
  const horizontal = layoutRuntimeTree(graph, collapsed);
  if (orientation === 'horizontal') return horizontal;
  const positions = new Map<string, TreePosition>();
  const rowHeight =
    Math.max(
      NODE_HEIGHT,
      ...[...horizontal.positions.values()].map((position) => treeNodeHeight(position.node)),
    ) + 115;
  let cursor = 0;
  function place(id: string, depth: number): number {
    const original = horizontal.positions.get(id)!;
    const children = collapsed.has(id) ? [] : original.children;
    const centers = children.map((child) => place(child, depth + 1));
    const width = treeNodeWidth(original.node);
    const center = centers.length ? (centers[0] + centers.at(-1)!) / 2 : cursor + width / 2;
    if (!centers.length) cursor += width + 70;
    positions.set(id, { ...original, x: center - width / 2, y: depth * rowHeight });
    return center;
  }
  place(graph.rootId, 0);
  const minimum = Math.min(0, ...[...positions.values()].map((position) => position.x));
  for (const position of positions.values()) position.x -= minimum;
  return {
    ...horizontal,
    positions,
    width: Math.max(
      ...[...positions.values()].map((position) => position.x + treeNodeWidth(position.node)),
    ),
    height: Math.max(
      ...[...positions.values()].map((position) => position.y + treeNodeHeight(position.node)),
    ),
  };
}

export function canvasEdgePath(
  source: TreePosition,
  target: TreePosition,
  orientation: CanvasLayout,
) {
  if (orientation === 'horizontal') {
    const x1 = source.x + treeNodeWidth(source.node);
    const y1 = source.y + NODE_HEIGHT / 2;
    const x2 = target.x;
    const y2 = target.y + NODE_HEIGHT / 2;
    const midpoint = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midpoint} ${y1}, ${midpoint} ${y2}, ${x2} ${y2}`;
  }
  const x1 = source.x + treeNodeWidth(source.node) / 2;
  const y1 = source.y + treeNodeHeight(source.node);
  const x2 = target.x + treeNodeWidth(target.node) / 2;
  const y2 = target.y;
  const midpoint = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midpoint}, ${x2} ${midpoint}, ${x2} ${y2}`;
}

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
  // A long output only enlarges its own depth band. Reserve subtree widths
  // too: a wide operation above a narrow operand must not invade its sibling.
  const depthHeights = new Map<number, number>();
  for (const { depth, node } of horizontal.positions.values())
    depthHeights.set(depth, Math.max(depthHeights.get(depth) ?? NODE_HEIGHT, treeNodeHeight(node)));
  const depthY = new Map<number, number>([[0, 0]]);
  for (let depth = 1; depth <= Math.max(...depthHeights.keys()); depth++)
    depthY.set(depth, depthY.get(depth - 1)! + depthHeights.get(depth - 1)! + 115);
  const gap = 70;
  const widths = new Map<string, number>();
  function measure(id: string): number {
    const original = horizontal.positions.get(id)!;
    const children = collapsed.has(id) ? [] : original.children;
    const childWidth =
      children.reduce((sum, child) => sum + measure(child), 0) +
      Math.max(0, children.length - 1) * gap;
    const width = Math.max(treeNodeWidth(original.node), childWidth);
    widths.set(id, width);
    return width;
  }
  function place(id: string, depth: number, left: number) {
    const original = horizontal.positions.get(id)!;
    const children = collapsed.has(id) ? [] : original.children;
    const width = widths.get(id)!;
    const childWidth =
      children.reduce((sum, child) => sum + widths.get(child)!, 0) +
      Math.max(0, children.length - 1) * gap;
    let childLeft = left + (width - childWidth) / 2;
    for (const child of children) {
      place(child, depth + 1, childLeft);
      childLeft += widths.get(child)! + gap;
    }
    positions.set(id, {
      ...original,
      x: left + (width - treeNodeWidth(original.node)) / 2,
      y: depthY.get(depth)!,
    });
  }
  measure(graph.rootId);
  place(graph.rootId, 0, 0);
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

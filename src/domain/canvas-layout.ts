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
  // Keep vertical space for wrapped results. Horizontal space follows each
  // branch's contour at the depths it actually occupies, not its total width.
  const depthHeights = new Map<number, number>();
  for (const { depth, node } of horizontal.positions.values())
    depthHeights.set(depth, Math.max(depthHeights.get(depth) ?? NODE_HEIGHT, treeNodeHeight(node)));
  const depthY = new Map<number, number>([[0, 0]]);
  for (let depth = 1; depth <= Math.max(...depthHeights.keys()); depth++)
    depthY.set(depth, depthY.get(depth - 1)! + depthHeights.get(depth - 1)! + 115);
  const gap = 70;
  const childOffsets = new Map<string, { id: string; x: number }[]>();
  function measure(id: string): { left: number[]; right: number[] } {
    const original = horizontal.positions.get(id)!;
    const children = collapsed.has(id) ? [] : original.children;
    const left: number[] = [];
    const right: number[] = [];
    const offsets: { id: string; x: number }[] = [];
    for (const child of children) {
      const contour = measure(child);
      let x = 0;
      for (let depth = 0; depth < Math.min(right.length, contour.left.length); depth++)
        x = Math.max(x, right[depth] + gap - contour.left[depth]);
      offsets.push({ id: child, x });
      for (let depth = 0; depth < contour.left.length; depth++) {
        left[depth] = Math.min(left[depth] ?? Infinity, contour.left[depth] + x);
        right[depth] = Math.max(right[depth] ?? -Infinity, contour.right[depth] + x);
      }
    }
    // Centre an operation over its immediate inputs, even when one input has
    // many descendants and the other is just a short leaf branch.
    const centre = offsets.length ? (offsets[0].x + offsets.at(-1)!.x) / 2 : 0;
    childOffsets.set(
      id,
      offsets.map((child) => ({ ...child, x: child.x - centre })),
    );
    const halfWidth = treeNodeWidth(original.node) / 2;
    return {
      left: [-halfWidth, ...left.map((x) => x - centre)],
      right: [halfWidth, ...right.map((x) => x - centre)],
    };
  }
  function place(id: string, depth: number, centre: number) {
    const original = horizontal.positions.get(id)!;
    for (const child of childOffsets.get(id)!) place(child.id, depth + 1, centre + child.x);
    positions.set(id, {
      ...original,
      x: centre - treeNodeWidth(original.node) / 2,
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

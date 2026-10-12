/** Route a secondary link around visible cards, their labels and side controls.
 * Coordinates are canvas/world coordinates, including saved positions and drag previews. */
export interface LinkPoint {
  x: number;
  y: number;
}
export interface LinkRect extends LinkPoint {
  width: number;
  height: number;
}
export interface LinkCard extends LinkPoint {
  id: string;
  width: number;
  height: number;
  topSpace?: number;
  /** Prefer the rendered phrase result as the link endpoint. */
  body?: LinkRect;
  /** Separate visible parts leave empty space between a pill and its result usable. */
  obstacles?: LinkRect[];
}
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
const clearance = 12;
const same = (a: LinkPoint, b: LinkPoint) => a.x === b.x && a.y === b.y;
function crosses(a: LinkPoint, b: LinkPoint, box: Box) {
  return a.y === b.y
    ? a.y > box.top &&
        a.y < box.bottom &&
        Math.max(a.x, b.x) > box.left &&
        Math.min(a.x, b.x) < box.right
    : a.x > box.left &&
        a.x < box.right &&
        Math.max(a.y, b.y) > box.top &&
        Math.min(a.y, b.y) < box.bottom;
}
function simplify(points: LinkPoint[]) {
  const result: LinkPoint[] = [];
  for (const point of points) {
    if (result.length && same(result[result.length - 1], point)) continue;
    while (result.length > 1) {
      const a = result[result.length - 2],
        b = result[result.length - 1];
      if (!((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}
interface QueueItem {
  state: number;
  cost: number;
  priority: number;
}
class Queue {
  values: QueueItem[] = [];
  push(item: QueueItem) {
    let index = this.values.length;
    this.values.push(item);
    while (index) {
      const parent = (index - 1) >> 1;
      if (this.values[parent].priority <= item.priority) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = item;
  }
  pop() {
    const first = this.values[0],
      last = this.values.pop()!;
    if (this.values.length) {
      let index = 0;
      while (index * 2 + 1 < this.values.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < this.values.length &&
          this.values[child + 1].priority < this.values[child].priority
        )
          child++;
        if (last.priority <= this.values[child].priority) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = last;
    }
    return first;
  }
}
/** Multi-port Manhattan A*: prefer short paths with few bends. Never fall back
 * to a line crossing cards when overlapping saved cards leave no clear exit. */
export function routeCoreference(
  cards: LinkCard[],
  sourceId: string,
  targetId: string,
): LinkPoint[] | null {
  const source = cards.find((card) => card.id === sourceId),
    target = cards.find((card) => card.id === targetId);
  if (!source || !target || sourceId === targetId) return null;
  const boxes = cards.flatMap((card) => {
    const body = card.body ?? card;
    const parts = card.obstacles ?? [
      {
        x: card.x,
        y: card.y - (card.topSpace ?? 36),
        width: card.width + 30,
        height: card.height + (card.topSpace ?? 36),
      },
    ];
    return parts
      .filter(
        (part) =>
          !parts.some(
            (other) =>
              other !== part &&
              (other.width > part.width + 0.01 || other.height > part.height + 0.01) &&
              part.x >= other.x - 0.01 &&
              part.y >= other.y - 0.01 &&
              part.x + part.width <= other.x + other.width + 0.01 &&
              part.y + part.height <= other.y + other.height + 0.01,
          ),
      )
      .map((part) => ({
        left: part.x - clearance,
        right: part.x + part.width + clearance,
        top: part.y - clearance,
        bottom: part.y + part.height + clearance,
        owner: card.id,
        endpoint:
          !card.obstacles ||
          (Math.abs(part.x - body.x) < 0.01 &&
            Math.abs(part.y - body.y) < 0.01 &&
            Math.abs(part.width - body.width) < 0.01 &&
            Math.abs(part.height - body.height) < 0.01),
      }));
  });
  const distance = (a: LinkPoint, b: LinkPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const ports = (card: LinkCard) => {
    const body = card.body ?? card;
    const lead = clearance + 8;
    const bounds = card.obstacles
      ? {
          left: body.x - lead,
          right: body.x + body.width + lead,
          top: body.y - lead,
          bottom: body.y + body.height + lead,
        }
      : {
          left: card.x - lead,
          right: card.x + card.width + 30 + lead,
          top: card.y - (card.topSpace ?? 36) - lead,
          bottom: card.y + card.height + lead,
        };
    const candidates = [
      {
        point: { x: body.x, y: body.y + body.height / 2 },
        escape: { x: bounds.left, y: body.y + body.height / 2 },
        direction: 0,
      },
      {
        point: { x: body.x + body.width, y: body.y + body.height / 2 },
        escape: { x: bounds.right, y: body.y + body.height / 2 },
        direction: 0,
      },
      {
        point: { x: body.x + body.width / 2, y: body.y },
        escape: { x: body.x + body.width / 2, y: bounds.top },
        direction: 1,
      },
      {
        point: { x: body.x + body.width / 2, y: body.y + body.height },
        escape: { x: body.x + body.width / 2, y: bounds.bottom },
        direction: 1,
      },
    ];
    return candidates.filter(
      (port) =>
        !boxes.some(
          (box) =>
            !(box.owner === card.id && box.endpoint) && crosses(port.point, port.escape, box),
        ) &&
        !boxes.some(
          (box) =>
            port.escape.x > box.left &&
            port.escape.x < box.right &&
            port.escape.y > box.top &&
            port.escape.y < box.bottom,
        ),
    );
  };
  const starts = ports(source),
    ends = ports(target);
  if (!starts.length || !ends.length) return null;
  const xs = [
    ...new Set([
      ...boxes.flatMap((box) => [box.left, box.right]),
      ...starts.map((p) => p.escape.x),
      ...ends.map((p) => p.escape.x),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      ...boxes.flatMap((box) => [box.top, box.bottom]),
      ...starts.map((p) => p.escape.y),
      ...ends.map((p) => p.escape.y),
    ]),
  ].sort((a, b) => a - b);
  xs.unshift(xs[0] - 24);
  xs.push(xs[xs.length - 1] + 24);
  ys.unshift(ys[0] - 24);
  ys.push(ys[ys.length - 1] + 24);
  const nx = xs.length;
  const index = (p: LinkPoint) => ys.indexOf(p.y) * nx + xs.indexOf(p.x);
  const point = (i: number): LinkPoint => ({ x: xs[i % nx], y: ys[Math.floor(i / nx)] });
  const goals = new Map(ends.map((port) => [index(port.escape), port]));
  const heuristic = (p: LinkPoint) =>
    Math.min(...ends.map((port) => Math.abs(p.x - port.escape.x) + Math.abs(p.y - port.escape.y)));
  const queue = new Queue(),
    costs = new Map<number, number>(),
    previous = new Map<number, number>();
  const startPorts = new Map<number, (typeof starts)[number]>();
  for (const port of starts) {
    const state = index(port.escape) * 2 + port.direction;
    const cost = distance(port.point, port.escape);
    if (cost >= (costs.get(state) ?? Infinity)) continue;
    costs.set(state, cost);
    startPorts.set(state, port);
    queue.push({ state, cost, priority: cost + heuristic(port.escape) });
  }
  const clearEdges = new Map<string, boolean>();
  let best: { state: number; cost: number; end: (typeof ends)[number] } | undefined;
  while (queue.values.length) {
    const item = queue.pop();
    if (item.cost !== costs.get(item.state)) continue;
    if (best && item.priority >= best.cost) break;
    const cell = Math.floor(item.state / 2),
      direction = item.state % 2,
      from = point(cell);
    const end = goals.get(cell);
    if (end) {
      const cost =
        item.cost + distance(end.point, end.escape) + (direction === end.direction ? 0 : 18);
      if (!best || cost < best.cost) best = { state: item.state, cost, end };
    }
    const x = cell % nx,
      y = Math.floor(cell / nx);
    for (const [next, nextDirection] of [
      [x ? cell - 1 : -1, 0],
      [x + 1 < nx ? cell + 1 : -1, 0],
      [y ? cell - nx : -1, 1],
      [y + 1 < ys.length ? cell + nx : -1, 1],
    ]) {
      if (next < 0) continue;
      const to = point(next),
        edge = `${Math.min(cell, next)}:${Math.max(cell, next)}`;
      if (!clearEdges.has(edge)) clearEdges.set(edge, !boxes.some((box) => crosses(from, to, box)));
      if (!clearEdges.get(edge)) continue;
      const state = next * 2 + nextDirection;
      const cost =
        item.cost +
        Math.abs(to.x - from.x) +
        Math.abs(to.y - from.y) +
        (direction === nextDirection ? 0 : 18);
      if (cost >= (costs.get(state) ?? Infinity)) continue;
      costs.set(state, cost);
      previous.set(state, item.state);
      queue.push({ state, cost, priority: cost + heuristic(to) });
    }
  }
  if (!best) return null;
  const route: LinkPoint[] = [best.end.point];
  let state = best.state;
  for (;;) {
    route.push(point(Math.floor(state / 2)));
    const parent = previous.get(state);
    if (parent === undefined) break;
    state = parent;
  }
  route.push(startPorts.get(state)!.point);
  return simplify(route.reverse());
}
export function coreferencePath(points: LinkPoint[]) {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1],
      corner = points[i],
      after = points[i + 1];
    // Stay inside the router's clearance: curves never cut through a visible box.
    const radius = Math.min(
      8,
      Math.hypot(corner.x - before.x, corner.y - before.y) / 2,
      Math.hypot(after.x - corner.x, after.y - corner.y) / 2,
    );
    const entry = {
      x: corner.x - Math.sign(corner.x - before.x) * radius,
      y: corner.y - Math.sign(corner.y - before.y) * radius,
    };
    const exit = {
      x: corner.x + Math.sign(after.x - corner.x) * radius,
      y: corner.y + Math.sign(after.y - corner.y) * radius,
    };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const end = points[points.length - 1];
  return path + ` L ${end.x} ${end.y}`;
}

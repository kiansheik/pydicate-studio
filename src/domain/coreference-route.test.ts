import { describe, expect, it } from 'vitest';
import realTree from '../../tests/fixtures/coreference-real-tree.json';
import { routeCoreference, type LinkCard, type LinkPoint } from './coreference-route';
const card = (id: string, x: number, y: number, width = 180, height = 100): LinkCard => ({
  id,
  x,
  y,
  width,
  height,
});
function clear(points: LinkPoint[], cards: LinkCard[]) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    expect(a.x === b.x || a.y === b.y).toBe(true);
    for (const node of cards) {
      const crosses =
        a.y === b.y
          ? a.y > node.y &&
            a.y < node.y + node.height &&
            Math.min(a.x, b.x) < node.x + node.width &&
            Math.max(a.x, b.x) > node.x
          : a.x > node.x &&
            a.x < node.x + node.width &&
            Math.min(a.y, b.y) < node.y + node.height &&
            Math.max(a.y, b.y) > node.y;
      expect(crosses, `segment ${i} crosses ${node.id}`).toBe(false);
    }
  }
}
function onBorder(p: LinkPoint, node: LinkCard) {
  return (
    ((p.x === node.x || p.x === node.x + node.width) &&
      p.y >= node.y &&
      p.y <= node.y + node.height) ||
    ((p.y === node.y || p.y === node.y + node.height) &&
      p.x >= node.x &&
      p.x <= node.x + node.width)
  );
}
describe('referential link routing', () => {
  it('attaches to actual card borders and detours around an intervening card', () => {
    const nodes = [
      card('pronoun', 0, 100),
      card('antecedent', 700, 100),
      card('blocker', 320, -80, 200, 360),
    ];
    const route = routeCoreference(nodes, 'pronoun', 'antecedent')!;
    expect(route).not.toBeNull();
    expect(onBorder(route[0], nodes[0])).toBe(true);
    expect(onBorder(route[route.length - 1], nodes[1])).toBe(true);
    clear(route, nodes);
    expect(route.some((p) => p.y >= 292 || p.y <= -128)).toBe(true);
  });
  it('clears card labels and side controls as well as the card body', () => {
    const nodes = [card('a', 0, 0), card('b', 600, 0), card('middle', 300, -100, 150, 350)];
    const route = routeCoreference(nodes, 'a', 'b')!;
    clear(route, nodes);
    clear(route, [
      {
        ...nodes[2],
        x: nodes[2].x - 11,
        y: nodes[2].y - 47,
        width: nodes[2].width + 52,
        height: nodes[2].height + 58,
      },
    ]);
  });
  it('reroutes using moved positions, variable card heights and either tree direction', () => {
    for (const y of [-450, 450]) {
      const nodes = [
        card('a', 250, y, 240, 190),
        card('b', 250, 0),
        card('middle', 180, y / 2, 360, 130),
      ];
      const route = routeCoreference(nodes, 'a', 'b')!;
      expect(route).not.toBeNull();
      clear(route, nodes);
      expect(onBorder(route[0], nodes[0])).toBe(true);
      expect(onBorder(route[route.length - 1], nodes[1])).toBe(true);
    }
  });
  it('can use the nearest clear side of a rendered phrase result', () => {
    const source = {
      ...card('a', 0, 0, 240, 180),
      body: { x: 0, y: 77, width: 240, height: 95 },
      obstacles: [
        { x: 0, y: 77, width: 240, height: 95 },
        { x: 87, y: 30, width: 66, height: 40 },
      ],
    };
    const target = {
      ...card('b', 400, 0, 240, 180),
      body: { x: 400, y: 77, width: 240, height: 95 },
      obstacles: [
        { x: 400, y: 77, width: 240, height: 95 },
        { x: 487, y: 30, width: 66, height: 40 },
      ],
    };
    const route = routeCoreference([source, target], 'a', 'b')!;
    expect(route).toEqual([
      { x: 240, y: 124.5 },
      { x: 400, y: 124.5 },
    ]);
  });
  it('keeps the real 38-node saved tree link compact and outside rendered parts', () => {
    const nodes = realTree.geometry.nodes.map((node) => ({
      ...node,
      obstacles: node.obstacles.filter((part) => part.class !== 'canvas-coreference-badge'),
    }));
    const labels = realTree.geometry.edgeLabels.map((label, index) => ({
      ...label,
      id: 'edge-label:' + index,
      body: label,
      obstacles: [label],
    }));
    const route = routeCoreference(
      [...nodes, ...labels],
      realTree.coreference.sourceId,
      realTree.coreference.targetId,
    )!;
    expect(route).not.toBeNull();
    const length = route
      .slice(1)
      .reduce((sum, p, i) => sum + Math.abs(p.x - route[i].x) + Math.abs(p.y - route[i].y), 0);
    const source = nodes.find((n) => n.id === realTree.coreference.sourceId)!.body;
    const target = nodes.find((n) => n.id === realTree.coreference.targetId)!.body;
    expect(onBorder(route[0], { id: 'source', ...source })).toBe(true);
    expect(onBorder(route[route.length - 1], { id: 'target', ...target })).toBe(true);
    expect(length).toBeLessThan(1100);
    expect(route.length).toBeLessThanOrEqual(8);
    clear(route, [
      ...nodes.flatMap((node) =>
        node.obstacles.map((part, i) => ({ id: node.id + ':' + i, ...part })),
      ),
      ...labels,
    ]);
  });

  it('never substitutes a colliding line when saved cards enclose the source', () => {
    expect(
      routeCoreference(
        [card('a', 50, 50), card('b', 700, 0), card('cover', 0, 0, 500, 500)],
        'a',
        'b',
      ),
    ).toBeNull();
  });
  it('routes through a populated forest rather than only checking the endpoint trees', () => {
    const nodes = [
      card('a', 0, 0),
      card('b', 1800, 900),
      ...Array.from({ length: 48 }, (_, i) =>
        card('obstacle' + i, 300 + (i % 6) * 240, Math.floor(i / 6) * 170),
      ),
    ];
    const route = routeCoreference(nodes, 'a', 'b')!;
    expect(route).not.toBeNull();
    clear(route, nodes);
  });
});

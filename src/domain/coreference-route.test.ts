import { describe, expect, it } from 'vitest';
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
    (p.x === node.x && p.y >= node.y && p.y <= node.y + node.height) ||
    (p.y === node.y + node.height && p.x >= node.x && p.x <= node.x + node.width)
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
  it('attaches operation links to the visible pill rather than its label/result envelope', () => {
    const source = { ...card('a', 0, 0, 240, 180), body: { x: 87, y: 30, width: 66, height: 40 } };
    const target = {
      ...card('b', 700, 0, 240, 180),
      body: { x: 787, y: 30, width: 66, height: 40 },
    };
    const route = routeCoreference([source, target], 'a', 'b')!;
    expect(route[0]).toEqual({ x: 87, y: 50 });
    expect(route[route.length - 1]).toEqual({ x: 787, y: 50 });
    clear(route, [
      { id: 'a', ...source.body },
      { id: 'b', ...target.body },
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

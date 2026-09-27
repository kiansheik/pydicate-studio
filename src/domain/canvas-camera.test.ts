import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  fitCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  revealCamera,
  sameCamera,
  visibleWorld,
} from './canvas-camera';

const size = { width: 900, height: 500 };

describe('clampZoom', () => {
  it('keeps the usable range and rejects broken numbers', () => {
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(40)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe('fitCamera', () => {
  it('centres the extent and never leaves the usable zoom range', () => {
    const camera = fitCamera({ x: 100, y: 50, width: 400, height: 200 }, size);
    expect(camera.x).toBe(300);
    expect(camera.y).toBe(150);
    expect(camera.zoom).toBeLessThanOrEqual(1.1);
    expect(camera.zoom).toBeGreaterThan(0);
  });
  it('stays valid for an empty extent in a viewport smaller than its padding', () => {
    const camera = fitCamera({ x: 0, y: 0, width: 0, height: 0 }, { width: 20, height: 20 });
    expect(camera.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(camera.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    expect(Number.isFinite(camera.x)).toBe(true);
  });
  it('shrinks far enough for a very wide tree', () => {
    const camera = fitCamera({ x: 0, y: 0, width: 40000, height: 200 }, size);
    expect(camera.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(camera.zoom).toBeLessThan(0.1);
  });
});

describe('visibleWorld', () => {
  it('reports the rectangle the viewBox shows', () => {
    expect(visibleWorld({ x: 0, y: 0, zoom: 2 }, size)).toEqual({
      x: -225,
      y: -125,
      width: 450,
      height: 250,
    });
  });
});

describe('revealCamera', () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  it('returns the identical camera when the box is already comfortably visible', () => {
    expect(revealCamera(camera, size, { x: -20, y: -20, width: 40, height: 40 })).toBe(camera);
  });
  it('pans by the smallest amount that uncovers a box past the right edge', () => {
    const next = revealCamera(camera, size, { x: 500, y: 0, width: 100, height: 50 }, 60);
    // The right margin sits at x = 390 in world units, so 210 of pan is enough.
    expect(next.x).toBe(210);
    expect(next.y).toBe(0);
    expect(next.zoom).toBe(1);
  });
  it('keeps the contributor zoom while reaching a far away piece', () => {
    const zoomed = { x: 0, y: 0, zoom: 2.2 };
    const next = revealCamera(zoomed, size, { x: 4000, y: 3000, width: 240, height: 100 });
    expect(next.zoom).toBe(2.2);
    expect(next.x).toBeGreaterThan(3000);
    expect(next.y).toBeGreaterThan(2000);
  });
  it('centres a box larger than the viewport instead of chasing one corner', () => {
    const next = revealCamera(camera, size, { x: -2000, y: -1000, width: 4000, height: 2000 });
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });
  it('centres rather than inverting the window when the margin exceeds the viewport', () => {
    const next = revealCamera(
      camera,
      { width: 80, height: 80 },
      {
        x: 300,
        y: 0,
        width: 10,
        height: 10,
      },
    );
    expect(next.x).toBe(305);
  });
});

describe('sameCamera', () => {
  it('ignores differences no one can see and keeps real ones', () => {
    expect(sameCamera({ x: 0, y: 0, zoom: 1 }, { x: 0.2, y: -0.1, zoom: 1 })).toBe(true);
    expect(sameCamera({ x: 0, y: 0, zoom: 1 }, { x: 4, y: 0, zoom: 1 })).toBe(false);
    expect(sameCamera({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0, zoom: 1.2 })).toBe(false);
  });
});

/** The camera the canvas and the read-only tree share: a world point held at the
 * centre of the viewport, and the scale that point is drawn at. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.025;
export const MAX_ZOOM = 2.5;

export interface ViewSize {
  width: number;
  height: number;
}
export interface WorldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The world rectangle a camera shows inside a viewport of `size` pixels. */
export function visibleWorld(camera: Camera, size: ViewSize): WorldBox {
  const width = size.width / camera.zoom;
  const height = size.height / camera.zoom;
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height };
}

/** Frame the whole extent. Padding is viewport pixels, so it stays constant on screen. */
export function fitCamera(extent: WorldBox, size: ViewSize, padding = 70, maxZoom = 1.1): Camera {
  const width = Math.max(1, extent.width);
  const height = Math.max(1, extent.height);
  const usableWidth = Math.max(1, size.width - padding);
  const usableHeight = Math.max(1, size.height - padding);
  return {
    x: extent.x + width / 2,
    y: extent.y + height / 2,
    zoom: clampZoom(Math.min(maxZoom, usableWidth / width, usableHeight / height)),
  };
}

/** The smallest pan that brings `box` inside the view, keeping `margin` viewport
 * pixels of context around it. An already visible box returns the very same camera,
 * so a caller can skip the state commit and the re-render it would cause. */
export function revealCamera(camera: Camera, size: ViewSize, box: WorldBox, margin = 60): Camera {
  const view = visibleWorld(camera, size);
  const inset = margin / camera.zoom;
  const shift = (start: number, length: number, boxStart: number, boxLength: number) => {
    let low = start + inset;
    let high = start + length - inset;
    // A margin wider than the viewport itself would invert the window; centre instead.
    if (high <= low) {
      low = start + length / 2;
      high = low;
    }
    if (boxLength > high - low) return boxStart + boxLength / 2 - (low + high) / 2;
    if (boxStart < low) return boxStart - low;
    if (boxStart + boxLength > high) return boxStart + boxLength - high;
    return 0;
  };
  const dx = shift(view.x, view.width, box.x, box.width);
  const dy = shift(view.y, view.height, box.y, box.height);
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return camera;
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** Cameras this close put every node within half a device pixel of each other. */
export function sameCamera(a: Camera, b: Camera): boolean {
  return (
    Math.abs(a.x - b.x) * a.zoom < 0.5 &&
    Math.abs(a.y - b.y) * a.zoom < 0.5 &&
    Math.abs(a.zoom - b.zoom) < 0.0005
  );
}

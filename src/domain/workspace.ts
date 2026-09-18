export type WorkspacePane = 'navigator' | 'editor' | 'source';
export type DockPosition = 'left' | 'center' | 'right' | 'bottom';
export type ResizePosition = Exclude<DockPosition, 'center'>;
export interface WorkspaceState {
  version: 2;
  supportTab: 'source' | 'ai';
  positions: Record<WorkspacePane, DockPosition>;
  hidden: Record<WorkspacePane, boolean>;
  maximized: WorkspacePane | null;
  sizes: Record<ResizePosition, number>;
}
export const workspacePanes: WorkspacePane[] = ['navigator', 'editor', 'source'];
export const dockPositions: DockPosition[] = ['left', 'center', 'right', 'bottom'];
export const resizeBounds: Record<ResizePosition, [number, number]> = {
  left: [140, 520],
  right: [180, 900],
  bottom: [120, 700],
};
export function defaultWorkspace(): WorkspaceState {
  return {
    version: 2,
    supportTab: 'source',
    positions: { navigator: 'left', editor: 'center', source: 'right' },
    hidden: { navigator: false, editor: false, source: false },
    maximized: null,
    sizes: { left: 220, right: 400, bottom: 280 },
  };
}
export function readWorkspace(text: string | null): WorkspaceState {
  try {
    const state = JSON.parse(text || 'null') as WorkspaceState | null;
    if (
      !state ||
      ![1, 2].includes(state.version) ||
      !state.positions ||
      !state.hidden ||
      !state.sizes ||
      !workspacePanes.every(
        (pane) =>
          dockPositions.includes(state.positions[pane]) && typeof state.hidden[pane] === 'boolean',
      ) ||
      new Set(Object.values(state.positions)).size !== 3 ||
      !(state.maximized === null || workspacePanes.includes(state.maximized)) ||
      Object.entries(resizeBounds).some(
        ([position, bounds]) =>
          !Number.isFinite(state.sizes[position as ResizePosition]) ||
          state.sizes[position as ResizePosition] < bounds[0] ||
          state.sizes[position as ResizePosition] > bounds[1],
      )
    )
      return defaultWorkspace();
    return {
      version: 2,
      supportTab: state.supportTab === 'ai' ? 'ai' : 'source',
      positions: { ...state.positions },
      hidden: { ...state.hidden },
      maximized: state.maximized && !state.hidden[state.maximized] ? state.maximized : null,
      sizes: { ...state.sizes },
    };
  } catch {
    return defaultWorkspace();
  }
}
export function moveWorkspacePane(
  state: WorkspaceState,
  pane: WorkspacePane,
  position: DockPosition,
): WorkspaceState {
  const occupant = workspacePanes.find(
    (candidate) => candidate !== pane && state.positions[candidate] === position,
  );
  return {
    ...state,
    maximized: null,
    positions: {
      ...state.positions,
      [pane]: position,
      ...(occupant ? { [occupant]: state.positions[pane] } : {}),
    },
    hidden: { ...state.hidden, [pane]: false },
  };
}
export function resizeWorkspace(
  state: WorkspaceState,
  position: ResizePosition,
  pixels: number,
): WorkspaceState {
  if (!Number.isFinite(pixels)) return state;
  const [minimum, maximum] = resizeBounds[position];
  return {
    ...state,
    sizes: { ...state.sizes, [position]: Math.round(Math.max(minimum, Math.min(maximum, pixels))) },
  };
}

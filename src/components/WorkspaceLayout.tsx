import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { GripVertical, Maximize2, Minimize2, RotateCcw, X } from 'lucide-react';
import {
  defaultWorkspace,
  dockPositions,
  moveWorkspacePane,
  readWorkspace,
  resizeBounds,
  resizeWorkspace,
  workspacePanes,
  type DockPosition,
  type ResizePosition,
  type WorkspacePane,
} from '../domain/workspace';
import '../workspace.css';
import { track } from '../domain/usage';

const storageKey = 'pydicate-studio:workspace:v2';
const legacyStorageKey = 'pydicate-studio:workspace:v1';
const titles: Record<WorkspacePane, string> = {
  navigator: 'Passagens',
  editor: 'Editor',
  source: 'Fonte',
};
const positionTitles: Record<DockPosition, string> = {
  left: 'Esquerda',
  center: 'Centro',
  right: 'Direita',
  bottom: 'Abaixo',
};
export function useWorkspaceLayout() {
  const [state, setState] = useState(() => {
    try {
      return readWorkspace(
        localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey),
      );
    } catch {
      return defaultWorkspace();
    }
  });
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      setError('');
    } catch {
      setError('O espaço de trabalho mudou nesta janela, mas não pôde ser salvo.');
    }
  }, [state]);
  return {
    state,
    error,
    support(tab: 'source' | 'ai') {
      setState((current) => ({
        ...current,
        supportTab: tab,
        hidden: { ...current.hidden, source: false },
        maximized: window.matchMedia('(max-width: 760px)').matches
          ? 'source'
          : current.maximized && current.maximized !== 'source'
            ? null
            : current.maximized,
      }));
    },
    toggle(pane: WorkspacePane) {
      track('editor.operation', { action: 'workspace.toggle', field: pane });
      setState((current) => ({
        ...current,
        maximized: current.maximized === pane ? null : current.maximized,
        hidden: { ...current.hidden, [pane]: !current.hidden[pane] },
      }));
    },
    move(pane: WorkspacePane, position: DockPosition) {
      track('editor.operation', { action: 'workspace.move', field: pane, to: position });
      setState((current) => moveWorkspacePane(current, pane, position));
    },
    maximize(pane: WorkspacePane) {
      track('editor.operation', { action: 'workspace.maximize', field: pane });
      setState((current) => ({
        ...current,
        maximized: current.maximized === pane ? null : pane,
        hidden: { ...current.hidden, [pane]: false },
      }));
    },
    resize(position: ResizePosition, pixels: number) {
      setState((current) => resizeWorkspace(current, position, pixels));
    },
    reset() {
      track('editor.operation', { action: 'workspace.reset' });
      setState(defaultWorkspace());
    },
  };
}
export type WorkspaceLayoutController = ReturnType<typeof useWorkspaceLayout>;

export function WorkspaceLayout({
  layout,
  panes,
}: {
  layout: WorkspaceLayoutController;
  panes: Record<WorkspacePane, ReactNode>;
}) {
  const { state } = layout;
  const [dragging, setDragging] = useState<WorkspacePane | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const grid = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ position: ResizePosition; start: number; size: number } | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const change = () => setNarrow(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const focused =
    state.maximized ||
    (narrow
      ? !state.hidden.editor
        ? 'editor'
        : workspacePanes.find((pane) => !state.hidden[pane]) || null
      : null);
  const visible = (pane: WorkspacePane) => !state.hidden[pane] && (!focused || focused === pane);
  const occupied = (position: DockPosition) =>
    workspacePanes.some((pane) => state.positions[pane] === position && visible(pane));
  const style = {
    '--workspace-left':
      !focused && occupied('left') ? `clamp(140px, ${state.sizes.left}px, 28vw)` : '0px',
    '--workspace-right':
      !focused && occupied('right') ? `clamp(180px, ${state.sizes.right}px, 46vw)` : '0px',
    '--workspace-bottom':
      !focused && occupied('bottom') ? `min(${state.sizes.bottom}px, 55%)` : '0px',
  } as CSSProperties;
  function dragStart(event: DragEvent, pane: WorkspacePane) {
    if ((event.target as Element).closest('button, select')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/x-pydicate-pane', pane);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(pane);
  }
  function drop(event: DragEvent, position: DockPosition) {
    event.preventDefault();
    const pane = event.dataTransfer.getData('application/x-pydicate-pane') as WorkspacePane;
    if (workspacePanes.includes(pane)) layout.move(pane, position);
    setDragging(null);
  }
  function resizeStart(event: PointerEvent, position: ResizePosition) {
    event.preventDefault();
    const pane = grid.current?.querySelector(`[data-position="${position}"][data-pane]`);
    const bounds = pane?.getBoundingClientRect();
    gesture.current = {
      position,
      start: position === 'bottom' ? event.clientY : event.clientX,
      size: bounds ? (position === 'bottom' ? bounds.height : bounds.width) : state.sizes[position],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function resizeMove(event: PointerEvent) {
    const current = gesture.current;
    if (!current) return;
    const point = current.position === 'bottom' ? event.clientY : event.clientX;
    layout.resize(
      current.position,
      current.size + (point - current.start) * (current.position === 'left' ? 1 : -1),
    );
  }
  return (
    <section className="workspace-shell" aria-label="Espaço de trabalho" style={style}>
      <div className="workspace-toolbar" aria-label="Janelas do espaço de trabalho">
        <span>Janelas</span>
        {workspacePanes.map((pane) => (
          <button
            key={pane}
            aria-label={`${visible(pane) ? 'Ocultar' : 'Mostrar'} ${titles[pane]}`}
            aria-pressed={visible(pane)}
            onClick={() => {
              if (visible(pane)) layout.toggle(pane);
              else if (narrow || (focused && focused !== pane)) layout.maximize(pane);
              else layout.toggle(pane);
            }}
          >
            {titles[pane]}
          </button>
        ))}
        <button
          className="workspace-reset"
          onClick={layout.reset}
          title="Restaurar disposição inicial"
        >
          <RotateCcw size={13} /> Restaurar disposição
        </button>
      </div>
      {layout.error && (
        <p role="status" className="workspace-storage-error">
          {layout.error}
        </p>
      )}
      <div className={`workspace-grid${focused ? ' is-focused' : ''}`} ref={grid}>
        {workspacePanes.map((pane) => (
          <section
            key={pane}
            className={`workspace-pane workspace-pane-${pane}`}
            data-pane={pane}
            data-position={state.positions[pane]}
            aria-label={`Janela ${titles[pane]}`}
            hidden={!visible(pane)}
            style={{ gridArea: focused ? '1 / 1 / -1 / -1' : state.positions[pane] }}
          >
            <header
              className="workspace-pane-title"
              draggable
              onDragStart={(event) => dragStart(event, pane)}
              onDragEnd={() => setDragging(null)}
            >
              <GripVertical size={14} aria-hidden="true" />
              <strong>{titles[pane]}</strong>
              <select
                aria-label={`Posição de ${titles[pane]}`}
                value={state.positions[pane]}
                onChange={(event) => layout.move(pane, event.target.value as DockPosition)}
              >
                {dockPositions.map((position) => (
                  <option value={position} key={position}>
                    {positionTitles[position]}
                  </option>
                ))}
              </select>
              <button
                aria-label={`${state.maximized === pane ? 'Restaurar' : 'Maximizar'} ${titles[pane]}`}
                title={state.maximized === pane ? 'Restaurar janela' : 'Maximizar janela'}
                onClick={() => layout.maximize(pane)}
              >
                {state.maximized === pane ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                aria-label={`Recolher ${titles[pane]}`}
                title="Recolher janela"
                onClick={() => layout.toggle(pane)}
              >
                <X size={14} />
              </button>
            </header>
            <div className="workspace-pane-content">{panes[pane]}</div>
          </section>
        ))}
        {!focused &&
          (['left', 'right', 'bottom'] as ResizePosition[]).filter(occupied).map((position) => (
            <div
              key={position}
              className={`workspace-resize workspace-resize-${position}`}
              role="separator"
              tabIndex={0}
              aria-label={`Redimensionar ${positionTitles[position]}`}
              aria-orientation={position === 'bottom' ? 'horizontal' : 'vertical'}
              aria-valuemin={resizeBounds[position][0]}
              aria-valuemax={resizeBounds[position][1]}
              aria-valuenow={state.sizes[position]}
              onPointerDown={(event) => resizeStart(event, position)}
              onPointerMove={resizeMove}
              onPointerUp={() => {
                if (gesture.current) track('ui.resize', { field: position });
                gesture.current = null;
              }}
              onPointerCancel={() => {
                gesture.current = null;
              }}
              onKeyDown={(event) => {
                const decrement =
                  position === 'left'
                    ? 'ArrowLeft'
                    : position === 'right'
                      ? 'ArrowRight'
                      : 'ArrowDown';
                const increment =
                  position === 'left'
                    ? 'ArrowRight'
                    : position === 'right'
                      ? 'ArrowLeft'
                      : 'ArrowUp';
                if (event.key !== decrement && event.key !== increment) return;
                event.preventDefault();
                track('ui.resize', { field: position });
                layout.resize(
                  position,
                  state.sizes[position] + (event.key === increment ? 10 : -10),
                );
              }}
            />
          ))}
        {dragging && (
          <div className="workspace-dropzones" onDragOver={(event) => event.preventDefault()}>
            {dockPositions.map((position) => (
              <div
                key={position}
                className={`workspace-dropzone workspace-dropzone-${position}`}
                data-dock={position}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => drop(event, position)}
              >
                Mover {titles[dragging]} · {positionTitles[position]}
              </div>
            ))}
          </div>
        )}
        {!workspacePanes.some(visible) && (
          <p className="workspace-empty">Reabra uma janela nos controles acima.</p>
        )}
      </div>
    </section>
  );
}

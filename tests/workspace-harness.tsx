import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceLayout, useWorkspaceLayout } from '../src/components/WorkspaceLayout';
import type { WorkspacePane } from '../src/domain/workspace';
declare global {
  interface Window {
    __workspaceMounts: Record<WorkspacePane, number>;
  }
}
window.__workspaceMounts = { navigator: 0, editor: 0, source: 0 };
function Pane({ id }: { id: WorkspacePane }) {
  const [value, setValue] = useState('');
  useEffect(() => {
    window.__workspaceMounts[id]++;
  }, [id]);
  return (
    <div style={{ padding: 12 }}>
      <label>
        {id}
        <textarea
          aria-label={`Draft ${id}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
    </div>
  );
}
function Harness() {
  const layout = useWorkspaceLayout();
  return (
    <main style={{ height: '100dvh', display: 'flex' }}>
      <WorkspaceLayout
        layout={layout}
        panes={{
          navigator: <Pane id="navigator" />,
          editor: <Pane id="editor" />,
          source: <Pane id="source" />,
        }}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

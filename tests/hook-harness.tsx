import { createRoot } from 'react-dom/client';
import { useStudio, type Studio } from '../src/useStudio';
import type { DraftEnvelope, StudioProject } from '../src/domain/types';

declare global {
  interface Window {
    __studioTest: Studio;
    __bridgeTest: {
      events: string[];
      saved: Record<string, DraftEnvelope>;
      failSave: boolean;
      failLoadProject: string | null;
      delayOpen: boolean;
      releaseOpen?: () => void;
      openedProject: StudioProject;
      refreshedProject: StudioProject;
    };
  }
}

function Harness() {
  const studio = useStudio();
  window.__studioTest = studio;
  return (
    <main>
      <output data-testid="ready">{String(studio.ready)}</output>
      <output data-testid="project">{studio.project.id}</output>
      <output data-testid="notes">{studio.draft?.notes}</output>
      <output data-testid="translation">{studio.draft?.translation}</output>
      <output data-testid="save">{studio.saveState}</output>
      <output data-testid="conflict">{String(studio.conflict)}</output>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

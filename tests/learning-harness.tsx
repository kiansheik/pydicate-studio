import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { LearningWorkspace } from '../src/components/LearningWorkspace';
import type { StudioProject } from '../src/domain/types';
import '../src/styles.css';
import '../src/authoring.css';
import '../src/theme.css';

// Only the test owner exposes this bridge. Parsing/realization use a real worker;
// provider transport is explicitly simulated and never contacts an AI service.
const project = (await window.studio!.invoke!('learning_test_project', {})) as StudioProject;
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Aprender</button>
      {open && <LearningWorkspace project={project} onClose={() => setOpen(false)} />}
    </>
  );
}
document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(<Harness />);

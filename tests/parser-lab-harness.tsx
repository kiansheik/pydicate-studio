import { createRoot } from 'react-dom/client';
import { ParserLab } from '../src/components/ParserLab';
import type { StudioProject } from '../src/domain/types';
import '../src/styles.css';
import '../src/authoring.css';
import '../src/theme.css';

// Only the test owner exposes this bridge. Analysis, realization, morphology and
// tree edits go to the actual Python laboratory worker over the same contract
// the desktop service uses. No provider is contacted and no token is spent.
const project = (await window.studio!.invoke!('parser_lab_test_project', {})) as StudioProject;
const transfers: string[] = [];
(window as unknown as { __labTransfers: string[] }).__labTransfers = transfers;
document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(
  <ParserLab
    project={project}
    onClose={() => undefined}
    onTransfer={(source) => transfers.push(source)}
  />,
);

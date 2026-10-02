import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TreeWorkspace } from '../src/components/TreeWorkspace';
import type { SharedTreeNavigation } from '../src/domain/shared-definition';
import type { AuthorNode } from '../src/domain/authoring';
import '../src/styles.css';

const targets: Record<string, SharedTreeNavigation> = {
  first: { name: 'enosem', declarationId: 'enosem:12', sourceId: 'lexicon', line: 12 },
  shadow: { name: 'enosem', declarationId: 'enosem:28', sourceId: 'other', line: 28 },
  stale: { name: 'stale', declarationId: 'stale:14', sourceId: 'lexicon', line: 14 },
};
const calls: { method: string; params: Record<string, unknown> }[] = [];
const events: (SharedTreeNavigation | null)[] = [];
const pending: (() => void)[] = [];
let delay = false;
const leaf = (raw: string): AuthorNode => ({
  id: 'root',
  kind: 'literal',
  label: '1',
  code: raw,
  start: 0,
  end: raw.length,
  children: [],
  evaluation: { status: 'ok', surface: 'SIMULADO' },
});

window.studio = {
  async invoke(method: string, params: Record<string, unknown>) {
    calls.push({ method, params });
    if (method === 'lexicon_inspect') {
      const requested = params.declarationTarget as {
        declarationLine: number;
        declarationId: string;
        declarationSourceId: string;
      };
      if (delay && params.name === 'enosem' && requested.declarationLine === 12)
        await new Promise<void>((resolve) => pending.push(resolve));
      const line =
        params.name === 'stale' ? requested.declarationLine + 1 : requested.declarationLine;
      return {
        sourcePath: `historic/${requested.declarationSourceId}.tu.py`,
        treeEdit: {
          editable: true,
          name: params.name,
          expression: '1',
          sourceFingerprint: 'source-before',
          declarationId: params.name === 'stale' ? 'stale:15' : requested.declarationId,
          scope: 'shared',
          sourceId: requested.declarationSourceId,
          line,
        },
      };
    }
    if (method === 'lexicon_tree_evaluate')
      return {
        expression: params.raw,
        revisionId: params.revisionId,
        engineFingerprint: params.engineFingerprint,
        tree: leaf(String(params.raw)),
        authoring: { root: leaf(String(params.raw)) },
        surface: 'SIMULADO',
        lines: ['SIMULADO'],
        failures: [],
        origin: 'engine',
      };
    return {};
  },
} as unknown as NonNullable<typeof window.studio>;

declare global {
  interface Window {
    treeNavigationFixture: {
      calls: typeof calls;
      events: typeof events;
      restore: (name: string | null) => void;
      delay: () => void;
      release: () => void;
    };
  }
}

function Fixture() {
  const [navigation, setNavigation] = useState<SharedTreeNavigation | null>(null);
  window.treeNavigationFixture = {
    calls,
    events,
    restore: (name) => setNavigation(name ? targets[name] : null),
    delay: () => {
      delay = true;
    },
    release: () => {
      delay = false;
      pending.splice(0).forEach((resolve) => resolve());
    },
  };
  return (
    <TreeWorkspace
      passageId="passage:fixture"
      sourceId="historic"
      revisionId="revision:1"
      raw="1"
      authoringRoot={leaf('1')}
      engineFingerprint="engine:fixture"
      onChangeCanvas={() => {}}
      onLexicalPreview={() => {}}
      sharedTreeNavigation={navigation}
      onSharedTreeNavigationChange={(target) => {
        events.push(target);
        setNavigation(target);
      }}
    />
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);

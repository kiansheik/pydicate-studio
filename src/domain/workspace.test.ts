import { describe, expect, it } from 'vitest';
import { defaultWorkspace, moveWorkspacePane, readWorkspace, resizeWorkspace } from './workspace';

describe('workspace layout', () => {
  it('starts with the source on the right and swaps occupied slots without losing hidden state', () => {
    const initial = defaultWorkspace();
    expect(initial.positions).toEqual({ navigator: 'left', editor: 'center', source: 'right' });
    const next = moveWorkspacePane(
      { ...initial, hidden: { ...initial.hidden, source: true }, maximized: 'editor' },
      'source',
      'center',
    );
    expect(next.positions.source).toBe('center');
    expect(next.positions.editor).toBe('right');
    expect(next.hidden.source).toBe(false);
    expect(next.maximized).toBe(null);
    expect(initial.positions.source).toBe('right');
    expect(moveWorkspacePane(next, 'navigator', 'bottom').positions.navigator).toBe('bottom');
  });
  it('restores valid persisted layouts and rejects malformed, duplicated or out-of-bounds preferences', () => {
    const state = moveWorkspacePane(defaultWorkspace(), 'source', 'bottom');
    expect(readWorkspace(JSON.stringify(state))).toEqual(state);
    for (const text of [
      '{',
      'null',
      '{"version":2}',
      JSON.stringify({
        ...state,
        positions: { navigator: 'left', editor: 'center', source: 'left' },
      }),
      JSON.stringify({ ...state, sizes: { ...state.sizes, right: 100000 } }),
    ])
      expect(readWorkspace(text)).toEqual(defaultWorkspace());
    expect(resizeWorkspace(state, 'right', -50).sizes.right).toBe(180);
    expect(resizeWorkspace(state, 'bottom', 9999).sizes.bottom).toBe(700);
    expect(resizeWorkspace(state, 'left', Number.NaN)).toBe(state);
  });
});

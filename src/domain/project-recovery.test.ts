import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerProjectRecovery, serviceError, withProjectRecovery } from './project-recovery';

let unregister: (() => void) | undefined;
afterEach(() => unregister?.());
const stale = () => Object.assign(new Error('Outdated'), { code: 'STALE_ENGINE' });

function setup() {
  let current = { projectId: 'project', engineFingerprint: 'old' };
  const refresh = vi.fn(async () => {
    current = { ...current, engineFingerprint: 'new' };
    return current;
  });
  unregister = registerProjectRecovery({ read: () => current, refresh });
  return {
    refresh,
    changeProject: () => {
      current = { ...current, projectId: 'other' };
    },
  };
}

describe('automatic read-only project recovery', () => {
  it('recovers coded Electron errors without exposing the transport marker', () => {
    expect(serviceError(new Error('[STUDIO:STALE_ENGINE] Changed'))).toMatchObject({
      message: 'Changed',
      code: 'STALE_ENGINE',
    });
    const other = new Error('A normal error');
    expect(serviceError(other)).toBe(other);
  });

  it('refreshes a stale search once and retries with the current engine', async () => {
    const { refresh } = setup();
    const request = vi.fn().mockRejectedValueOnce(stale()).mockResolvedValueOnce('result');
    await expect(
      withProjectRecovery('dictionary_lookup', { query: 'tym', engineFingerprint: 'old' }, request),
    ).resolves.toBe('result');
    expect(refresh).toHaveBeenCalledExactlyOnceWith('project');
    expect(request).toHaveBeenLastCalledWith({ query: 'tym', engineFingerprint: 'new' });
  });

  it('does not loop when files keep changing', async () => {
    const { refresh } = setup();
    const request = vi.fn().mockRejectedValue(stale());
    await expect(withProjectRecovery('structure_search', {}, request)).rejects.toMatchObject({
      code: 'STALE_ENGINE',
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['structure_resolve', 'dictionary_predicate', 'predicate_create'])(
    'refreshes %s context without replaying the chosen insertion',
    async (method) => {
      const { refresh } = setup();
      const request = vi.fn().mockRejectedValue(stale());
      await expect(withProjectRecovery(method, {}, request)).rejects.toMatchObject({
        code: 'CONTEXT_REFRESHED',
      });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['source_apply', 'source_preview', 'reference_approve', 'ai_start'])(
    'never retries or refreshes a %s operation',
    async (method) => {
      const { refresh } = setup();
      const request = vi.fn().mockRejectedValue(stale());
      await expect(withProjectRecovery(method, {}, request)).rejects.toMatchObject({
        code: 'STALE_ENGINE',
      });
      expect(refresh).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('does not refresh a different project after navigation', async () => {
    const { refresh, changeProject } = setup();
    const request = vi.fn(async () => {
      changeProject();
      throw stale();
    });
    await expect(withProjectRecovery('structure_search', {}, request)).rejects.toMatchObject({
      code: 'STALE_ENGINE',
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});

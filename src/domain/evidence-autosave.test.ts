import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvidenceAutosaver, type EvidenceSaveEvent } from './evidence-autosave';
import type { EvidenceStatus, WorkingEvidence } from './evidence';

function working(x = 1): WorkingEvidence {
  return {
    assetId: 'pdf:a',
    revision: 1,
    passageFingerprint: 'initial',
    baseline: 'null',
    regions: [{ id: 'crop', assetId: 'pdf:a', pageIndex: 0, rect: [x, 2, x + 10, 12] }],
    view: { pageIndex: 0, zoom: 1, rotation: 0 },
  };
}
function status(input: Record<string, unknown>, revision = 2): EvidenceStatus {
  return {
    version: 1,
    revision,
    passageFingerprint: `saved:${revision}`,
    projectId: 'project',
    sourceId: 'source',
    retainedAssetCount: 1,
    asset: {
      id: 'pdf:a',
      name: 'scan.pdf',
      bytes: 1,
      fingerprint: 'pdf-hash',
      managedState: 'ok',
      originalState: 'ok',
    },
    passage: {
      regions: input.regions as WorkingEvidence['regions'],
      view: input.view as WorkingEvidence['view'],
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const params = { projectId: 'project', sourceId: 'source', passageId: 'a' };
afterEach(() => vi.useRealTimers());

describe('evidence autosave coordinator', () => {
  it('debounces completed edits and never writes intermediate gesture coordinates', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (input: Record<string, unknown>) => status(input));
    const queue = new EvidenceAutosaver(save, () => {});
    queue.update('a', params, working());
    await vi.advanceTimersByTimeAsync(200);
    queue.pause('a');
    queue.update('a', params, working(2), false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    queue.update('a', params, working(3));
    await vi.advanceTimersByTimeAsync(399);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].regions).toEqual(working(3).regions);
  });

  it('coalesces edits behind an in-flight save and uses its acknowledged fingerprint', async () => {
    vi.useFakeTimers();
    const first = deferred<EvidenceStatus>();
    const events: EvidenceSaveEvent[] = [];
    const save = vi.fn(async (input: Record<string, unknown>) =>
      save.mock.calls.length === 1 ? first.promise : status(input, 3),
    );
    const queue = new EvidenceAutosaver(save, (event) => events.push(event));
    queue.update('a', params, working());
    const flush = queue.flush('a');
    queue.update('a', params, working(2));
    queue.update('a', params, working(3));
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve(status(save.mock.calls[0][0]));
    await flush;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({
      expectedRevision: 2,
      expectedPassageFingerprint: 'saved:2',
      regions: working(3).regions,
    });
    expect(events.at(-1)).toMatchObject({
      state: 'saved',
      working: { revision: 3, regions: working(3).regions },
    });
  });

  it('prepare and a debounce flush share one write', async () => {
    vi.useFakeTimers();
    const held = deferred<EvidenceStatus>();
    const save = vi.fn(() => held.promise);
    const queue = new EvidenceAutosaver(save, () => {});
    queue.update('a', params, working());
    const first = queue.flush('a');
    const second = queue.flush('a');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    held.resolve(status({ ...working() }));
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('preserves failed changes and waits for explicit retry without a request loop', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (input: Record<string, unknown>) => {
      if (save.mock.calls.length === 1) throw new Error('offline');
      return status(input);
    });
    const events: EvidenceSaveEvent[] = [];
    const queue = new EvidenceAutosaver(save, (event) => events.push(event));
    queue.update('a', params, working());
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      state: 'error',
      working: { regions: working().regions },
    });
    await queue.flush('a');
    expect(save).toHaveBeenCalledTimes(2);
    expect(events.at(-1)?.state).toBe('saved');
  });

  it('keeps passage identities separate when an outgoing save finishes later', async () => {
    vi.useFakeTimers();
    const held = deferred<EvidenceStatus>();
    const save = vi.fn(async (input: Record<string, unknown>) =>
      input.passageId === 'a' ? held.promise : status(input),
    );
    const events: EvidenceSaveEvent[] = [];
    const queue = new EvidenceAutosaver(save, (event) => events.push(event));
    queue.update('a', params, working());
    const outgoing = queue.flush('a');
    queue.update('b', { ...params, passageId: 'b' }, working(20));
    await queue.flush('b');
    held.resolve(status(save.mock.calls[0][0], 3));
    await outgoing;
    expect(
      events
        .filter((event) => event.state === 'saved')
        .map((event) => [event.key, event.working.regions[0].rect[0]]),
    ).toEqual([
      ['b', 20],
      ['a', 1],
    ]);
  });
});

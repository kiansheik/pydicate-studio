import { describe, expect, it } from 'vitest';
import { analysisNoteSnapshot, submissionOperation } from './analysis-submission';
import type { AnalysisJob } from './analysis';

const general = {
  id: 'note:general',
  version: 1,
  scope: 'entry' as const,
  fields: { meaning: 'a saved meaning', grammar: '', note: '' },
};
const local = {
  ...general,
  id: 'note:local',
  scope: 'occurrence' as const,
  sourceId: 'source',
  passageId: 'passage:one',
};
const snapshot = (notes = [general, local], sourceId = 'source', passageId = 'passage:one') =>
  analysisNoteSnapshot(notes, sourceId, passageId);

describe('saved notebook identity for explicit analysis submission', () => {
  it('is deterministic across ordering, reload and pending publication identities', async () => {
    const first = await snapshot();
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await snapshot([local, general])).toBe(first);
    expect(await snapshot(JSON.parse(JSON.stringify([general, local])))).toBe(first);
    expect(await snapshot([general, local], 'source', 'pending:one')).toBe(first);
  });

  it('includes reusable meanings and this source occurrence while ignoring other passage notes and empty notes', async () => {
    const first = await snapshot();
    expect(await snapshot([general, { ...local, version: 2 }])).not.toBe(first);
    expect(await snapshot([{ ...general, version: 2 }, local])).not.toBe(first);
    expect(
      await snapshot([general, local, { ...local, id: 'other', passageId: 'passage:other' }]),
    ).toBe(first);
    expect(
      await snapshot([general, local, { ...local, id: 'other-source', sourceId: 'different' }]),
    ).toBe(first);
    expect(
      await snapshot([
        general,
        local,
        { ...general, id: 'empty', fields: { meaning: ' ', grammar: '', note: '' } },
      ]),
    ).toBe(first);
    expect(
      await snapshot([general, { ...local, fields: { meaning: '', grammar: '', note: '' } }]),
    ).not.toBe(first);
  });

  it.each(['analyze', 'grammar-repair'])(
    'deduplicates unchanged active %s sends but starts a new job after saved note changes',
    async (task) => {
      const values = new Map<string, string>();
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      };
      let count = 0;
      const createId = () => 'operation:' + ++count;
      const input = {
        submission: {
          passageId: 'passage:one',
          revisionId: 'same-revision',
          task,
          scope: 'passage',
        },
        provider: 'codex',
        engine: 'same-engine',
        noteSnapshot: await snapshot(),
      };
      const active = [
        {
          id: 'job:existing',
          passageId: 'passage:one',
          status: 'running',
          createdAt: '2026-09-20',
          input: { baseRevisionId: 'same-revision', task, scope: 'passage' },
        },
      ] as AnalysisJob[];
      const first = submissionOperation(input, active, storage, createId);
      expect(
        submissionOperation(
          { ...input, noteSnapshot: await snapshot([local, general]) },
          active,
          storage,
          createId,
        ),
      ).toBe(first);
      const changed = {
        ...input,
        noteSnapshot: await snapshot([{ ...general, version: 2 }, local]),
      };
      expect(submissionOperation(changed, active, storage, createId)).not.toBe(first);
      expect(submissionOperation(changed, active, storage, createId)).toBe('operation:2');
      expect(
        submissionOperation(
          changed,
          [{ ...active[0], status: 'ready-for-review' }],
          storage,
          createId,
        ),
      ).toBe('operation:3');
      expect([...values.keys()].join()).not.toContain('a saved meaning');
    },
  );

  it('rejects malformed or oversized identities before creating any operation', async () => {
    await expect(snapshot(Array(10001).fill(general))).rejects.toThrow(/caderno/);
    await expect(snapshot([{ ...general, version: 0 }])).rejects.toThrow(/identidade/);
  });
});

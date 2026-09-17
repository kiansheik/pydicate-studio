import { describe, expect, it } from 'vitest';
import { aiSelection, aiRecordScope, canAcceptAI, mergeAIRecords, type AIRecord } from './ai';

const record: AIRecord = {
  version: 1,
  requestId: 'a',
  projectId: 'p',
  passageId: 'line',
  revisionId: 'r1',
  provider: 'codex',
  model: 'model',
  action: 'translate',
  context: {},
  inputHash: null,
  inputContext: null,
  text: 'translated',
  suggestion: null,
  status: 'completed',
  error: null,
  startedAt: '2026-09-16',
  finishedAt: '2026-09-16',
  acceptances: [],
  editorialApproval: null,
};
describe('AI result binding', () => {
  it('preserves historical partial selections and prevents replacing a full translation with them', () => {
    const historical = {
      ...record,
      context: { raw: 'left + right', selectedNode: { code: 'left' } },
    };
    const bytes = JSON.stringify(historical);
    expect(aiRecordScope(historical)).toBe('legacy-selection');
    expect(canAcceptAI(historical, 'p', 'line', 'r1')).toBe(false);
    expect(JSON.stringify(historical)).toBe(bytes);
    expect(
      canAcceptAI(
        { ...historical, inputContext: { analysisTarget: { scope: 'passage' } } },
        'p',
        'line',
        'r1',
      ),
    ).toBe(true);
    expect(
      canAcceptAI({ ...historical, context: { scope: 'constituent' } }, 'p', 'line', 'r1'),
    ).toBe(false);
  });
  it('only offers an explicit constituent scope for spans from the current expression', () => {
    const node = { id: 'root/left', code: 'left', start: 0, end: 4 };
    expect(aiSelection(node, 'left + right')).toEqual(node);
    expect(aiSelection(node, 'changed + right')).toBe(null);
    expect(aiSelection({ ...node, end: 999 }, 'left')).toBe(null);
    expect(aiSelection({ code: 'left' }, 'left + right')).toBe(null);
  });
  it('only permits manual acceptance into the exact requested project, passage and revision', () => {
    expect(canAcceptAI(record, 'p', 'line', 'r1')).toBe(true);
    expect(canAcceptAI(record, 'p', 'line', 'r2')).toBe(false);
    expect(canAcceptAI(record, 'p', 'duplicate-line', 'r1')).toBe(false);
    expect(canAcceptAI(record, 'other-project', 'line', 'r1')).toBe(false);
    expect(canAcceptAI({ ...record, status: 'streaming' }, 'p', 'line', 'r1')).toBe(false);
  });
  it('retains terminal output when a delayed partial arrives and keeps distinct requests', () => {
    expect(mergeAIRecords([record], { ...record, status: 'streaming', text: 'part' })[0].text).toBe(
      'translated',
    );
    expect(mergeAIRecords([record], { ...record, requestId: 'new' })).toHaveLength(2);
    expect(
      mergeAIRecords([{ ...record, status: 'streaming' }], {
        ...record,
        status: 'streaming',
        text: 'part',
      })[0].text,
    ).toBe('translated');
  });
  it('ignores older phase checkpoints even before the first text arrives', () => {
    const current: AIRecord = {
      ...record,
      status: 'streaming',
      text: '',
      phase: 'provider_reasoning',
      updatedAt: '2026-09-17T10:00:03.000Z',
    };
    const delayed: AIRecord = {
      ...current,
      phase: 'mcp_context',
      updatedAt: '2026-09-17T10:00:01.000Z',
    };
    expect(mergeAIRecords([current], delayed)[0].phase).toBe('provider_reasoning');
  });
});

import { describe, expect, it } from 'vitest';
import {
  analysisActivity,
  analysisProgress,
  analysisStreamText,
  emptyAnalysis,
  mergeAnalysisDetails,
  canAcceptCandidate,
  candidateTranslation,
  citationDetails,
  comparisonLabel,
  type AnalysisCandidate,
  type AnalysisConversation,
  type AnalysisJob,
} from './analysis';

const job = {
  id: 'job',
  projectId: 'project',
  passageId: 'passage',
  status: 'ready-for-review',
  input: { baseRevisionId: 'draft', engineFingerprint: 'engine' },
} as AnalysisJob;
const candidate = {
  id: 'candidate',
  jobId: 'job',
  projectId: 'project',
  passageId: 'passage',
  status: 'proposed',
  revisionId: 'candidate-v1',
  raw: 'x',
  evaluation: {
    revisionId: 'candidate-v1',
    engineFingerprint: 'engine',
    expression: 'x',
    evaluationStatus: 'partial',
  },
} as AnalysisCandidate;
describe('analysis review boundaries', () => {
  it('keeps full streaming details newer than the compact list read', () => {
    const events = Array.from({ length: 45 }, (_, index) => ({
      type: 'text-delta',
      attemptId: 'current',
      text: `word-${index} `,
    }));
    const compact = {
      ...job,
      currentAttemptId: 'current',
      createdAt: '2026-09-30T12:00:00.000Z',
      updatedAt: '2026-09-30T12:00:01.000Z',
      events: events.slice(-20),
    };
    const full = {
      ...compact,
      updatedAt: '2026-09-30T12:00:01.001Z',
      events: [...events, { type: 'text-delta', attemptId: 'current', text: 'newest' }],
    };
    const conversation = {
      id: 'thread',
      revision: 1,
      turns: [],
    } as unknown as AnalysisConversation;
    const result = mergeAnalysisDetails(
      { ...emptyAnalysis(), jobs: [compact] },
      new Map([[full.id, { job: full, conversation, candidates: [candidate] }]]),
      new Map(),
    );
    expect(analysisStreamText(result.jobs[0])).toBe(
      events.map((event) => event.text).join('') + 'newest',
    );
    expect(result.jobs[0]).toBe(full);
    expect(result.candidates).toEqual([candidate]);
  });
  it('does not replace newer or resumed listing state with obsolete details', () => {
    const latest = {
      ...job,
      currentAttemptId: 'new',
      createdAt: '2026-09-30T12:00:00.000Z',
      updatedAt: '2026-09-30T12:00:02.000Z',
    };
    const conversation = {
      id: 'thread',
      revision: 1,
      turns: [],
    } as unknown as AnalysisConversation;
    for (const old of [
      { ...latest, updatedAt: '2026-09-30T12:00:01.000Z' },
      { ...latest, currentAttemptId: 'old' },
      { ...latest, projectId: 'another-project' },
    ]) {
      const result = mergeAnalysisDetails(
        { ...emptyAnalysis(), jobs: [latest] },
        new Map([[old.id, { job: old, conversation, candidates: [candidate] }]]),
        new Map(),
      );
      expect(result.jobs[0]).toBe(latest);
      expect(result.candidates).toEqual([]);
    }
  });
  it('reports completed grammar calls and failed reads without claiming they succeeded', () => {
    expect(
      analysisActivity({
        ...job,
        events: [
          { type: 'tool-start', tool: 'grammar_read' },
          { type: 'tool-result', tool: 'grammar_context', result: { context: {} } },
          { type: 'tool-result', tool: 'grammar_files', result: { files: [] } },
          {
            type: 'tool-result',
            tool: 'grammar_read',
            result: {
              structuredContent: null,
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ code: 'ENOENT', message: 'Missing guide' }),
                },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      'Construção e contexto consultados',
      'Arquivos da gramática listados',
      'Falha ao consultar regra da gramática',
    ]);
    expect(
      analysisActivity({ ...job, events: [{ type: 'tool-start', tool: 'grammar_edit' }] }),
    ).toEqual([]);
    expect(
      analysisActivity({
        ...job,
        events: [{ type: 'tool-result', tool: 'grammar_edit', result: { isError: true } }],
      }),
    ).toEqual(['Falha ao editar a gramática']);
    expect(
      analysisActivity({
        ...job,
        events: [{ type: 'tool-result', tool: 'grammar_read', result: { content: 'rule' } }],
      }),
    ).toEqual(['Regra da gramática consultada']);
  });
  it('distinguishes rolled-back edits from applied grammar work in activity', () => {
    expect(
      analysisActivity({
        ...job,
        events: [
          {
            type: 'tool-result',
            tool: 'grammar_edit',
            result: { rolledBack: true, verificationError: { message: 'regression' } },
          },
          {
            type: 'tool-result',
            tool: 'grammar_edit',
            result: { structuredContent: { receipt: { rolledBack: true } } },
          },
          { type: 'tool-result', tool: 'grammar_edit', result: { receipt: { id: 'applied' } } },
        ],
      }),
    ).toEqual(['Edição da gramática revertida', 'Gramática editada e reavaliada']);
  });
  it('reports one coherent status for raw and MCP-wrapped receipts of the same edit', () => {
    for (const [result, label] of [
      [
        {
          rolledBack: true,
          receipt: { rolledBack: true },
          verificationError: { message: 'regression' },
        },
        'Edição da gramática revertida',
      ],
      [{ verificationError: { message: 'verification failed' } }, 'Falha ao editar a gramática'],
      [
        { error: { code: 'GRAMMAR_REGRESSION', message: 'regression' } },
        'Falha ao editar a gramática',
      ],
    ] as const) {
      expect(
        analysisActivity({
          ...job,
          events: [
            { type: 'tool-result', tool: 'grammar_edit', result },
            {
              type: 'tool-result',
              tool: 'grammar_edit',
              result: {
                structuredContent: result,
                content: [{ type: 'text', text: JSON.stringify(result) }],
              },
            },
          ],
        }),
      ).toEqual([label]);
    }
  });
  it('shows only the current resumed attempt stream, including before its first token', () => {
    const resumed = {
      ...job,
      currentAttemptId: 'new',
      events: [{ type: 'text-delta', attemptId: 'old', text: 'interrupted' }],
    };
    expect(analysisStreamText(resumed)).toBe('');
    expect(
      analysisStreamText({
        ...resumed,
        events: [...resumed.events, { type: 'text-delta', attemptId: 'new', text: 'continued' }],
      }),
    ).toBe('continued');
    expect(analysisStreamText({ ...job, events: [{ type: 'text-delta', text: 'legacy' }] })).toBe(
      'legacy',
    );
  });
  it('exposes only translations bound to the complete current evaluation and preserves legacy candidates', () => {
    const translated: AnalysisCandidate = {
      ...candidate,
      evaluation: { ...candidate.evaluation!, surface: 'abá', evaluationStatus: 'complete' },
      translation: {
        text: 'Pessoa.',
        language: 'pt',
        status: 'tentative',
        revisionId: candidate.revisionId,
        expression: candidate.raw,
        engineFingerprint: 'engine',
        evaluatedSurface: 'abá',
        uncertainties: [],
      },
    };
    expect(candidateTranslation(translated)?.text).toBe('Pessoa.');
    expect(candidateTranslation(candidate)).toBeNull();
    expect(candidateTranslation({ ...translated, revisionId: 'edited' })).toBeNull();
    expect(candidateTranslation({ ...translated, raw: 'other' })).toBeNull();
    for (const changed of [
      { surface: 'other' },
      { evaluationStatus: 'partial' as const },
      { engineFingerprint: 'changed' },
      { error: { message: 'failed' } },
    ])
      expect(
        candidateTranslation({
          ...translated,
          evaluation: { ...translated.evaluation!, ...changed },
        }),
      ).toBeNull();
  });
  it('allows explicit reuse after input or engine changes but requires an intact original proposal', () => {
    expect(canAcceptCandidate(candidate, job, 'draft', 'engine')).toBe(true);
    expect(canAcceptCandidate(candidate, job, 'newer-draft', 'engine')).toBe(true);
    expect(canAcceptCandidate(candidate, job, 'newer-draft', 'newer-engine')).toBe(true);
    expect(canAcceptCandidate(candidate, job, '', 'engine')).toBe(false);
    expect(canAcceptCandidate(candidate, { ...job, status: 'cancelled' }, 'draft', 'engine')).toBe(
      false,
    );
    expect(canAcceptCandidate({ ...candidate, passageId: 'other' }, job, 'draft', 'engine')).toBe(
      false,
    );
    expect(canAcceptCandidate({ ...candidate, raw: 'new-raw' }, job, 'draft', 'engine')).toBe(
      false,
    );
    expect(
      canAcceptCandidate({ ...candidate, revisionId: 'new-revision' }, job, 'draft', 'engine'),
    ).toBe(false);
  });
  it('never presents a completed failure as a still-running tool stage', () => {
    expect(analysisProgress({ ...job, status: 'running', phase: 'studio_dictionary_entry' })).toBe(
      'Consultando o dicionário…',
    );
    expect(analysisProgress({ ...job, status: 'failed', phase: 'studio_candidate_evaluate' })).toBe(
      'Falhou',
    );
    expect(analysisProgress({ ...job, phase: 'studio_dictionary_entry' })).toBe('Proposta pronta');
  });
  it('keeps exact, spacing-case and accent matches distinct', () => {
    expect(comparisonLabel({ exact: true, spacingCase: true, accentFolded: true })).toBe(
      'Coincide exatamente',
    );
    expect(comparisonLabel({ exact: false, spacingCase: true, accentFolded: true })).toContain(
      'espaços e maiúsculas',
    );
    expect(comparisonLabel({ exact: false, spacingCase: false, accentFolded: true })).toContain(
      'também os acentos',
    );
    expect(comparisonLabel({ exact: false, spacingCase: false, accentFolded: false })).toBe(
      'Há diferenças na forma',
    );
  });
  it('exposes exact nested dictionary identity without substituting same-spelling entries', () => {
    const item = {
      kind: 'dictionary',
      entry: {
        headword: 'pysyrõ',
        definition: 'the other sense',
        entryIndex: 9336,
        datasetFingerprint: 'sha256:fixture',
      },
    };
    expect(citationDetails(item)).toMatchObject({
      entryIndex: 9336,
      datasetFingerprint: 'sha256:fixture',
      definition: 'the other sense',
    });
    expect(item.entry.entryIndex).toBe(9336);
  });
});

it('reports stalled repair elapsed time and bounds technical logs without altering durable events', async () => {
  const { analysisLiveness, analysisTechnicalLog, analysisProgress } = await import('./analysis');
  const observed = {
    ...job,
    status: 'running' as const,
    phase: 'grammar-corpus',
    attemptStartedAt: '2026-10-02T20:46:25Z',
    deadlineAt: '2026-10-02T21:01:25Z',
    events: [
      {
        type: 'tool-result',
        tool: 'grammar_read',
        at: '2026-10-02T20:49:41Z',
        result: { content: 'x'.repeat(100000) },
      },
    ],
  };
  expect(analysisLiveness(observed, Date.parse('2026-10-02T21:08:25Z'))).toContain(
    '22 min nesta tentativa',
  );
  expect(analysisLiveness(observed, Date.parse('2026-10-02T21:08:25Z'))).toContain(
    'Sem novo evento há 18 min',
  );
  expect(analysisLiveness(observed, Date.parse('2026-10-02T21:08:25Z'))).toContain(
    'Limite atingido',
  );
  expect(analysisProgress(observed)).toContain('verificando outras passagens');
  expect(analysisTechnicalLog(observed).length).toBeLessThan(1000);
  expect(observed.events[0].result.content.length).toBe(100000);
});

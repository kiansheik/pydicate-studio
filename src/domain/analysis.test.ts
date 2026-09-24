import { describe, expect, it } from 'vitest';
import {
  analysisProgress,
  analysisStreamText,
  canAcceptCandidate,
  candidateTranslation,
  citationDetails,
  comparisonLabel,
  type AnalysisCandidate,
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

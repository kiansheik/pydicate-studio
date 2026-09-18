import { describe, expect, it } from 'vitest';
import compiled from '../generated/learning.json';
import {
  constructionKey,
  lessonMatches,
  lessonStepMatches,
  matchesSearch,
  type LearningLibrary,
} from './learning';
import type { RenderResult } from './types';

const library = compiled as unknown as LearningLibrary;
describe('source-backed lessons', () => {
  it('checks structure, annotations and complete realization instead of surface alone', () => {
    for (const lesson of library.lessons) {
      const result = structuredClone(lesson.steps.at(-1)!.evaluation!);
      expect(lessonMatches(result, lesson)).toBe(true);
      expect(lessonMatches({ ...result, annotated: 'wrong' }, lesson)).toBe(false);
      expect(lessonMatches({ ...result, tree: undefined }, lesson)).toBe(false);
      expect(lessonMatches({ ...result, evaluationStatus: 'partial' }, lesson)).toBe(false);
      expect(
        lessonMatches({ ...result, failures: [{ message: 'failed' }] } as RenderResult, lesson),
      ).toBe(false);
      expect(lessonMatches(result, { ...lesson, available: false })).toBe(false);
      const moved = structuredClone(result.tree!);
      moved.start += 3;
      expect(constructionKey(moved)).toBe(constructionKey(result.tree));
    }
  });
  it('checks each stage and accepts partial structure only when the lesson explains it', () => {
    for (const lesson of library.lessons) {
      for (const step of lesson.steps) {
        expect(lessonStepMatches(step.evaluation!, step)).toBe(true);
        expect(lessonStepMatches({ ...step.evaluation!, annotated: 'different' }, step)).toBe(
          false,
        );
        if (step.partialExpected)
          expect(lessonStepMatches(step.evaluation!, { ...step, partialExpected: false })).toBe(
            false,
          );
      }
    }
  });
  it('searches accent-insensitively, including API names and code', () => {
    expect(matchesSearch('omissao', 'Omissão na fala')).toBe(true);
    expect(matchesSearch('.var(1)', '(mombeu * nhe).var(1)')).toBe(true);
    expect(matchesSearch('base nominal', 'Obter a base nominal')).toBe(true);
    expect(matchesSearch('posse negativo', 'Posse')).toBe(false);
  });
});

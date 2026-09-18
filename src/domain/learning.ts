import type { AuthorNode } from './authoring';
import { isCanvasState, type CanvasState } from './canvas';
import type { RenderResult } from './types';

export interface Guide {
  id: string;
  title: string;
  terms: string[];
  body: string;
  ui: string;
  code: string;
  api?: string[];
  related?: string[];
  source: string;
}
export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  sourceId: string;
  ordinal: number;
  intro: string;
  guides: string[];
  available: boolean;
  reason: string;
  reference?: string;
  sourceRaw?: string;
  sourceLine?: number;
  recordId?: string;
  steps: {
    raw: string;
    title: string;
    prompt: string;
    hint: string;
    partialExpected?: boolean;
    evaluation?: RenderResult;
  }[];
  question: string;
  choices: string[];
  answer: number;
  explanation: string;
}
export interface LearningLibrary {
  version: number;
  contentId?: string;
  engineFingerprint?: string;
  documentationFingerprint?: string;
  lessons: Lesson[];
  guides: Guide[];
  implementations: {
    id: string;
    name: string;
    owner: string;
    signature: string;
    source: string;
    docstring: string;
    editorSupported: boolean;
    kind?: string;
    definition?: string;
  }[];
  inventory: {
    sourceId: string;
    ordinal: number;
    line: number;
    raw: string;
    surface: string;
    reference?: string;
    status: string;
    features: string[];
  }[];
  sources: string[];
  verifiedCount: number;
}
export interface LessonProgress {
  raw: string;
  canvas?: CanvasState;
  step: number;
  answer?: number;
  complete?: boolean;
}

export const searchable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
export function matchesSearch(query: string, ...values: (string | string[] | undefined)[]) {
  const haystack = searchable(values.flat().filter(Boolean).join(' '));
  return searchable(query)
    .trim()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

// Compare syntax, never spelling alone. Spans, redundant parentheses and engine
// annotations do not change the learner's construction.
export function constructionKey(node?: AuthorNode | null): string {
  if (!node) return '';
  return JSON.stringify([
    node.kind,
    node.operator,
    node.method,
    node.lexicalReference,
    node.kind === 'literal' ? node.value : undefined,
    node.children.map(({ slot, node: child }) => [slot, constructionKey(child)]),
  ]);
}
export function lessonMatches(result: RenderResult | null, lesson: Lesson) {
  const expected = lesson.steps.at(-1)?.evaluation;
  return !!(
    lesson.available &&
    expected &&
    result &&
    result.evaluationStatus === 'complete' &&
    !result.failures?.length &&
    result.surface === lesson.reference &&
    result.annotated === expected.annotated &&
    constructionKey(result.tree) === constructionKey(expected.tree)
  );
}

export function lessonStepMatches(result: RenderResult | null, step: Lesson['steps'][number]) {
  const expected = step.evaluation;
  return !!(
    result &&
    expected?.tree &&
    result.tree &&
    result.evaluationStatus === expected.evaluationStatus &&
    (result.evaluationStatus === 'complete' || step.partialExpected) &&
    result.surface === expected.surface &&
    result.annotated === expected.annotated &&
    constructionKey(result.tree) === constructionKey(expected.tree)
  );
}

export function readProgress(key: string, lessons: Lesson[]): Record<string, LessonProgress> {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    const result: Record<string, LessonProgress> = {};
    for (const lesson of lessons) {
      const value = saved?.[lesson.id];
      if (
        value &&
        typeof value.raw === 'string' &&
        value.raw.length <= 100000 &&
        Number.isInteger(value.step) &&
        value.step >= 0 &&
        value.step < lesson.steps.length
      ) {
        result[lesson.id] = {
          raw: value.raw,
          step: value.step,
          canvas: isCanvasState(value.canvas) ? value.canvas : undefined,
          answer:
            Number.isInteger(value.answer) &&
            value.answer >= 0 &&
            value.answer < lesson.choices.length
              ? value.answer
              : undefined,
          complete: value.complete === true,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

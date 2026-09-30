import type { ParsedExpression } from './authoring';
import type { RenderResult } from './types';

export interface SharedDefinitionTarget {
  name: string;
  expectedExpression: string;
  sourceFingerprint: string;
  declarationId?: string;
  declarationSourceId?: string;
  declarationLine?: number;
}

export type SharedTreeTarget =
  | {
      editable: true;
      name: string;
      expression: string;
      sourceFingerprint: string;
      declarationId: string;
      storageId?: string;
      scope: 'shared' | 'source';
      sourceId: string;
      line: number;
    }
  | { editable: false; reason: string };

export type SharedTreeEvaluation = RenderResult & {
  authoring?: ParsedExpression;
  treeEdit?: SharedTreeTarget;
};

export interface SharedTreeEntry {
  target: Extract<SharedTreeTarget, { editable: true }>;
  sourcePath: string;
}

export interface SharedTreeRequest {
  name: string;
  definitionContext?: SharedDefinitionTarget;
}

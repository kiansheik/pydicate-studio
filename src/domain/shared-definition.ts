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

/** Read-only location identity; source code and edit receipts never enter URLs. */
export interface SharedTreeNavigation {
  name: string;
  declarationId: string;
  sourceId: string;
  line: number;
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
  definitionImports?: { name: string; sourceId: string; line: number }[];
};

export interface SharedDefinitionCandidate {
  name: string;
  headword?: string;
  surface?: string;
  definition?: string;
  treeEdit?: SharedTreeTarget;
  availableInDefinition?: boolean;
  reuseBlockedReason?: string;
}

export interface SharedTreeEntry {
  target: Extract<SharedTreeTarget, { editable: true }>;
  sourcePath: string;
}

export interface SharedTreeRequest {
  name: string;
  definitionContext?: SharedDefinitionTarget;
}

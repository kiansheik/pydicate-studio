import { withStructureContext } from './structure-drafts';
import { serviceError, withProjectRecovery } from './project-recovery';

/** Captured from the selected engine at this exact source step. A failed
 * standalone realization does not invalidate the surrounding expression. */
export type NodeEvaluation =
  | { status: 'ok'; surface: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error' | 'blocked' | 'missing'; message: string; causes?: string[] }
  | { status: 'value'; value: string };

export interface EvaluationFailure {
  nodeId: string;
  expression: string;
  message: string;
  stage: 'reference' | 'operation' | 'evaluation' | 'missing';
  blockedBy?: string[];
  engineFrames?: { file: string; line: number; function: string; source?: string }[];
}

export interface AuthorNode {
  id: string;
  kind: string;
  label: string;
  code: string;
  start: number;
  end: number;
  operator?: string;
  method?: string;
  lexicalReference?: string;
  category?: string;
  runtimeType?: string;
  verbete?: string;
  tag?: string;
  dispatch?: string;
  operandTypes?: string[];
  definition?: string;
  evaluation?: NodeEvaluation;
  engineRoles?: {
    role: string;
    argumentIndex: number | null;
    verbete?: string;
    inflection?: string;
    expressed: boolean;
    inferredByEngine?: boolean;
    evidence: string;
  }[];
  children: { slot: string; node: AuthorNode }[];
  capabilities?: unknown;
}
export interface ParsedExpression {
  revisionId: string;
  raw: string;
  root: AuthorNode | null;
  diagnostics: (string | { message: string; line?: number; column?: number })[];
  capabilities?: unknown;
}
export interface SourcePreview {
  previewId: string;
  diff: string;
  sourceFingerprint: string;
  diagnostics?: string[];
  kind?: string;
  passageId?: string;
  targetPassageId?: string;
  newPassage?: boolean;
  name?: string;
  scope?: string;
  affectedUses?: unknown[];
  draftRevisionId?: string;
  pendingDraftId?: string;
  /** Source expression after any reviewed promotion to shared lexical names. */
  raw?: string;
  lexicalAdditions?: {
    name: string;
    expression: string;
    headword?: string;
    reused?: boolean;
  }[];
  files?: { path: string; sourceFingerprint: string; diff: string }[];
}
export function diagnosticText(value: string | { message: string }) {
  return typeof value === 'string' ? value : value.message;
}
export async function invoke<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!window.studio?.invoke)
    throw new Error('Abra o aplicativo desktop para usar o projeto e o motor locais.');
  const bridge = window.studio;
  return withProjectRecovery(method, params, (current) =>
    (bridge.invoke!(method, withStructureContext(method, current)) as Promise<T>).catch(
      (reason) => {
        throw serviceError(reason);
      },
    ),
  );
}
export function flattenNodes(root: AuthorNode | null): AuthorNode[] {
  return root ? [root, ...root.children.flatMap((child) => flattenNodes(child.node))] : [];
}
export function replaceNode(raw: string, node: AuthorNode, replacement: string): string {
  if (raw.slice(node.start, node.end) === replacement) return raw;
  return raw.slice(0, node.start) + '(' + replacement + ')' + raw.slice(node.end);
}

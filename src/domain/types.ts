export type PassageStatus = 'untranscribed' | 'analysis' | 'review' | 'approved' | 'changed';
export interface ImperativeAnalysis {
  kind: 'imperative';
  predicate: 'apiti';
  subject: 'nde';
  object: 'moro';
  hiddenSubject: boolean;
  mood: 'imperative' | 'indicative';
  negated: boolean;
}
export interface Witness {
  title: string;
  year: string;
  printedPage: string | null;
  pdfPage: number | null;
  region: [number, number, number, number] | null;
  folio?: string | null;
  textualLine?: string | number | null;
  section?: string | null;
  subsection?: string | null;
}
export interface Passage {
  id: string;
  legacyId: string;
  sourceId: string;
  ordinal: number;
  title: string;
  sourceExpression: string;
  sourceFingerprint: string;
  legacyExpressionFingerprint?: string;
  acceptedReference: string | null;
  referenceProvenance: 'legacy' | 'none' | 'example';
  diplomatic: string;
  normalized: string;
  translation: string;
  notes: string;
  witness: Witness;
  status: PassageStatus;
  analysis: ImperativeAnalysis | null;
  sourceMetadata?: { folio?: string; lines?: string; line?: string; [key: string]: unknown };
  studioMetadata?: Record<string, unknown>;
}
export interface RepositorySnapshot {
  name: string;
  path: string;
  revision: string;
  branch: string;
  dirty: boolean;
  fingerprint: string;
}
export interface StudioProject {
  id: string;
  name: string;
  mode: 'example' | 'local';
  passages: Passage[];
  repositories: RepositorySnapshot[];
  engineFingerprint: string;
  diagnostics: string[];
}
export interface Draft {
  /** Tentative analysis guidance is never a reviewed @target. */
  aiInput?: { tentativeReading: string; meaning: string; constraints: string };
  /** Immutable human acceptance receipts; undo changes content, not this history. */
  aiAcceptances?: {
    operationId: string;
    jobId: string;
    candidateId: string;
    revalidation?: {
      engineFingerprint: string;
      expressionFingerprint: string;
      sourceFingerprint?: string;
      at: string;
      status: 'complete' | 'partial' | 'failed';
      surface?: string;
      annotated?: string;
      changedSinceProposal?: boolean;
      error?: { code: string; message: string };
    };
    candidateRevision: string;
    baseRevisionId: string;
    revisionId: string;
    at: string;
  }[];
  /** A new passage uses the ordinary editor before a reviewed source append. */
  pending?: { sourceId: string; previousPassageId?: string; ordinal: number };
  /** Detached expressions and layout remain local draft material. */
  canvas?: import('./canvas').CanvasState;
  workflow?: { stage: 'analysis' | 'review' | 'complete'; updatedAt: string };
  locators?: {
    printedPage?: string;
    folio?: string;
    line?: string;
    section?: string;
    subsection?: string;
  };
  /** Raw input remains authoritative even while incomplete or invalid. */
  raw?: string;
  passageId: string;
  revisionId: string;
  sourceFingerprint: string;
  diplomatic: string;
  normalized: string;
  translation: string;
  notes: string;
  analysis: ImperativeAnalysis | null;
  updatedAt: string;
}
export interface Morpheme {
  text: string;
  tag: string;
  nodeId: string;
  explanation: string;
}
export interface RenderResult {
  evaluationStatus?: 'complete' | 'partial';
  failures?: import('./authoring').EvaluationFailure[];
  revisionId: string;
  engineFingerprint: string;
  expression: string;
  surface: string;
  annotated: string;
  morphemes: Morpheme[];
  origin: 'engine' | 'snapshot';
  tree?: import('./authoring').AuthorNode;
  runtimeTree?: import('./runtime-tree').RuntimeGraph;
}
export interface RenderRequest {
  revisionId: string;
  engineFingerprint: string;
  analysis: ImperativeAnalysis;
}
export interface DraftEnvelope {
  version: 1;
  storageRevision?: number;
  projectId: string;
  drafts: Record<string, Draft>;
}
export interface StudioBridge {
  copyText?(text: string): Promise<void>;
  recordUsage?(event: Record<string, unknown>): Promise<void>;
  invoke?(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onEvent?(listener: (event: any) => void): () => void;
  openProject(): Promise<StudioProject | null>;
  refreshProject(): Promise<StudioProject>;
  render(request: RenderRequest): Promise<RenderResult>;
  loadDrafts(projectId: string): Promise<DraftEnvelope | null>;
  saveDrafts(envelope: DraftEnvelope): Promise<void | { storageRevision: number }>;
}
declare global {
  interface Window {
    studio?: StudioBridge;
  }
}

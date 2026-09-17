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
}
export interface Passage {
  id: string;
  legacyId: string;
  sourceId: string;
  ordinal: number;
  title: string;
  sourceExpression: string;
  sourceFingerprint: string;
  acceptedReference: string | null;
  referenceProvenance: 'legacy' | 'none' | 'example';
  diplomatic: string;
  normalized: string;
  translation: string;
  notes: string;
  witness: Witness;
  status: PassageStatus;
  analysis: ImperativeAnalysis | null;
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
  revisionId: string;
  engineFingerprint: string;
  expression: string;
  surface: string;
  annotated: string;
  morphemes: Morpheme[];
  origin: 'engine' | 'snapshot';
}
export interface RenderRequest {
  revisionId: string;
  engineFingerprint: string;
  analysis: ImperativeAnalysis;
}
export interface DraftEnvelope {
  version: 1;
  projectId: string;
  drafts: Record<string, Draft>;
}
export interface StudioBridge {
  openProject(): Promise<StudioProject | null>;
  refreshProject(): Promise<StudioProject>;
  render(request: RenderRequest): Promise<RenderResult>;
  loadDrafts(projectId: string): Promise<DraftEnvelope | null>;
  saveDrafts(envelope: DraftEnvelope): Promise<void>;
}
declare global {
  interface Window {
    studio?: StudioBridge;
  }
}

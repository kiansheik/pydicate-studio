export interface LexicalOccurrence {
  id: string;
  lexicalId: string;
  name: string;
  path: string;
  sourceNodeId: string;
  direct: boolean;
  certainty: 'source' | 'candidate';
  via: string[];
  binding: { parameter: string; argument: string } | null;
  runtimeNodeIds: string[];
}
export interface ActiveLexicalEntry {
  id: string;
  name: string;
  kind: 'helper' | 'alias' | 'compound' | 'predicate';
  runtimeType: string;
  category: string;
  headword: string;
  definition: string;
  runtimeAttributes?: Record<string, string | number | boolean>;
  expression: string;
  provenance: Record<string, unknown>;
  elements: { name: string; code: string }[];
  occurrenceIds: string[];
}
export interface PassageLexiconInventory {
  version: 1;
  revisionId: string;
  engineFingerprint: string;
  expressionFingerprint: string;
  entries: ActiveLexicalEntry[];
  occurrences: LexicalOccurrence[];
  diagnostics: string[];
}
export interface LexicalNoteFields {
  meaning: string;
  grammar: string;
  note: string;
}
export interface LexicalNote {
  id: string;
  scope: 'entry' | 'occurrence';
  lexicalId: string;
  lexicalName: string;
  sourceId?: string;
  passageId?: string;
  occurrenceId?: string;
  revisionId: string;
  expressionFingerprint: string;
  provenance: Record<string, unknown>;
  fields: LexicalNoteFields;
  version: number;
  createdAt: string;
  updatedAt: string;
  history: { version: number; savedAt: string; revisionId: string; fields: LexicalNoteFields }[];
}
export function foldLexical(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}
export function lexicalNoteSummary(records: LexicalNote[]) {
  return {
    entries: new Set(records.map((record) => record.lexicalId)).size,
    general: records.filter((record) => record.scope === 'entry').length,
    occurrences: records.filter((record) => record.scope === 'occurrence').length,
    passages: new Set(
      records.filter((record) => record.passageId).map((record) => record.passageId),
    ).size,
    revisions: records.reduce((sum, record) => sum + record.history.length, 0),
  };
}

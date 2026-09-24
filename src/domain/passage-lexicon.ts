import type { NodeEvaluation } from './authoring';

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
  noteOccurrenceId?: string;
  nodeFingerprint?: string;
  start?: number;
  end?: number;
  expression?: string;
  nodeKind?: string;
  label?: string;
  depth?: number;
  isRoot?: boolean;
  parentSourceNodeId?: string;
  editable?: boolean;
  evaluation?: NodeEvaluation;
  surface?: string;
  baseDefinition?: string;
  compositeDefinition?: string;
  inheritedDefinition?: string;
  hasDefinitionOverride?: boolean;
}
export interface ActiveLexicalEntry {
  id: string;
  name: string;
  kind: 'helper' | 'alias' | 'compound' | 'predicate' | 'construction' | 'unresolved';
  runtimeType: string;
  category: string;
  headword: string;
  definition: string;
  lexicalName?: string;
  sharedDefinitionTarget?: { name: string; scope: 'shared' | 'source' };
  nodeKind?: string;
  surface?: string;
  baseDefinition?: string;
  compositeDefinition?: string;
  lexicalStatus?: 'hypothetical';
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
export function lexicalOccurrenceRows(inventory: PassageLexiconInventory | null, query = '') {
  const entries = new Map(inventory?.entries.map((entry) => [entry.id, entry]));
  const needle = foldLexical(query);
  return (inventory?.occurrences ?? []).flatMap((occurrence) => {
    const entry = entries.get(occurrence.lexicalId);
    if (!entry) return [];
    const searchable = [
      entry.name,
      entry.headword,
      entry.category,
      entry.definition,
      occurrence.surface,
      occurrence.expression,
      occurrence.label,
      occurrence.baseDefinition,
      occurrence.compositeDefinition,
      occurrence.inheritedDefinition,
    ]
      .filter(Boolean)
      .join(' ');
    return foldLexical(searchable).includes(needle) ? [{ entry, occurrence }] : [];
  });
}

export function occurrenceDefinition(entry: ActiveLexicalEntry, occurrence: LexicalOccurrence) {
  if (occurrence.compositeDefinition !== undefined) return occurrence.compositeDefinition;
  if (occurrence.baseDefinition !== undefined) return occurrence.baseDefinition;
  if (['construction', 'unresolved'].includes(entry.kind)) return '';
  if (entry.compositeDefinition !== undefined) return entry.compositeDefinition;
  if (entry.baseDefinition !== undefined) return entry.baseDefinition;
  return entry.definition;
}

export function occurrenceNoteId(occurrence: LexicalOccurrence) {
  return occurrence.noteOccurrenceId ?? occurrence.id;
}
export function matchesOccurrenceNote(
  note: LexicalNote,
  occurrence: LexicalOccurrence,
  passageId: string,
  expressionFingerprint: string,
) {
  if (
    note.scope !== 'occurrence' ||
    note.passageId !== passageId ||
    note.lexicalId !== occurrence.lexicalId
  )
    return false;
  if (note.nodeFingerprint && occurrence.noteOccurrenceId)
    return (
      note.occurrenceId === occurrence.noteOccurrenceId &&
      note.nodeFingerprint === occurrence.nodeFingerprint
    );
  return (
    note.occurrenceId === occurrence.id && note.expressionFingerprint === expressionFingerprint
  );
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
  nodeFingerprint?: string;
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

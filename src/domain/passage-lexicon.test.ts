import { describe, expect, it } from 'vitest';
import {
  lexicalOccurrenceRows,
  occurrenceDefinition,
  matchesOccurrenceNote,
  occurrenceNoteId,
  type ActiveLexicalEntry,
  type LexicalOccurrence,
  type LexicalNote,
  type PassageLexiconInventory,
} from './passage-lexicon';
const entry: ActiveLexicalEntry = {
  id: 'construction',
  name: 'a * b',
  kind: 'construction',
  runtimeType: 'Noun',
  category: 'noun',
  headword: '',
  definition: 'inherited meaning',
  baseDefinition: 'inherited base',
  expression: 'a * b',
  provenance: {},
  elements: [],
  occurrenceIds: ['root', 'other'],
};
const occurrence: LexicalOccurrence = {
  id: 'root',
  lexicalId: entry.id,
  name: entry.name,
  path: 'root',
  sourceNodeId: 'root',
  direct: true,
  certainty: 'source',
  via: [],
  binding: null,
  runtimeNodeIds: [],
  isRoot: true,
  editable: true,
  noteOccurrenceId: 'stable:root',
  nodeFingerprint: 'node:root',
};
const inventory: PassageLexiconInventory = {
  version: 1,
  revisionId: 'rev',
  engineFingerprint: 'engine',
  expressionFingerprint: 'expression',
  entries: [entry],
  occurrences: [
    occurrence,
    { ...occurrence, id: 'other', sourceNodeId: 'root/right', isRoot: false },
  ],
  diagnostics: [],
};
const note = {
  scope: 'occurrence',
  lexicalId: entry.id,
  passageId: 'passage',
  occurrenceId: 'stable:root',
  nodeFingerprint: 'node:root',
  expressionFingerprint: 'earlier-expression',
} as LexicalNote;
describe('passage tree lexical projection', () => {
  it('lists every occurrence in source order, retaining the whole expression and repeated constructions', () => {
    expect(lexicalOccurrenceRows(inventory).map((item) => item.occurrence.id)).toEqual([
      'root',
      'other',
    ]);
    expect(lexicalOccurrenceRows(inventory, 'a * b')).toHaveLength(2);
    expect(lexicalOccurrenceRows(inventory, 'unknown')).toEqual([]);
  });
  it('uses explicit occurrence meanings and never labels inherited operation definitions as composed meaning', () => {
    expect(occurrenceDefinition(entry, occurrence)).toBe('');
    expect(occurrenceDefinition(entry, { ...occurrence, compositeDefinition: 'whole' })).toBe(
      'whole',
    );
    expect(occurrenceDefinition(entry, { ...occurrence, baseDefinition: 'base' })).toBe('base');
    expect(occurrenceDefinition(entry, { ...occurrence, compositeDefinition: '' })).toBe('');
    expect(occurrenceDefinition({ ...entry, kind: 'predicate' }, occurrence)).toBe(
      'inherited base',
    );
  });
  it('binds stable subtree notes despite unrelated full-expression edits and refuses other nodes/passages', () => {
    expect(occurrenceNoteId(occurrence)).toBe('stable:root');
    expect(matchesOccurrenceNote(note, occurrence, 'passage', 'changed-expression')).toBe(true);
    expect(
      matchesOccurrenceNote(
        note,
        { ...occurrence, nodeFingerprint: 'changed-node' },
        'passage',
        'changed-expression',
      ),
    ).toBe(false);
    expect(matchesOccurrenceNote(note, occurrence, 'other-passage', 'changed-expression')).toBe(
      false,
    );
  });
  it('requires the exact expression and old occurrence ID for legacy notes', () => {
    const legacy = { ...note, nodeFingerprint: undefined, occurrenceId: 'root' };
    expect(matchesOccurrenceNote(legacy, occurrence, 'passage', 'earlier-expression')).toBe(true);
    expect(matchesOccurrenceNote(legacy, occurrence, 'passage', 'changed-expression')).toBe(false);
    expect(
      matchesOccurrenceNote(
        { ...legacy, occurrenceId: 'other' },
        occurrence,
        'passage',
        'earlier-expression',
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { createDraft } from './model';
import { groupPassages, latestSourcePassage, passageGroupPath } from './passage-navigation';

const base = createExampleProject().passages[0];
const row = (id: string, section: string, subsection: string, sourceId = 'book', ordinal = 1) => ({
  ...base,
  id,
  sourceId,
  ordinal,
  witness: { ...base.witness, section, subsection },
});

describe('passage navigation', () => {
  it('uses current draft locators including explicit clearing without inventing section titles', () => {
    const a = row('a', 'Original', 'Primeira'),
      b = row('b', 'Original', 'Segunda');
    const draft = { ...createDraft(a), locators: { section: '', subsection: 'Atualizada' } };
    const groups = groupPassages([a, b], { a: draft });
    expect(groups[0].sections.map((item) => item.title)).toEqual(['', 'Original']);
    expect(groups[0].sections[0].subsections[0].title).toBe('Atualizada');
    expect(passageGroupPath(groups, 'a')).toEqual(['source:book', 'section:a', 'subsection:a']);
  });

  it('keeps noncontiguous repeated headings separate to preserve administrator order', () => {
    const rows = [row('a', 'A', 'I'), row('b', 'B', 'II'), row('c', 'A', 'I')];
    const groups = groupPassages(rows, {});
    expect(groups[0].sections.map((item) => item.title)).toEqual(['A', 'B', 'A']);
    expect(
      groups.flatMap((source) =>
        source.sections.flatMap((section) =>
          section.subsections.flatMap((subsection) =>
            subsection.passages.map((passage) => passage.id),
          ),
        ),
      ),
    ).toEqual(['a', 'b', 'c']);
  });

  it('selects the final listed passage of the restored source, including pending and reordered rows', () => {
    const rows = [
      row('high', 'A', 'I', 'first', 80),
      row('low', 'A', 'II', 'first', 1),
      row('other', 'B', 'I', 'second', 100),
      row('pending:new', 'B', 'II', 'second', 2),
    ];
    expect(latestSourcePassage(rows, 'high')?.id).toBe('low');
    expect(latestSourcePassage(rows, 'other')?.id).toBe('pending:new');
    expect(latestSourcePassage(rows)?.id).toBe('low');
    expect(latestSourcePassage([])).toBeUndefined();
  });

  it('groups interleaved sources once in first-seen order without reordering within a source', () => {
    const groups = groupPassages(
      [row('a', 'A', 'I', 'first'), row('b', 'B', 'I', 'second'), row('c', 'A', 'II', 'first')],
      {},
    );
    expect(groups.map((group) => group.id)).toEqual(['first', 'second']);
    expect(
      groups[0].sections[0].subsections.flatMap((group) => group.passages.map((p) => p.id)),
    ).toEqual(['a', 'c']);
  });
});

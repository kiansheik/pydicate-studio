import type { Draft, Passage } from './types';

export interface PassageSubsection {
  id: string;
  title: string;
  passages: Passage[];
}
export interface PassageSection {
  id: string;
  title: string;
  subsections: PassageSubsection[];
}
export interface PassageSourceGroup {
  id: string;
  sections: PassageSection[];
}

/** Group adjacent rows only: grouping must never undo the administrator's order. */
export function groupPassages(passages: Passage[], drafts: Record<string, Draft>) {
  const groups: PassageSourceGroup[] = [];
  const sources = new Map<string, PassageSourceGroup>();
  for (const passage of passages) {
    let source = sources.get(passage.sourceId);
    if (!source) {
      source = { id: passage.sourceId, sections: [] };
      groups.push(source);
      sources.set(passage.sourceId, source);
    }
    const locators = drafts[passage.id]?.locators;
    const sourceText = (field: 'section' | 'subsection') =>
      typeof passage.sourceMetadata?.[field] === 'string'
        ? (passage.sourceMetadata[field] as string)
        : '';
    const sectionTitle = (
      locators?.section ??
      passage.witness.section ??
      sourceText('section')
    ).trim();
    const subsectionTitle = (
      locators?.subsection ??
      passage.witness.subsection ??
      sourceText('subsection')
    ).trim();
    let section = source.sections.at(-1);
    if (!section || section.title !== sectionTitle) {
      section = { id: `section:${passage.id}`, title: sectionTitle, subsections: [] };
      source.sections.push(section);
    }
    let subsection = section.subsections.at(-1);
    if (!subsection || subsection.title !== subsectionTitle) {
      subsection = { id: `subsection:${passage.id}`, title: subsectionTitle, passages: [] };
      section.subsections.push(subsection);
    }
    subsection.passages.push(passage);
  }
  return groups;
}

export function passageGroupPath(groups: PassageSourceGroup[], passageId: string) {
  for (const source of groups)
    for (const section of source.sections)
      for (const subsection of section.subsections)
        if (subsection.passages.some((passage) => passage.id === passageId))
          return [`source:${source.id}`, section.id, subsection.id];
  return [];
}

/** Last means the visible list order, including pending rows and admin ordering. */
export function latestSourcePassage(passages: Passage[], restoredId?: string) {
  const sourceId =
    passages.find((passage) => passage.id === restoredId)?.sourceId ?? passages[0]?.sourceId;
  return passages.filter((passage) => passage.sourceId === sourceId).at(-1);
}

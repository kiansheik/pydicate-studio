import type { Passage, StudioProject, StudioSource } from './types';

/** Older snapshots have no catalogue; derive their labels from the actual witnesses. */
export function projectSources(project: StudioProject): StudioSource[] {
  const sources = new Map((project.sources ?? []).map((source) => [source.id, source]));
  for (const passage of project.passages) {
    if (!sources.has(passage.sourceId))
      sources.set(passage.sourceId, {
        id: passage.sourceId,
        title: passage.witness.title || passage.sourceId.replaceAll('_', ' '),
        year: passage.witness.year,
      });
  }
  return [...sources.values()];
}

export function sourceLabel(source: StudioSource): string {
  return source.year && !source.title.includes(source.year)
    ? `${source.title} · ${source.year}`
    : source.title;
}

export function sourceSlug(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (/^[a-z]/.test(slug) ? slug : `fonte_${slug}`).slice(0, 80);
}

/** A UI shell for an empty source, never an accepted corpus record. */
export function emptySourcePassage(source: StudioSource): Passage {
  return {
    id: `empty:${source.id}`,
    legacyId: `empty:${source.id}`,
    sourceId: source.id,
    ordinal: 0,
    title: source.title,
    sourceExpression: '',
    sourceFingerprint: 'pending',
    acceptedReference: null,
    referenceProvenance: 'none',
    diplomatic: '',
    normalized: '',
    translation: '',
    notes: '',
    status: 'untranscribed',
    analysis: null,
    witness: {
      title: source.title,
      year: source.year,
      printedPage: null,
      pdfPage: null,
      region: null,
    },
  };
}

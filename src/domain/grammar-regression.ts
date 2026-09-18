export interface CorpusRow {
  ordinal: number;
  codeFingerprint: string;
  reference?: string | null;
  surface?: string;
  annotated?: string;
  error?: string;
}

export interface CorpusSnapshot {
  engineFingerprint: string;
  sources: Record<string, { error?: string; rows?: CorpusRow[] }>;
}

export interface ChangedCorpusLine {
  source: string;
  ordinal: number;
  before: string;
  after: string;
  approvedReferenceChanged: boolean;
  annotatedChanged: boolean;
}

/** Compare the same source expressions before and after a grammar edit. */
export function compareGrammarSnapshots(before: CorpusSnapshot, after: CorpusSnapshot) {
  const changed: ChangedCorpusLine[] = [];
  const sourceChanges: string[] = [];
  let baselineIssues = 0;
  let newReferenceIssues = 0;
  let checked = 0;
  for (const source of new Set([...Object.keys(before.sources), ...Object.keys(after.sources)])) {
    const old = before.sources[source];
    const next = after.sources[source];
    if (!old || !next || old.error || next.error) {
      sourceChanges.push(source);
      continue;
    }
    const oldRows = old.rows ?? [];
    const newRows = next.rows ?? [];
    if (oldRows.length !== newRows.length) sourceChanges.push(source);
    for (let index = 0; index < Math.min(oldRows.length, newRows.length); index++) {
      const a = oldRows[index];
      const b = newRows[index];
      if (a.ordinal !== b.ordinal || a.codeFingerprint !== b.codeFingerprint) {
        sourceChanges.push(`${source}:${index + 1}`);
        continue;
      }
      checked++;
      const reference = a.reference;
      if (reference != null && a.surface !== reference) baselineIssues++;
      if (a.surface !== b.surface || a.annotated !== b.annotated || a.error !== b.error) {
        const approvedReferenceChanged =
          reference != null && a.surface === reference && b.surface !== reference;
        if (approvedReferenceChanged) newReferenceIssues++;
        changed.push({
          source,
          ordinal: a.ordinal,
          before: a.error ?? a.surface ?? '',
          after: b.error ?? b.surface ?? '',
          approvedReferenceChanged,
          annotatedChanged: a.annotated !== b.annotated,
        });
      }
    }
  }
  return { checked, baselineIssues, newReferenceIssues, changed, sourceChanges };
}

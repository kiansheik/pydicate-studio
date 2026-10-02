'use strict';

// Read-only counts from a fresh engine snapshot, never inferred editorial approval.
function summarizeCorpus(snapshot, project, envelope, jobs = []) {
  const morphemes = new Set();
  const sources = Object.entries(snapshot.sources).map(([sourceId, source]) => {
    const rows = source.rows ?? [];
    const issues = [];
    let approved = 0,
      divergent = 0,
      failed = 0;
    for (const row of rows) {
      const passage = project.passages.find(
        (p) => p.sourceId === sourceId && p.ordinal === row.ordinal,
      );
      if (row.reference != null) approved++;
      if (row.error) {
        failed++;
        issues.push({
          ordinal: row.ordinal,
          passageId: passage?.id,
          kind: 'error',
          message: row.error,
        });
      } else if (row.reference != null && row.surface !== row.reference) {
        divergent++;
        issues.push({
          ordinal: row.ordinal,
          passageId: passage?.id,
          kind: 'divergent',
          expected: row.reference,
          actual: row.surface ?? '',
        });
      }
      // Same surface/tag parsing as authoring_runtime.evaluate. These are
      // observed annotated forms, not dictionary headwords or inferred roots.
      for (const match of (row.annotated ?? '').matchAll(/([^\[\]]+)\[([^\[\]]+)\]/gu)) {
        const form = match[1].trim().normalize('NFC');
        if (form) morphemes.add(JSON.stringify([form, match[2]]));
      }
    }
    const drafts = Object.values(envelope?.drafts ?? {}).filter(
      (d) => d.pending?.sourceId === sourceId && !d.organization?.deleted,
    );
    return {
      sourceId,
      title: project.sources?.find((s) => s.id === sourceId)?.title ?? sourceId,
      lines: rows.length,
      approved,
      unreviewed: rows.length - approved,
      divergent,
      failed,
      pending: drafts.length,
      error: source.error,
      issues,
    };
  });
  for (const source of project.sources ?? [])
    if (!sources.some((s) => s.sourceId === source.id)) {
      sources.push({
        sourceId: source.id,
        title: source.title,
        lines: 0,
        approved: 0,
        unreviewed: 0,
        divergent: 0,
        failed: 0,
        pending: Object.values(envelope?.drafts ?? {}).filter(
          (d) => d.pending?.sourceId === source.id && !d.organization?.deleted,
        ).length,
        error: undefined,
        issues: [],
      });
    }
  return {
    checkedAt: new Date().toISOString(),
    engineFingerprint: snapshot.engineFingerprint,
    sources,
    totals: {
      sources: sources.length,
      lines: sources.reduce((n, s) => n + s.lines, 0),
      divergent: sources.reduce((n, s) => n + s.divergent, 0),
      failures: sources.reduce((n, s) => n + s.failed + Number(!!s.error), 0),
      pending: sources.reduce((n, s) => n + s.pending, 0),
      morphemes: morphemes.size,
    },
    activeRepairs: jobs.filter(
      (j) =>
        j.input?.task === 'grammar-repair' &&
        ['running', 'queued', 'cancelling'].includes(j.status),
    ).length,
    interruptedRepairs: jobs
      .filter(
        (j) =>
          j.input?.task === 'grammar-repair' &&
          ['blocked', 'failed', 'cancelled'].includes(j.status),
      )
      .map((j) => ({
        id: j.id,
        passageId: j.passageId,
        status: j.status,
        error: j.error?.message,
        verified: j.grammarVerification?.matches === true,
        checked: j.grammarVerification?.comparison?.checked ?? 0,
      })),
  };
}
module.exports = { summarizeCorpus };

import { describe, expect, it } from 'vitest';
import { createExampleProject, renderExample } from './example';
import { createDraft, expressionFor } from './model';
import snapshots from './render-snapshots.json';
import type { ImperativeAnalysis } from './types';

describe('bundled example evidence', () => {
  it('keeps real source expressions, baselines and unknown witness mapping distinct', () => {
    const project = createExampleProject();
    expect(project.id).toBe('example:araujo-0067');
    expect(project.passages.map((passage) => passage.ordinal)).toEqual([
      63, 64, 65, 66, 67, 68, 69, 70,
    ]);
    const imperative = project.passages.find((passage) => passage.ordinal === 67)!;
    expect(imperative.sourceExpression).toBe('-(+nde * apiti * moro).imp()');
    expect(imperative.acceptedReference).toBe('eporoapiti umẽ');
    for (const passage of project.passages) {
      expect(passage.referenceProvenance).toBe('example');
      expect(passage.status).not.toBe('approved');
      expect(passage.diplomatic).toBe('');
      expect(passage.normalized).toBe('');
      expect(passage.translation).toBe('');
      expect(passage.witness.pdfPage).toBeNull();
      expect(passage.witness.region).toBeNull();
      expect(passage.analysis !== null).toBe(passage.ordinal === 67);
    }
  });

  it('returns independently owned data when the example is reopened', () => {
    const first = createExampleProject();
    const second = createExampleProject();
    first.passages[0]!.notes = 'edited';
    expect(second.passages[0]!.notes).toBe('');
  });

  it('selects evaluated snapshots and retains engine/revision provenance for all provided variants', async () => {
    for (const snapshot of snapshots.snapshots) {
      const result = await renderExample({
        revisionId: 'draft:one',
        engineFingerprint: snapshots.engineFingerprint,
        analysis: snapshot.analysis as ImperativeAnalysis,
      });
      expect(result).toMatchObject({
        revisionId: 'draft:one',
        engineFingerprint: snapshots.engineFingerprint,
        expression: snapshot.expression,
        surface: snapshot.surface,
        annotated: snapshot.annotated,
        morphemes: snapshot.morphemes,
        origin: 'snapshot',
      });
      expect(result.expression).toBe(expressionFor(snapshot.analysis as ImperativeAnalysis));
    }
  });

  it('does not relabel a fixture as a result from a different engine', async () => {
    const passage = createExampleProject().passages.find((entry) => entry.ordinal === 67)!;
    const draft = createDraft(passage);
    await expect(
      renderExample({
        revisionId: draft.revisionId,
        engineFingerprint: 'different-engine',
        analysis: draft.analysis!,
      }),
    ).rejects.toThrow(/motor/);
  });
});

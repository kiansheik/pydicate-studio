import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { createDraft } from './model';
import {
  registerStructureContext,
  structureDrafts,
  withStructureContext,
} from './structure-drafts';
import type { DraftEnvelope, StudioProject } from './types';

function fixture() {
  const project: StudioProject = { ...createExampleProject(), mode: 'local' };
  project.passages = project.passages.map((passage) => ({
    ...passage,
    sourceId: 'araujo_catecismo_1686',
  }));
  const envelope: DraftEnvelope = {
    version: 1,
    projectId: project.id,
    drafts: Object.fromEntries(
      project.passages.map((passage) => [passage.id, createDraft(passage)]),
    ),
  };
  return { project, envelope };
}

describe('current draft structures for reuse', () => {
  it('indexes detached pieces even when the main expression is unchanged or empty', () => {
    const { project, envelope } = fixture();
    const passage = project.passages[0];
    envelope.drafts[passage.id].canvas = {
      fragments: [{ id: 'piece-1', raw: 'og * (emi * tym)', x: 100, y: 200 }],
      positions: {},
    };
    expect(structureDrafts(project, envelope)).toEqual([
      {
        passageId: passage.id,
        sourceId: passage.sourceId,
        revisionId: envelope.drafts[passage.id].revisionId,
        fragmentId: 'piece-1',
        raw: 'og * (emi * tym)',
      },
    ]);
    envelope.drafts[passage.id].raw = '';
    expect(structureDrafts(project, envelope)).toHaveLength(1);
  });
  it('includes changed analyses and pending lines while excluding unchanged, conflicting and archived entries', () => {
    const { project, envelope } = fixture();
    const first = project.passages[0];
    const second = project.passages[1];
    envelope.drafts[first.id] = {
      ...envelope.drafts[first.id],
      raw: 'og * (emi * tym)',
      notes: 'private interpretation',
    };
    envelope.drafts[second.id] = {
      ...envelope.drafts[second.id],
      raw: 'changed * meaning',
      sourceFingerprint: 'old-source',
    };
    envelope.drafts.orphan = {
      ...envelope.drafts[first.id],
      passageId: 'orphan',
      raw: 'unknown_namespace',
    };
    envelope.drafts['pending:new'] = {
      ...envelope.drafts[first.id],
      passageId: 'pending:new',
      raw: '(emi * tym)',
    };
    const indexed = structureDrafts(project, envelope);
    expect(indexed.map((draft) => draft.passageId)).toEqual([first.id, 'pending:new']);
    expect(indexed[0].raw).toBe('og * (emi * tym)');
    expect(indexed[0]).not.toHaveProperty('notes');
    expect(structureDrafts(project, { ...envelope, projectId: 'another-project' })).toEqual([]);
  });

  it('reads live edits again on resolve and clears context when the workspace unmounts', () => {
    const { project, envelope } = fixture();
    const first = project.passages[0];
    const cleanup = registerStructureContext(() => ({
      projectId: project.id,
      engineFingerprint: project.engineFingerprint,
      drafts: structureDrafts(project, envelope),
    }));
    try {
      expect(withStructureContext('structure_search', { query: 'tym' })).toMatchObject({
        drafts: [],
      });
      envelope.drafts[first.id].raw = 'emi * tym';
      expect(withStructureContext('structure_resolve', { candidateId: 'selected' })).toMatchObject({
        drafts: [{ raw: 'emi * tym' }],
      });
      expect(withStructureContext('lexicon_search', { query: 'tym' })).toEqual({ query: 'tym' });
    } finally {
      cleanup();
    }
    expect(withStructureContext('structure_search', { query: 'tym' })).toEqual({ query: 'tym' });
  });
});

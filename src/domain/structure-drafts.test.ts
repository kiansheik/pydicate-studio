import { describe, expect, it, vi } from 'vitest';
import * as nextPage from './next-page';
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
  it('resolves pending insertion namespaces once across all projected drafts', () => {
    const { project, envelope } = fixture();
    const first = project.passages[0];
    const pending = { ...first, id: 'pending:inserted' };
    project.passages.unshift(pending);
    envelope.drafts[pending.id] = { ...createDraft(pending), raw: 'pending_piece' };
    envelope.drafts[first.id].raw = 'changed_piece';
    const contexts = vi.spyOn(nextPage, 'pendingInsertionContexts');
    try {
      const indexed = structureDrafts(project, envelope);
      expect(indexed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ passageId: first.id, raw: 'changed_piece' }),
          expect.objectContaining({
            passageId: pending.id,
            raw: 'pending_piece',
            beforePassageId: first.id,
          }),
        ]),
      );
      expect(contexts).toHaveBeenCalledTimes(1);
    } finally {
      contexts.mockRestore();
    }
  });

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

  it('does not project draft indexes for ordinary calls and preserves explicit pending namespaces', () => {
    let draftReads = 0;
    let pendingReads = 0;
    let raw = 'first';
    const cleanup = registerStructureContext(() => ({
      projectId: 'project',
      engineFingerprint: 'engine',
      get drafts() {
        draftReads++;
        return [{ passageId: 'pending:one', sourceId: 'source', raw, revisionId: raw }];
      },
      get pendingContexts() {
        pendingReads++;
        return { 'pending:one': { beforePassageId: 'passage:next' } };
      },
    }));
    try {
      for (const method of [
        'parse_expression',
        'evaluate_expression',
        'dictionary_lookup',
        'lexicon_search',
      ])
        expect(withStructureContext(method, { passageId: 'passage:published' })).toEqual({
          passageId: 'passage:published',
        });
      expect(draftReads).toBe(0);
      expect(pendingReads).toBe(0);
      expect(
        withStructureContext('evaluate_expression', { passageId: 'pending:one' }),
      ).toMatchObject({ beforePassageId: 'passage:next' });
      expect(pendingReads).toBe(1);
      expect(draftReads).toBe(0);
      expect(withStructureContext('structure_search', {})).toMatchObject({
        drafts: [{ raw: 'first' }],
      });
      raw = 'changed';
      expect(withStructureContext('structure_resolve', {})).toMatchObject({
        drafts: [{ raw: 'changed' }],
      });
      expect(draftReads).toBe(2);
    } finally {
      cleanup();
    }
  });
});

it('excluded pending drafts do not enter the reuse index', () => {
  const { project, envelope } = fixture();
  const id = 'pending:excluded';
  envelope.drafts[id] = {
    ...createDraft(project.passages[0]),
    passageId: id,
    raw: 'mo * pyta',
    pending: { sourceId: 'araujo_catecismo_1686', ordinal: 3 },
    organization: { sourceId: 'araujo_catecismo_1686', position: 2, deleted: true },
  };
  expect(structureDrafts(project, envelope).some((item) => item.passageId === id)).toBe(false);
});

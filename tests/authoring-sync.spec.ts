import { expect, test, type Page } from '@playwright/test';

// These controlled fake responses exercise hook concurrency. Real engine fidelity and
// native contributor behavior have independent coverage and native-workflows reports.
async function ready(page: Page) {
  await page.goto('/tests/next-hook-harness.html');
  await expect(page.getByTestId('project')).toHaveText('simulated:a');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
}
async function hold(page: Page, method: string, raw?: string) {
  await page.evaluate(({ method, raw }) => window.__nextControl.holds.push({ method, raw }), {
    method,
    raw,
  });
}
async function pending(page: Page, method: string, raw?: string) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ method, raw }) =>
          window.__nextControl.pending.some(
            (item) => item.method === method && (raw === undefined || item.params.raw === raw),
          ),
        { method, raw },
      ),
    )
    .toBe(true);
}
async function release(page: Page, method: string, raw?: string) {
  await page.evaluate(({ method, raw }) => window.__nextControl.release(method, raw), {
    method,
    raw,
  });
}

test('automatic source refresh preserves live pending edits, loose pieces, notes, selection and undo history', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() =>
    window.__nextStudio.edit({ raw: 'human_alpha', notes: 'Primeira nota.' }),
  );
  await page.evaluate(() => window.__nextStudio.setSelectedId('passage-b'));
  await expect(page.getByTestId('passage')).toHaveText('passage-b');
  await page.evaluate(() =>
    window.__nextStudio.edit({ raw: 'archived_beta', notes: 'Preservar arquivo.' }),
  );
  const pendingId = await page.evaluate(() => window.__nextStudio.createPendingDraft());
  expect(pendingId).toMatch(/^pending:/);
  await expect(page.getByTestId('passage')).toHaveText(pendingId!);
  await page.evaluate(() =>
    window.__nextStudio.edit({
      raw: 'pending_before_refresh',
      notes: 'Nota anterior.',
      canvas: {
        layout: 'bottom-up',
        fragments: [{ id: 'old-piece', raw: 'beta', x: 160, y: 220 }],
        positions: {},
      },
    }),
  );
  const previous = await page.evaluate(() => structuredClone(window.__nextStudio.draft!));
  await hold(page, 'refresh_project');
  await page.evaluate(() => {
    const next = structuredClone(window.__nextControl.project);
    next.engineFingerprint = 'simulated-engine:automatic-change';
    next.passages = next.passages.filter((passage) => passage.id !== 'passage-b');
    window.__nextControl.project = next;
    window.__nextControl.emit({ type: 'source-change', projectId: next.id });
  });
  await pending(page, 'refresh_project');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const applyError = await page.evaluate(async () => {
    try {
      await window.__nextStudio.applySource({
        previewId: 'review-open-before-refresh',
        kind: 'source',
        sourceFingerprint: 'previous-source',
        diff: 'SIMULATED REVIEW',
      });
      return 'UNEXPECTED_SUCCESS';
    } catch (error) {
      return String(error);
    }
  });
  expect(applyError).toContain('Aguarde a atualização ou operação atual');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) => item.method === 'source_apply'),
    ),
  ).toHaveLength(0);
  // The visible editor must accept typing while the filesystem refresh is held.
  await page.evaluate(() =>
    window.__nextStudio.edit({
      raw: 'pending_edited_during_refresh',
      notes: 'Nota digitada durante a atualização.',
      canvas: {
        layout: 'bottom-up',
        fragments: [
          { id: 'old-piece', raw: 'beta', x: 160, y: 220 },
          { id: 'new-piece', raw: 'gamma', x: 440, y: 220 },
        ],
        positions: { 'main:root': { x: 260, y: 80 } },
      },
    }),
  );
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('pending_edited_during_refresh');
  const edited = await page.evaluate(() => ({
    selectedId: window.__nextStudio.selectedId,
    drafts: structuredClone(window.__nextStudio.envelope.drafts),
  }));
  await release(page, 'refresh_project');
  await expect
    .poll(() => page.evaluate(() => window.__nextStudio.project.engineFingerprint))
    .toBe('simulated-engine:automatic-change');
  expect(
    await page.evaluate(() => ({
      selectedId: window.__nextStudio.selectedId,
      drafts: window.__nextStudio.envelope.drafts,
    })),
  ).toEqual(edited);
  expect(
    await page.evaluate(() => window.__nextStudio.orphanDrafts.map((draft) => draft.passageId)),
  ).toEqual(['passage-b']);
  await page.evaluate(() => window.__nextStudio.undo());
  const undone = await page.evaluate(() => window.__nextStudio.draft!);
  expect(undone).toMatchObject({
    raw: previous.raw,
    notes: previous.notes,
    canvas: previous.canvas,
    pending: previous.pending,
  });
  expect(undone.revisionId).not.toBe(previous.revisionId);
  await page.evaluate(() => window.__nextStudio.redo());
  const redone = await page.evaluate(() => window.__nextStudio.draft!);
  expect(redone).toMatchObject({
    raw: edited.drafts[pendingId!].raw,
    notes: edited.drafts[pendingId!].notes,
    canvas: edited.drafts[pendingId!].canvas,
    pending: edited.drafts[pendingId!].pending,
  });
  expect(redone.revisionId).not.toBe(edited.drafts[pendingId!].revisionId);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) => item.method === 'refresh_project'),
    ),
  ).toHaveLength(1);
});

test('automatic source refresh keeps a real source conflict explicit without changing the human draft', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() =>
    window.__nextStudio.edit({ raw: 'human_unfinished(', notes: 'Manter esta interpretação.' }),
  );
  const before = await page.evaluate(() => structuredClone(window.__nextStudio.draft!));
  await page.evaluate(() => {
    const next = structuredClone(window.__nextControl.project);
    next.engineFingerprint = 'simulated-engine:source-conflict';
    next.passages[0].sourceExpression = 'external_source';
    next.passages[0].sourceFingerprint = 'external-source-revision';
    window.__nextControl.project = next;
    window.__nextControl.emit({ type: 'source-change', projectId: next.id });
  });
  await expect(page.getByTestId('conflict')).toHaveText('true');
  await expect(page.getByTestId('source')).toHaveText('external_source');
  expect(await page.evaluate(() => window.__nextStudio.draft)).toEqual(before);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) =>
        ['source_preview', 'source_apply', 'reference_approve'].includes(item.method),
      ),
    ),
  ).toEqual([]);
  await page.evaluate(() => window.__nextStudio.reconcileDraft());
  await expect(page.getByTestId('conflict')).toHaveText('false');
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue(before.raw!);
  await expect(page.getByLabel('Nota simulada')).toHaveValue(before.notes);
});

test('stale concurrent lookups coalesce automatic refresh and retry each query with the current engine', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => window.__nextStudio.edit({ raw: 'local_work', notes: 'Não perder.' }));
  const before = await page.evaluate(() => structuredClone(window.__nextStudio.draft!));
  await hold(page, 'refresh_project');
  await page.evaluate(() => {
    const original = window.studio!.invoke!;
    const oldFingerprint = window.__nextStudio.project.engineFingerprint;
    const params = {
      passageId: window.__nextStudio.passage.id,
      engineFingerprint: oldFingerprint,
      query: 'y py',
    };
    window.__nextControl.responses.structure_search = {
      results: [],
      total: 0,
      indexFingerprint: 'fresh-index',
    };
    window.__nextControl.responses.dictionary_lookup = { results: [], total: 0 };
    window.__nextControl.project = {
      ...window.__nextControl.project,
      engineFingerprint: 'simulated-engine:recovered',
    };
    window.studio!.invoke = async (method, params) => {
      const result = await original(method, params);
      if (
        ['structure_search', 'dictionary_lookup'].includes(method) &&
        params?.engineFingerprint === oldFingerprint
      )
        throw Object.assign(new Error('Simulated changed corpus/grammar'), {
          code: 'STALE_ENGINE',
        });
      return result;
    };
    void Promise.all([
      window.__nextInvoke('structure_search', params),
      window.__nextInvoke('dictionary_lookup', params),
    ]).then(
      (value) => {
        window.__nextControl.responses.lookupOutcome = { value };
      },
      (error) => {
        window.__nextControl.responses.lookupOutcome = { error: String(error) };
      },
    );
  });
  await pending(page, 'refresh_project');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) => item.method === 'refresh_project'),
    ),
  ).toHaveLength(1);
  await release(page, 'refresh_project');
  await expect
    .poll(() => page.evaluate(() => window.__nextControl.responses.lookupOutcome))
    .toEqual({
      value: [
        { results: [], total: 0, indexFingerprint: 'fresh-index' },
        { results: [], total: 0 },
      ],
    });
  const requests = await page.evaluate(() => window.__nextControl.requests);
  for (const method of ['structure_search', 'dictionary_lookup']) {
    expect(
      requests
        .filter((item) => item.method === method)
        .map((item) => ({
          query: item.params.query,
          engineFingerprint: item.params.engineFingerprint,
        })),
    ).toEqual([
      { query: 'y py', engineFingerprint: 'simulated-engine:simulated:a' },
      { query: 'y py', engineFingerprint: 'simulated-engine:recovered' },
    ]);
  }
  expect(requests.filter((item) => item.method === 'refresh_project')).toHaveLength(1);
  expect(await page.evaluate(() => window.__nextStudio.draft)).toEqual(before);
  await expect(page.getByTestId('passage')).toHaveText('passage-a');
});

test('a stale chosen structure refreshes context without replaying resolution or inserting it', async ({
  page,
}) => {
  await ready(page);
  const before = await page.evaluate(() => structuredClone(window.__nextStudio.draft!));
  await page.evaluate(() => {
    const original = window.studio!.invoke!;
    const revision = window.__nextStudio.draft!.revisionId;
    window.__nextControl.responses.structure_resolve = {
      expression: 'beta',
      surface: 'beta',
      kind: 'reference',
      source: { sourceId: 'araujo_catecismo_1686' },
    };
    window.__nextControl.project = {
      ...window.__nextControl.project,
      engineFingerprint: 'simulated-engine:chosen-stale',
    };
    window.studio!.invoke = async (method, params) => {
      const result = await original(method, params);
      if (method === 'structure_resolve')
        throw Object.assign(new Error('Simulated changed corpus/grammar'), {
          code: 'STALE_ENGINE',
        });
      return result;
    };
    void window
      .__nextInvoke<{
        expression: string;
      }>('structure_resolve', {
        passageId: window.__nextStudio.passage.id,
        candidateId: 'old-candidate',
        indexFingerprint: 'old-index',
      })
      .then(
        (result) => {
          window.__nextControl.responses.resolutionOutcome = {
            inserted: window.__nextStudio.insertPiece(result.expression, revision),
          };
        },
        (error: { message?: string; code?: string }) => {
          window.__nextControl.responses.resolutionOutcome = {
            error: error.message,
            code: error.code,
          };
        },
      );
  });
  await expect
    .poll(() => page.evaluate(() => window.__nextControl.responses.resolutionOutcome))
    .toMatchObject({ code: 'CONTEXT_REFRESHED' });
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) => item.method === 'structure_resolve'),
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) => item.method === 'refresh_project'),
    ),
  ).toHaveLength(1);
  expect(await page.evaluate(() => window.__nextStudio.draft)).toEqual(before);
  expect(await page.evaluate(() => window.__nextStudio.project.engineFingerprint)).toBe(
    'simulated-engine:chosen-stale',
  );
});

test('canvas-only edits persist with undo and reuse exact current source evaluation', async ({
  page,
}) => {
  await ready(page);
  const before = await page.evaluate(
    () =>
      window.__nextControl.requests.filter((request) => request.method === 'evaluate_expression')
        .length,
  );
  await page.evaluate(() =>
    window.__nextStudio.edit({
      canvas: {
        fragments: [{ id: 'piece-one', raw: 'beta', x: 300, y: 240 }],
        positions: { 'main:root': { x: 80, y: 90 } },
      },
    }),
  );
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextStudio.result?.revisionId === window.__nextStudio.draft?.revisionId,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.filter((request) => request.method === 'evaluate_expression')
          .length,
    ),
  ).toBe(before);
  await page.evaluate(() => window.__nextStudio.undo());
  expect(await page.evaluate(() => window.__nextStudio.draft?.canvas)).toBeUndefined();
  await page.evaluate(() => window.__nextStudio.redo());
  await page.evaluate(() => window.__nextStudio.persist());
  await page.reload();
  await expect(page.getByTestId('ready')).toHaveText('true');
  expect(await page.evaluate(() => window.__nextStudio.draft?.canvas)).toEqual({
    fragments: [{ id: 'piece-one', raw: 'beta', x: 300, y: 240 }],
    positions: { 'main:root': { x: 80, y: 90 } },
  });
});

test('a partial root result retains successful child evidence on the current revision', async ({
  page,
}) => {
  await ready(page);
  await hold(page, 'evaluate_expression', 'alpha * missing');
  await page.getByLabel('Pydicate simulado').fill('alpha * missing');
  await pending(page, 'evaluate_expression', 'alpha * missing');
  await page.evaluate(() => {
    const request = window.__nextControl.pending.find(
      (request) => request.method === 'evaluate_expression',
    )!;
    window.__nextControl.responses.evaluate_expression = {
      expression: request.params.raw,
      revisionId: request.params.revisionId,
      engineFingerprint: request.params.engineFingerprint,
      surface: '',
      annotated: '',
      morphemes: [],
      origin: 'engine',
      evaluationStatus: 'partial',
      failures: [
        {
          nodeId: 'root/right',
          expression: 'missing',
          stage: 'reference',
          message: 'Unknown reference',
        },
      ],
      tree: {
        id: 'root',
        kind: 'binary',
        label: '*',
        operator: '*',
        code: 'alpha * missing',
        start: 0,
        end: 15,
        evaluation: { status: 'blocked', message: 'Blocked by missing', causes: ['root/right'] },
        children: [
          {
            slot: 'left',
            node: {
              id: 'root/left',
              kind: 'reference',
              label: 'alpha',
              code: 'alpha',
              start: 0,
              end: 5,
              children: [],
              evaluation: { status: 'ok', surface: 'alpha' },
            },
          },
          {
            slot: 'right',
            node: {
              id: 'root/right',
              kind: 'reference',
              label: 'missing',
              code: 'missing',
              start: 8,
              end: 15,
              children: [],
              evaluation: { status: 'error', message: 'Unknown reference' },
            },
          },
        ],
      },
    };
  });
  await release(page, 'evaluate_expression', 'alpha * missing');
  await expect(page.getByTestId('diagnostic')).toContainText('partes que funcionam');
  expect(
    await page.evaluate(() => window.__nextStudio.parsed?.root?.children[0].node.evaluation),
  ).toEqual({ status: 'ok', surface: 'alpha' });
  expect(await page.evaluate(() => window.__nextStudio.result?.evaluationStatus)).toBe('partial');
  expect(await page.evaluate(() => window.__nextStudio.result?.revisionId)).toBe(
    await page.getByTestId('revision').textContent(),
  );
});

test('simulated contracts: incomplete raw and independent notes save and reopen without a valid tree', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Pydicate simulado').fill('incomplete(');
  await page.getByLabel('Nota simulada').fill('Human uncertainty remains useful.');
  await expect(page.getByTestId('diagnostic')).toContainText('incomplete input');
  await expect(page.getByTestId('tree')).toBeEmpty();
  await page.evaluate(() => window.__nextStudio.persist());
  await page.reload();
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('incomplete(');
  await expect(page.getByLabel('Nota simulada')).toHaveValue('Human uncertainty remains useful.');
  await expect(page.getByTestId('tree')).toBeEmpty();
  await expect(page.getByTestId('surface')).toBeEmpty();
});

test('simulated contracts: delayed parse and evaluation cannot replace a newer raw revision', async ({
  page,
}) => {
  await ready(page);
  await hold(page, 'parse_expression', 'old_parse');
  await page.getByLabel('Pydicate simulado').fill('old_parse');
  await pending(page, 'parse_expression', 'old_parse');
  await page.getByLabel('Pydicate simulado').fill('new_parse');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:new_parse');
  await release(page, 'parse_expression', 'old_parse');
  await expect(page.getByTestId('tree')).toHaveText('new_parse');
  await hold(page, 'evaluate_expression', 'old_render');
  await page.getByLabel('Pydicate simulado').fill('old_render');
  await pending(page, 'evaluate_expression', 'old_render');
  await page.getByLabel('Pydicate simulado').fill('new_render');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:new_render');
  await release(page, 'evaluate_expression', 'old_render');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:new_render');
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('new_render');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter(
        (item) => item.method === 'evaluate_expression' && item.params.raw === 'old_parse',
      ),
    ),
  ).toHaveLength(0);
});

test('simulated contracts: undo and redo create fresh revisions and reject a delayed same-text result', async ({
  page,
}) => {
  await ready(page);
  await hold(page, 'evaluate_expression', 'changed');
  await page.getByLabel('Pydicate simulado').fill('changed');
  await pending(page, 'evaluate_expression', 'changed');
  const firstRevision = await page.getByTestId('revision').textContent();
  await page.getByRole('button', { name: 'Desfazer simulado', exact: true }).click();
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('alpha');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  const undoRevision = await page.getByTestId('revision').textContent();
  await hold(page, 'evaluate_expression', 'changed');
  await page.getByRole('button', { name: 'Refazer simulado', exact: true }).click();
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('changed');
  const redoRevision = await page.getByTestId('revision').textContent();
  expect(new Set([firstRevision, undoRevision, redoRevision]).size).toBe(3);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__nextControl.pending.filter(
            (item) => item.method === 'evaluate_expression' && item.params.raw === 'changed',
          ).length,
      ),
    )
    .toBe(2);
  await release(page, 'evaluate_expression', 'changed');
  await expect(page.getByTestId('surface')).toBeEmpty();
  await release(page, 'evaluate_expression', 'changed');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:changed');
  expect(await page.evaluate(() => window.__nextStudio.result?.revisionId)).toBe(redoRevision);
});

test('simulated contracts: project transitions discard old parse/render responses', async ({
  page,
}) => {
  await ready(page);
  await hold(page, 'evaluate_expression', 'old_project');
  await page.getByLabel('Pydicate simulado').fill('old_project');
  await pending(page, 'evaluate_expression', 'old_project');
  await page.evaluate(async () => {
    window.__nextControl.openedProject = window.__nextControl.makeProject(
      'simulated:b',
      'other_project',
    );
    await window.__nextStudio.openProject();
  });
  await expect(page.getByTestId('project')).toHaveText('simulated:b');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:other_project');
  await release(page, 'evaluate_expression', 'old_project');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:other_project');
  await expect(page.getByTestId('tree')).toHaveText('other_project');
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('other_project');
});

test('simulated contracts: redo history cannot cross projects that share a source passage identity', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Pydicate simulado').fill('unapplied_project_a_work');
  await page.getByRole('button', { name: 'Desfazer simulado', exact: true }).click();
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('alpha');
  expect(await page.evaluate(() => window.__nextStudio.canRedo)).toBe(true);
  await page.evaluate(async () => {
    window.__nextControl.openedProject = window.__nextControl.makeProject(
      'simulated:b',
      'project_b_source',
    );
    await window.__nextStudio.openProject();
  });
  await expect(page.getByTestId('project')).toHaveText('simulated:b');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const redoAvailable = await page.evaluate(() => window.__nextStudio.canRedo);
  await page.getByRole('button', { name: 'Refazer simulado', exact: true }).click();
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('project_b_source');
  expect(redoAvailable).toBe(false);
});

test('simulated contracts: source previews cannot apply after the reviewed draft changes', async ({
  page,
}) => {
  await ready(page);
  await hold(page, 'source_preview');
  await page.evaluate(() => {
    void window.__nextStudio.sourcePreview().then((value) => {
      window.__nextControl.preview = value;
    });
  });
  await pending(page, 'source_preview');
  await page.getByLabel('Pydicate simulado').fill('later_human_edit');
  await release(page, 'source_preview');
  await expect.poll(() => page.evaluate(() => Boolean(window.__nextControl.preview))).toBe(true);
  const message = await page.evaluate(async () => {
    try {
      await window.__nextStudio.applySource(window.__nextControl.preview!);
      return 'UNEXPECTED_APPLY';
    } catch (error) {
      return String(error);
    }
  });
  expect(message).toContain('rascunho mudou');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((item) => item.method === 'source_apply'),
    ),
  ).toBe(false);
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('later_human_edit');
});

test('simulated contracts: explicit reconciliation preserves source, human raw and orphan backup', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Pydicate simulado').fill('human_unfinished(');
  await page.getByLabel('Nota simulada').fill('Retain this independent note.');
  await page.evaluate(() => {
    const next = structuredClone(window.__nextStudio.project);
    next.passages[0].sourceExpression = 'external_source';
    next.passages[0].sourceFingerprint = 'external-content';
    window.__nextStudio.changeProject(next);
  });
  await expect(page.getByTestId('conflict')).toHaveText('true');
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('human_unfinished(');
  await page.evaluate(() => window.__nextStudio.reconcileDraft());
  await expect(page.getByTestId('conflict')).toHaveText('false');
  await expect(page.getByTestId('source')).toHaveText('external_source');
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('human_unfinished(');
  await page.evaluate(() => {
    const next = structuredClone(window.__nextStudio.project);
    next.passages[0].id = 'replacement-passage';
    next.passages[0].sourceExpression = 'external_rewrite';
    next.passages[0].sourceFingerprint = 'external-rewrite';
    window.__nextStudio.changeProject(next);
  });
  await expect(page.getByTestId('orphans')).toHaveText('1');
  await page.evaluate(() => window.__nextStudio.reconcileDraft('passage-a'));
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('human_unfinished(');
  await expect(page.getByLabel('Nota simulada')).toHaveValue('Retain this independent note.');
  await expect(page.getByTestId('source')).toHaveText('external_rewrite');
  expect(await page.evaluate(() => window.__nextStudio.envelope.drafts['passage-a'].raw)).toBe(
    'human_unfinished(',
  );
  await page.evaluate(() => window.__nextStudio.persist());
  expect(
    await page.evaluate(() => Object.keys(window.__nextControl.saved['simulated:a'].drafts)),
  ).toContain('passage-a');
});

test('simulated contracts: applying a lexical definition does not overwrite unrelated raw work', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Pydicate simulado').fill('unapplied_human_analysis');
  await page.getByLabel('Nota simulada').fill('Keep while a definition changes.');
  await page.evaluate(async () => {
    window.__nextControl.applyResult = structuredClone(window.__nextStudio.project);
    window.__nextControl.applyResult.engineFingerprint = 'simulated-engine:lexicon-updated';
    await window.__nextStudio.applySource({
      previewId: 'lexical-preview',
      sourceFingerprint: 'lexical-v1',
      diff: 'SIMULATED LEXICAL DIFF',
      kind: 'lexicon',
      name: 'word',
    });
  });
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('unapplied_human_analysis');
  await expect(page.getByLabel('Nota simulada')).toHaveValue('Keep while a definition changes.');
  await expect(page.getByTestId('source')).toHaveText('alpha');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:unapplied_human_analysis');
});

test('saved legacy drafts render after migration and completion survives restart and content undo', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    const envelope = structuredClone(window.__nextStudio.envelope);
    for (const draft of Object.values(envelope.drafts)) {
      delete draft.raw;
      delete draft.locators;
    }
    localStorage.setItem('simulated-next:simulated:a', JSON.stringify(envelope));
  });
  await page.reload();
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  await page.getByLabel('Nota simulada').fill('A preserved note');
  await page.evaluate(() => window.__nextStudio.setWorkflow('complete'));
  await page.getByRole('button', { name: 'Desfazer simulado', exact: true }).click();
  expect(await page.evaluate(() => window.__nextStudio.draft?.workflow?.stage)).toBe('complete');
  await page.evaluate(() => window.__nextStudio.persist());
  await page.reload();
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  expect(await page.evaluate(() => window.__nextStudio.draft?.workflow?.stage)).toBe('complete');
  const before = await page.evaluate(
    () => window.__nextControl.requests.filter((r) => r.method === 'evaluate_expression').length,
  );
  await page.evaluate(() => window.__nextStudio.setWorkflow('review'));
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () => window.__nextControl.requests.filter((r) => r.method === 'evaluate_expression').length,
    ),
  ).toBe(before);
  await page.evaluate(() => window.__nextStudio.setSelectedId('passage-b'));
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:beta');
});

test('failed retry cannot leave a previous successful result looking current', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const invoke = window.studio!.invoke!;
    window.studio!.invoke = async (method, params) => {
      if (method === 'evaluate_expression') throw new Error('SIMULATED_ENGINE_FAILURE');
      return invoke(method, params);
    };
    window.__nextStudio.retryEvaluation();
  });
  await expect(page.getByTestId('diagnostic')).toContainText('SIMULATED_ENGINE_FAILURE');
  await expect(page.getByTestId('surface')).toBeEmpty();
});

import { expect, test, type Page } from '@playwright/test';
import type { DraftEnvelope, StudioProject } from '../src/domain/types';

declare global {
  interface Window {
    __publicationFailure?: { id: string; failedSaves: number };
    __publicationAcknowledgements?: { receiptId: string; ids: string[] }[];
  }
}

async function rankedProject(page: Page) {
  // A source publication survives a browser restart, while a rejected draft
  // write leaves the previous envelope intact. Supply those independently.
  await page.addInitScript(() => {
    const saved = localStorage.getItem('publication-project');
    if (saved) {
      const project = JSON.parse(saved);
      window.__nextInitial = {
        responses: {
          session_restore: {
            project,
            selectedPassageId: localStorage.getItem(`simulated-selection:${project.id}`),
          },
        },
      };
    }
  });
  await page.goto('/tests/next-hook-harness.html');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await page.evaluate(async () => {
    await window.__nextStudio.persist();
    const studio = window.__nextStudio;
    const envelope = structuredClone(studio.envelope);
    const sourceId = studio.passage.sourceId;
    envelope.drafts['passage-b'].organization = { sourceId, position: 0, deleted: false };
    envelope.drafts['passage-a'].organization = { sourceId, position: 1, deleted: false };
    localStorage.setItem(`simulated-next:${studio.project.id}`, JSON.stringify(envelope));
  });
  await page.reload();
  await expect(page.getByTestId('passage')).toHaveText('passage-a');
  expect(await identities(page)).toEqual(['passage-b', 'passage-a']);
}

function identities(page: Page) {
  return page.evaluate(() => window.__nextStudio.project.passages.map((passage) => passage.id));
}

async function insertedDraft(page: Page) {
  const pending = await page.evaluate(() => window.__nextStudio.createPendingDraft('before')!);
  await expect(page.getByTestId('passage')).toHaveText(pending);
  await page.evaluate(() =>
    window.__nextStudio.edit({
      raw: 'original_tree',
      normalized: 'Leitura que mantém sua posição',
      notes: 'Nota editorial preservada durante a publicação',
    }),
  );
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:original_tree');
  await page.evaluate(() => window.__nextStudio.persist());
  expect(await identities(page)).toEqual(['passage-b', pending, 'passage-a']);
  return pending;
}

async function preparePublication(page: Page) {
  return page.evaluate(async () => {
    const studio = window.__nextStudio;
    const preview = await studio.sourcePreview();
    window.__nextControl.preview = preview;
    const canonical = {
      ...studio.passage,
      id: preview.targetPassageId!,
      sourceExpression: studio.draft!.raw!,
      sourceFingerprint: 'published-source-v1',
      diplomatic: studio.draft!.diplomatic,
      normalized: studio.draft!.normalized,
      notes: studio.draft!.notes,
    };
    // The source inserts before A. The administrator's visible order is B,A,
    // so this new line must remain between B and A after its identity changes.
    window.__nextControl.applyResult = {
      ...window.__nextControl.project,
      passages: [canonical, ...window.__nextControl.project.passages],
    };
    return canonical.id;
  });
}

async function reviseCanonical(
  page: Page,
  canonical: string,
  expectedOrder = ['passage-b', canonical, 'passage-a'],
) {
  await page.evaluate((id) => window.__nextStudio.setSelectedId(id), canonical);
  await expect(page.getByTestId('passage')).toHaveText(canonical);
  await page.evaluate(() => window.__nextStudio.edit({ raw: 'revised_tree' }));
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:revised_tree');
  await page.evaluate(async () => {
    const studio = window.__nextStudio;
    const preview = await studio.sourcePreview();
    const base = window.__nextControl.project;
    window.__nextControl.applyResult = {
      ...base,
      passages: base.passages.map((passage) =>
        passage.id === studio.passage.id
          ? {
              ...passage,
              sourceExpression: studio.draft!.raw!,
              sourceFingerprint: 'revised-source-v2',
            }
          : passage,
      ),
    };
    await studio.applySource(preview);
    window.__nextControl.project = structuredClone(window.__nextControl.applyResult);
    await window.__nextStudio.persist();
  });
  expect(await identities(page)).toEqual(expectedOrder);
  await expect(page.getByTestId('conflict')).toHaveText('false');
  const previewRequest = await page.evaluate(() =>
    [...window.__nextControl.requests]
      .reverse()
      .find((request) => ['source_preview', 'source_new_preview'].includes(request.method)),
  );
  expect(previewRequest).toMatchObject({
    method: 'source_preview',
    params: { passageId: canonical },
  });
}

test('revising an already published passage neither inserts a row nor changes administrator order', async ({
  page,
}) => {
  await rankedProject(page);
  await reviseCanonical(page, 'passage-a', ['passage-b', 'passage-a']);
  await page.evaluate(() => window.__nextStudio.refresh());
  expect(await identities(page)).toEqual(['passage-b', 'passage-a']);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) => request.method === 'source_new_preview'),
    ),
  ).toEqual([]);
});

for (const dirty of ['sibling', 'retired-pending'] as const) {
  test(`an open peer applies only clean refresh rows while preserving its ${dirty === 'sibling' ? 'sibling workflow' : dirty} edit`, async ({
    page,
  }) => {
    await rankedProject(page);
    const pending = await insertedDraft(page);
    const canonical = await preparePublication(page);
    await page.evaluate(
      ({ pending, canonical }) => {
        const studio = window.__nextStudio;
        const before = studio.envelope.drafts;
        const migrated = {
          ...structuredClone(before[pending]),
          passageId: canonical,
          sourceFingerprint: 'published-source-v1',
          organization: { sourceId: studio.passage.sourceId, position: 1, deleted: false },
        };
        delete migrated.pending;
        const project = window.__nextControl.applyResult;
        project.engineFingerprint += ':published-in-another-browser';
        project.draftPublication = {
          receiptId: 'peer-refresh-receipt',
          projectId: project.id,
          storageRevision: 30,
          changes: [
            {
              id: pending,
              version: 6,
              draft: null,
              expectedRevisionId: before[pending].revisionId,
              expectedDraft: before[pending],
            },
            {
              id: canonical,
              version: 1,
              draft: migrated,
              expectedRevisionId: null,
              expectedDraft: null,
            },
            {
              id: 'passage-a',
              version: 8,
              expectedRevisionId: before['passage-a'].revisionId,
              expectedDraft: before['passage-a'],
              draft: {
                ...before['passage-a'],
                revisionId: 'remote-a',
                organization: { sourceId: studio.passage.sourceId, position: 2, deleted: false },
              },
            },
            {
              id: 'passage-b',
              version: 9,
              expectedRevisionId: before['passage-b'].revisionId,
              expectedDraft: before['passage-b'],
              draft: {
                ...before['passage-b'],
                revisionId: 'remote-b',
                notes: 'Nota remota da vizinha',
              },
            },
          ],
        };
        window.__publicationAcknowledgements = [];
        window.studio!.acknowledgeDraftPublication = (receiptId, ids) => {
          window.__publicationAcknowledgements!.push({ receiptId, ids });
          return ids;
        };
        window.__nextControl.project = project;
        window.__nextControl.holds.push({ method: 'refresh_project' });
        window.__nextControl.emit({
          type: 'source-change',
          projectId: project.id,
          engineFingerprint: project.engineFingerprint,
        });
      },
      { pending, canonical },
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__nextControl.pending.some((request) => request.method === 'refresh_project'),
        ),
      )
      .toBe(true);
    const editedId = dirty === 'sibling' ? 'passage-b' : pending;
    if (dirty === 'sibling') {
      const revisions = await page.evaluate((pending) => {
        const studio = window.__nextStudio;
        const before = studio.envelope.drafts['passage-b'].revisionId;
        studio.setSelectedId('passage-b');
        studio.setWorkflow('review');
        studio.setSelectedId(pending);
        return before;
      }, pending);
      expect(
        await page.evaluate(() => window.__nextStudio.envelope.drafts['passage-b'].revisionId),
      ).toBe(revisions);
    } else {
      await page.evaluate(
        (passageId) =>
          window.__nextStudio.editPassages([
            { passageId, changes: { notes: 'Edição local durante a atualização' } },
          ]),
        editedId,
      );
    }
    await page.evaluate(() => window.__nextControl.release('refresh_project'));
    if (dirty === 'retired-pending') {
      await expect
        .poll(() => page.evaluate(() => window.__nextStudio.error))
        .toContain('rascunho local foi preservado');
      expect(await identities(page)).toEqual(['passage-b', pending, 'passage-a']);
      expect(await page.evaluate(() => window.__publicationAcknowledgements)).toEqual([]);
    } else {
      await expect(page.getByTestId('passage')).toHaveText(canonical);
      expect(await identities(page)).toEqual(['passage-b', canonical, 'passage-a']);
      const accepted = await page.evaluate(() => window.__publicationAcknowledgements);
      expect(accepted).toEqual([
        { receiptId: 'peer-refresh-receipt', ids: [pending, canonical, 'passage-a'] },
      ]);
      expect(
        await page.evaluate(
          () => window.__nextStudio.envelope.drafts['passage-a'].organization?.position,
        ),
      ).toBe(2);
      expect(
        await page.evaluate(() => window.__nextStudio.envelope.drafts['passage-b'].revisionId),
      ).not.toBe('remote-b');
      expect(
        await page.evaluate(() => window.__nextStudio.envelope.drafts['passage-b'].workflow?.stage),
      ).toBe('review');
    }
    if (dirty === 'retired-pending')
      expect(
        await page.evaluate((id) => window.__nextStudio.envelope.drafts[id].notes, editedId),
      ).toBe('Edição local durante a atualização');
  });
}

for (const { dirtySibling, straddlesPublication } of [
  { dirtySibling: false, straddlesPublication: false },
  { dirtySibling: true, straddlesPublication: false },
  { dirtySibling: false, straddlesPublication: true },
]) {
  test(`the hosted peer refresh adopts canonical version one only after acknowledgement${dirtySibling ? ' and keeps a dirty sibling version guarded' : ''}${straddlesPublication ? ' after one bounded source/draft snapshot retry' : ''}`, async ({
    page,
  }) => {
    await rankedProject(page);
    const pending = await insertedDraft(page);
    const canonical = await preparePublication(page);
    const fixture = await page.evaluate(() => ({
      project: window.__nextControl.applyResult,
      originalProject: window.__nextControl.project,
      envelope: window.__nextStudio.envelope,
    }));
    const initial = structuredClone(fixture.envelope);
    const stored = structuredClone(initial);
    const versions: Record<string, number> = { [pending]: 5, 'passage-a': 7, 'passage-b': 4 };
    const writes: { changes: { id: string; version: number; draft: unknown }[] }[] = [];
    let loads = 0;
    let refreshes = 0;
    await page.route('**/publication-transport', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Peer transport fixture</title>',
      }),
    );
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const input = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
      if (pathname === '/api/me')
        return route.fulfill({
          json: { user: { id: 'peer', role: 'reviewer' }, csrf: 'fixture-only' },
        });
      if (pathname === '/api/events')
        return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      if (pathname === '/api/drafts/load') {
        loads++;
        return route.fulfill({ json: { envelope: stored, versions } });
      }
      if (pathname === '/api/refresh') {
        refreshes++;
        if (refreshes === 1) {
          const migrated = {
            ...stored.drafts[pending],
            passageId: canonical,
            sourceFingerprint: 'published-source-v1',
          };
          delete migrated.pending;
          delete stored.drafts[pending];
          stored.drafts[canonical] = migrated;
          stored.drafts['passage-a'].organization = {
            ...stored.drafts['passage-a'].organization!,
            position: 2,
          };
          stored.drafts['passage-a'].revisionId = 'remote-a';
          stored.drafts['passage-b'].notes = 'Nota de outra pessoa';
          stored.drafts['passage-b'].revisionId = 'remote-b';
          stored.storageRevision = 30;
          Object.assign(versions, { [pending]: 6, [canonical]: 1, 'passage-a': 8, 'passage-b': 9 });
        }
        // Publication lands after the first source read but before drafts/load.
        // Only the bounded retry returns matching source and draft snapshots.
        return route.fulfill({
          json: straddlesPublication && refreshes === 1 ? fixture.originalProject : fixture.project,
        });
      }
      if (pathname === '/api/drafts') {
        writes.push(structuredClone(input));
        if (
          input.changes.some(
            (change: { id: string; version: number }) =>
              change.version !== (versions[change.id] ?? 0),
          )
        )
          return route.fulfill({
            status: 409,
            json: { error: { code: 'DRAFT_CONFLICT', message: 'Versão antiga preservada.' } },
          });
        for (const change of input.changes) {
          versions[change.id] = (versions[change.id] ?? 0) + 1;
          if (change.draft === null) delete stored.drafts[change.id];
          else stored.drafts[change.id] = structuredClone(change.draft);
        }
        stored.storageRevision = (stored.storageRevision ?? 0) + 1;
        return route.fulfill({ json: { versions, storageRevision: stored.storageRevision } });
      }
      throw new Error(`Unexpected peer transport fixture request: ${pathname}`);
    });
    await page.goto('/publication-transport');
    await page.addScriptTag({ path: 'server/public/bridge.js' });
    const result = await page.evaluate(
      async ({ projectId, dirtySibling }) => {
        const local = (await window.studio!.loadDrafts(projectId))!;
        const project = await window.studio!.refreshProject();
        const receipt = project.draftPublication!;
        // Merely receiving the snapshot must not adopt content or versions. An
        // unchanged pre-refresh envelope should still be a no-op until ack.
        await window.studio!.saveDrafts(local);
        if (dirtySibling) {
          local.drafts['passage-b'].notes = 'Edição local não confirmada';
          local.drafts['passage-b'].revisionId = 'dirty-local-b';
        }
        const clean = receipt.changes.filter(
          (change) => (local.drafts[change.id]?.revisionId ?? null) === change.expectedRevisionId,
        );
        const accepted = window.studio!.acknowledgeDraftPublication!(
          receipt.receiptId!,
          clean.map((change) => change.id),
        );
        for (const change of clean) {
          if (!accepted.includes(change.id)) continue;
          if (change.draft === null) delete local.drafts[change.id];
          else local.drafts[change.id] = change.draft;
        }
        local.storageRevision = receipt.storageRevision;
        let error = '';
        try {
          await window.studio!.saveDrafts(local);
        } catch (reason) {
          error = (reason as Error & { code?: string }).code ?? String(reason);
        }
        localStorage.setItem('peer-envelope', JSON.stringify(local));
        return {
          accepted,
          error,
          local,
          passageIds: project.passages.map((passage) => passage.id),
        };
      },
      { projectId: fixture.project.id, dirtySibling },
    );
    expect(loads).toBe(straddlesPublication ? 3 : 2);
    expect(refreshes).toBe(straddlesPublication ? 2 : 1);
    expect(result.passageIds).toContain(canonical);
    expect(result.accepted).toEqual(expect.arrayContaining([pending, canonical, 'passage-a']));
    expect(result.local.drafts[pending]).toBeUndefined();
    expect(result.local.drafts['passage-a'].organization?.position).toBe(2);
    if (dirtySibling) {
      expect(result.accepted).not.toContain('passage-b');
      expect(result.error).toBe('DRAFT_CONFLICT');
      expect(writes).toHaveLength(1);
      expect(writes[0].changes).toEqual([expect.objectContaining({ id: 'passage-b', version: 4 })]);
      expect(result.local.drafts['passage-b'].notes).toBe('Edição local não confirmada');
      expect(stored.drafts['passage-b'].notes).toBe('Nota de outra pessoa');
    } else {
      expect(result.error).toBe('');
      expect(writes).toEqual([]);
      await page.evaluate(async (id) => {
        const local = JSON.parse(localStorage.getItem('peer-envelope')!) as DraftEnvelope;
        local.drafts[id].notes = 'Primeira edição depois da publicação por outra pessoa';
        await window.studio!.saveDrafts(local);
      }, canonical);
      expect(writes).toHaveLength(1);
      expect(writes[0].changes).toEqual([expect.objectContaining({ id: canonical, version: 1 })]);
    }
  });
}

test('publishing between administrator-ranked passages and revising it preserves visible order and count', async ({
  page,
}) => {
  await rankedProject(page);
  const pending = await insertedDraft(page);
  const canonical = await preparePublication(page);
  expect(canonical).toBe(pending.replace('pending:', 'passage:'));
  await page.evaluate(async () => {
    await window.__nextStudio.applySource(window.__nextControl.preview!);
    window.__nextControl.project = structuredClone(window.__nextControl.applyResult);
    await window.__nextStudio.persist();
  });
  await expect(page.getByTestId('passage')).toHaveText(canonical);
  expect(await identities(page)).toEqual(['passage-b', canonical, 'passage-a']);
  expect(
    await page.evaluate((id) => window.__nextStudio.envelope.drafts[id], pending),
  ).toBeUndefined();
  await reviseCanonical(page, canonical);
  await page.evaluate(() => window.__nextStudio.refresh());
  expect(await identities(page)).toEqual(['passage-b', canonical, 'passage-a']);
});

test('a peer canonical save followed by a failed legacy draft migration reopens as one row at the pending position', async ({
  page,
}) => {
  await rankedProject(page);
  const pending = await insertedDraft(page);
  const canonical = await preparePublication(page);
  await page.evaluate((id) => {
    window.__publicationFailure = { id, failedSaves: 0 };
    const save = window.studio!.saveDrafts.bind(window.studio);
    window.studio!.saveDrafts = async (envelope: DraftEnvelope) => {
      if (envelope.drafts[window.__publicationFailure!.id]) {
        const key = `simulated-next:${envelope.projectId}`;
        const disk = JSON.parse(localStorage.getItem(key)!) as DraftEnvelope;
        if (!disk.drafts[id]) {
          // Another browser receives source-change and saves the canonical
          // draft before the publisher can retire its pending identity.
          const peer = structuredClone(envelope.drafts[id]);
          delete peer.organization;
          disk.drafts[id] = peer;
          localStorage.setItem(key, JSON.stringify(disk));
        }
        window.__publicationFailure!.failedSaves++;
        throw new Error('SIMULATED_DRAFT_WRITE_CONFLICT_AFTER_SOURCE_PUBLICATION');
      }
      return save(envelope);
    };
  }, canonical);
  const outcome = await page.evaluate(async () => {
    const result = await window.__nextStudio.applySource(window.__nextControl.preview!);
    window.__nextControl.project = structuredClone(window.__nextControl.applyResult);
    localStorage.setItem('publication-project', JSON.stringify(window.__nextControl.project));
    try {
      await window.__nextStudio.persist();
    } catch {
      /* The source has already succeeded. */
    }
    return result;
  });
  expect(outcome.sourceApplied).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__publicationFailure!.failedSaves))
    .toBeGreaterThan(0);
  const stale = await page.evaluate(
    () => JSON.parse(localStorage.getItem('simulated-next:simulated:a')!) as DraftEnvelope,
  );
  expect(stale.drafts[pending]?.notes).toBe('Nota editorial preservada durante a publicação');
  expect(stale.drafts[canonical]?.raw).toBe('original_tree');

  await page.reload();
  await expect(page.getByTestId('ready')).toHaveText('true');
  expect(await identities(page)).toEqual(['passage-b', canonical, 'passage-a']);
  await page.evaluate(() => {
    window.__nextControl.project = JSON.parse(localStorage.getItem('publication-project')!);
  });
  await page.evaluate((id) => window.__nextStudio.setSelectedId(id), canonical);
  await expect(page.getByTestId('passage')).toHaveText(canonical);
  await expect(page.getByTestId('conflict')).toHaveText('false');
  expect(await page.evaluate(() => window.__nextStudio.draft!.notes)).toBe(
    'Nota editorial preservada durante a publicação',
  );
  await page.evaluate(() => window.__nextStudio.persist());
  const recovered = await page.evaluate(
    () => JSON.parse(localStorage.getItem('simulated-next:simulated:a')!) as DraftEnvelope,
  );
  // Historic partial publications may retain an alias as recovery data. It
  // must never produce a second row, move the canonical row, or lose metadata.
  if (recovered.drafts[pending])
    expect(recovered.drafts[pending].notes).toBe('Nota editorial preservada durante a publicação');
  expect(recovered.drafts[canonical]?.raw).toBe('original_tree');
  await reviseCanonical(page, canonical);
  await page.evaluate(() => window.__nextStudio.refresh());
  expect(await identities(page)).toEqual(['passage-b', canonical, 'passage-a']);
});

test('the matching source-change event during publication does not refresh an obsolete pending envelope', async ({
  page,
}) => {
  await rankedProject(page);
  await insertedDraft(page);
  const canonical = await preparePublication(page);
  await page.evaluate(() => {
    window.__nextControl.applyResult.engineFingerprint += ':published';
    window.__nextControl.holds.push({ method: 'source_apply' });
  });
  const applying = page.evaluate(() =>
    window.__nextStudio.applySource(window.__nextControl.preview!),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((request) => request.method === 'source_apply'),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const control = window.__nextControl;
    control.project = structuredClone(control.applyResult);
    control.emit({
      type: 'source-change',
      projectId: control.project.id,
      engineFingerprint: control.project.engineFingerprint,
    });
  });
  await page.evaluate(() => window.__nextControl.release('source_apply'));
  await applying;
  await expect(page.getByTestId('passage')).toHaveText(canonical);
  expect(await identities(page)).toEqual(['passage-b', canonical, 'passage-a']);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) => request.method === 'refresh_project'),
    ),
  ).toEqual([]);
});

test('the editor adopts the server publication receipt instead of recreating the canonical draft locally', async ({
  page,
}) => {
  await rankedProject(page);
  const pending = await insertedDraft(page);
  const canonical = await preparePublication(page);
  await page.evaluate(
    async ({ pending, canonical }) => {
      const studio = window.__nextStudio;
      const draft = {
        ...structuredClone(studio.envelope.drafts[pending]),
        passageId: canonical,
        sourceFingerprint: 'published-source-v1',
        revisionId: 'server-finalized-revision',
        notes: 'Metadados confirmados na publicação atômica',
        organization: { sourceId: studio.passage.sourceId, position: 1, deleted: false },
      };
      delete draft.pending;
      window.__nextControl.applyResult.draftPublication = {
        projectId: studio.project.id,
        storageRevision: 42,
        changes: [
          { id: pending, version: 6, draft: null },
          { id: canonical, version: 1, draft },
          {
            id: 'passage-a',
            version: 8,
            draft: {
              ...studio.envelope.drafts['passage-a'],
              organization: { sourceId: studio.passage.sourceId, position: 2, deleted: false },
            },
          },
        ],
      };
      await studio.applySource(window.__nextControl.preview!);
      await window.__nextStudio.persist();
    },
    { pending, canonical },
  );
  await expect(page.getByTestId('passage')).toHaveText(canonical);
  expect(await identities(page)).toEqual(['passage-b', canonical, 'passage-a']);
  const saved = await page.evaluate(() => window.__nextStudio.envelope);
  expect(saved.storageRevision).toBe(42);
  expect(saved.drafts[pending]).toBeUndefined();
  expect(saved.drafts[canonical]).toMatchObject({
    revisionId: 'server-finalized-revision',
    notes: 'Metadados confirmados na publicação atômica',
  });
  expect(await page.evaluate(() => window.__nextStudio.project.draftPublication)).toBeUndefined();
});

test('the hosted bridge adopts only the atomic publication receipt and never retries canonical creation at version zero', async ({
  page,
}) => {
  await rankedProject(page);
  const pending = await insertedDraft(page);
  const canonical = await preparePublication(page);
  const fixture = await page.evaluate(() => ({
    project: window.__nextControl.applyResult,
    envelope: window.__nextStudio.envelope,
  }));
  const migrated = {
    ...structuredClone(fixture.envelope.drafts[pending]),
    passageId: canonical,
    sourceFingerprint: 'published-source-v1',
  };
  delete migrated.pending;
  const versions: Record<string, number> = {
    [pending]: 5,
    [canonical]: 0,
    'passage-a': 7,
    'passage-b': 4,
  };
  const stored = structuredClone(fixture.envelope);
  let published = false;
  const writes: { changes: { id: string; version: number; draft: unknown }[] }[] = [];
  await page.route('**/publication-transport', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Hosted publication transport fixture</title>',
    }),
  );
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const input = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    if (pathname === '/api/me')
      return route.fulfill({
        json: { user: { id: 'reviewer', role: 'admin' }, csrf: 'fixture-only' },
      });
    if (pathname === '/api/events')
      return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    if (pathname === '/api/drafts/load')
      return route.fulfill({ json: { envelope: stored, versions } });
    if (pathname === '/api/invoke' && input.method === 'source_apply') {
      published = true;
      delete stored.drafts[pending];
      stored.drafts[canonical] = structuredClone(migrated);
      stored.storageRevision = 20;
      versions[pending] = 6;
      versions[canonical] = 1;
      // A peer also edits a different passage. Its unseen new version must
      // not become permission for this browser to overwrite that content.
      stored.drafts['passage-b'].notes = 'Edição remota não carregada';
      versions['passage-b'] = 9;
      return route.fulfill({
        json: {
          ...fixture.project,
          versions,
          draftPublication: {
            projectId: fixture.project.id,
            storageRevision: 20,
            changes: [
              { id: pending, version: 6, draft: null },
              { id: canonical, version: 1, draft: migrated },
            ],
          },
        },
      });
    }
    if (pathname === '/api/drafts') {
      writes.push(structuredClone(input));
      const stale = input.changes.some(
        (change: { id: string; version: number }) => change.version !== (versions[change.id] ?? 0),
      );
      if (stale)
        return route.fulfill({
          status: 409,
          json: { error: { code: 'DRAFT_CONFLICT', message: 'Versão mudou em outra aba.' } },
        });
      for (const change of input.changes) {
        versions[change.id] = (versions[change.id] ?? 0) + 1;
        if (change.draft === null) delete stored.drafts[change.id];
        else stored.drafts[change.id] = structuredClone(change.draft);
      }
      stored.storageRevision = (stored.storageRevision ?? 0) + 1;
      return route.fulfill({ json: { versions, storageRevision: stored.storageRevision } });
    }
    throw new Error(`Unexpected hosted publication fixture request: ${pathname}`);
  });
  await page.goto('/publication-transport');
  // Execute the actual hosted browser transport, not a replacement bridge.
  await page.addScriptTag({ path: 'server/public/bridge.js' });
  await page.evaluate(async (projectId) => {
    const draft = (await window.studio!.loadDrafts(projectId))!;
    const project = (await window.studio!.invoke!('source_apply', {
      previewId: 'reviewed-fixture',
      sourceFingerprint: 'reviewed-source',
    })) as StudioProject;
    for (const change of project.draftPublication!.changes) {
      if (change.draft === null) delete draft.drafts[change.id];
      else draft.drafts[change.id] = change.draft;
    }
    draft.storageRevision = project.draftPublication!.storageRevision;
    localStorage.setItem('receipt-envelope', JSON.stringify(draft));
    await window.studio!.saveDrafts(draft);
  }, fixture.project.id);
  expect(published).toBe(true);
  expect(writes).toEqual([]);
  await page.evaluate(async (id) => {
    const draft = JSON.parse(localStorage.getItem('receipt-envelope')!) as DraftEnvelope;
    draft.drafts[id].notes = 'Edição posterior à publicação';
    await window.studio!.saveDrafts(draft);
    localStorage.setItem('receipt-envelope', JSON.stringify(draft));
  }, canonical);
  expect(writes).toHaveLength(1);
  expect(writes[0].changes).toEqual([expect.objectContaining({ id: canonical, version: 1 })]);
  const conflict = await page.evaluate(async () => {
    const draft = JSON.parse(localStorage.getItem('receipt-envelope')!) as DraftEnvelope;
    draft.drafts['passage-b'].notes = 'Tentativa com versão antiga';
    try {
      await window.studio!.saveDrafts(draft);
      return '';
    } catch (error) {
      return (error as Error & { code?: string }).code ?? String(error);
    }
  });
  expect(conflict).toBe('DRAFT_CONFLICT');
  expect(writes[1].changes).toEqual([expect.objectContaining({ id: 'passage-b', version: 4 })]);
  expect(stored.drafts['passage-b'].notes).toBe('Edição remota não carregada');
  expect(stored.drafts[pending]).toBeUndefined();
});

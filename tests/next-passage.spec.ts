import { expect, test, type Page } from '@playwright/test';
import type { DraftEnvelope } from '../src/domain/types';

async function workspace(page: Page) {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.locator('.add-next-passage')).toBeEnabled();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
}
async function contextFields(page: Page) {
  const details = page.locator('.source-context-fields');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}
async function selectedId(page: Page) {
  return page.evaluate(() => localStorage.getItem('simulated-selection:simulated:a')!);
}
async function saved(page: Page): Promise<DraftEnvelope> {
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem('simulated-next:simulated:a')))
    .toBe(true);
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('simulated-next:simulated:a')!) as DraftEnvelope,
  );
}

test('dictionary insertion is revision-bound and forms one undoable main or loose piece edit', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html');
  await expect(page.getByTestId('project')).toHaveText('simulated:a');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const pending = await page.evaluate(() => window.__nextStudio.createPendingDraft()!);
  await expect(page.getByTestId('passage')).toHaveText(pending);
  const expression = 'Noun("abá", definition="(s.) pessoa")';
  const before = await page.evaluate(() => window.__nextStudio.draft!);
  expect(
    await page.evaluate(
      (expression) => window.__nextStudio.insertPiece(expression, 'stale-revision'),
      expression,
    ),
  ).toBe(false);
  expect(await page.evaluate(() => window.__nextStudio.draft!)).toEqual(before);
  expect(
    await page.evaluate(
      ({ expression, revision }) => window.__nextStudio.insertPiece(expression, revision),
      { expression, revision: before.revisionId },
    ),
  ).toBe(true);
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue(expression);
  expect(await page.evaluate(() => window.__nextStudio.draft!.canvas!.fragments)).toEqual([]);
  await page.getByRole('button', { name: 'Desfazer simulado', exact: true }).click();
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('');
  await page.getByRole('button', { name: 'Refazer simulado', exact: true }).click();
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue(expression);
  const revision = await page.evaluate(() => window.__nextStudio.draft!.revisionId);
  expect(
    await page.evaluate(
      (revision) => window.__nextStudio.insertPiece('Pronoun("ixé")', revision),
      revision,
    ),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__nextStudio.draft!.canvas!.fragments))
    .toHaveLength(1);
  const added = await page.evaluate(() => window.__nextStudio.draft!);
  expect(added.raw).toBe(expression);
  expect(added.canvas!.fragments).toHaveLength(1);
  expect(added.canvas!.fragments[0].raw).toBe('Pronoun("ixé")');
  await page.getByRole('button', { name: 'Desfazer simulado', exact: true }).click();
  expect(await page.evaluate(() => window.__nextStudio.draft!.canvas!.fragments)).toEqual([]);
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue(expression);
});

test('a later pending line cannot publish before the first and both drafts remain editable', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html');
  await expect(page.getByTestId('project')).toHaveText('simulated:a');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const first = await page.evaluate(() => window.__nextStudio.createPendingDraft()!);
  await expect(page.getByTestId('passage')).toHaveText(first);
  await page.evaluate(() =>
    window.__nextStudio.edit({ raw: 'first_line', notes: 'Primeira leitura' }),
  );
  const second = await page.evaluate(() => window.__nextStudio.createPendingDraft()!);
  await expect(page.getByTestId('passage')).toHaveText(second);
  await page.evaluate(() =>
    window.__nextStudio.edit({ raw: 'second_line', notes: 'Segunda leitura independente' }),
  );
  await page.evaluate(() => window.__nextStudio.persist());
  const before = await page.evaluate(() => window.__nextStudio.envelope);
  const rejected = await page.evaluate(async () => {
    const count = window.__nextControl.requests.length;
    let error = '';
    try {
      await window.__nextStudio.sourcePreview();
    } catch (reason) {
      error = String(reason);
    }
    return {
      error,
      requests: window.__nextControl.requests.slice(count),
      envelope: window.__nextStudio.envelope,
    };
  });
  expect(rejected.error).toContain('Inclua primeiro a passagem 3');
  expect(rejected.requests).toEqual([]);
  expect(rejected.envelope).toEqual(before);
  expect(await saved(page)).toEqual(before);
  await page.evaluate((id) => window.__nextStudio.setSelectedId(id), first);
  await expect(page.getByTestId('passage')).toHaveText(first);
  const preview = await page.evaluate(() => window.__nextStudio.sourcePreview());
  expect(preview.pendingDraftId).toBe(first);
  expect(preview.targetPassageId).toBe(first.replace('pending:', 'passage:'));
  const requests = await page.evaluate(() =>
    window.__nextControl.requests.filter((request) => request.method === 'source_new_preview'),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].params).toMatchObject({ passageId: first, raw: 'first_line' });
  expect((await page.evaluate(() => window.__nextStudio.envelope)).drafts[second]).toEqual(
    before.drafts[second],
  );
});

test('one click opens an ordinary empty next-passage workspace at the last edited book location', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await contextFields(page);
  await page.getByLabel('Página impressa da passagem', { exact: true }).fill('26–27');
  await page.getByLabel('Fólio da passagem', { exact: true }).fill('13v');
  await page.getByLabel('Seção da passagem', { exact: true }).fill('Doutrina');
  await page.getByLabel('Subseção da passagem', { exact: true }).fill('Orações');
  await page.getByLabel('Linhas no texto da passagem', { exact: true }).fill('10–15');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Leitura anterior');
  await page.locator('.add-next-passage').click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0003');
  await expect(page.locator('.new-passage-badge')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Árvore', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('combobox', { name: 'Adicionar peça: buscar em tupi', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-canvas-key]')).toHaveCount(0);
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Leitura normalizada', exact: true })).toHaveValue(
    '',
  );
  await contextFields(page);
  for (const [label, value] of [
    ['Página impressa', '26–27'],
    ['Fólio', '13v'],
    ['Seção', 'Doutrina'],
    ['Subseção', 'Orações'],
    ['Linhas no texto', ''],
  ])
    await expect(page.getByLabel(`${label} da passagem`, { exact: true })).toHaveValue(value);
  await expect(
    page.getByRole('button', { name: 'Revisar nova passagem', exact: true }),
  ).toBeDisabled();
  const id = await selectedId(page);
  expect(id).toMatch(/^pending:[a-f0-9-]{36}$/);
  await expect.poll(async () => (await saved(page)).drafts[id]?.raw).toBe('');
  const envelope = await saved(page);
  expect(envelope.drafts[id]).toMatchObject({
    pending: { previousPassageId: 'passage-b', ordinal: 3 },
    canvas: { layout: 'bottom-up', fragments: [], positions: {} },
  });
  expect(envelope.drafts['passage-b'].diplomatic).toBe('Leitura anterior');
  const requests = await page.evaluate(() => window.__nextControl.requests);
  expect(
    requests.filter((request) =>
      /^(source_.*preview|source_apply|reference_approve|ai_)/.test(request.method),
    ),
  ).toEqual([]);
  expect(
    [...requests].reverse().find((request) => request.method === 'evidence_status')!.params,
  ).toMatchObject({
    passageId: id.replace('pending:', 'passage:'),
    previousPassageId: 'passage-b',
    newPassageGuide: true,
  });
});

test('repeated pending passages inherit cumulative locators, retain normal undo, and reopen the selected shell', async ({
  page,
}) => {
  await workspace(page);
  await page.locator('.add-next-passage').click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0003');
  const first = await selectedId(page);
  await contextFields(page);
  await page.getByLabel('Página impressa da passagem', { exact: true }).fill('28');
  await page.getByLabel('Seção da passagem', { exact: true }).fill('Novo capítulo');
  await page.getByLabel('Subseção da passagem', { exact: true }).fill('Perguntas');
  await page
    .getByRole('textbox', { name: 'Leitura normalizada', exact: true })
    .fill('Leitura só desta linha');
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Leitura normalizada', exact: true })).toHaveValue(
    '',
  );
  await page.getByRole('button', { name: 'Refazer edição na árvore', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Leitura normalizada', exact: true })).toHaveValue(
    'Leitura só desta linha',
  );
  await page.locator('.add-next-passage').click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0004');
  const second = await selectedId(page);
  expect(second).not.toBe(first);
  await expect(page.getByRole('textbox', { name: 'Leitura normalizada', exact: true })).toHaveValue(
    '',
  );
  await contextFields(page);
  await expect(page.getByLabel('Página impressa da passagem', { exact: true })).toHaveValue('28');
  await expect(page.getByLabel('Seção da passagem', { exact: true })).toHaveValue('Novo capítulo');
  await expect(page.getByLabel('Subseção da passagem', { exact: true })).toHaveValue('Perguntas');
  await expect
    .poll(async () => (await saved(page)).drafts[second]?.pending?.previousPassageId)
    .toBe(first);
  await page.reload();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0004');
  await expect(
    page.getByRole('combobox', { name: 'Adicionar peça: buscar em tupi', exact: true }),
  ).toBeVisible();
  expect(await selectedId(page)).toBe(second);
  await contextFields(page);
  await expect(page.getByLabel('Subseção da passagem', { exact: true })).toHaveValue('Perguntas');
  const envelope = await saved(page);
  expect(envelope.drafts[first].normalized).toBe('Leitura só desta linha');
  expect(Object.keys(envelope.drafts).filter((key) => key.startsWith('pending:'))).toHaveLength(2);
});

test('simulated pending source preview is revision-bound and migrates the exact draft only after explicit apply', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html');
  await expect(page.getByTestId('project')).toHaveText('simulated:a');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const pendingId = await page.evaluate(() => window.__nextStudio.createPendingDraft()!);
  await expect(page.getByTestId('passage')).toHaveText(pendingId);
  await page.evaluate(() =>
    window.__nextStudio.edit({
      raw: 'new_expression',
      notes: 'Nota local preservada',
      locators: { printedPage: '29', section: 'Capítulo', subsection: 'Final', line: '3–4' },
      canvas: {
        layout: 'bottom-up',
        fragments: [{ id: 'loose', raw: 'beta', x: 30, y: 40 }],
        positions: {},
      },
    }),
  );
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:new_expression');
  await page.evaluate(async () => {
    window.__nextControl.preview = await window.__nextStudio.sourcePreview();
  });
  const targetId = pendingId.replace('pending:', 'passage:');
  const request = await page.evaluate(() =>
    [...window.__nextControl.requests]
      .reverse()
      .find((request) => request.method === 'source_new_preview'),
  );
  expect(request!.params).toMatchObject({
    passageId: pendingId,
    newPassageId: targetId,
    sourceId: 'araujo_catecismo_1686',
    raw: 'new_expression',
    metadata: {
      printedPage: '29',
      section: 'Capítulo',
      subsection: 'Final',
      notes: 'Nota local preservada',
    },
  });
  await page.evaluate(() => window.__nextStudio.edit({ notes: 'Nota após prévia' }));
  const failure = await page.evaluate(async () => {
    try {
      await window.__nextStudio.applySource(window.__nextControl.preview!);
      return '';
    } catch (error) {
      return String(error);
    }
  });
  expect(failure).toContain('rascunho mudou');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((request) => request.method === 'source_apply'),
    ),
  ).toBe(false);
  await page.evaluate(async () => {
    const studio = window.__nextStudio;
    const preview = await studio.sourcePreview();
    window.__nextControl.applyResult = {
      ...window.__nextControl.project,
      passages: [
        ...window.__nextControl.project.passages,
        {
          ...studio.passage,
          id: preview.targetPassageId!,
          sourceExpression: studio.draft!.raw!,
          sourceFingerprint: 'new-source-fingerprint',
          acceptedReference: null,
        },
      ],
    };
    await studio.applySource(preview);
    await window.__nextStudio.persist();
  });
  await expect(page.getByTestId('passage')).toHaveText(targetId);
  const state = await page.evaluate(() => window.__nextStudio.envelope);
  expect(state.drafts[pendingId]).toBeUndefined();
  expect(state.drafts[targetId]).toMatchObject({
    raw: 'new_expression',
    notes: 'Nota após prévia',
    sourceFingerprint: 'new-source-fingerprint',
    canvas: { layout: 'bottom-up', fragments: [{ id: 'loose', raw: 'beta', x: 30, y: 40 }] },
  });
  expect(state.drafts[targetId].pending).toBeUndefined();
  expect(await page.evaluate(() => window.__nextStudio.passage.acceptedReference)).toBeNull();
});

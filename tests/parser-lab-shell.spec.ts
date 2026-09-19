import { expect, test } from '@playwright/test';

/** The solver lives in the editor tabs, beside the tree it feeds.
 *  Real analysis and engine morphology are covered by tests/parser-lab.spec.ts. */
async function workspace(page: import('@playwright/test').Page) {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByRole('button', { name: 'Aprender', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
}

async function labRequests(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    window.__nextControl.requests
      .map((request) => request.method)
      .filter((method) => method.startsWith('parser_lab_')),
  );
}

test('the solver is a tab in the editor, not hidden behind a setting', async ({ page }) => {
  await workspace(page);
  // No switch to find: it sits with the other projections of this passage.
  await expect(page.getByRole('tab', { name: 'Sugerir', exact: true })).toBeVisible();
  expect(await labRequests(page)).toEqual([]);
});

test('opening the tab reads state only and starts nothing', async ({ page }) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Sugerir uma análise/ })).toBeVisible();
  await expect.poll(() => labRequests(page)).toEqual(['parser_lab_status']);
});

test('without an index the tab offers preparation instead of failing', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByRole('button', { name: 'Aprender', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const status = window.__nextControl.responses.parser_lab_status as Record<string, unknown>;
    window.__nextControl.responses.parser_lab_status = { ...status, artifacts: [], active: {} };
  });
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  // Preparation is offered, never performed on its own.
  await expect(page.getByRole('button', { name: /Preparar índice/ })).toBeVisible();
  await expect(page.getByTestId('solver-analyse')).toBeDisabled();
  expect(await labRequests(page)).toEqual(['parser_lab_status']);
});

test('the input starts from the passage transcription', async ({ page }) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  const transcription = await page.evaluate(
    () => window.__nextControl.project.passages[0].normalized,
  );
  if (transcription) await expect(page.getByTestId('solver-input')).toHaveValue(transcription);
  await page.getByTestId('solver-input').fill('Asó xe rokype');
  await expect(page.getByTestId('solver-normalized')).toContainText('asoxerokype');
});

test('the full laboratory opens from the tab and closing returns to the editor', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByRole('button', { name: 'Laboratório', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao trabalho' }).click();
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Sugerir uma análise/ })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((request) =>
        /source_apply|reference_approve/.test(request.method),
      ),
    ),
  ).toBe(false);
});

test('a chosen reading goes into the draft and undo takes it back', async ({ page }) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Pydicate editável', exact: true });
  const before = await editor.inputValue();
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByTestId('solver-input').fill('sapépe');
  await page.getByTestId('solver-analyse').click();

  // Both readings are offered; the form does not decide between them.
  const candidates = page.getByTestId('solver-candidates');
  await expect(candidates.locator('li')).toHaveCount(2);
  await expect(page.getByTestId('solver-status')).toContainText('2 leituras válidas');

  // Take the second one into the draft this passage is working on.
  await candidates.locator('li').nth(1).locator('button').first().click();
  await page.getByTestId('solver-use-1').click();
  await expect(page.getByTestId('solver-imported')).toBeVisible();

  // The reading is now the expression this passage is being built from.
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await expect(editor).toHaveValue('(pe * (ae * apé))');

  // It is an ordinary draft edit: undo restores what was there.
  await page.getByRole('tab', { name: 'Árvore', exact: true }).click();
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await expect(editor).toHaveValue(before);

  // The choice is recorded, and nothing was published or approved.
  const calls = await labRequests(page);
  expect(calls).toContain('parser_lab_judgment');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((request) =>
        /source_apply|reference_approve/.test(request.method),
      ),
    ),
  ).toBe(false);
});

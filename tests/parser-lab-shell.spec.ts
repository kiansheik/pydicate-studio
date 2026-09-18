import { expect, test } from '@playwright/test';

/** The hidden tab inside the real App shell, over the simulated bridge.
 *  Real analysis and engine morphology are covered by tests/parser-lab.spec.ts. */
async function workspace(page: import('@playwright/test').Page) {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByTestId('project')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aprender', exact: true })).toBeVisible();
}

async function labRequests(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    window.__nextControl.requests
      .map((request) => request.method)
      .filter((method) => method.startsWith('parser_lab_')),
  );
}

test('the laboratory is absent by default and opening Studio never calls it', async ({ page }) => {
  await workspace(page);
  await expect(page.getByTestId('parser-lab-open')).toHaveCount(0);
  expect(await labRequests(page)).toEqual([]);
});

test('the experimental switch reveals the tab and survives a reload', async ({ page }) => {
  await workspace(page);
  await page.getByRole('button', { name: 'Informações do projeto' }).click();
  await expect(page.getByTestId('parser-lab-switch')).not.toBeChecked();
  expect(await labRequests(page)).toEqual([]);
  await page.getByTestId('parser-lab-switch').check();
  await expect(page.getByTestId('parser-lab-open')).toBeVisible();
  // Revealing the entry point alone still starts nothing.
  expect(await labRequests(page)).toEqual([]);
  await page.reload();
  await expect(page.getByTestId('parser-lab-open')).toBeVisible();
  expect(await labRequests(page)).toEqual([]);
});

test('opening the laboratory reads state only, and closing restores the workspace', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('button', { name: 'Informações do projeto' }).click();
  await page.getByTestId('parser-lab-switch').check();
  await page.getByRole('button', { name: 'Fechar informações' }).click();
  await page.getByTestId('parser-lab-open').click();
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toBeVisible();
  await expect(page.getByTestId('lab-artifacts')).toContainText('Nenhum índice ativo');
  await expect.poll(() => labRequests(page)).toEqual(['parser_lab_status']);
  await page.getByRole('button', { name: 'Dados' }).click();
  await page.getByTestId('lab-start-prepare').click();
  await expect
    .poll(() => labRequests(page))
    .toEqual(['parser_lab_status', 'parser_lab_job_start', 'parser_lab_status']);
  await page.getByRole('button', { name: 'Voltar ao trabalho' }).click();
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aprender', exact: true })).toBeVisible();
});

test('turning the switch off hides the tab again without touching the workspace', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('button', { name: 'Informações do projeto' }).click();
  await page.getByTestId('parser-lab-switch').check();
  await page.getByTestId('parser-lab-switch').uncheck();
  await expect(page.getByTestId('parser-lab-open')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('parser-lab-open')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((request) =>
        /source_apply|reference_approve/.test(request.method),
      ),
    ),
  ).toBe(false);
});

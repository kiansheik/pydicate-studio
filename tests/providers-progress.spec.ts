import { expect, test } from '@playwright/test';

test('AI UI distinguishes context, accepted request and reasoning, cancels and never auto-retries', async ({
  page,
}) => {
  await page.goto('/tests/providers-harness.html');
  await expect(page.getByRole('combobox', { name: 'Esforço de raciocínio' })).toHaveValue('medium');
  await page.getByRole('button', { name: 'Solicitar assistência' }).click();
  await expect(page.getByText('Lendo o contexto local…', { exact: false })).toBeVisible();
  await page.evaluate(() => window.__providerHarness.phase('provider_wait'));
  await expect(
    page.getByText('Solicitação aceita; aguardando resposta…', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Obtendo contexto da fonte e do MCP…')).toHaveCount(0);
  await page.evaluate(() => window.__providerHarness.phase('provider_reasoning'));
  await expect(page.getByText('O provedor está analisando…', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByText('Cancelada', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solicitar assistência' })).toBeEnabled();
  await page.waitForTimeout(1100);
  expect(
    await page.evaluate(
      () => window.__providerHarness.calls.filter((call) => call === 'ai_start').length,
    ),
  ).toBe(1);
});

test('Translation defaults to the visible full passage despite a partial tree selection', async ({
  page,
}) => {
  await page.goto('/tests/providers-harness.html');
  await expect(page.getByRole('combobox', { name: 'Escopo da solicitação' })).toHaveValue(
    'passage',
  );
  await expect(page.getByLabel('Expressão enviada para análise')).toHaveText(
    'first_constituent + second_constituent + final_constituent',
  );
  await page.getByRole('button', { name: 'Solicitar assistência' }).click();
  const context = await page.evaluate(() => window.__providerHarness.request()?.context);
  expect(context?.scope).toBe('passage');
  expect(context?.raw).toBe('first_constituent + second_constituent + final_constituent');
  expect(context?.selectedNode).toBe(null);
});

test('Partial translation requires an explicit scope and does not claim to replace the passage', async ({
  page,
}) => {
  await page.goto('/tests/providers-harness.html');
  await page.getByRole('combobox', { name: 'Escopo da solicitação' }).selectOption('constituent');
  await expect(page.getByLabel('Expressão enviada para análise')).toHaveText('first_constituent');
  await expect(
    page.getByText('Uma tradução parcial não substitui a tradução da passagem.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar assistência' }).click();
  const context = await page.evaluate(() => window.__providerHarness.request()?.context);
  expect(context?.scope).toBe('constituent');
  expect(context?.raw).toContain('final_constituent');
  expect(context?.selectedNode).toMatchObject({ code: 'first_constituent' });
});

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

test('quick tree translation previews a local prompt and adopts only a reviewed language result', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/tests/providers-harness.html?translation');
  await expect(page.getByLabel('Idioma da tradução')).toHaveValue('Português');
  await page.getByLabel('Idioma da tradução').fill('English');
  await page.getByRole('button', { name: 'Gerar prompt de tradução' }).click();
  await expect(page.getByTestId('translation-prompt')).toContainText('final_constituent');
  await page.getByRole('button', { name: 'Copiar prompt', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('language: English');
  expect(
    await page.evaluate(() =>
      window.__providerHarness.calls.filter((method) =>
        ['ai_start', 'ai_configure'].includes(method),
      ),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Traduzir', exact: true }).click();
  const request = await page.evaluate(() => window.__providerHarness.request());
  expect(request?.context).toMatchObject({
    targetLanguage: 'English',
    scope: 'passage',
    selectedNode: null,
    diplomatic: '',
  });
  await page.evaluate(() => window.__providerHarness.complete());
  await expect(page.getByText('Tradução · English', { exact: true })).toBeVisible();
  await page.getByText('Leitura e alternativas', { exact: true }).click();
  await expect(
    page.getByText('Literal reading and possible alternatives.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copiar tradução para revisão', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Tradução humana preservada')).toHaveText('Minha tradução humana.');
  await page.getByRole('button', { name: 'Revisar tradução', exact: true }).click();
  await expect(page.getByText('Tradução atual do rascunho', { exact: true })).toBeVisible();
  await expect(page.locator('.assistant-candidate')).toContainText(
    'My previous English translation.',
  );
  await page.getByLabel('Sugestão revisada').fill('My reviewed translation.');
  await page.getByRole('button', { name: 'Aceitar no rascunho', exact: true }).click();
  await expect(page.getByLabel('Tradução em inglês')).toHaveText('My reviewed translation.');
  await expect(page.getByLabel('Tradução humana preservada')).toHaveText('Minha tradução humana.');
  await expect(page.getByLabel('Tradução em português')).toHaveText('Minha tradução em português.');
});

test('quick translation discards delayed prompts and prevents applying results to a changed tree or engine', async ({
  page,
}) => {
  await page.goto('/tests/providers-harness.html?translation&delayed');
  await page.getByRole('button', { name: 'Gerar prompt de tradução' }).click();
  await page.evaluate(() => window.__providerHarness.changeTree());
  await page.evaluate(() => window.__providerHarness.releasePreview());
  await expect(page.getByTestId('translation-prompt')).toHaveCount(0);
  await page.getByRole('button', { name: 'Traduzir', exact: true }).click();
  await page.evaluate(() => window.__providerHarness.complete());
  await page.getByRole('button', { name: 'Revisar tradução', exact: true }).click();
  await page.evaluate(() => window.__providerHarness.changeEngine());
  await expect(
    page.getByRole('button', { name: 'Aceitar no rascunho', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('A gramática mudou ou não foi registrada.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copiar tradução para revisão', exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      window.__providerHarness.calls.filter((method) => method === 'ai_accept'),
    ),
  ).toEqual([]);
  await expect(page.getByLabel('Tradução humana preservada')).toHaveText('Minha tradução humana.');
});

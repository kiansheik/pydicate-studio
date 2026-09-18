import { expect, test } from '@playwright/test';

test('human translation is editable before analysis, preserved on acceptance and explicitly replaceable afterward', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  const translation = page.getByLabel('Tradução em português', { exact: true });
  await translation.fill('Minha tradução inicial.');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Abá.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  const suggestion = page.getByRole('region', { name: 'Tradução sugerida' });
  await expect(suggestion).toContainText('Pessoa: tradução sugerida pela fixture.');
  await expect(suggestion).toContainText('Hipótese para revisão humana.');
  await suggestion.screenshot({ path: test.info().outputPath('candidate-translation.png') });
  await page.getByRole('tab', { name: 'Fonte', exact: true }).click();
  await expect(translation).toHaveValue('Minha tradução inicial.');
  await page.getByRole('tab', { name: /^IA/ }).click();
  await page.getByRole('button', { name: 'Usar no rascunho', exact: true }).click();
  await page.getByRole('tab', { name: 'Fonte', exact: true }).click();
  await expect(translation).toHaveValue('Minha tradução inicial.');
  await page.getByRole('tab', { name: /^IA/ }).click();
  await page
    .getByRole('button', { name: 'Substituir minha tradução por esta', exact: true })
    .click();
  await expect(translation).toHaveValue('Pessoa: tradução sugerida pela fixture.');
  await translation.fill('Pessoa; tradução revisada por mim.');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextControl.saved['simulated:a'].drafts['passage-a'].translation,
      ),
    )
    .toBe('Pessoa; tradução revisada por mim.');
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.filter((request) => request.method === 'analysis_submit')
          .length,
    ),
  ).toBe(1);
  await page.reload();
  await expect(translation).toHaveValue('Pessoa; tradução revisada por mim.');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
});

test('using a proposal and translation together avoids a stale draft and saves both without another AI request', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Abá.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await page.getByRole('button', { name: 'Usar proposta e tradução', exact: true }).click();
  await expect(page.getByLabel('Tradução em português', { exact: true })).toHaveValue(
    'Pessoa: tradução sugerida pela fixture.',
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draft = window.__nextControl.saved['simulated:a'].drafts['passage-a'];
        return { raw: draft.raw, translation: draft.translation };
      }),
    )
    .toEqual({ raw: 'beta', translation: 'Pessoa: tradução sugerida pela fixture.' });
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.filter((request) => request.method === 'analysis_submit')
          .length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.filter((request) => request.method === 'analysis_accept')
          .length,
    ),
  ).toBe(1);
});

import { expect, test } from '@playwright/test';

test('independent PT and EN translations autosave, reopen and clear without changing legacy text', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti umẽ');
  const pt = page.getByLabel('Tradução em português', { exact: true }).first();
  const en = page.getByLabel('Tradução em inglês', { exact: true }).first();
  await pt.fill('  Primeira linha.\n\nSegunda linha.  ');
  await en.fill('First line.\nSecond line.');
  const key = 'pydicate-studio:drafts:v1:example:araujo-0067';
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).drafts['example:araujo-0067'].translations,
        key,
      ),
    )
    .toEqual({ pt: '  Primeira linha.\n\nSegunda linha.  ', en: 'First line.\nSecond line.' });
  await page.reload();
  await expect(pt).toHaveValue('  Primeira linha.\n\nSegunda linha.  ');
  await expect(en).toHaveValue('First line.\nSecond line.');
  await pt.fill('');
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).drafts['example:araujo-0067'],
        key,
      ),
    )
    .toMatchObject({ translation: '', translations: { pt: '', en: 'First line.\nSecond line.' } });
  await en.scrollIntoViewIfNeeded();
  await expect(en).toBeVisible();
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti umẽ');
  await page.screenshot({ path: 'test-results/independent-translations.png', fullPage: true });
});

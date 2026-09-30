import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/shared-tree-navigation-harness.html');
  await expect(page.getByRole('tab', { name: 'Passagem', exact: true })).toBeVisible();
});

test('exact shared-tree restoration preserves a dirty tab and only user actions emit navigation', async ({
  page,
}) => {
  await page.evaluate(() => window.treeNavigationFixture.restore('first'));
  const tab = page.getByRole('tab', { name: 'enosem', exact: true });
  const editor = page.getByLabel('Expressão da árvore compartilhada', { exact: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveValue('1');
  await page.locator('summary').filter({ hasText: 'Expressão da árvore compartilhada' }).click();
  await editor.fill('2');
  await page.evaluate(() => window.treeNavigationFixture.restore(null));
  await expect(editor).toBeHidden();
  await page.evaluate(() => window.treeNavigationFixture.restore('first'));
  await expect(editor).toHaveValue('2');
  expect(await page.evaluate(() => window.treeNavigationFixture.events)).toEqual([]);
  const inspection = await page.evaluate(() =>
    window.treeNavigationFixture.calls.find((item) => item.method === 'lexicon_inspect'),
  );
  expect(inspection?.params.declarationTarget).toEqual({
    name: 'enosem',
    declarationSourceId: 'lexicon',
    declarationLine: 12,
    declarationId: 'enosem:12',
  });
  await page.getByRole('tab', { name: 'Passagem', exact: true }).click();
  await tab.click();
  await page.getByRole('button', { name: 'Fechar aba enosem', exact: true }).click();
  expect(await page.evaluate(() => window.treeNavigationFixture.events)).toEqual([
    null,
    { name: 'enosem', sourceId: 'lexicon', line: 12, declarationId: 'enosem:12' },
    null,
  ]);
  expect(
    await page.evaluate(() =>
      window.treeNavigationFixture.calls.filter((item) =>
        /apply|preview|analysis_submit/.test(item.method),
      ),
    ),
  ).toEqual([]);
});

test('a stale declaration URL reports the mismatch instead of opening the same name at another line', async ({
  page,
}) => {
  await page.evaluate(() => window.treeNavigationFixture.restore('stale'));
  await expect(page.getByRole('alert')).toContainText('A definição deste link mudou');
  await expect(page.getByLabel('Expressão da árvore compartilhada', { exact: true })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => window.treeNavigationFixture.events)).toEqual([]);
});

test('a delayed declaration cannot steal focus from a later same-name target', async ({ page }) => {
  await page.evaluate(() => {
    window.treeNavigationFixture.delay();
    window.treeNavigationFixture.restore('first');
  });
  await expect(page.getByText('Abrindo a árvore de enosem…')).toBeVisible();
  await page.evaluate(() => window.treeNavigationFixture.restore('shadow'));
  await expect(page.getByLabel('Expressão da árvore compartilhada', { exact: true })).toHaveValue(
    '1',
  );
  await page.evaluate(() => window.treeNavigationFixture.release());
  await expect(page.getByLabel('Expressão da árvore compartilhada', { exact: true })).toHaveCount(
    2,
  );
  const tabs = page.getByRole('tab', { name: 'enosem', exact: true });
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.treeNavigationFixture.events)).toEqual([]);
});

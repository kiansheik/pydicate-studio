import { expect, test } from '@playwright/test';

// The rest of the suite runs with the secondary tools switched on; this file covers the
// desk a reader actually meets on a first install.
test.use({ storageState: { cookies: [], origins: [] } });

test('the default desk hides the tools the usage log shows going unused', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti umẽ');

  await expect(page.getByRole('tab', { name: 'Árvore', exact: true })).toBeVisible();
  for (const hidden of ['Construção', 'Morfemas', 'Histórico', 'Código'])
    await expect(page.getByRole('tab', { name: hidden, exact: true })).toHaveCount(0);
  for (const mode of ['Revisar', 'Contribuir uma leitura'])
    await expect(page.getByRole('button', { name: mode, exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Janelas do espaço de trabalho')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aprender', exact: true })).toHaveCount(0);
});

test('the overflow menu keeps the hidden entry points reachable and restores them', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti umẽ');

  await page.getByRole('button', { name: 'Mais ferramentas' }).click();
  const menu = page.getByRole('menu', { name: 'Mais ferramentas' });
  await expect(menu.getByRole('menuitem', { name: 'Aprender' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Atividade' })).toBeVisible();

  await menu.getByRole('checkbox', { name: 'Ferramentas avançadas' }).check();
  await expect(page.getByRole('tab', { name: 'Código', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar', exact: true })).toBeVisible();
  await expect(page.getByLabel('Janelas do espaço de trabalho')).toBeVisible();
  // The preference survives a reload rather than living only in this window.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Código', exact: true })).toBeVisible();
});

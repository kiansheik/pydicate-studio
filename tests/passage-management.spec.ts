import { expect, test } from '@playwright/test';
test.use({ storageState: { cookies: [], origins: [] } });

test('admin organizes, duplicates, deletes, restores and reloads on a cramped screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/tests/next-hook-harness.html?workspace&collaborative&passage-admin');
  await page
    .getByRole('navigation', { name: 'Navegar entre janelas' })
    .getByRole('button', { name: 'Passagens', exact: true })
    .click();
  await page.getByRole('button', { name: 'Organizar passagens', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Organizar passagens' });
  await modal.getByLabel('Passagem', { exact: true }).selectOption('passage-a');
  await modal.getByRole('button', { name: '↓ Descer', exact: true }).click();
  await expect(modal.locator('option').first()).toHaveAttribute('value', 'passage-b');
  await modal.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expect(modal.locator('option')).toHaveCount(3);
  const copyId = await modal.locator('option').last().getAttribute('value');
  await modal.getByLabel('Passagem', { exact: true }).selectOption(copyId!);
  await modal.getByRole('button', { name: 'Excluir da lista', exact: true }).click();
  await expect(modal.locator('option')).toHaveCount(2);
  await modal.getByText('Excluídas (1)', { exact: true }).click();
  await modal.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(modal.locator('option')).toHaveCount(3);
  await modal.getByLabel('Passagem', { exact: true }).selectOption('passage-a');
  await modal.getByRole('button', { name: 'Excluir da lista', exact: true }).click();
  await expect(modal.locator('option')).toHaveCount(2);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Navegar entre janelas' })
    .getByRole('button', { name: 'Passagens', exact: true })
    .click();
  await expect(page.locator('.passage-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Organizar passagens', exact: true }).click();
  await modal.getByText('Excluídas (1)', { exact: true }).click();
  await modal.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(modal.locator('option')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('contributors do not receive passage management controls', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace&collaborative');
  await expect(page.locator('.passage-item')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Organizar passagens' })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

test('dock movement, collapse and maximization preserve mounted editors and persist preferences', async ({
  page,
}) => {
  await page.goto('/tests/workspace-harness.html');
  await page.getByLabel('Draft editor').fill('keep this working text');
  await page.getByLabel('Draft source').fill('unsaved evidence fixture');
  await page.getByRole('combobox', { name: 'Posição de Fonte' }).selectOption('center');
  await expect(page.locator('[data-pane="source"]')).toHaveAttribute('data-position', 'center');
  await expect(page.locator('[data-pane="editor"]')).toHaveAttribute('data-position', 'right');
  await page.getByRole('button', { name: 'Recolher Fonte', exact: true }).click();
  await expect(page.getByLabel('Draft source')).toBeHidden();
  await page.getByRole('button', { name: 'Mostrar Fonte', exact: true }).click();
  await expect(page.getByLabel('Draft source')).toHaveValue('unsaved evidence fixture');
  await page.getByRole('button', { name: 'Maximizar Editor', exact: true }).click();
  await expect(page.getByLabel('Draft source')).toBeHidden();
  await expect(page.getByLabel('Draft editor')).toHaveValue('keep this working text');
  await page.getByRole('button', { name: 'Restaurar Editor', exact: true }).click();
  const leftBorder = page.getByRole('separator', { name: 'Redimensionar Esquerda' });
  const borderBox = (await leftBorder.boundingBox())!;
  await page.mouse.move(borderBox.x + borderBox.width / 2, borderBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(borderBox.x + borderBox.width / 2 + 30, borderBox.y + 100, { steps: 4 });
  await page.mouse.up();
  await expect(leftBorder).toHaveAttribute('aria-valuenow', '250');
  await page.getByRole('combobox', { name: 'Posição de Passagens' }).selectOption('bottom');
  const separator = page.getByRole('separator', { name: 'Redimensionar Abaixo' });
  await separator.focus();
  await page.keyboard.press('ArrowUp');
  await expect(separator).toHaveAttribute('aria-valuenow', '290');
  expect(await page.evaluate(() => window.__workspaceMounts)).toEqual({
    navigator: 1,
    editor: 1,
    source: 1,
  });
  await page.reload();
  await expect(page.locator('[data-pane="source"]')).toHaveAttribute('data-position', 'center');
  await expect(page.locator('[data-pane="navigator"]')).toHaveAttribute('data-position', 'bottom');
  await expect(page.getByRole('separator', { name: 'Redimensionar Abaixo' })).toHaveAttribute(
    'aria-valuenow',
    '290',
  );
  await page.getByRole('button', { name: 'Restaurar disposição' }).click();
  await expect(page.locator('[data-pane="source"]')).toHaveAttribute('data-position', 'right');
});

test('titlebar drag docks a pane and narrow layouts expose every pane without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/tests/workspace-harness.html');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page
    .locator('[data-pane="source"] .workspace-pane-title')
    .dispatchEvent('dragstart', { dataTransfer });
  await page.locator('[data-dock="bottom"]').dispatchEvent('drop', { dataTransfer });
  await expect(page.locator('[data-pane="source"]')).toHaveAttribute('data-position', 'bottom');
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.getByLabel('Draft editor')).toBeVisible();
  await expect(page.getByLabel('Draft source')).toBeHidden();
  await page.getByRole('button', { name: 'Mostrar Fonte', exact: true }).click();
  await expect(page.getByLabel('Draft source')).toBeVisible();
  await expect(page.getByLabel('Draft editor')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.__workspaceMounts)).toEqual({
    navigator: 1,
    editor: 1,
    source: 1,
  });
});

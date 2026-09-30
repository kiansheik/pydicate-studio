import { expect, test } from '@playwright/test';

// The rest of the suite runs with the secondary tools switched on; this file covers the
// desk a reader actually meets on a first install.
test.use({ storageState: { cookies: [], origins: [] } });

test('the default desk keeps secondary tools behind the advanced preference', async ({ page }) => {
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

test('basic mode restores access to saved hidden panes without changing the saved layout', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'pydicate-studio:workspace:v2',
      JSON.stringify({
        version: 2,
        supportTab: 'source',
        positions: { navigator: 'bottom', editor: 'center', source: 'right' },
        hidden: { navigator: true, editor: false, source: true },
        maximized: null,
        sizes: { left: 220, right: 400, bottom: 280 },
      }),
    ),
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Janela Passagens', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Janela Fonte', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Recolher / })).toHaveCount(0);
  await expect(page.getByLabel('Posição de Passagens')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mais ferramentas' }).click();
  await page.getByRole('checkbox', { name: 'Ferramentas avançadas' }).check();
  await expect(page.locator('[data-pane="navigator"]')).toBeHidden();
  await expect(page.locator('[data-pane="navigator"]')).toHaveAttribute('data-position', 'bottom');
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 800, height: 600 },
  { width: 640, height: 480 },
]) {
  test(`passages remain clickable and scroll vertically at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    if (viewport.width <= 1100) {
      const nav = page.getByRole('navigation', { name: 'Navegar entre janelas' });
      await nav.getByRole('button', { name: 'Passagens', exact: true }).click();
    }
    const list = page.locator('.passage-list');
    const bounds = (await list.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(100);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    const last = list.locator('.passage-item').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await last.click();
    await expect(last).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: testInfo.outputPath(`passages-${viewport.width}.png`) });
    expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (viewport.width <= 1100) {
      const nav = page.getByRole('navigation', { name: 'Navegar entre janelas' });
      await nav.getByRole('button', { name: 'Editor', exact: true }).click();
      await expect(page.locator('[data-pane="editor"]')).toBeVisible();
      await nav.getByRole('button', { name: 'Fonte', exact: true }).click();
      await expect(page.locator('[data-pane="source"]')).toBeVisible();
    }
  });
}

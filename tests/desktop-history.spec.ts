import { expect, test } from '@playwright/test';

test('administrator reads preserved conversations and unfinished messages without starting a provider', async ({
  page,
}) => {
  const requests: string[] = [];
  const entry = {
    snapshot: 'a'.repeat(64),
    path: 'files/analysis/records/one.json',
    kind: 'conversation',
    section: 'conversations',
    recordId: 'one',
    title: 'Conversa',
    sourceId: 'fonte',
    ordinal: 3,
    originalPassageId: 'old:1',
    passageId: 'passage:current',
  };
  await page.route('**/api/**', async (route) => {
    requests.push(route.request().method() + ' ' + route.request().url());
    const url = new URL(route.request().url());
    if (url.pathname === '/api/desktop-history') {
      await route.fulfill({
        json: { archives: [{}], entries: [entry], total: 1, nextCursor: null },
      });
    } else if (url.pathname === '/api/desktop-history/item') {
      await route.fulfill({
        json: {
          entry,
          data: {
            composer: 'Minha orientação ainda não enviada',
            turns: [
              { role: 'user', text: 'Como analisar esta fonte?' },
              { role: 'assistant', text: 'Resposta <img src=x onerror=alert(1)> preservada' },
            ],
          },
          relatedFiles: [],
        },
      });
    } else await route.abort();
  });
  await page.goto('/tests/desktop-history-harness.html');
  await page.getByRole('button', { name: 'Histórico do desktop', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico do desktop' });
  await expect(dialog.getByRole('status')).toContainText('1 registro(s)');
  await dialog.getByRole('button', { name: /Conversa/ }).click();
  await expect(
    dialog.getByText('Minha orientação ainda não enviada', { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText('Resposta <img src=x onerror=alert(1)> preservada', { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(0);
  await expect(
    dialog.getByRole('link', { name: 'Baixar arquivo original completo' }),
  ).toHaveAttribute('href', /desktop-history\/file/);
  await dialog.getByLabel('Passagens do histórico').selectOption('all');
  await expect.poll(() => requests.length).toBe(3);
  expect(
    requests.every(
      (request) => request.startsWith('GET ') && request.includes('/api/desktop-history'),
    ),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('contributor UI does not expose private desktop research history', async ({ page }) => {
  await page.goto('/tests/desktop-history-harness.html?role=contributor');
  await expect(page.getByRole('button', { name: 'Histórico do desktop' })).toHaveCount(0);
});

test('administrator explicitly restores a PDF buffer with mapped passage and current revision', async ({
  page,
}) => {
  const browserKey =
    'pydicate-studio:evidence-draft:v1:' + JSON.stringify(['desktop', 'fonte', 'old:1']);
  const buffer = {
    assetId: 'pdf:exact',
    revision: 2,
    regions: [{ id: 'r1', assetId: 'pdf:exact', pageIndex: 5, rect: [10, 20, 30, 40] }],
    view: { pageIndex: 5, zoom: 1, rotation: 0 },
    baseline: 'null',
  };
  const entry = {
    snapshot: 'a'.repeat(64),
    path: 'files/browser-storage.json',
    section: 'browserEntries',
    recordId: 'record',
    kind: 'pdf-buffer',
    title: 'Regiões e página do PDF no navegador',
    passageId: 'passage:current',
  };
  await page.addInitScript(() => {
    (window as unknown as { studio: unknown }).studio = {
      invoke: async (method: string, params: Record<string, unknown>) => {
        if (method !== 'evidence_status') throw new Error('Unexpected operation');
        return {
          ...params,
          revision: 10,
          asset: { id: 'pdf:exact', managedState: 'ok' },
          passage: null,
        };
      },
    };
  });
  await page.route('**/api/desktop-history**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/desktop-history')
      await route.fulfill({
        json: { archives: [{}], entries: [entry], total: 1, nextCursor: null },
      });
    else
      await route.fulfill({
        json: {
          entry,
          data: {
            browserKey,
            serialized: JSON.stringify(buffer),
            value: buffer,
            origin: 'studio://app',
          },
          relatedFiles: [],
          browserRestore: {
            projectId: 'hosted',
            sourceProjectId: 'desktop',
            passageMappings: { 'old:1': 'passage:current' },
          },
        },
      });
  });
  await page.goto('/tests/desktop-history-harness.html');
  await page.getByRole('button', { name: 'Histórico do desktop', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico do desktop' });
  await dialog.getByRole('button', { name: 'Regiões e página do PDF no navegador' }).click();
  await expect(dialog.getByText('Página 6', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Restaurar estas regiões neste navegador' }).click();
  await expect(dialog.getByText(/1 restaurado\(s\)/)).toBeVisible();
  const restored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        'pydicate-studio:evidence-draft:v1:' +
          JSON.stringify(['hosted', 'fonte', 'passage:current']),
      ) || 'null',
    ),
  );
  expect(restored.revision).toBe(10);
  expect(restored.regions).toEqual(buffer.regions);
});

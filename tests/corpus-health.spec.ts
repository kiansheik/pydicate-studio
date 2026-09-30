import { expect, test } from '@playwright/test';
test.use({ storageState: { cookies: [], origins: [] } });
test('top health button shows corpus issues and opens the exact saved line at 800x600', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/tests/next-hook-harness.html?workspace&collaborative');
  await page.evaluate(() => {
    window.__nextControl.responses.corpus_health = {
      activeRepairs: 0,
      checkedAt: '2026-09-30T10:00:00Z',
      durationMs: 450,
      totals: { sources: 1, lines: 2, divergent: 1, failures: 0, pending: 3, morphemes: 5 },
      sources: [
        {
          sourceId: 'araujo_catecismo_1686',
          title: 'Araújo',
          lines: 2,
          approved: 1,
          unreviewed: 1,
          pending: 3,
          divergent: 1,
          failed: 0,
          issues: [
            {
              ordinal: 2,
              passageId: 'passage-b',
              kind: 'divergent',
              expected: 'forma salva',
              actual: 'outra forma',
            },
          ],
        },
      ],
      interruptedRepairs: [],
    };
  });
  await page.getByRole('button', { name: 'Saúde do corpus', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Saúde do corpus' });
  await expect(dialog.getByRole('cell', { name: 'Araújo', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Referência: forma salva', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Resultado: outra forma', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Abrir linha 2' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0002');
  const requests = await page.evaluate(() => window.__nextControl.requests.map((r) => r.method));
  expect(
    requests.filter(
      (m) => m.startsWith('analysis_') && !['analysis_list', 'analysis_get'].includes(m),
    ),
  ).toEqual([]);
});
test('health reports an active repair without showing a misleading completed result', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&collaborative');
  await page.evaluate(() => {
    window.__nextControl.responses.corpus_health = { busy: true, activeRepairs: 1 };
  });
  await page.getByRole('button', { name: 'Saúde do corpus', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Saúde do corpus' });
  await expect(dialog).toContainText('Aguarde a conclusão');
  await expect(dialog.getByRole('table')).toHaveCount(0);
});

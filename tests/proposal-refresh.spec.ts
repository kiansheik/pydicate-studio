import { expect, test } from '@playwright/test';

test('inspection refreshes a changed local engine once and reuses the same acceptance command without another AI request', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Mendâra');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'analysis_accept' }));
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((item) => item.method === 'analysis_accept'),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    window.__nextControl.project.engineFingerprint = 'simulated:updated-grammar';
    window.__nextControl.reject(
      'analysis_accept',
      '[STUDIO:STALE_ENGINE] O corpus ou a gramática mudou.',
    );
  });
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
  await expect(page.getByRole('region', { name: 'Prévia da proposta de IA' })).toHaveCount(0);
  const trace = await page.evaluate(() => ({
    accepts: window.__nextControl.requests.filter((r) => r.method === 'analysis_accept'),
    refreshes: window.__nextControl.requests.filter((r) => r.method === 'refresh_project'),
    submissions: window.__nextControl.requests.filter((r) => r.method === 'analysis_submit'),
    draft: window.__nextControl.saved['simulated:a'].drafts['passage-a'],
  }));
  expect(trace.accepts).toHaveLength(2);
  expect(trace.accepts[1].params).toEqual(trace.accepts[0].params);
  expect(trace.refreshes).toHaveLength(1);
  expect(trace.submissions).toHaveLength(1);
  expect(trace.draft.raw).toBe('beta');
  expect(trace.draft.aiAcceptances).toHaveLength(1);
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextControl.requests.filter((r) => r.method === 'analysis_get').length,
      ),
    )
    .toBeGreaterThan(1);
  expect(
    await page.evaluate(
      () => window.__nextControl.requests.filter((r) => r.method === 'analysis_accept').length,
    ),
  ).toBe(2);
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Desfazer', exact: true })
    .click();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
});

test('a local version that keeps changing stops after one refresh and preserves the human draft', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Mendâra');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await page.evaluate(() =>
    window.__nextControl.holds.push({ method: 'analysis_accept' }, { method: 'analysis_accept' }),
  );
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__nextControl.pending.some((item) => item.method === 'analysis_accept'),
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      window.__nextControl.reject(
        'analysis_accept',
        '[STUDIO:STALE_ENGINE] A gramática mudou durante a verificação local.',
      ),
    );
  }
  await expect(
    page.getByText('A gramática mudou durante a verificação local.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  const trace = await page.evaluate(() => ({
    accepts: window.__nextControl.requests.filter((r) => r.method === 'analysis_accept').length,
    refreshes: window.__nextControl.requests.filter((r) => r.method === 'refresh_project').length,
    submissions: window.__nextControl.requests.filter((r) => r.method === 'analysis_submit').length,
    draft: window.__nextControl.saved['simulated:a'].drafts['passage-a'],
  }));
  expect(trace.accepts).toBe(2);
  expect(trace.refreshes).toBe(1);
  expect(trace.submissions).toBe(1);
  expect(trace.draft.aiAcceptances ?? []).toHaveLength(0);
});

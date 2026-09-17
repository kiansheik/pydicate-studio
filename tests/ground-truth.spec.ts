import { expect, test } from '@playwright/test';

// Real GroundTruthPanel + useStudio; only the backend is simulated. No corpus or provider writes.
test('ground truth requires current reviewed source and explicit confirmation; failure and concurrency preserve drafts', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?groundTruth=1');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  const confirmation = page.getByRole('checkbox', {
    name: 'Revisei a forma completa acima e quero registrá-la como ground truth.',
    exact: true,
  });
  const save = page.getByRole('button', { name: 'Confirmar e salvar ground truth', exact: true });
  const success = page.getByText('Ground truth salva. As outras passagens foram preservadas.', {
    exact: true,
  });
  await expect(confirmation).toBeEnabled();
  await expect(save).toBeDisabled();
  await page.getByLabel('Pydicate simulado').fill('changed_raw');
  await expect(confirmation).toBeDisabled();
  await page.getByLabel('Pydicate simulado').fill('alpha');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  await confirmation.check();
  await page.getByLabel('Nota simulada').fill('Unapplied human field');
  await expect(confirmation).toBeDisabled();
  await expect(confirmation).not.toBeChecked();
  await page.getByLabel('Nota simulada').fill('');
  await expect(confirmation).toBeEnabled();
  await expect(save).toBeDisabled();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) => request.method === 'reference_approve'),
    ),
  ).toHaveLength(0);

  const before = await page.evaluate(() => structuredClone(window.__nextStudio.envelope.drafts));
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_approve' }));
  await confirmation.check();
  await save.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((request) => request.method === 'reference_approve'),
      ),
    )
    .toBe(true);
  await expect(page.getByTestId('ready')).toHaveText('false');
  const duplicate = await page.evaluate(async () => {
    window.__nextStudio.setSelectedId('passage-b');
    window.__nextStudio.edit({ raw: 'must_not_replace_approved_draft' });
    try {
      await window.__nextStudio.approveGroundTruth('SIMULADO:alpha');
      return 'UNEXPECTED_SUCCESS';
    } catch (error) {
      return String(error);
    }
  });
  expect(duplicate).toContain('Aguarde');
  await expect(page.getByTestId('passage')).toHaveText('passage-a');
  await expect(page.getByLabel('Pydicate simulado')).toHaveValue('alpha');
  await expect(success).toHaveCount(0);
  await page.evaluate(() =>
    window.__nextControl.reject('reference_approve', 'SIMULATED_APPROVAL_FAILURE'),
  );
  await expect(page.getByRole('alert')).toContainText('SIMULATED_APPROVAL_FAILURE');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(success).toHaveCount(0);
  expect(await page.evaluate(() => window.__nextStudio.envelope.drafts)).toEqual(before);

  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_approve' }));
  await expect(confirmation).toBeEnabled();
  await expect(save).toBeDisabled();
  await confirmation.check();
  await save.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((request) => request.method === 'reference_approve'),
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.__nextControl.release('reference_approve'));
  await expect(success).toBeVisible();
  await expect(page.getByTestId('ready')).toHaveText('true');
  const after = await page.evaluate(() => ({
    drafts: window.__nextStudio.envelope.drafts,
    project: window.__nextStudio.project,
    saved: window.__nextControl.saved['simulated:a'],
  }));
  expect(after.drafts['passage-a'].workflow?.stage).toBe('complete');
  expect(after.drafts['passage-b']).toEqual(before['passage-b']);
  expect(after.saved.drafts['passage-a'].workflow?.stage).toBe('complete');
  expect(after.project.passages[0].acceptedReference).toBe('SIMULADO:alpha');
  expect(after.project.passages[1].acceptedReference).toBe(null);
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.filter((request) => request.method === 'reference_approve')
          .length,
    ),
  ).toBe(2);
});

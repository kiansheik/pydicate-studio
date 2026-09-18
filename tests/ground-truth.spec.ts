import { expect, test } from '@playwright/test';

test('workspace opens ground truth directly and cancelling never approves or applies source', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  const open = page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Commit to Ground Truth', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Commit to Ground Truth', exact: true });
  const save = dialog.getByRole('button', { name: 'Confirmar e salvar ground truth', exact: true });
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_status' }));
  await open.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(save).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Montar a análise', exact: true })).toHaveClass(
    'active',
  );
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => window.__nextControl.release('reference_status'));
  await open.click();
  await expect(dialog).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(dialog).toContainText('SIMULADO:alpha');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await page
    .locator('.review-view')
    .getByRole('button', { name: 'Commit to Ground Truth', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(save).toBeEnabled();
  await dialog.getByRole('button', { name: 'Fechar ground truth', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter(({ method }) =>
        ['reference_approve', 'source_apply', 'source_preview', 'source_new_preview'].includes(
          method,
        ),
      ),
    ),
  ).toEqual([]);
});

test('applying a reviewed source edit saves the ground truth in the same action', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Pydicate editável', exact: true });
  await editor.fill('alpha_revisado');
  await expect(page.getByTestId('generated-surface')).not.toHaveText('Avaliando…');

  const dialog = page.getByRole('dialog', { name: 'Commit to Ground Truth', exact: true });
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Commit to Ground Truth', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  // With unapplied changes the reference cannot be saved yet, only reviewed.
  await expect(
    dialog.getByRole('button', { name: 'Confirmar e salvar ground truth', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();

  const overlay = page.getByRole('dialog', { name: /Revisar/ });
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: /Aplicar/ }).click();

  // One action: the source is applied and the reference saved, with no return trip.
  await expect(page.getByText('Ground truth salva no corpus')).toBeVisible();
  // A refusal banner would mean it stopped; success must not raise one.
  await expect(page.locator('.notice-banner')).toHaveCount(0);
  await expect(overlay).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  const calls = await page.evaluate(() =>
    window.__nextControl.requests
      .filter(({ method }) => ['source_apply', 'reference_approve'].includes(method))
      .map(({ method }) => method),
  );
  expect(calls).toEqual(['source_apply', 'reference_approve']);
});

test('a refused reference leaves the applied source alone and says why', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  // The corpus keeps references in sequence; this passage is not the next one.
  await page.evaluate(() => {
    window.__nextControl.responses.reference_status = {
      record: null,
      recordPath: 'SIMULATED/records.jsonl',
      recordCount: 2,
      nextOrdinal: 3,
      canApproveSequentially: false,
    };
  });
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pydicate editável', exact: true }).fill('alpha_2');
  await expect(page.getByTestId('generated-surface')).not.toHaveText('Avaliando…');
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Commit to Ground Truth', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Commit to Ground Truth', exact: true })
    .getByRole('button', { name: 'Revisar edição da fonte', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: /Revisar/ })
    .getByRole('button', { name: /Aplicar/ })
    .click();

  const notice = page.getByRole('status').filter({ hasText: 'A fonte foi aplicada' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('0003');
  const calls = await page.evaluate(() =>
    window.__nextControl.requests
      .filter(({ method }) => ['source_apply', 'reference_approve'].includes(method))
      .map(({ method }) => method),
  );
  expect(calls).toEqual(['source_apply']);
});

// Real GroundTruthPanel + useStudio; only the backend is simulated. No corpus or provider writes.
test('one explicit save requires current reviewed source; failure and concurrency preserve drafts', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?groundTruth=1');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  const save = page.getByRole('button', { name: 'Confirmar e salvar ground truth', exact: true });
  const success = page.getByText('Ground truth salva. As outras passagens foram preservadas.', {
    exact: true,
  });
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(save).toBeEnabled();
  await page.getByLabel('Pydicate simulado').fill('changed_raw');
  await expect(save).toBeDisabled();
  await page.getByLabel('Pydicate simulado').fill('alpha');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  await expect(save).toBeEnabled();
  await page.getByLabel('Nota simulada').fill('Unapplied human field');
  await expect(save).toBeDisabled();
  await page.getByLabel('Nota simulada').fill('');
  await expect(save).toBeEnabled();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) => request.method === 'reference_approve'),
    ),
  ).toHaveLength(0);

  const before = await page.evaluate(() => structuredClone(window.__nextStudio.envelope.drafts));
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_approve' }));
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
  await expect(save).toBeEnabled();
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

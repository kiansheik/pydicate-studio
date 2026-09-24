import { expect, test, type Page } from '@playwright/test';

const mainCommit = (page: Page) =>
  page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Commit to Ground Truth', exact: true });
const review = (page: Page) => page.getByRole('dialog', { name: /^Revisar/ });
async function workspace(page: Page) {
  await page.goto('/tests/next-hook-harness.html?workspace&publication');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
}
async function editRaw(page: Page, raw: string) {
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pydicate editável', exact: true }).fill(raw);
  await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${raw}`);
}
const publicationCalls = (page: Page) =>
  page.evaluate(() =>
    window.__nextControl.requests
      .filter(({ method }) => ['source_apply', 'reference_approve'].includes(method))
      .map(({ method }) => method),
  );

test('main ground truth actions open the source review directly and cancelling never writes', async ({
  page,
}) => {
  await workspace(page);
  await mainCommit(page).click();
  await expect(review(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Confirmar e salvar ground truth', exact: true }),
  ).toHaveCount(0);
  await expect(
    review(page).getByRole('region', { name: 'Resultado atual do rascunho' }),
  ).toContainText('SIMULADO:alpha');
  await review(page).getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
  await expect(review(page)).toHaveCount(0);
  await mainCommit(page).click();
  await expect(review(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await page
    .locator('.review-view')
    .getByRole('button', { name: 'Commit to Ground Truth', exact: true })
    .click();
  await expect(review(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await review(page).getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
  expect(await publicationCalls(page)).toEqual([]);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter(({ method }) => method === 'source_preview'),
    ),
  ).toHaveLength(3);
});

test('one reviewed acceptance publishes the passage and added lexicon then approves ground truth', async ({
  page,
}) => {
  await workspace(page);
  await editRaw(page, 'alpha_revisado');
  await page.evaluate(() => {
    window.__nextControl.publicationPreview = {
      lexicalAdditions: [
        {
          name: 'ekat',
          headword: 'ekat',
          definition: '',
          lexicalStatus: 'hypothetical',
          expression: 'Noun("ekat")',
        },
      ],
      files: [
        {
          path: 'historic/lexicon.tu.py',
          sourceFingerprint: 'lexicon-v1',
          diff: '+ekat = Noun("ekat")',
        },
        {
          path: 'historic/araujo_catecismo_1686.tu.py',
          sourceFingerprint: 'source-v1',
          diff: '+alpha_revisado',
        },
      ],
    };
  });
  await mainCommit(page).click();
  await expect(review(page)).toHaveAttribute('aria-label', 'Revisar passagem e léxico');
  await expect(review(page).getByRole('region', { name: 'Palavras desta revisão' })).toContainText(
    'Raiz hipotética · não atestada',
  );
  await expect(review(page)).toContainText('Sem significado informado.');
  await review(page).getByText('Mostrar diff técnico', { exact: true }).click();
  await expect(
    review(page).getByRole('region', { name: 'historic/lexicon.tu.py', exact: true }),
  ).toContainText('ekat =');
  await expect(
    review(page).getByRole('region', { name: 'historic/araujo_catecismo_1686.tu.py', exact: true }),
  ).toContainText('alpha_revisado');
  await review(page).screenshot({ path: '/private/tmp/pydicate-ground-truth-review.png' });
  await review(page)
    .getByRole('button', { name: 'Salvar fonte e ground truth', exact: true })
    .click();
  await expect(page.getByText('Passagem e ground truth salvas', { exact: false })).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await publicationCalls(page)).toEqual(['source_apply', 'reference_approve']);
  const published = await page.evaluate(() => window.__nextControl.project.passages[0]);
  expect(published.sourceExpression).toBe('alpha_revisado');
  expect(published.acceptedReference).toBe('SIMULADO:alpha_revisado');
});

test('unchanged source is reviewed and approved without a redundant source write', async ({
  page,
}) => {
  await workspace(page);
  await mainCommit(page).click();
  await expect(review(page)).toBeVisible();
  await review(page).getByRole('button', { name: 'Salvar ground truth', exact: true }).click();
  await expect(page.getByText('Passagem e ground truth salvas', { exact: false })).toBeVisible();
  expect(await publicationCalls(page)).toEqual(['reference_approve']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('new passage acceptance approves the stable published identity in the same review', async ({
  page,
}) => {
  await workspace(page);
  await page.locator('.add-next-passage').click();
  await editRaw(page, 'new_expression');
  await page.getByLabel('Tradução', { exact: true }).fill('Tradução humana da nova passagem.');
  const pendingId = await page.evaluate(
    () => localStorage.getItem('simulated-selection:simulated:a')!,
  );
  expect(pendingId).toMatch(/^pending:/);
  await mainCommit(page).click();
  await expect(review(page)).toHaveAttribute('aria-label', 'Revisar nova passagem');
  await review(page)
    .getByRole('button', { name: 'Salvar fonte e ground truth', exact: true })
    .click();
  await expect(page.getByText('Passagem e ground truth salvas', { exact: false })).toBeVisible();
  const result = await page.evaluate(() => ({
    approved: window.__nextControl.requests.find(({ method }) => method === 'reference_approve')!
      .params,
    project: window.__nextControl.project,
    saved: window.__nextControl.saved['simulated:a'],
  }));
  const stableId = pendingId.replace(/^pending:/, 'passage:');
  expect(result.approved.passageId).toBe(stableId);
  expect(result.approved.engineFingerprint).toBe(
    result.project.engineFingerprint.replace(/:approved$/, ''),
  );
  expect(result.project.passages.find((item) => item.id === stableId)).toMatchObject({
    sourceExpression: 'new_expression',
    acceptedReference: 'SIMULADO:new_expression',
    translation: 'Tradução humana da nova passagem.',
  });
  expect(result.saved.drafts[pendingId]).toBeUndefined();
  expect(result.saved.drafts[stableId].workflow?.stage).toBe('complete');
  expect(result.project.passages.slice(0, 2).map((item) => item.acceptedReference)).toEqual([
    null,
    null,
  ]);
  expect(await publicationCalls(page)).toEqual(['source_apply', 'reference_approve']);
});

test('a failed source write never approves and keeps the reviewed edit available', async ({
  page,
}) => {
  await workspace(page);
  await editRaw(page, 'alpha_failed');
  await mainCommit(page).click();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'source_apply' }));
  await review(page)
    .getByRole('button', { name: 'Salvar fonte e ground truth', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some(({ method }) => method === 'source_apply'),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.__nextControl.reject('source_apply', 'SIMULATED_SOURCE_FAILURE'),
  );
  await expect(review(page).getByRole('alert')).toContainText('SIMULATED_SOURCE_FAILURE');
  expect(await publicationCalls(page)).toEqual(['source_apply']);
  expect(await page.evaluate(() => window.__nextControl.project.passages[0].sourceExpression)).toBe(
    'alpha',
  );
});

test('a failed approval preserves the applied source and retries approval without republishing', async ({
  page,
}) => {
  await workspace(page);
  await editRaw(page, 'alpha_retry');
  await mainCommit(page).click();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_approve' }));
  await review(page)
    .getByRole('button', { name: 'Salvar fonte e ground truth', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some(({ method }) => method === 'reference_approve'),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.__nextControl.reject('reference_approve', 'SIMULATED_APPROVAL_FAILURE'),
  );
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'A fonte foi salva' })).toContainText(
    'SIMULATED_APPROVAL_FAILURE',
  );
  expect(await page.evaluate(() => window.__nextControl.project.passages[0].sourceExpression)).toBe(
    'alpha_retry',
  );
  expect(await publicationCalls(page)).toEqual(['source_apply', 'reference_approve']);
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha_retry');
  await mainCommit(page).click();
  await review(page).getByRole('button', { name: 'Salvar ground truth', exact: true }).click();
  await expect(page.getByText('Passagem e ground truth salvas', { exact: false })).toBeVisible();
  expect(await publicationCalls(page)).toEqual([
    'source_apply',
    'reference_approve',
    'reference_approve',
  ]);
});

test('the combined save stays locked through reference approval and ignores duplicate acceptance', async ({
  page,
}) => {
  await workspace(page);
  await editRaw(page, 'alpha_locked');
  await mainCommit(page).click();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_approve' }));
  const accept = review(page).getByRole('button', {
    name: 'Salvar fonte e ground truth',
    exact: true,
  });
  await accept.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some(({ method }) => method === 'reference_approve'),
      ),
    )
    .toBe(true);
  const saving = review(page).getByRole('button', { name: 'Salvando…', exact: true });
  await expect(saving).toBeDisabled();
  await expect(
    review(page).getByRole('button', { name: 'Voltar sem aplicar', exact: true }),
  ).toBeDisabled();
  await saving.evaluate((element: HTMLButtonElement) => element.click());
  await page
    .getByRole('button', { name: /0002 Por transcrever/ })
    .evaluate((element: HTMLButtonElement) => element.click());
  expect(await page.evaluate(() => localStorage.getItem('simulated-selection:simulated:a'))).toBe(
    'passage-a',
  );
  await page.keyboard.press('Escape');
  await expect(review(page)).toBeVisible();
  expect(await publicationCalls(page)).toEqual(['source_apply', 'reference_approve']);
  await page.evaluate(() => window.__nextControl.release('reference_approve'));
  await expect(page.getByText('Passagem e ground truth salvas', { exact: false })).toBeVisible();
  await expect(review(page)).toHaveCount(0);
});

test('a draft edit while source preview is delayed cannot publish the stale proposal', async ({
  page,
}) => {
  await workspace(page);
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'source_preview' }));
  await mainCommit(page).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some(({ method }) => method === 'source_preview'),
      ),
    )
    .toBe(true);
  await editRaw(page, 'changed_during_preview');
  await page.evaluate(() => window.__nextControl.release('source_preview'));
  await expect(page.getByRole('alert')).toContainText('mudou');
  await expect(review(page)).toHaveCount(0);
  expect(await publicationCalls(page)).toEqual([]);
});

test('stale grammar and partial reviewed results cannot start the combined publication', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?groundTruth=1&publication');
  await expect(page.getByTestId('surface')).toHaveText('SIMULADO:alpha');
  const errors = await page.evaluate(async () => {
    const studio = window.__nextStudio;
    const preview = await studio.sourcePreview();
    const errors = [];
    for (const result of [
      { ...studio.result!, engineFingerprint: 'previous-engine' },
      { ...studio.result!, evaluationStatus: 'partial' as const },
    ]) {
      try {
        await studio.applySource(preview, result);
        errors.push('UNEXPECTED_SUCCESS');
      } catch (error) {
        errors.push(String(error));
      }
    }
    return errors;
  });
  expect(errors).toHaveLength(2);
  for (const error of errors) expect(error).toContain('forma revisada não corresponde');
  expect(await publicationCalls(page)).toEqual([]);
});

test('an existing human target is preserved when the reviewed form disagrees', async ({ page }) => {
  await workspace(page);
  await page.evaluate(() => {
    window.__nextControl.responses.reference_status = {
      record: { surface: 'human_target', normalized_target: 'human_target', status: 'approved' },
      recordPath: 'SIMULATED/records.jsonl',
      recordCount: 2,
      nextOrdinal: 3,
      canApproveSequentially: true,
    };
  });
  await editRaw(page, 'alpha_target');
  await mainCommit(page).click();
  await review(page)
    .getByRole('button', { name: 'Salvar fonte e ground truth', exact: true })
    .click();
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'A fonte foi salva' })).toContainText(
    'alvo humano',
  );
  expect(await publicationCalls(page)).toEqual(['source_apply']);
});

test('missing earlier references do not block explicit approval of this passage', async ({
  page,
}) => {
  await workspace(page);
  await page.evaluate(() => {
    window.__nextControl.responses.reference_status = {
      record: null,
      recordPath: 'SIMULATED/records.jsonl',
      recordCount: 2,
      nextOrdinal: 3,
      canApproveSequentially: false,
    };
  });
  await editRaw(page, 'alpha_sequence');
  await mainCommit(page).click();
  await review(page)
    .getByRole('button', { name: 'Salvar fonte e ground truth', exact: true })
    .click();
  await expect(review(page)).toHaveCount(0);
  expect(await publicationCalls(page)).toEqual(['source_apply', 'reference_approve']);
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

test('source review can save only the passage without approving ground truth', async ({ page }) => {
  await workspace(page);
  await editRaw(page, 'alpha_unreviewed');
  await mainCommit(page).click();
  await review(page)
    .getByRole('checkbox', { name: 'Registrar também como ground truth' })
    .uncheck();
  await review(page).getByRole('button', { name: 'Salvar somente a fonte', exact: true }).click();
  await expect(review(page)).toHaveCount(0);
  expect(await publicationCalls(page)).toEqual(['source_apply']);
  await expect(page.getByRole('combobox', { name: 'Etapa do trabalho' })).not.toHaveValue(
    'complete',
  );
});

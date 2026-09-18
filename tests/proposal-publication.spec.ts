import { expect, test, type Page } from '@playwright/test';

const noun = 'Noun(value="mendara", definition="casamento; matrimônio")';

async function prepareNoun(page: Page, restorePreview = false) {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.locator('.add-next-passage').click();
  await expect(
    page.getByRole('button', { name: 'Revisar nova passagem', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Mendâra');
  await page
    .getByLabel('Tradução em português', { exact: true })
    .fill('Casamento, na minha leitura.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }),
  ).toBeVisible();
  const pendingId = await page.evaluate(
    ({ raw, restorePreview }) => {
      const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
      const candidate = state.candidates[0];
      candidate.raw = raw;
      candidate.tree = { ...candidate.tree, label: 'mendara', code: raw, end: raw.length };
      candidate.evaluation = {
        ...candidate.evaluation,
        expression: raw,
        surface: 'mendara',
        tree: candidate.tree,
        engineFingerprint: 'an-earlier-grammar-version',
      };
      state.jobs[0].input.engineFingerprint = 'an-earlier-grammar-version';
      state.jobs[0].updatedAt = new Date(Date.now() + 1000).toISOString();
      delete candidate.translation;
      if (restorePreview) {
        const conversation = state.conversations.find(
          (item: { id: string }) => item.id === state.jobs[0].conversationId,
        );
        conversation.selectedCandidateId = candidate.id;
        conversation.revision++;
      }
      window.__nextControl.setAnalysis(state);
      return candidate.passageId;
    },
    { raw: noun, restorePreview },
  );
  expect(
    await page.evaluate(
      (id) => window.__nextControl.saved['simulated:a'].drafts[id].raw,
      pendingId,
    ),
  ).toBe('');
  if (restorePreview) await page.reload();
  return pendingId;
}

for (const entry of ['passage', 'ground-truth'] as const) {
  test(`inspected single noun from an older grammar is immediately available to ${entry} review`, async ({
    page,
  }) => {
    const pendingId = await prepareNoun(page);
    await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Prévia da proposta de IA' })).toHaveCount(0);
    const editor = page.locator('[data-pane="editor"] .expression-canvas');
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${noun}`);
    await expect(
      editor.getByRole('button', { name: 'De baixo para cima', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() =>
        page.evaluate((id) => window.__nextControl.saved['simulated:a'].drafts[id].raw, pendingId),
      )
      .toBe(noun);
    const action =
      entry === 'ground-truth'
        ? page
            .getByRole('dialog')
            .getByRole('button', { name: 'Revisar edição da fonte', exact: true })
        : page.getByRole('button', { name: 'Revisar nova passagem', exact: true });
    if (entry === 'ground-truth') {
      await page.getByRole('button', { name: 'Commit to Ground Truth', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Confirmar e salvar ground truth', exact: true }),
      ).toBeDisabled();
    }
    await expect(action).toBeEnabled();
    await action.click();
    await expect(
      page.getByRole('dialog', { name: 'Revisar nova passagem', exact: true }),
    ).toBeVisible();
    const result = await page.evaluate(
      (id) => ({
        accepted: window.__nextControl.requests.filter((r) => r.method === 'analysis_accept'),
        submissions: window.__nextControl.requests.filter((r) => r.method === 'analysis_submit'),
        evaluated: window.__nextControl.requests.filter((r) => r.method === 'evaluate_expression'),
        reviewed: window.__nextControl.requests.filter((r) => r.method === 'source_new_preview'),
        published: window.__nextControl.requests.filter((r) =>
          ['source_apply', 'reference_approve'].includes(r.method),
        ),
        draft: window.__nextControl.saved['simulated:a'].drafts[id],
        currentEngine: window.__nextControl.project.engineFingerprint,
      }),
      pendingId,
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.submissions).toHaveLength(1);
    expect(result.reviewed).toHaveLength(1);
    expect(result.reviewed[0].params.raw).toBe(noun);
    expect(result.reviewed[0].params.metadata).toMatchObject({
      diplomatic: 'Mendâra',
      translation: 'Casamento, na minha leitura.',
    });
    expect(
      result.evaluated.some(
        (request) =>
          request.params.raw === noun && request.params.engineFingerprint === result.currentEngine,
      ),
    ).toBe(true);
    expect(result.draft.raw).toBe(noun);
    expect(result.draft.aiAcceptances).toHaveLength(1);
    expect(result.published).toHaveLength(0);
    await page.getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
    await page
      .locator('.workspace-footer')
      .getByRole('button', { name: 'Desfazer', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate((id) => window.__nextControl.saved['simulated:a'].drafts[id].raw, pendingId),
      )
      .toBe('');
    expect(
      await page.evaluate(
        (id) => window.__nextControl.saved['simulated:a'].drafts[id].translation,
        pendingId,
      ),
    ).toBe('Casamento, na minha leitura.');
  });
}

test('a previously saved proposal preview can still use and review the displayed noun', async ({
  page,
}) => {
  const pendingId = await prepareNoun(page, true);
  await expect(
    page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }),
  ).toBeVisible();
  const projection = page.getByRole('region', { name: 'Prévia da proposta de IA' });
  await expect(projection).toBeVisible();
  await projection.getByRole('button', { name: 'Usar e revisar proposta', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Revisar nova passagem', exact: true }),
  ).toBeVisible();
  await expect(projection).toHaveCount(0);
  const result = await page.evaluate(
    (id) => ({
      draft: window.__nextControl.saved['simulated:a'].drafts[id],
      reviewed: window.__nextControl.requests.find((r) => r.method === 'source_new_preview'),
      published: window.__nextControl.requests.filter((r) =>
        ['source_apply', 'reference_approve'].includes(r.method),
      ),
    }),
    pendingId,
  );
  expect(result.draft.raw).toBe(noun);
  expect(result.draft.translation).toBe('Casamento, na minha leitura.');
  expect(result.reviewed?.params.raw).toBe(noun);
  expect(result.published).toHaveLength(0);
});

test('a review completing after navigation cannot open on another passage', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'source_preview' }));
  await page.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__nextControl.pending.some((r) => r.method === 'source_preview')),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await page.evaluate(() => window.__nextControl.release('source_preview'));
  await expect(
    page.getByText('A passagem ou o rascunho mudou. Abra a revisão novamente.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Revisar passagem', exact: true })).toHaveCount(0);
});

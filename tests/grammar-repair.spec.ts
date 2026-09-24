import { expect, test } from '@playwright/test';

test('correction prefills the current form and submits notes into a separate persistent AI conversation', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Morerobiare yma');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  const prior = await page.evaluate(
    () => JSON.parse(localStorage.getItem('simulated-analysis')!).jobs[0],
  );
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  const actual = await page.getByTestId('generated-surface').innerText();
  await page.getByRole('button', { name: 'Corrigir gramática / árvore' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Diagnóstico para corrigir a gramática' });
  await expect(dialog.getByLabel('Forma pretendida', { exact: true })).toHaveValue(actual);
  await expect(dialog.getByLabel('Prompt de correção da gramática')).not.toBeVisible();
  await dialog.getByLabel('Forma pretendida', { exact: true }).fill("morerobîare'yma");
  await dialog
    .getByLabel('Explicação linguística')
    .fill('moro deve ter a variante mor, sem prefixo relacional.');
  await page.screenshot({ path: 'test-results/grammar-correction-desktop.png' });
  await page.setViewportSize({ width: 720, height: 900 });
  await expect(dialog.getByRole('button', { name: 'Enviar ao Codex' })).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/grammar-correction-narrow.png' });
  await dialog.getByRole('button', { name: 'Enviar ao Codex' }).click();
  await expect(dialog).not.toBeVisible();
  const ai = page.getByRole('tabpanel', { name: 'IA', exact: true });
  await expect(ai).toBeVisible();
  await expect(ai).toContainText('moro deve ter a variante mor');
  await expect(ai.getByLabel('Verificação da correção')).toContainText("morerobîare'yma");
  const sent = await page.evaluate(
    () =>
      window.__nextControl.requests
        .filter((request) => request.method === 'analysis_submit')
        .at(-1)!.params,
  );
  expect(sent.task).toBe('grammar-repair');
  expect(sent.newConversation).toBe(true);
  expect((sent.grammarRepair as { raw: string }).raw).toBe('alpha');
  await expect(ai.getByLabel('Tarefa da análise')).not.toBeVisible();
  await ai.getByLabel('Mensagem para a IA').fill('Confira também o plural.');
  await ai.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
  await expect(ai).toContainText('Confira também o plural.');
  const reply = await page.evaluate(
    () =>
      window.__nextControl.requests
        .filter((request) => request.method === 'analysis_submit')
        .at(-1)!.params,
  );
  expect(reply.task).toBe('grammar-repair');
  expect(reply.parentJobId).toBeTruthy();
  await ai.getByLabel('Conversa de IA', { exact: true }).selectOption(prior.conversationId);
  await expect(ai.getByText('SIMULATED proposal for interaction testing.')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /^IA/ }).click();
  await expect(page.getByLabel('Conversa de IA', { exact: true })).toHaveValue(
    prior.conversationId,
  );
});

test('failed submission preserves the edited correction and can be retried', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByRole('button', { name: 'Corrigir gramática / árvore' }).first().click();
  await page.getByLabel('Forma pretendida', { exact: true }).fill('Minha forma');
  await page.getByLabel('Explicação linguística').fill('Minhas notas');
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'analysis_submit' }));
  await page.getByRole('button', { name: 'Enviar ao Codex' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((item) => item.method === 'analysis_submit'),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.__nextControl.reject('analysis_submit', 'SIMULATED unavailable'),
  );
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('SIMULATED unavailable');
  await expect(page.getByLabel('Forma pretendida', { exact: true })).toHaveValue('Minha forma');
  await expect(page.getByLabel('Explicação linguística')).toHaveValue('Minhas notas');
  await expect(page.getByRole('button', { name: 'Enviar ao Codex' })).toBeEnabled();
});

test('retrying an initial correction after editing saved lexical notes captures a new submission identity', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.evaluate(() => {
    window.__nextControl.responses.lexical_notes_list = {
      records: [
        {
          id: 'note:grammar',
          version: 1,
          scope: 'entry',
          fields: { meaning: '', grammar: 'old nuance', note: '' },
        },
      ],
    };
  });
  await page.getByRole('button', { name: 'Corrigir gramática / árvore' }).first().click();
  await page.getByLabel('Forma pretendida', { exact: true }).fill('Minha forma');
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'analysis_submit' }));
  await page.getByRole('button', { name: 'Enviar ao Codex' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((item) => item.method === 'analysis_submit'),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.__nextControl.reject('analysis_submit', 'SIMULATED unavailable'),
  );
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('SIMULATED unavailable');
  await page.evaluate(() => {
    window.__nextControl.responses.lexical_notes_list = {
      records: [
        {
          id: 'note:grammar',
          version: 2,
          scope: 'entry',
          fields: { meaning: '', grammar: 'corrected nuance', note: '' },
        },
      ],
    };
  });
  await page.getByRole('button', { name: 'Enviar ao Codex' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const submitted = await page.evaluate(() =>
    window.__nextControl.requests
      .filter((item) => item.method === 'analysis_submit')
      .map((item) => item.params),
  );
  expect(submitted).toHaveLength(2);
  expect(submitted[1].operationId).not.toBe(submitted[0].operationId);
  expect(submitted[1].revisionId).toBe(submitted[0].revisionId);
});

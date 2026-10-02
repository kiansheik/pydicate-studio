import { submitPassageAnalysis } from './explicit-analysis';
import { expect, test } from '@playwright/test';

test('correction prefills the current form and submits notes into a separate persistent AI conversation', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Morerobiare yma');
  await submitPassageAnalysis(page);
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

test('early target stays provisional, can be confirmed once, survives reload and remains cancellable', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByRole('button', { name: 'Corrigir gramática / árvore' }).first().click();
  await page.getByLabel('Forma pretendida', { exact: true }).fill('ogûerekomemûãsara');
  await page.getByRole('button', { name: 'Enviar ao Codex' }).click();
  await expect(page.getByLabel('Verificação da correção')).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('simulated-analysis')!);
    const job = data.jobs.at(-1);
    job.status = 'running';
    job.phase = 'grammar-corpus';
    job.attemptStartedAt = new Date(Date.now() - 22 * 60000).toISOString();
    job.deadlineAt = new Date(Date.now() - 7 * 60000).toISOString();
    job.events = [
      {
        type: 'tool-result',
        tool: 'grammar_read',
        at: new Date(Date.now() - 18 * 60000).toISOString(),
        result: { content: 'x'.repeat(100000) },
      },
    ];
    job.grammarCandidate = {
      id: 'observed-target',
      expression: 'alpha',
      surface: 'ogûerekomemûãsara',
      intendedSurface: 'ogûerekomemûãsara',
      matches: true,
      evaluationStatus: 'complete',
      validation: 'pending',
      engineFingerprint: 'fixture',
    };
    delete job.grammarVerification;
    job.updatedAt = new Date().toISOString();
    window.__nextControl.setAnalysis(data);
  });
  await page.reload();
  await page.getByRole('tab', { name: /^IA/ }).click();
  const target = page.getByLabel('Resultado do alvo');
  await expect(target).toContainText('ainda não está validado');
  await expect(target).toContainText('ogûerekomemûãsara');
  await expect(page.getByText(/22 min nesta tentativa/)).toBeVisible();
  await expect(page.getByText(/Sem novo evento há 18 min/)).toBeVisible();
  await page.screenshot({ path: 'test-results/grammar-target-pending.png' });
  await target.getByRole('button', { name: 'Esta forma está correta' }).click();
  await expect(target).toContainText('Confirmação desta forma registrada');
  await expect(target.getByRole('button', { name: 'Esta forma está correta' })).toHaveCount(0);
  await expect(target).toContainText('ainda não está validado');
  await expect(page.getByRole('button', { name: 'Cancelar análise', exact: true })).toBeEnabled();
  await page.reload();
  await page.getByRole('tab', { name: /^IA/ }).click();
  await expect(target).toContainText('Confirmação desta forma registrada');
  await page.getByRole('button', { name: 'Cancelar análise', exact: true }).click();
  await expect(page.getByText('Cancelada', { exact: true }).first()).toBeVisible();
  await expect(target).toContainText('ainda não está validado');
  await page.setViewportSize({ width: 720, height: 900 });
  await page.getByRole('button', { name: 'Assistência IA', exact: true }).click();
  await target.scrollIntoViewIfNeeded();
  expect(await target.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await target.screenshot({ path: 'test-results/grammar-target-cancelled-narrow.png' });
});

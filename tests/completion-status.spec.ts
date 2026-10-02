import { expect, test, type Page } from '@playwright/test';

const target =
  '/tests/next-hook-harness.html?workspace&publication&analysis&passage=passage-a&view=analysis&tab=tree';
const row = (page: Page) =>
  page.getByLabel('Passagens por seção').getByRole('button', { name: /0001/ });

test('saving a reference immediately completes its row and panel despite an older pending submission', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__nextInitial = {
      responses: {
        submissions_list: [
          {
            id: 'submission-old',
            projectId: 'simulated:a',
            passageId: 'passage-a',
            sourceId: 'araujo_catecismo_1686',
            revisionId: 'old-submitted-revision',
            draftRevisionId: 1,
            submittedAt: 1,
            author: 'Fixture',
            status: 'submitted',
          },
        ],
      },
    };
  });
  await page.goto(target);
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await expect(row(page)).toContainText('Aguardando revisão');
  await expect(page.locator('.workflow-control')).toContainText('Aguardando revisão');
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Salvar como referência', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: /^Revisar/ });
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_approve' }));
  await dialog.getByRole('button', { name: 'Salvar referência', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((r) => r.method === 'reference_approve'),
      ),
    )
    .toBe(true);
  await expect(row(page)).not.toContainText('Concluída');
  await page.evaluate(() => {
    window.__nextControl.holds.push({ method: 'evaluate_expression' }, { method: 'draft_save' });
    window.__nextControl.release('reference_approve');
  });
  // The completion label must update before the follow-up persistence and
  // engine refresh finish, rather than waiting for a reload or another click.
  await expect(row(page)).toContainText('Concluída');
  await expect(row(page)).not.toContainText('Aguardando revisão');
  await expect(row(page)).toHaveClass(/is-complete/);
  await expect(page.getByRole('combobox', { name: 'Etapa do trabalho' })).toHaveValue('complete');
  await expect(page.locator('.workflow-control')).toHaveClass(/is-complete/);
  await expect(page.locator('.workflow-control')).not.toContainText('Aguardando revisão');
  await expect(page.locator('.generated-surface')).not.toContainText('Aguardando análise');
  await expect(page.locator('.agreement-bar .workflow-complete')).toContainText('concluída');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((r) => r.method === 'evaluate_expression'),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    window.__nextControl.release('draft_save');
    window.__nextControl.release('evaluate_expression');
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Concluídas 1$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Concluídas 1$/ }).click();
  await expect(row(page)).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Filtrar envios para revisão' })
    .selectOption('submitted');
  await expect(row(page)).toHaveCount(0);
  await page.getByRole('button', { name: /^Todas / }).click();
  await expect(row(page)).toContainText('Concluída');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Etapa do trabalho' })).toHaveValue('complete');
  await expect(row(page)).toContainText('Concluída');
  await expect(row(page)).not.toContainText('Aguardando revisão');
  await page.evaluate(() => {
    const rows = window.__nextControl.responses
      .submissions_list as import('../src/domain/submissions').SubmissionSummary[];
    rows[0] = { ...rows[0], id: 'submission-new', draftRevisionId: 2, submittedAt: Date.now() + 1 };
    window.__nextControl.emit({ type: 'submissions-change' });
  });
  await expect(row(page)).toContainText('Aguardando revisão');
  await expect(row(page)).not.toHaveClass(/is-complete/);
  await expect(page.getByRole('combobox', { name: 'Etapa do trabalho' })).toHaveValue('review');
  await page
    .getByRole('combobox', { name: 'Filtrar envios para revisão' })
    .selectOption('submitted');
  await expect(row(page)).toBeVisible();
  await page.getByRole('button', { name: /^Todas / }).click();
  await page.getByRole('combobox', { name: 'Etapa do trabalho' }).selectOption('analysis');
  await expect(row(page)).not.toHaveClass(/is-complete/);
  await expect(page.getByRole('combobox', { name: 'Etapa do trabalho' })).toHaveValue('analysis');
});

test('a rejected reference approval leaves the passage unfinished', async ({ page }) => {
  await page.goto(target);
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Salvar como referência', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: /^Revisar/ });
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'reference_approve' }));
  await dialog.getByRole('button', { name: 'Salvar referência', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((r) => r.method === 'reference_approve'),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.__nextControl.reject('reference_approve', 'SIMULATED_APPROVAL_FAILURE'),
  );
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'SIMULATED_APPROVAL_FAILURE' }).first(),
  ).toBeVisible();
  await expect(row(page)).not.toContainText('Concluída');
  await expect(page.getByRole('combobox', { name: 'Etapa do trabalho' })).not.toHaveValue(
    'complete',
  );
  await expect(row(page)).not.toHaveClass(/is-complete/);
});

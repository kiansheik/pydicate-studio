import { expect, test } from '@playwright/test';

const queue = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^Fila/ });
const panel = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Traduções propostas em lote' });
const translationField = (page: import('@playwright/test').Page) =>
  page.getByLabel('Tradução em português', { exact: true });
async function openSource(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: 'Fonte', exact: true }).click();
}

async function proposeTranslation(page: import('@playwright/test').Page) {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Nhemöabaré.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
}

/** A proposal whose tree the draft already holds: its translation describes the analysis the
 *  contributor actually has, which is the only case the batch review may write. */
async function alignProposalWithDraft(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
    const envelopeKey = Object.keys(localStorage).find((key) => key.startsWith('simulated-next:'))!;
    const drafts = JSON.parse(localStorage.getItem(envelopeKey)!).drafts as Record<
      string,
      { raw: string }
    >;
    for (const candidate of state.candidates) {
      const raw = drafts[candidate.passageId]?.raw;
      if (!raw) continue;
      candidate.raw = raw;
      candidate.evaluation.expression = raw;
      candidate.translation.expression = raw;
    }
    window.__nextControl.setAnalysis(state);
  });
}

test('a proposed translation fills an empty draft field from the batch review', async ({
  page,
}) => {
  await proposeTranslation(page);
  await alignProposalWithDraft(page);
  await queue(page).click();
  await page.getByRole('button', { name: /^Traduções propostas/ }).click();
  const row = panel(page).getByRole('listitem').first();
  await expect(row).toContainText('tradução sugerida pela fixture');
  // Nothing was written by hand, so the box is already ticked.
  await expect(row.getByRole('checkbox')).toBeChecked();
  await expect(row).toHaveAttribute('data-state', 'empty');
  await panel(page)
    .getByRole('button', { name: /^Gravar/ })
    .click();
  await expect(page.getByText('tradução(ões) gravada(s)', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Tradução em português', { exact: true })).toHaveValue(
    'Pessoa: tradução sugerida pela fixture.',
  );
});

test('an existing translation is never replaced without its own box being ticked', async ({
  page,
}) => {
  await proposeTranslation(page);
  await alignProposalWithDraft(page);
  await openSource(page);
  await translationField(page).fill('Minha leitura.');
  await queue(page).click();
  await page.getByRole('button', { name: /^Traduções propostas/ }).click();
  const row = panel(page).getByRole('listitem').first();
  await expect(row).toHaveAttribute('data-state', 'conflict');
  await expect(row).toContainText('Minha leitura.');
  await expect(row.getByRole('checkbox')).not.toBeChecked();
  await expect(panel(page).getByRole('button', { name: /^Gravar 0/ })).toBeDisabled();
  await expect(page.getByLabel('Tradução em português', { exact: true })).toHaveValue(
    'Minha leitura.',
  );
  await row.getByRole('checkbox').check();
  await panel(page)
    .getByRole('button', { name: /^Gravar 1/ })
    .click();
  await expect(page.getByLabel('Tradução em português', { exact: true })).toHaveValue(
    'Pessoa: tradução sugerida pela fixture.',
  );
});

test('a translation of a tree the draft does not hold cannot be written from the review', async ({
  page,
}) => {
  await proposeTranslation(page);
  // No alignment: the proposal carries its own tree, so its translation describes an
  // analysis the contributor has not accepted.
  await queue(page).click();
  await page.getByRole('button', { name: /^Traduções propostas/ }).click();
  const row = panel(page).getByRole('listitem').first();
  await expect(row).toHaveAttribute('data-state', 'stale');
  await expect(row.getByRole('checkbox')).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: /^Gravar 0/ })).toBeDisabled();
  await openSource(page);
  await expect(translationField(page)).toHaveValue('');
});

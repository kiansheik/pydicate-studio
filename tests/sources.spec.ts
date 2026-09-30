import { expect, test } from '@playwright/test';
import type { DraftEnvelope } from '../src/domain/types';

test('opening an entirely empty source creates a persistent editable first draft', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/next-hook-harness.html?workspace&empty-source&collaborative');
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0001');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Primeira linha');
  await expect(page.locator('.passage-list')).toContainText('Primeira linha');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('simulated-next:simulated:a')))
    .toContain('Primeira linha');
  await page.reload();
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue(
    'Primeira linha',
  );
  await expect(page.locator('.passage-item')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('create a source, write its first reading, reload, switch sources and append to the selected source', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&sources&collaborative');
  await expect(page.getByRole('button', { name: 'Nova fonte', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Nova fonte', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova fonte' });
  await dialog.getByLabel('Título da fonte').fill('Manuscrito de São Luís');
  await dialog.getByLabel('Ano (opcional)').fill('1750');
  await expect(dialog.getByLabel('Nome do arquivo .tu.py')).toHaveValue('manuscrito_de_sao_luis');
  await dialog.getByRole('button', { name: 'Criar fonte', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Fonte', exact: true })).toHaveValue(
    'manuscrito_de_sao_luis',
  );
  await expect(page.locator('.breadcrumbs')).toContainText('Manuscrito de São Luís · 1750');
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0001');
  await expect(
    page.getByRole('button', { name: 'Vincular PDF à fonte', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Minha primeira leitura');
  await expect(page.locator('.passage-list')).toContainText('Minha primeira leitura');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const envelope: DraftEnvelope = JSON.parse(
          localStorage.getItem('simulated-next:simulated:a') || '{}',
        );
        return Object.values(envelope.drafts ?? {}).some(
          (draft: any) => draft.diplomatic === 'Minha primeira leitura',
        );
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Fonte', exact: true })).toHaveValue(
    'manuscrito_de_sao_luis',
  );
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue(
    'Minha primeira leitura',
  );
  await page.locator('.add-next-passage').click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0002');
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue('');
  await page
    .getByRole('combobox', { name: 'Fonte', exact: true })
    .selectOption('araujo_catecismo_1686');
  await expect(page.locator('.passage-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Próxima passagem', exact: true })).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Fonte', exact: true })
    .selectOption('manuscrito_de_sao_luis');
  await expect(page.locator('.passage-item')).toHaveCount(2);
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0001');
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue(
    'Minha primeira leitura',
  );
  await expect(page.getByText('Não foi possível carregar a fila:', { exact: false })).toHaveCount(
    0,
  );
});

test('an existing non-Araújo source receives new passages in place', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace&source=outra_fonte');
  await expect(page.locator('.add-next-passage')).toBeEnabled();
  await page.locator('.add-next-passage').click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0003');
  await expect(page.getByRole('combobox', { name: 'Fonte', exact: true })).toHaveValue(
    'outra_fonte',
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const envelope: DraftEnvelope = JSON.parse(
          localStorage.getItem('simulated-next:simulated:a') || '{}',
        );
        return Object.values(envelope.drafts ?? {}).find((draft: any) => draft.pending)?.pending
          ?.sourceId;
      }),
    )
    .toBe('outra_fonte');
});

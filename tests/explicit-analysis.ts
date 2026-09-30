import type { Page } from '@playwright/test';

/** Generation starts only from an explicit request in the IA view. */
export async function submitPassageAnalysis(page: Page) {
  await page.getByRole('tab', { name: /^IA/ }).click();
  await page.getByLabel('Tarefa da análise', { exact: true }).selectOption('analyze');
  await page.getByLabel('Escopo da análise', { exact: true }).selectOption('passage');
  await page.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
}

import { expect, type Page } from '@playwright/test';
import type { Draft, DraftEnvelope } from '../src/domain/types';

export async function currentSavedDraft(page: Page): Promise<Draft> {
  return page.evaluate(() => {
    const id = localStorage.getItem('simulated-selection:simulated:a')!;
    const envelope = JSON.parse(
      localStorage.getItem('simulated-next:simulated:a')!,
    ) as DraftEnvelope;
    return envelope.drafts[id];
  });
}

/** Older saved fields survive the removal of their former source-panel inputs. */
export async function seedSavedReading(page: Page, fields: Partial<Draft>) {
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await expect(
    page.getByText('Rascunho salvo. A referência do corpus foi preservada.', { exact: true }),
  ).toBeVisible();
  await page.evaluate((fields) => {
    const key = 'simulated-next:simulated:a';
    const envelope = JSON.parse(localStorage.getItem(key)!) as DraftEnvelope;
    const id = localStorage.getItem('simulated-selection:simulated:a')!;
    envelope.drafts[id] = { ...envelope.drafts[id], ...fields };
    localStorage.setItem(key, JSON.stringify(envelope));
  }, fields);
  await page.reload();
  await expect(page.locator('.add-next-passage')).toBeEnabled();
}

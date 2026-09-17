import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const earlier = JSON.parse(
  await fs.readFile(path.join(root, 'docs/reviews/round-2-evidence.json'), 'utf8'),
);
const temp = earlier.temp;
const parent = path.join(temp, 'projects');
const env = { ...process.env, PYDICATE_STUDIO_DEV: '0', PYDICATE_PROJECT_PARENT: parent };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [path.join(temp, 'boot.cjs')], env, timeout: 30000 });
const result = {
  initialFailure:
    'The original probe used a canvas point scrolled under the fixed header after pressing the below-canvas drawing control. This recheck scrolls the actual canvas into view before measuring coordinates.',
};
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 30000 });
  await page
    .locator('.passage-item')
    .filter({ has: page.locator('.ordinal', { hasText: /^0058$/ }) })
    .click();
  const canvas = page.getByTestId('pdf-canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Zoom do PDF').selectOption('0.5');
  await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Marcar região', exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  result.box = box;
  result.canvas = await canvas.evaluate((c) => ({
    width: c.width,
    height: c.height,
    blue: Array.from(
      c.getContext('2d').getImageData(c.width * 0.45, c.height * (1 - 350 / 600), 1, 1).data,
    ),
  }));
  assert(result.canvas.blue[2] > 180 && result.canvas.blue[0] < 30);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();
  const region = page.getByTestId('pdf-region');
  await expect(region).toHaveCount(1);
  result.rect = await region.getAttribute('data-pdf-rect');
  await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
  await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Girar 90°', exact: true }).click();
  await page.getByLabel('Zoom do PDF').selectOption('1.5');
  await expect(region).toHaveAttribute('data-pdf-rect', result.rect);
  await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
  await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Alternar tema', exact: true }).click();
  result.theme = await page.locator('html').getAttribute('data-theme');
  result.physical = await page.getByLabel('Página física do PDF', { exact: true }).inputValue();
  const p = await page.evaluate(() => window.studio.refreshProject());
  result.saved = await page.evaluate(
    async (input) => window.studio.invoke('evidence_status', input),
    { projectId: p.id, sourceId: 'araujo_catecismo_1686', passageId: p.passages[57].id },
  );
  await page.screenshot({
    path: path.join(root, 'docs/reviews/round-2-screenshots/09-pdf-recheck-light.png'),
  });
  result.status = 'passed';
} catch (e) {
  result.status = 'failed';
  result.error = String(e);
} finally {
  await fs.writeFile(
    path.join(root, 'docs/reviews/round-2-pdf-recheck.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  await app.close();
  console.log(JSON.stringify(result));
}

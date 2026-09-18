import { expect, test } from '@playwright/test';
import type { SourcePreview } from '../src/domain/authoring';

test('ordinary source review explains the separated meanings before opening technical details', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  const savedBefore = await page.evaluate(() => localStorage.getItem('simulated-next:simulated:a'));
  await page.evaluate(() => {
    const preview: SourcePreview = {
      previewId: 'simulated-definition-repair',
      kind: 'source',
      passageId: 'passage-a',
      targetPassageId: 'passage-a',
      sourceFingerprint: 'simulated-source-v1',
      raw: 'nhemoabare',
      diff: '+nhemoabare = (nhe * (mo * abare)).var(1).base_nominal().copy()\n+l += nhemoabare',
      reviewSummary: { kind: 'passage-update', analysisChanged: true, passageOrdinal: 1 },
      definitionRepairs: [
        {
          base: 'abaré',
          compound: 'nhemoabaré',
          before: 'sacramento da ordem',
          baseDefinition: 'padre',
          compoundDefinition: 'sacramento da ordem',
        },
      ],
      lexicalAdditions: [
        {
          name: 'abare',
          headword: 'abaré',
          expression: 'Noun("abaré", definition="padre")',
          definition: 'padre',
        },
        {
          name: 'nhemoabare',
          headword: 'nhemoabaré',
          expression: '(nhe * (mo * abare)).var(1).base_nominal().copy()',
          definition: 'sacramento da ordem',
        },
      ],
    };
    window.__nextControl.responses.source_preview = preview;
  });

  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar passagem e léxico', exact: true });
  await expect(review).toBeVisible();
  const notice = review.getByRole('region', { name: 'Significados separados nesta revisão' });
  await expect(notice.getByRole('heading')).toHaveText('Significado do conjunto corrigido');
  await expect(notice).toContainText('A definição de nhemoabaré estava na peça abaré.');
  await expect(notice).toContainText('restaura o significado individual da peça');
  const words = review.getByRole('region', { name: 'Palavras desta revisão' });
  const base = words
    .getByRole('listitem')
    .filter({ has: page.getByText('abaré', { exact: true }) });
  const compound = words
    .getByRole('listitem')
    .filter({ has: page.getByText('nhemoabaré', { exact: true }) });
  await expect(base).toContainText('padre');
  await expect(base).not.toContainText('sacramento da ordem');
  await expect(compound).toContainText('sacramento da ordem');
  await expect(review.locator('.source-review-technical')).not.toHaveAttribute('open');
  await expect(review.locator('pre:visible, code:visible')).toHaveCount(0);
  await review.screenshot({ path: '/tmp/studio-source-definition-repair.png' });

  await review.getByText('Mostrar diff técnico', { exact: true }).click();
  await expect(review.locator('pre')).toContainText('+l += nhemoabare');
  await expect(review.getByRole('row').filter({ hasText: 'nhemoabare' })).toContainText(
    'Nova entrada',
  );
  await review.getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  const result = await page.evaluate(() => ({
    requests: window.__nextControl.requests,
    saved: localStorage.getItem('simulated-next:simulated:a'),
  }));
  expect(result.saved).toBe(savedBefore);
  expect(result.requests.find(({ method }) => method === 'source_preview')?.params.raw).toBe(
    'alpha',
  );
  expect(
    result.requests.filter(({ method }) =>
      ['composition_define', 'source_apply', 'analysis_submit'].includes(method),
    ),
  ).toEqual([]);
});

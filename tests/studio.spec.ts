import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const draftKey = 'pydicate-studio:drafts:v1:example:araujo-0067';
const initialPassageId = 'example:araujo-0067';

async function openDesk(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti umẽ');
}

async function savedField(page: Page, passageId: string, field: string) {
  return page.evaluate(
    ({ key, id, name }) => {
      const text = localStorage.getItem(key);
      return text ? JSON.parse(text).drafts[id]?.[name] : null;
    },
    { key: draftKey, id: passageId, name: field },
  );
}

test('negation changes the generated result, preserves the reference and supports undo', async ({
  page,
}) => {
  await openDesk(page);
  await expect(page.getByTestId('reference-surface')).toHaveText('eporoapiti umẽ');
  await page.screenshot({ path: 'test-results/desk.png', fullPage: true });
  await page.screenshot({ path: 'test-results/desk-viewport.png' });

  await page.getByRole('checkbox', { name: 'Negar a oração inteira' }).uncheck();
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti');
  await expect(page.getByTestId('reference-surface')).toHaveText('eporoapiti umẽ');
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await expect(page.getByText('(+nde * apiti * moro).imp()', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti umẽ');
  await page.getByRole('tab', { name: 'Construção', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Negar a oração inteira' })).toBeChecked();
});

test('incomplete readings save independently, survive navigation and reload', async ({ page }) => {
  await openDesk(page);
  await page
    .getByRole('textbox', { name: /^Transcrição diplomática/ })
    .fill('eporoapiti [leitura a conferir]');
  await page
    .getByRole('textbox', { name: 'Nota de leitura', exact: true })
    .fill('Conferir a nasalidade no testemunho.');
  await expect
    .poll(() => savedField(page, initialPassageId, 'notes'))
    .toBe('Conferir a nasalidade no testemunho.');

  await page.getByRole('button', { name: /0066/ }).click();
  await page
    .getByRole('textbox', { name: 'Nota de leitura', exact: true })
    .fill('Contribuição sem análise visual.');
  await expect
    .poll(() => savedField(page, 'example:araujo-0066', 'notes'))
    .toBe('Contribuição sem análise visual.');
  await page.getByRole('button', { name: /0067/ }).click();
  await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
    'Conferir a nasalidade no testemunho.',
  );

  await page.reload();
  await expect(page.getByRole('textbox', { name: /^Transcrição diplomática/ })).toHaveValue(
    'eporoapiti [leitura a conferir]',
  );
  await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
    'Conferir a nasalidade no testemunho.',
  );
  await expect(page.getByTestId('reference-surface')).toHaveText('eporoapiti umẽ');
  await page.getByRole('button', { name: /0066/ }).click();
  await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
    'Contribuição sem análise visual.',
  );
});

test('selecting the generic-object morpheme follows its constituent across views', async ({
  page,
}) => {
  await openDesk(page);
  await page.locator('button[data-node-id="predicate"]').click();
  await page.getByRole('tab', { name: 'Morfemas', exact: true }).click();
  const objectMorpheme = page.locator('button[data-node-id="object"]');
  await expect(objectMorpheme).toContainText('poro');
  await expect(objectMorpheme).toHaveAttribute('aria-pressed', 'false');
  await objectMorpheme.click();
  await expect(objectMorpheme).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('tab', { name: 'Árvore', exact: true }).click();
  await expect(page.locator('button[data-node-id="object"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('tab', { name: 'Construção', exact: true }).click();
  await expect(page.locator('button[data-node-id="object"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('corrupt saved drafts remain intact and show a recoverable error', async ({ page }) => {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: draftKey,
    raw: '{unreadable draft',
  });
  await page.goto('/');
  await expect(page.getByText(/Os rascunhos salvos não puderam ser lidos/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar rascunho', exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(
    '{unreadable draft',
  );
});

test('export carries the changed draft and evaluated revision while preserving baseline and approval provenance', async ({
  page,
}, testInfo) => {
  await openDesk(page);
  await page.getByRole('checkbox', { name: 'Negar a oração inteira' }).uncheck();
  await page
    .getByRole('textbox', { name: 'Nota de leitura', exact: true })
    .fill('Proposta para revisão, sem nova aprovação.');
  await expect(page.getByTestId('generated-surface')).toHaveText('eporoapiti');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar contribuição', exact: true }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('pydicate-contribuicao-67.json');
  const path = testInfo.outputPath('contribution.json');
  await download.saveAs(path);
  const contribution = JSON.parse(await readFile(path, 'utf8'));
  expect(contribution).toMatchObject({
    format: 'pydicate-studio-contribution',
    version: 1,
    passage: {
      legacyId: 'araujo_catecismo_1686:0067',
      sourceExpression: '-(+nde * apiti * moro).imp()',
    },
    draft: { notes: 'Proposta para revisão, sem nova aprovação.', analysis: { negated: false } },
    reference: { text: 'eporoapiti umẽ', provenance: 'example' },
    evaluation: {
      expression: '(+nde * apiti * moro).imp()',
      surface: 'eporoapiti',
      origin: 'snapshot',
    },
    editorialApproval: null,
  });
  expect(contribution.evaluation.revisionId).toBe(contribution.draft.revisionId);
  expect(contribution.evaluation.engineFingerprint).toBeTruthy();
});

test('the reading desk fits a narrow screen without horizontal page scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDesk(page);
  await expect(page.getByRole('button', { name: /0067/ })).toBeInViewport();
  await expect(page.getByTestId('generated-surface')).toBeInViewport();
  await expect(
    page.getByRole('textbox', { name: 'Transcrição diplomática', exact: true }),
  ).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  await expect(page.getByRole('button', { name: 'Salvar rascunho', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/desk-mobile.png', fullPage: true });
  await page.screenshot({ path: 'test-results/desk-mobile-viewport.png' });
  const showSource = page.getByRole('button', { name: 'Mostrar fonte', exact: true });
  await expect(showSource).toContainText('Ver fonte');
  await showSource.click();
  const diplomatic = page.getByRole('textbox', { name: 'Transcrição diplomática', exact: true });
  await diplomatic.scrollIntoViewIfNeeded();
  await expect(diplomatic).toBeInViewport();
});

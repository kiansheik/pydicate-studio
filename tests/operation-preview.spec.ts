import { expect, test, type Page } from '@playwright/test';
import type { NodeEvaluation } from '../src/domain/authoring';

async function requestCount(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => window.operationPreview.requests.length)).toBe(count);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/operation-preview-harness.html');
  await expect(page.getByText('Escolha a peça que falta.', { exact: true })).toBeVisible();
});

test('operation preview waits for complete inputs and debounces candidates without mutation calls', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-20T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-20T12:00:01Z'));
  expect(await page.evaluate(() => window.operationPreview.requests)).toEqual([]);
  await page.evaluate(() => window.operationPreview.update({ raw: 'first' }));
  await expect(page.getByRole('status')).toHaveText('Calculando a forma…');
  await page.clock.fastForward(100);
  expect(await page.evaluate(() => window.operationPreview.requests)).toEqual([]);
  await page.evaluate(() => window.operationPreview.update({ raw: 'second' }));
  await page.clock.fastForward(199);
  expect(await page.evaluate(() => window.operationPreview.requests)).toEqual([]);
  await page.clock.fastForward(1);
  await requestCount(page, 1);
  await page.evaluate(() =>
    window.operationPreview.resolve(0, {
      tree: { evaluation: { status: 'ok', surface: 'forma do nó' } },
    }),
  );
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveText('forma do nó');
  expect(await page.evaluate(() => window.operationPreview.requests)).toEqual([
    {
      method: 'evaluate_expression',
      params: {
        raw: 'second',
        passageId: 'passage:test',
        sourceId: 'source:test',
        revisionId: 'revision:1',
        engineFingerprint: 'engine:test',
      },
    },
  ]);
});

test('pending and superseded operation previews never show the previous candidate form', async ({
  page,
}) => {
  await page.evaluate(() => window.operationPreview.update({ raw: 'first' }));
  await requestCount(page, 1);
  await page.evaluate(() => window.operationPreview.resolve(0));
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveText('forma:first');
  await page.evaluate(() => window.operationPreview.update({ raw: 'second' }));
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Calculando a forma…');
  await requestCount(page, 2);
  await page.evaluate(() => window.operationPreview.update({ raw: 'third' }));
  await requestCount(page, 3);
  await page.evaluate(() => window.operationPreview.resolve(2));
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveText('forma:third');
  await page.evaluate(() => window.operationPreview.resolve(1));
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveText('forma:third');
});

test('operation preview rejects mismatched evidence and detached or changed editing contexts', async ({
  page,
}) => {
  const mismatches = [
    { expression: 'wrong' },
    { revisionId: 'old' },
    { engineFingerprint: 'old' },
    { origin: 'snapshot' },
  ];
  for (const [index, mismatch] of mismatches.entries()) {
    await page.evaluate(
      (index) => window.operationPreview.update({ raw: 'candidate', contextKey: `edit:${index}` }),
      index,
    );
    await requestCount(page, index + 1);
    await page.evaluate(({ index, mismatch }) => window.operationPreview.resolve(index, mismatch), {
      index,
      mismatch,
    });
    await expect(page.getByRole('alert')).toContainText('A análise ou o motor mudou');
    await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveCount(0);
  }
  await page.evaluate(() => window.operationPreview.update({ contextKey: 'next-operation' }));
  await requestCount(page, 5);
  await page.evaluate(() =>
    window.operationPreview.update({
      passageId: 'passage:next',
      sourceId: 'source:next',
      revisionId: 'revision:2',
      engineFingerprint: 'engine:next',
    }),
  );
  await requestCount(page, 6);
  await page.evaluate(() => window.operationPreview.resolve(4, { surface: 'old context' }));
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.operationPreview.show(false));
  await page.evaluate(() => window.operationPreview.resolve(5, { surface: 'detached context' }));
  await expect(page.getByRole('region', { name: 'Prévia do resultado' })).toHaveCount(0);
  await page.evaluate(() => window.operationPreview.show(true));
  await requestCount(page, 7);
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.operationPreview.resolve(6, { surface: 'current context' }));
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveText('current context');
});

test('operation preview distinguishes empty forms, scalar values, incomplete branches and evaluation errors', async ({
  page,
}) => {
  const states: NodeEvaluation[] = [
    { status: 'ok', surface: '' },
    { status: 'value', value: '2' },
    { status: 'missing', message: 'Falta argumento.' },
    { status: 'blocked', message: 'Peça indisponível.' },
    { status: 'unavailable', message: 'Sem realização isolada.' },
    { status: 'error', message: 'Operação incompatível.' },
  ];
  for (const [index, evaluation] of states.entries()) {
    await page.evaluate(
      (index) => window.operationPreview.update({ raw: `state:${index}` }),
      index,
    );
    await requestCount(page, index + 1);
    await page.evaluate(
      ({ index, evaluation }) =>
        window.operationPreview.resolve(index, {
          surface: 'DO NOT FALL BACK',
          tree: { evaluation },
        }),
      { index, evaluation },
    );
    await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveCount(0);
    if (evaluation.status === 'ok')
      await expect(
        page.getByText('A operação produz uma forma vazia.', { exact: true }),
      ).toBeVisible();
    else if (evaluation.status === 'value')
      await expect(page.getByLabel('Valor previsto', { exact: true })).toHaveText('2');
    else await expect(page.getByText(evaluation.message, { exact: true })).toBeVisible();
  }
  await page.evaluate(() => window.operationPreview.update({ raw: 'error' }));
  await requestCount(page, 7);
  await page.evaluate(() => window.operationPreview.reject(6, 'SIMULATED_EVALUATION_FAILURE'));
  await expect(page.getByRole('alert')).toHaveText('SIMULATED_EVALUATION_FAILURE');
  await page.evaluate(() => window.operationPreview.update({ raw: 'partial' }));
  await requestCount(page, 8);
  await page.evaluate(() =>
    window.operationPreview.resolve(7, {
      evaluationStatus: 'partial',
      tree: { evaluation: { status: 'ok', surface: 'forma parcial' } },
      failures: [{ nodeId: 'root', message: 'Anotação incompleta.' }],
    }),
  );
  await expect(page.getByText('A avaliação ainda está incompleta.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Forma prevista', { exact: true })).toHaveText('forma parcial');
  await expect(page.getByText('Anotação incompleta.', { exact: true })).toBeVisible();
});

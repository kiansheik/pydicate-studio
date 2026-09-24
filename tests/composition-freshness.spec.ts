import { expect, test, type Page } from '@playwright/test';
import type { AuthorNode } from '../src/domain/authoring';
import type { StudioBridge } from '../src/domain/types';

const original = 'potar * moro';
const revised = '(studio_define((potar * moro), "dictionary whole meaning"))';

declare global {
  interface Window {
    compositionFixture: {
      requests: Record<string, unknown>[];
      finish: (index: number, response?: Record<string, unknown>) => void;
    };
  }
}

/** Explicitly simulated source/evaluation evidence: these cases verify delayed
 * UI writes and identities, not dictionary matching or linguistic correctness.
 */
async function open(page: Page) {
  await page.addInitScript(
    ({ original }) => {
      const root = (raw: string): AuthorNode =>
        raw === original
          ? {
              id: 'root',
              kind: 'binary',
              label: '*',
              operator: '*',
              code: raw,
              start: 0,
              end: raw.length,
              evaluation: { status: 'ok', surface: 'moropotara' },
              children: [
                {
                  slot: 'left',
                  node: {
                    id: 'root/left',
                    kind: 'reference',
                    label: 'potar',
                    lexicalReference: 'potar',
                    code: 'potar',
                    start: 0,
                    end: 5,
                    children: [],
                    baseDefinition: 'want',
                  },
                },
                {
                  slot: 'right',
                  node: {
                    id: 'root/right',
                    kind: 'reference',
                    label: 'moro',
                    lexicalReference: 'moro',
                    code: 'moro',
                    start: 8,
                    end: 12,
                    children: [],
                    baseDefinition: 'people',
                  },
                },
              ],
            }
          : {
              id: 'root',
              kind: 'reference',
              label: raw,
              code: raw,
              start: 0,
              end: raw.length,
              children: [],
              evaluation: { status: 'ok', surface: raw },
            };
      window.canvasFixture = {
        raw: original,
        root: root(original),
        evaluatedRoot: root(original),
        canvas: { fragments: [], positions: {} },
      };
      const pending: ((response: Record<string, unknown>) => void)[] = [];
      window.compositionFixture = {
        requests: [],
        finish(index, response = {}) {
          const params = this.requests[index];
          pending[index]({
            raw: 'studio_define((potar * moro), "dictionary whole meaning")',
            revisionId: params.revisionId,
            engineFingerprint: params.engineFingerprint,
            ...response,
          });
        },
      };
      window.studio = {
        recordUsage: async () => undefined,
        invoke: async (method: string, params: Record<string, unknown>) => {
          if (method === 'parse_expression')
            return {
              raw: params.raw,
              revisionId: params.revisionId,
              root: root(String(params.raw)),
              diagnostics: [],
            };
          if (method === 'evaluate_expression')
            return {
              tree: root(String(params.raw)),
              failures: [],
              engineFingerprint: params.engineFingerprint,
              revisionId: params.revisionId,
            };
          if (method === 'node_definition') {
            window.compositionFixture.requests.push(structuredClone(params));
            return new Promise<Record<string, unknown>>((resolve) => pending.push(resolve));
          }
          if (method === 'dictionary_lookup')
            return {
              results: [],
              total: 0,
              datasetFingerprint: 'sha256:' + 'd'.repeat(64),
              engineFingerprint: params.engineFingerprint,
            };
          if (method === 'structure_search') return { results: [], total: 0 };
          throw new Error('Unexpected composition fixture operation ' + method);
        },
      } as unknown as StudioBridge;
    },
    { original },
  );
  await page.goto('/tests/canvas-harness.html');
  await expect(page.locator('#canvas-ready')).toHaveText('ready');
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
}

async function startDefinition(page: Page, count = 1) {
  await page.locator('[data-canvas-key="main:root"] > [aria-pressed]').click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Definir significado do conjunto…', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Definir composição', exact: true });
  await dialog.getByLabel('Definição do conjunto').fill('dictionary whole meaning');
  await dialog.getByRole('button', { name: 'Usar definição no rascunho', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.compositionFixture.requests.length))
    .toBe(count);
  return dialog;
}

async function finish(page: Page, index = 0, response: Record<string, unknown> = {}) {
  await page.evaluate(
    async ({ index, response }) => {
      window.compositionFixture.finish(index, response);
      // Let the bridge continuation and the resulting React render settle.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
    { index, response },
  );
}

test('a current composition response still applies once and retains a working undo', async ({
  page,
}) => {
  await open(page);
  await startDefinition(page);
  await finish(page);
  await expect(page.locator('#canvas-raw')).toHaveText(revised);
  await expect(page.locator('#canvas-history')).toHaveText('1');
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.locator('#canvas-raw')).toHaveText(original);
});

test('cancelled composition response cannot change the draft or undo history', async ({ page }) => {
  await open(page);
  const dialog = await startDefinition(page);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await finish(page);
  await expect(page.locator('#canvas-raw')).toHaveText(original);
  await expect(page.locator('#canvas-history')).toHaveText('0');
});

test('an unmounted canvas cannot overwrite a newer draft with its delayed composition response', async ({
  page,
}) => {
  await open(page);
  await startDefinition(page);
  await page.evaluate(() => window.canvasShowTree(false));
  await expect(
    page.getByRole('group', { name: 'Diagrama interativo das operações Pydicate' }),
  ).toHaveCount(0);
  await page.evaluate(() => window.canvasReplaceRaw('newer_draft'));
  await expect(page.locator('#canvas-raw')).toHaveText('newer_draft');
  await finish(page);
  await expect(page.locator('#canvas-raw')).toHaveText('newer_draft');
  await expect(page.locator('#canvas-history')).toHaveText('1');
});

test('an engine change invalidates an in-flight composition even when raw and revision are unchanged', async ({
  page,
}) => {
  await open(page);
  await startDefinition(page);
  await page.evaluate(() => window.canvasSetEngineFingerprint('engine:replacement'));
  await expect(page.locator('#canvas-engine')).toHaveText('engine:replacement');
  await finish(page);
  await expect(page.locator('#canvas-raw')).toHaveText(original);
  await expect(page.locator('#canvas-history')).toHaveText('0');
});

for (const field of ['revisionId', 'engineFingerprint']) {
  test(`a composition response with a different ${field} cannot change the draft`, async ({
    page,
  }) => {
    await open(page);
    await startDefinition(page);
    await finish(page, 0, { [field]: 'wrong-identity' });
    await expect(page.locator('#canvas-raw')).toHaveText(original);
    await expect(page.locator('#canvas-history')).toHaveText('0');
    await expect(
      page.getByText('A composição mudou durante a consulta. Abra novamente sua definição.', {
        exact: true,
      }),
    ).toBeVisible();
  });
}

test('a cancelled earlier response cannot clear the busy state of a newer composition request', async ({
  page,
}) => {
  await open(page);
  const first = await startDefinition(page);
  await first.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const current = await startDefinition(page, 2);
  await finish(page, 0);
  await expect(current.getByLabel('Definição do conjunto')).toBeDisabled();
  await expect(page.locator('#canvas-raw')).toHaveText(original);
  await finish(page, 1);
  await expect(page.locator('#canvas-raw')).toHaveText(revised);
  await expect(page.locator('#canvas-history')).toHaveText('1');
});

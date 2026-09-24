import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { StudioBridge } from '../src/domain/types';
import type { OperationFixture } from './expression-tree-harness';

const projectParent = process.env.PYDICATE_PROJECT_PARENT ?? path.resolve('..');
const hasCorpus = existsSync(
  path.join(projectParent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py'),
);
const inspect = `import json,sys
from pathlib import Path
sys.path.insert(0,'python')
from studio_authoring import expression_tree,source_entries
payload=json.load(sys.stdin)
result=expression_tree(payload['raw'])
if payload.get('evaluate'):
    from authoring_runtime import configure,namespace_for,realize
    corpus=configure(Path(payload['parent']))
    source=corpus/'historic/araujo_catecismo_1686.tu.py'
    entry=source_entries(source)[80]
    result=realize(payload['raw'],namespace_for(corpus,source,entry['statementLine']))
print(json.dumps(result,ensure_ascii=False))`;

function inspectExpression(raw: string, evaluate = false) {
  return JSON.parse(
    execFileSync('python3', ['-B', '-c', inspect], {
      input: JSON.stringify({ raw, evaluate, parent: projectParent }),
      encoding: 'utf8',
    }),
  );
}

interface PreviewRequest {
  raw: string;
  passageId: string;
  revisionId: string;
  engineFingerprint: string;
}

async function openTree(page: Page, raw: string, expansion = 'tym.copy()') {
  const requests: PreviewRequest[] = [];
  await page.route('**/__operation_parse', async (route) => {
    const { raw: nextRaw } = route.request().postDataJSON() as { raw: string };
    await route.fulfill({ json: { raw: nextRaw, root: inspectExpression(nextRaw).root } });
  });
  await page.route('**/__scope_preview_rpc', async (route) => {
    const { method, params } = route.request().postDataJSON() as {
      method: string;
      params: PreviewRequest;
    };
    if (method === 'lexicon_inspect') {
      await route.fulfill({ json: { safeOccurrenceExpansion: expansion } });
      return;
    }
    if (method !== 'evaluate_expression') {
      await route.fulfill({ json: { results: [] } });
      return;
    }
    requests.push(params);
    await route.fulfill({
      json: {
        ...inspectExpression(params.raw, true),
        expression: params.raw,
        revisionId: params.revisionId,
        engineFingerprint: params.engineFingerprint,
        origin: 'engine',
      },
    });
  });
  await page.addInitScript(
    (fixture: OperationFixture) => {
      window.operationFixture = fixture;
      window.operationUsage = [];
      window.studio = {
        recordUsage: async (record: unknown) => window.operationUsage.push(record),
        invoke: async (method: string, params: Record<string, unknown>) => {
          const response = await fetch('/__scope_preview_rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, params }),
          });
          return response.json();
        },
      } as unknown as StudioBridge;
    },
    { raw, root: inspectExpression(raw).root, engineFingerprint: 'scope-preview-engine' },
  );
  await page.goto('/tests/expression-tree-harness.html');
  await expect(page.locator('#operation-parse-state')).toHaveText('pronto');
  await expect(page.locator('.tree-scope-editor')).toBeVisible();
  return requests;
}

async function enterCode(page: Page, label: string, value: string) {
  const input = page.getByRole('textbox', { name: label, exact: true, includeHidden: true });
  if (!(await input.isVisible()))
    await input.locator('xpath=ancestor::details[1]').locator('summary').click();
  await input.fill(value);
}

test.beforeEach(() => test.skip(!hasCorpus, 'Selected local corpus is not installed'));

test('adding a tree operation shows the real resulting form before changing the draft', async ({
  page,
}) => {
  const requests = await openTree(page, 'tym');
  const composer = page.locator('.tree-composer');
  await expect(composer.getByRole('region', { name: 'Prévia do resultado' })).toContainText(
    'Complete os argumentos',
  );
  expect(requests).toHaveLength(0);
  await page.getByLabel('Posição do novo argumento', { exact: true }).selectOption('left');
  await enterCode(page, 'Argumento da operação na árvore', 'emi');
  await expect(composer.getByLabel('Forma prevista', { exact: true })).toHaveText('temityma');
  expect(requests).toEqual([
    {
      raw: '((emi) * (tym))',
      passageId: 'operation-fixture',
      revisionId: 'operation-0',
      engineFingerprint: 'scope-preview-engine',
    },
  ]);
  await expect(page.locator('#operation-raw')).toHaveText('tym');
  await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
  await expect(page.locator('#operation-raw')).toHaveText(requests[0].raw);
});

test('a changed operator previews the entire expression and reports an invalid nested result before confirmation', async ({
  page,
}) => {
  const raw = 'og * (emi * tym)';
  const requests = await openTree(page, raw);
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await page
    .getByRole('group', { name: 'Diagrama interativo das operações Pydicate' })
    .locator('[data-source-node="root/right"] > [aria-pressed]')
    .click();
  const details = page.locator('.tree-modify-operation');
  await expect(details).not.toHaveAttribute('open', '');
  expect(requests).toHaveLength(0);
  await details.locator('summary').click();
  await page.getByLabel('Novo operador desta parte', { exact: true }).selectOption('/');
  await expect(details.getByRole('region', { name: 'Prévia do resultado' })).toContainText(
    'Não foi possível obter a forma.',
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].raw).toBe('og * (((emi) / (tym)))');
  await expect(page.locator('#operation-raw')).toHaveText(raw);
  await page.getByRole('button', { name: 'Trocar operador', exact: true }).click();
  await expect(page.locator('#operation-raw')).toHaveText(requests[0].raw);
});

test('reuse, expansion and raw replacement previews stay read-only and closed panels do not evaluate', async ({
  page,
}) => {
  const requests = await openTree(page, 'tym');
  const rawPanel = page.locator('.tree-raw-replacement');
  const reusePanel = page.locator('.tree-lexical-insert');
  await rawPanel.locator('summary').click();
  await page.getByLabel('Expressão da parte na árvore', { exact: true }).fill('emi * tym');
  // Closing during the debounce must cancel the pending read-only evaluation.
  await rawPanel.locator('summary').click();
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(0);
  await rawPanel.locator('summary').click();
  await expect(rawPanel.getByLabel('Forma prevista', { exact: true })).toHaveText('temityma');
  expect(requests[0].raw).toBe('(emi * tym)');
  await rawPanel.locator('summary').click();
  await expect(rawPanel.getByRole('region', { name: 'Prévia do resultado' })).toHaveCount(0);

  await reusePanel.locator(':scope > summary').click();
  await enterCode(page, 'Buscar léxico na árvore', 'emi * tym');
  await expect(reusePanel.getByLabel('Forma prevista', { exact: true })).toHaveText('temityma');
  await reusePanel.locator(':scope > summary').click();
  await expect(reusePanel.getByRole('region', { name: 'Prévia do resultado' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Preparar cópia desta ocorrência', exact: true }).click();
  await expect(
    page.locator('.runtime-expansion').getByLabel('Forma prevista', { exact: true }),
  ).toHaveText('tym');
  await page.getByRole('button', { name: 'Cancelar cópia', exact: true }).click();
  await expect(page.locator('.runtime-expansion')).toHaveCount(0);
  await expect(page.locator('#operation-raw')).toHaveText('tym');
  expect(requests).toHaveLength(3);
  expect(requests.map((request) => request.raw)).toEqual([
    '(emi * tym)',
    '(emi * tym)',
    '(tym.copy())',
  ]);

  await rawPanel.locator('summary').click();
  await expect(rawPanel.getByLabel('Forma prevista', { exact: true })).toHaveText('temityma');
  await page.getByRole('button', { name: 'Aplicar substituição', exact: true }).click();
  await expect(page.locator('#operation-raw')).toHaveText(requests.at(-1)!.raw);
});

test('editing an intermediate operation keeps its local meaning without introducing another tree level', async ({
  page,
}) => {
  const raw = "og * studio_define(emi * tym, 'plantação descrita')";
  const requests = await openTree(page, raw);
  const graph = page.getByRole('group', { name: 'Diagrama interativo das operações Pydicate' });
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(graph.locator('[data-source-node]')).toHaveCount(5);
  await graph.locator('[data-source-node="root/right"] > [aria-pressed]').click();
  await expect(page.locator('.tree-current-expression')).toHaveText(
    "studio_define(emi * tym, 'plantação descrita')",
  );
  const details = page.locator('.tree-modify-operation');
  await details.locator('summary').click();
  await page.getByLabel('Novo operador desta parte', { exact: true }).selectOption('/');
  await expect(details.getByRole('region', { name: 'Prévia do resultado' })).toContainText(
    'Não foi possível obter a forma.',
  );
  const expected = "og * studio_define(((emi) / (tym)), 'plantação descrita')";
  expect(requests.at(-1)!.raw).toBe(expected);
  await expect(page.locator('#operation-raw')).toHaveText(raw);
  await page.getByRole('button', { name: 'Trocar operador', exact: true }).click();
  await expect(page.locator('#operation-raw')).toHaveText(expected);
  await expect(page.locator('#operation-parse-state')).toHaveText('pronto');
  await expect(graph.locator('[data-source-node]')).toHaveCount(5);

  await details.locator('summary').click();
  await page.getByRole('button', { name: 'Manter lado direito tym', exact: true }).click();
  await expect(page.locator('#operation-raw')).toHaveText(
    "og * studio_define(((tym)), 'plantação descrita')",
  );
  await expect(page.locator('#operation-parse-state')).toHaveText('pronto');
  await expect(graph.locator('[data-source-node]')).toHaveCount(3);
});

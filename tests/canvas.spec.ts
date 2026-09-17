import { test, expect, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { StudioBridge } from '../src/domain/types';
import type { CanvasState } from '../src/domain/canvas';
import type { CanvasFixture } from './canvas-harness';

const parent = process.env.PYDICATE_PROJECT_PARENT ?? path.resolve('..');
const hasCorpus = existsSync(
  path.join(parent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py'),
);
const runner = `import json,sys
from pathlib import Path
sys.path.insert(0,'python')
from studio_authoring import expression_tree,source_entries
payload=json.load(sys.stdin);raw=payload.get('raw','')
parsed=expression_tree(raw)
if payload['method']=='parse_expression':
 result={**parsed,'raw':raw,'revisionId':payload.get('revisionId','fixture')}
else:
 from authoring_runtime import configure,namespace_for,realize,predicate_catalog,predicate_create,dictionary_predicate
 from navarro_search import dictionary_entry,dictionary_lookup
 corpus=configure(Path(payload['parent']))
 path=corpus/'historic/araujo_catecismo_1686.tu.py'
 entry=source_entries(path)[80]
 namespace=namespace_for(corpus,path,entry['statementLine'])
 if payload['method']=='dictionary_lookup': result=dictionary_lookup(Path(payload['parent'])/'nhe-enga',payload)
 elif payload['method']=='dictionary_predicate':
  descriptor,row=dictionary_entry(Path(payload['parent'])/'nhe-enga',payload)
  result={**dictionary_predicate({**payload,'entry':descriptor,'entryRecord':row},namespace),'engineFingerprint':'canvas-fixture-engine','revisionId':payload.get('revisionId','fixture')}
 elif payload['method']=='predicate_catalog': result=predicate_catalog(namespace)
 elif payload['method']=='predicate_create': result=predicate_create(payload,namespace)
 else:
  realized=realize(raw,namespace) if parsed['root'] else None
  result=({'raw':raw,'root':parsed['root'],'evaluatedRoot':realized['tree'] if realized else None,'failures':realized['failures'] if realized else []} if payload['method']=='fixture' else {**realized,'expression':raw,'revisionId':payload.get('revisionId','fixture'),'engineFingerprint':'canvas-fixture-engine','origin':'engine'})
print(json.dumps(result,ensure_ascii=False))`;

function run(method: string, params: Record<string, unknown>) {
  return JSON.parse(
    execFileSync('python3', ['-B', '-c', runner], {
      input: JSON.stringify({ ...params, method, parent }),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
}
async function openCanvas(
  page: Page,
  raw: string,
  canvas: CanvasState = { fragments: [], positions: {} },
) {
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const source = { sourceId: 'araujo_catecismo_1686', label: 'Léxico local' };
    let result: unknown;
    if (request.method === 'dictionary_lookup') result = { results: [], total: 0 };
    else if (request.method === 'structure_search')
      result = {
        results: [
          {
            id: 'lookup:ypy',
            surface: 'ypy',
            name: 'ypy',
            expression: 'ypy',
            kind: 'reference',
            source,
            match: 'exact',
          },
        ],
        total: 1,
        indexFingerprint: 'fixture',
      };
    else if (request.method === 'structure_resolve')
      result = { surface: 'ypy', expression: 'ypy', kind: 'reference', source };
    else result = run(request.method, request.params);
    await route.fulfill({ json: result });
  });
  await page.addInitScript(
    (fixture) => {
      window.canvasFixture = fixture;
      window.studio = {
        recordUsage: async () => undefined,
        invoke: async (method: string, params: Record<string, unknown>) => {
          const response = await fetch('/__canvas_rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, params }),
          });
          return response.json();
        },
      } as unknown as StudioBridge;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            window.canvasClipboard = text;
          },
        },
      });
    },
    { ...run('fixture', { raw }), canvas } as CanvasFixture,
  );
  await page.goto('/tests/canvas-harness.html');
  await ready(page);
  return requests;
}
const svg = (page: Page) =>
  page.getByRole('group', { name: 'Diagrama interativo das operações Pydicate' });
const card = (page: Page, key: string) => svg(page).locator(`[data-canvas-key="${key}"]`);
const node = (page: Page, key: string) => card(page, key).locator(':scope > [aria-pressed]');
async function ready(page: Page) {
  await expect(page.locator('#canvas-ready')).toHaveText('ready');
  await expect(svg(page)).toBeVisible();
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
}
async function menu(page: Page, key: string, action: RegExp | string) {
  await node(page, key).click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Ações da peça' })
    .getByRole('menuitem', { name: action })
    .click();
}
async function center(locator: Locator) {
  const box = await locator.locator('rect.runtime-node-body').first().boundingBox();
  if (!box) throw new Error('Canvas node has no visible drag body');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function dragTo(page: Page, source: string, target: string) {
  const a = await center(node(page, source));
  const b = await center(node(page, target));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(card(page, target)).toHaveClass(/is-drop-target/);
  await page.mouse.up();
}
async function blankCanvasPoint(page: Page) {
  return svg(page).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const isBlank = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest('svg') === element && !hit.closest('[data-canvas-key], [role="button"]');
    };
    for (let y = bounds.top + 30; y < bounds.bottom - 90; y += 55) {
      for (let x = bounds.right - 110; x > bounds.left + 30; x -= 75) {
        if (isBlank(x, y) && isBlank(x + 60, y + 45)) return { x, y };
      }
    }
    throw new Error('No visible blank canvas area found outside the active panel');
  });
}

test.beforeEach(() => test.skip(!hasCorpus, 'Selected local corpus is not installed'));

test('an open inline query survives a refreshed revision without stored text or automatic insertion', async ({
  page,
}) => {
  const requests = await openCanvas(page, 'tym');
  const query = page.getByRole('combobox', { name: 'Adicionar peça: buscar em tupi', exact: true });
  await query.fill('y py');
  await expect(page.getByRole('option').filter({ hasText: 'Léxico local' })).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem('studio:piece-query:canvas-fixture');
    window.canvasReplaceRaw('tym # refreshed context');
  });
  await expect(query).toHaveValue('y py');
  await expect
    .poll(() => requests.filter((request) => request.method === 'structure_search').length)
    .toBe(2);
  expect(
    requests.filter((request) => request.method === 'structure_search').at(-1)?.params,
  ).toMatchObject({ passageId: 'canvas-fixture', query: 'y py' });
  await expect(page.getByRole('option').filter({ hasText: 'Léxico local' })).toBeVisible();
  await expect(page.locator('#canvas-raw')).toHaveText('tym # refreshed context');
  expect(requests.filter((request) => request.method === 'structure_resolve')).toHaveLength(0);
});

for (const initialRaw of ['', 'tym']) {
  test(`visible canvas search inserts a verified ${initialRaw ? 'loose piece' : 'first piece'} without a panel and undoes atomically`, async ({
    page,
  }) => {
    const requests = await openCanvas(page, initialRaw);
    const query = page.getByRole('combobox', {
      name: 'Adicionar peça: buscar em tupi',
      exact: true,
    });
    await expect(query).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await query.fill('y py');
    await page.getByRole('option').filter({ hasText: 'Léxico local' }).click();
    await expect
      .poll(() => page.evaluate(() => window.canvasSnapshot))
      .toMatchObject(
        initialRaw
          ? { raw: initialRaw, canvas: { fragments: [{ raw: 'ypy' }] } }
          : { raw: 'ypy', canvas: { fragments: [] } },
      );
    expect(requests.filter((request) => request.method === 'structure_resolve')).toHaveLength(1);
    expect(requests.find((request) => request.method === 'structure_search')?.params.query).toBe(
      'y py',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(query).toBeVisible();
    await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
    await expect
      .poll(() => page.evaluate(() => window.canvasSnapshot))
      .toEqual({ raw: initialRaw, canvas: { fragments: [], positions: {} } });
  });
}

test('dismissing visible search rejects an in-flight resolved piece and still permits a fresh selection', async ({
  page,
}) => {
  await openCanvas(page, 'tym');
  let releaseResolution!: () => void;
  const heldResolution = new Promise<void>((resolve) => {
    releaseResolution = resolve;
  });
  let resolving = false;
  let held = false;
  await page.route('**/__canvas_rpc', async (route) => {
    if (route.request().postDataJSON().method !== 'structure_resolve' || held)
      return route.fallback();
    held = true;
    resolving = true;
    await heldResolution;
    await route.fulfill({
      json: {
        surface: 'ypy',
        expression: 'ypy',
        kind: 'reference',
        source: { sourceId: 'araujo_catecismo_1686', label: 'Léxico local' },
      },
    });
  });
  const query = page.getByRole('combobox', { name: 'Adicionar peça: buscar em tupi', exact: true });
  await query.fill('ypy');
  await page.getByRole('option').filter({ hasText: 'Léxico local' }).click();
  await expect.poll(() => resolving).toBe(true);
  const blank = await blankCanvasPoint(page);
  await page.mouse.click(blank.x, blank.y);
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/__canvas_rpc') &&
      response.request().postDataJSON().method === 'structure_resolve',
  );
  releaseResolution();
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({
    raw: 'tym',
    canvas: { fragments: [], positions: {} },
  });
  await expect(page.getByRole('option')).toHaveCount(0);
  await query.fill('y py');
  await page.getByRole('option').filter({ hasText: 'Léxico local' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.canvasSnapshot.canvas.fragments.map((piece) => piece.raw)),
    )
    .toEqual(['ypy']);
});

test('a blank canvas drag dismisses the add panel without consuming normal panning', async ({
  page,
}) => {
  await openCanvas(page, 'tym');
  await page.getByRole('button', { name: 'Adicionar peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette.getByRole('tab', { name: 'Criar peça', exact: true }).click();
  await palette.getByRole('button', { name: 'Nome', exact: true }).click();
  await palette.getByRole('textbox', { name: 'Palavra em tupi', exact: true }).fill('ara');
  await expect(palette).toBeVisible();
  const initialView = await svg(page).getAttribute('viewBox');
  const blank = await blankCanvasPoint(page);
  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await expect(palette).not.toBeVisible();
  await page.mouse.move(blank.x + 60, blank.y + 45, { steps: 6 });
  await page.mouse.up();
  await expect(svg(page)).not.toHaveAttribute('viewBox', initialView!);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({
    raw: 'tym',
    canvas: { fragments: [], positions: {} },
  });
});

test('clicking a canvas node dismisses the operation panel and selects that node', async ({
  page,
}) => {
  await openCanvas(page, '(emi * tym) + no');
  await menu(page, 'main:root/left', 'Adicionar operação');
  const operation = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  await operation.getByRole('combobox', { name: 'Operação na peça' }).selectOption('/');
  await expect(operation).toBeVisible();
  await node(page, 'main:root/right').click();
  await expect(operation).not.toBeVisible();
  await expect(node(page, 'main:root/right')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#canvas-raw')).toHaveText('(emi * tym) + no');
  await menu(page, 'main:root/right', 'Adicionar operação');
  await operation.getByRole('combobox', { name: 'Operação na peça' }).selectOption('*');
  await operation.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await expect(operation).not.toBeVisible();
  await expect(page.locator('#canvas-raw')).toContainText('__studio_slot_');
});

test('clicking outside a combination panel cancels it without combining the independent pieces', async ({
  page,
}) => {
  const initial: CanvasState = {
    layout: 'bottom-up',
    fragments: [{ id: 'prefix', raw: 'emi', x: 500, y: 260 }],
    positions: {},
  };
  await openCanvas(page, 'tym', initial);
  await expect(card(page, 'prefix:root').locator('[data-evaluation-state="ok"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await dragTo(page, 'main:root', 'prefix:root');
  const combination = page.getByRole('dialog', { name: 'Combinar peças', exact: true });
  await combination
    .getByRole('combobox', { name: 'Operação para combinar peças' })
    .selectOption('*');
  await expect(combination).toBeVisible();
  const blank = await blankCanvasPoint(page);
  await page.mouse.click(blank.x, blank.y);
  await expect(combination).not.toBeVisible();
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: 'tym', canvas: initial });
});

test('add palette searches existing structures before Navarro senses and preserves its natural query', async ({
  page,
}) => {
  await openCanvas(page, 'tym');
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    if (request.method !== 'dictionary_lookup') return route.fallback();
    await route.fulfill({ json: run(request.method, request.params) });
  });
  await page.getByRole('button', { name: 'Adicionar peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  const query = palette.getByRole('combobox', {
    name: 'Palavra ou trecho da peça: buscar em tupi',
  });
  await query.fill('y py');
  await expect(palette.getByRole('option').first()).toContainText('ypy');
  await expect(palette.getByText('Dicionário Navarro · criar peça', { exact: true })).toBeVisible();
  await expect(palette.getByRole('option').first()).toContainText('Léxico local');
  await palette.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(palette).not.toBeVisible();
  await page.getByRole('button', { name: 'Adicionar peça', exact: true }).click();
  await expect(query).toHaveValue('y py');
  await expect(palette.getByRole('option').first()).toContainText('Léxico local');
  await palette.getByRole('option').first().click();
  await palette.getByRole('button', { name: 'Adicionar ao espaço', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.canvasSnapshot.canvas.fragments.map((piece) => piece.raw)),
    )
    .toEqual(['ypy']);
});

test('Navarro fallback preserves the selected sense and requires an explicit type for an unclassified entry', async ({
  page,
}) => {
  await openCanvas(page, '');
  const conversions: Record<string, unknown>[] = [];
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    if (request.method === 'structure_search')
      return route.fulfill({ json: { results: [], total: 0 } });
    if (!['dictionary_lookup', 'dictionary_predicate'].includes(request.method))
      return route.fallback();
    if (request.method === 'dictionary_predicate') conversions.push(request.params);
    await route.fulfill({ json: run(request.method, request.params) });
  });
  await page.getByRole('button', { name: 'Adicionar primeira peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette
    .getByRole('combobox', { name: 'Palavra ou trecho da peça: buscar em tupi' })
    .fill('abá');
  await palette
    .getByRole('option')
    .filter({ has: page.locator('strong').filter({ hasText: /^abá1$/ }) })
    .click();
  await expect(
    palette.getByText('Qual função esta acepção terá na construção?', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('#canvas-raw')).toHaveText('');
  await palette.getByRole('button', { name: 'Pronome', exact: true }).click();
  await expect(palette).not.toBeVisible();
  await ready(page);
  const expression = (await page.locator('#canvas-raw').textContent())!;
  expect(expression).toContain('Pronoun(');
  expect(conversions).toHaveLength(2);
  expect(Object.hasOwn(conversions[0], 'constructor')).toBe(false);
  expect(conversions[1]).toMatchObject({
    entryIndex: conversions[0].entryIndex,
    datasetFingerprint: conversions[0].datasetFingerprint,
    constructor: 'Pronoun',
  });
  const entry = run('dictionary_lookup', { query: 'abá' }).results.find(
    (entry: { optionalNumber: string }) => entry.optionalNumber === '1',
  );
  expect(run('fixture', { raw: expression }).evaluatedRoot.definition).toBe(entry.definition);
});

test('a classified Navarro sense becomes a fully evaluated lexical piece from the default search', async ({
  page,
}) => {
  await openCanvas(page, '');
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    if (request.method === 'structure_search')
      return route.fulfill({ json: { results: [], total: 0 } });
    if (!['dictionary_lookup', 'dictionary_predicate'].includes(request.method))
      return route.fallback();
    await route.fulfill({ json: run(request.method, request.params) });
  });
  await page.getByRole('button', { name: 'Adicionar primeira peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette
    .getByRole('combobox', { name: 'Palavra ou trecho da peça: buscar em tupi' })
    .fill('abá');
  await palette
    .getByRole('option')
    .filter({ has: page.locator('strong').filter({ hasText: /^abá2$/ }) })
    .click();
  await expect(palette).not.toBeVisible();
  await ready(page);
  const expression = (await page.locator('#canvas-raw').textContent())!;
  expect(expression).toContain('Noun(');
  const entry = run('dictionary_lookup', { query: 'abá' }).results.find(
    (entry: { optionalNumber: string }) => entry.optionalNumber === '2',
  );
  const result = run('fixture', { raw: expression }).evaluatedRoot;
  expect(result.definition).toBe(entry.definition);
  expect(result.evaluation.status).toBe('ok');
});

test('empty canvas bubble creates a real predicate and persists the vertical or horizontal layout', async ({
  page,
}) => {
  const requests = await openCanvas(page, '', {
    layout: 'bottom-up',
    fragments: [],
    positions: {},
  });
  await page.getByRole('button', { name: 'Adicionar primeira peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette.getByRole('tab', { name: 'Criar peça', exact: true }).click();
  await palette.getByRole('button', { name: 'Nome', exact: true }).click();
  await palette.getByRole('textbox', { name: 'Palavra em tupi', exact: true }).fill('ara');
  await palette
    .getByRole('textbox', { name: 'Significado ou observações', exact: true })
    .fill('dia');
  await palette.getByRole('button', { name: 'Criar e adicionar peça', exact: true }).click();
  await expect(palette).not.toBeVisible();
  await ready(page);
  const raw = (await page.locator('#canvas-raw').textContent())!;
  expect(raw).toContain('Noun(');
  expect(requests.find((request) => request.method === 'predicate_create')?.params).toMatchObject({
    constructor: 'Noun',
    values: { value: 'ara', definition: 'dia' },
  });
  const parsed = run('parse_expression', { raw }).root;
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  const rootCenter = await center(node(page, 'main:root'));
  const childCenter = await center(node(page, `main:${parsed.children[0].node.id}`));
  expect(rootCenter.y).toBeLessThan(childCenter.y);
  const before = requests.filter((request) => request.method === 'evaluate_expression').length;
  await page.getByRole('button', { name: 'Da esquerda para a direita', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.layout))
    .toBe('horizontal');
  expect(requests.filter((request) => request.method === 'evaluate_expression')).toHaveLength(
    before,
  );
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole('button', { name: 'Da esquerda para a direita', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#canvas-raw')).toHaveText(raw);
});

test('independent pieces dragged together choose an operator while explicit swapping remains separate', async ({
  page,
}) => {
  const initial: CanvasState = {
    layout: 'bottom-up',
    fragments: [{ id: 'prefix', raw: 'emi', x: 500, y: 260 }],
    positions: {},
  };
  await openCanvas(page, 'tym', initial);
  await expect(card(page, 'prefix:root').locator('[data-evaluation-state="ok"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await dragTo(page, 'main:root', 'prefix:root');
  const dialog = page.getByRole('dialog', { name: 'Combinar peças', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#canvas-raw')).toHaveText('tym');
  await dialog.getByRole('combobox', { name: 'Operação para combinar peças' }).selectOption('*');
  await dialog.getByRole('button', { name: 'Combinar peças', exact: true }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
  const root = run('parse_expression', {
    raw: await page.locator('#canvas-raw').textContent(),
  }).root;
  expect(root.operator).toBe('*');
  expect(root.children.map((child: { node: { code: string } }) => child.node.code)).toEqual([
    'emi',
    'tym',
  ]);
  await expect(card(page, 'main:root')).toContainText('temityma');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: 'tym', canvas: initial });
  await menu(page, 'main:root', 'Trocar com outra peça');
  await node(page, 'prefix:root').click();
  await ready(page);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#canvas-raw')).toHaveText('emi');
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments[0].raw)).toBe('tym');
});

test('context operations chain a selected variant and imperative without writing source code', async ({
  page,
}) => {
  await openCanvas(page, 'pysyro');
  await menu(page, 'main:root', 'Escolher variante…');
  const dialog = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  await dialog.getByRole('spinbutton', { name: 'Número da variante' }).fill('2');
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  await menu(page, 'main:root', 'Imperativo');
  await ready(page);
  const root = run('parse_expression', {
    raw: await page.locator('#canvas-raw').textContent(),
  }).root;
  expect(root.method).toBe('imp');
  expect(root.children[0].node.method).toBe('var');
  expect(root.children[0].node.children[1].node.code).toBe('2');
  expect(root.children[0].node.children[0].node.code).toBe('pysyro');
});

test('context-menu detach persists its orphan and reconnects into the exact hole with atomic undo', async ({
  page,
}) => {
  await openCanvas(page, 'no + (emi * tym)');
  await menu(page, 'main:root/right', 'Soltar trecho');
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments.length))
    .toBe(1);
  await ready(page);
  const state = await page.evaluate(() => window.canvasSnapshot);
  const fragment = state.canvas.fragments[0];
  expect(fragment.raw).toBe('emi * tym');
  expect(state.raw).toMatch(/__studio_slot_[a-f0-9]+/);
  await page.reload();
  await ready(page);
  await expect(
    card(page, `${fragment.id}:root`).locator('[data-evaluation-state="ok"]'),
  ).toHaveCount(1);
  await menu(page, `${fragment.id}:root`, 'Conectar ou trocar');
  await card(page, 'main:root/right')
    .getByRole('button', { name: 'Conectar no encaixe vazio' })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments.length))
    .toBe(0);
  await ready(page);
  expect(
    run('parse_expression', { raw: await page.locator('#canvas-raw').textContent() }).root
      .children[1].node.code,
  ).toBe('emi * tym');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(state);
});

test('real pointer dragging swaps occupied operands and moves an orphan into a hole', async ({
  page,
}) => {
  await openCanvas(page, 'tym / ypy');
  await dragTo(page, 'main:root/left', 'main:root/right');
  await ready(page);
  let root = run('parse_expression', { raw: await page.locator('#canvas-raw').textContent() }).root;
  expect(root.children.map((child: { node: { code: string } }) => child.node.code)).toEqual([
    'ypy',
    'tym',
  ]);
  await menu(page, 'main:root/right', 'Soltar trecho');
  await ready(page);
  const fragment = await page.evaluate(() => window.canvasSnapshot.canvas.fragments[0]);
  await expect(
    card(page, `${fragment.id}:root`).locator('[data-evaluation-state="ok"]'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await dragTo(page, `${fragment.id}:root`, 'main:root/right');
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
  root = run('parse_expression', { raw: await page.locator('#canvas-raw').textContent() }).root;
  expect(root.children.map((child: { node: { code: string } }) => child.node.code)).toEqual([
    'ypy',
    'tym',
  ]);
});

test('keyboard duplication/removal and context operations retain undoable source-backed fragments', async ({
  page,
}) => {
  await openCanvas(page, 'tym');
  await node(page, 'main:root').focus();
  await page.keyboard.press('Control+d');
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments.length))
    .toBe(1);
  const fragment = await page.evaluate(() => window.canvasSnapshot.canvas.fragments[0]);
  await expect(
    card(page, `${fragment.id}:root`).locator('[data-evaluation-state="ok"]'),
  ).toHaveCount(1);
  await node(page, `${fragment.id}:root`).click();
  await node(page, `${fragment.id}:root`).focus();
  await page.keyboard.press('Delete');
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments.length))
    .toBe(0);
  await svg(page).focus();
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments.length))
    .toBe(1);
  await node(page, 'main:root').focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Adicionar operação', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  await dialog.getByRole('combobox', { name: 'Operação na peça' }).selectOption('/');
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  await expect(card(page, 'main:root/right')).toHaveClass(/canvas-hole/);
  await expect(card(page, 'main:root').locator('[data-evaluation-state="blocked"]')).toHaveCount(1);
});

test('moving a subtree in blank canvas space persists layout without changing source or reevaluating', async ({
  page,
}) => {
  const requests = await openCanvas(page, 'no + (emi * tym)');
  const raw = await page.locator('#canvas-raw').textContent();
  const evaluated = requests.filter((request) => request.method === 'evaluate_expression').length;
  const start = await center(node(page, 'main:root/right'));
  const viewport = await svg(page).boundingBox();
  const target = { x: viewport!.x + 40, y: viewport!.y + viewport!.height - 35 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.canvasSnapshot.canvas.positions).length))
    .toBe(3);
  const positions = await page.evaluate(() => window.canvasSnapshot.canvas.positions);
  expect(Object.keys(positions).sort()).toEqual([
    'main:root/right',
    'main:root/right/left',
    'main:root/right/right',
  ]);
  await expect(page.locator('#canvas-raw')).toHaveText(raw!);
  expect(requests.filter((request) => request.method === 'evaluate_expression')).toHaveLength(
    evaluated,
  );
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.positions)).toEqual(positions);
});

test('partial evaluation keeps working sibling results, identifies direct errors and exports selected diagnostic context', async ({
  page,
}) => {
  const raw = '(emi * tym) + (__studio_slot_A1 * missing_predicate)';
  await openCanvas(page, raw);
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await expect(card(page, 'main:root/left').locator('[data-evaluation-state="ok"]')).toContainText(
    'temityma',
  );
  await expect(card(page, 'main:root/right/left')).toHaveClass(/canvas-hole/);
  await expect(
    card(page, 'main:root/right/left').locator('[data-evaluation-state="missing"]'),
  ).toHaveCount(1);
  await expect(
    card(page, 'main:root/right/right').locator('[data-evaluation-state="error"]'),
  ).toHaveCount(1);
  await expect(card(page, 'main:root').locator('[data-evaluation-state="blocked"]')).toHaveCount(1);
  await node(page, 'main:root/right/right').click();
  await page.getByRole('button', { name: 'Copiar diagnóstico', exact: true }).click();
  const report = await page.evaluate(() => window.canvasDiagnostic);
  expect(report!.raw).toBe(raw);
  expect(report!.selectedNodeId).toBe('root/right/right');
  expect(
    report!.failures!.some(
      (failure) => failure.nodeId === 'root/right/right' && failure.stage === 'reference',
    ),
  ).toBe(true);
  await expect(page.locator('#canvas-raw')).toHaveText(raw);
});

test('dragging a collapsed compound carries both automatic and saved hidden descendant positions', async ({
  page,
}) => {
  const requests = await openCanvas(page, 'emi * tym');
  const keys = ['main:root', 'main:root/left', 'main:root/right'];
  const evaluations = requests.filter((request) => request.method === 'evaluate_expression').length;
  const points = async () =>
    Promise.all(
      keys.map((key) =>
        card(page, key).evaluate((element) => {
          const matrix = (element as SVGGElement).transform.baseVal.getItem(0).matrix;
          return { x: matrix.e, y: matrix.f };
        }),
      ),
    );
  const dragBlank = async (x: number, y: number) => {
    const start = await center(node(page, 'main:root'));
    const bounds = (await svg(page).boundingBox())!;
    const candidates = [
      { x: bounds.x + x, y: bounds.y + bounds.height - y },
      { x: bounds.x + bounds.width * 0.7, y: bounds.y + 80 },
      { x: bounds.x + bounds.width * 0.45, y: bounds.y + bounds.height - 70 },
    ];
    const target = await page.evaluate(
      ({ candidates, start }) =>
        candidates.find(
          (point) =>
            Math.hypot(point.x - start.x, point.y - start.y) > 60 &&
            !document.elementFromPoint(point.x, point.y)?.closest('[data-canvas-key]'),
        ),
      { candidates, start },
    );
    if (!target) throw new Error('No blank canvas target is visible');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => Object.keys(window.canvasSnapshot.canvas.positions).length))
      .toBeGreaterThan(0);
  };
  for (const savedChildren of [false, true]) {
    if (savedChildren) {
      // A visible drag records explicit child positions before hiding them again.
      await dragBlank(600, 170);
      expect(
        Object.keys(await page.evaluate(() => window.canvasSnapshot.canvas.positions)).sort(),
      ).toEqual([...keys].sort());
    }
    const before = await points();
    await card(page, 'main:root').getByRole('button', { name: 'Recolher *', exact: true }).click();
    await expect(card(page, 'main:root/left')).toHaveCount(0);
    await dragBlank(savedChildren ? 420 : 250, 65);
    await card(page, 'main:root').getByRole('button', { name: 'Expandir *', exact: true }).click();
    const after = await points();
    expect(Math.hypot(after[0].x - before[0].x, after[0].y - before[0].y)).toBeGreaterThan(20);
    for (let index = 1; index < keys.length; index++) {
      expect(after[index].x - after[0].x).toBeCloseTo(before[index].x - before[0].x, 3);
      expect(after[index].y - after[0].y).toBeCloseTo(before[index].y - before[0].y, 3);
    }
    await expect(page.locator('#canvas-raw')).toHaveText('emi * tym');
    await expect(card(page, 'main:root').locator('[data-evaluation-state="ok"]')).toContainText(
      'temityma',
    );
  }
  expect(requests.filter((request) => request.method === 'evaluate_expression')).toHaveLength(
    evaluations,
  );
});

test('a direct engine failure retains operand results and diagnostic engine frames', async ({
  page,
}) => {
  const raw = '(îe * mombeu) + tym';
  await openCanvas(page, raw);
  await expect(card(page, 'main:root/right').locator('[data-evaluation-state="ok"]')).toContainText(
    'tym',
  );
  await expect(card(page, 'main:root').locator('[data-evaluation-state="error"]')).toHaveCount(1);
  await node(page, 'main:root').click();
  await page.getByRole('button', { name: 'Copiar diagnóstico', exact: true }).click();
  const report = await page.evaluate(() => window.canvasDiagnostic);
  const failure = report!.failures!.find((entry) => entry.nodeId === 'root');
  expect(failure).toMatchObject({ expression: raw, stage: 'evaluation' });
  expect(failure!.engineFrames!.some((frame) => frame.file.includes('/nhe-enga/'))).toBe(true);
  await expect(page.locator('#canvas-raw')).toHaveText(raw);
});

test('an incomplete saved orphan can be repaired and removed without losing other work', async ({
  page,
}) => {
  const canvas: CanvasState = {
    fragments: [{ id: 'unfinished', raw: 'helper( # continuar', x: 450, y: 280 }],
    positions: {},
  };
  await openCanvas(page, 'tym', canvas);
  await expect(
    card(page, 'unfinished:root').locator('[data-evaluation-state="error"]'),
  ).toHaveCount(1);
  await menu(page, 'unfinished:root', 'Editar esta parte');
  await page
    .getByRole('textbox', { name: 'Corrigir expressão da peça', exact: true })
    .fill('emi * tym');
  await page.getByRole('button', { name: 'Aplicar correção', exact: true }).click();
  await expect(card(page, 'unfinished:root').locator('[data-evaluation-state="ok"]')).toContainText(
    'temityma',
  );
  await expect(page.locator('#canvas-raw')).toHaveText('tym');
  await menu(page, 'unfinished:root', /^Remover trecho/);
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments.length))
    .toBe(0);
  await expect(page.locator('#canvas-raw')).toHaveText('tym');
});

test('pending drag cannot alter a different passage even when its source text is identical', async ({
  page,
}) => {
  await openCanvas(page, 'tym / ypy');
  const from = await center(node(page, 'main:root/left'));
  const to = await center(node(page, 'main:root/right'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.evaluate(() => window.canvasSetPassageId('another-canvas-passage'));
  await expect(page.locator('#canvas-passage')).toHaveText('another-canvas-passage');
  await page.mouse.up();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText('tym / ypy');
  expect(await page.evaluate(() => window.canvasSnapshot.canvas)).toEqual({
    fragments: [],
    positions: {},
  });
});

test('malformed primary code can be repaired from the canvas while preserving saved loose pieces', async ({
  page,
}) => {
  const canvas: CanvasState = {
    fragments: [{ id: 'saved', raw: 'ypy', x: 450, y: 280 }],
    positions: {},
  };
  await openCanvas(page, 'helper( # continuar', canvas);
  await menu(page, 'main:root', 'Editar esta parte');
  await page
    .getByRole('textbox', { name: 'Corrigir expressão da peça', exact: true })
    .fill('emi * tym');
  await page.getByRole('button', { name: 'Aplicar correção', exact: true }).click();
  await expect(card(page, 'main:root').locator('[data-evaluation-state="ok"]')).toContainText(
    'temityma',
  );
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual(
    canvas.fragments,
  );
  expect(
    run('parse_expression', { raw: await page.locator('#canvas-raw').textContent() }).root.code,
  ).toBe('emi * tym');
});

test('a naturally selected reusable word can be added as a persistent loose piece', async ({
  page,
}) => {
  await openCanvas(page, 'tym');
  await page.getByRole('button', { name: 'Adicionar peça', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await dialog.getByRole('tab', { name: 'Buscar palavra ou trecho', exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Palavra ou trecho da peça: buscar em tupi', exact: true })
    .fill('ypy');
  await dialog.getByRole('listbox').getByRole('option').click();
  await dialog.getByRole('button', { name: 'Adicionar ao espaço', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments.length))
    .toBe(1);
  const fragment = await page.evaluate(() => window.canvasSnapshot.canvas.fragments[0]);
  expect(fragment.raw).toBe('ypy');
  await expect(
    card(page, `${fragment.id}:root`).locator('[data-evaluation-state="ok"]'),
  ).toHaveCount(1);
  await expect(page.locator('#canvas-raw')).toHaveText('tym');
});

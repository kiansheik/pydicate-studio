import { test, expect, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { StudioBridge } from '../src/domain/types';
import type { CanvasState } from '../src/domain/canvas';
import type { CanvasFixture } from './canvas-harness';
import { flattenNodes, type AuthorNode } from '../src/domain/authoring';

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
 if payload['method']=='lexicon_inspect':
  from authoring_runtime import lexicon_result
  result=lexicon_result({**payload,'action':'lexicon_inspect'},corpus,path,namespace)
 elif payload['method']=='dictionary_lookup': result={**dictionary_lookup(Path(payload['parent'])/'nhe-enga',payload),'engineFingerprint':'canvas-fixture-engine'}
 elif payload['method']=='dictionary_predicate':
  descriptor,row=dictionary_entry(Path(payload['parent'])/'nhe-enga',payload)
  result={**dictionary_predicate({**payload,'entry':descriptor,'entryRecord':row},namespace),'engineFingerprint':'canvas-fixture-engine','revisionId':payload.get('revisionId','fixture')}
 elif payload['method']=='composition_define':
  if payload.get('dictionarySelection'):
   from node_definitions import define_node
   descriptor,_=dictionary_entry(Path(payload['parent'])/'nhe-enga',payload['dictionarySelection'])
   result=define_node({**payload,'sourceId':'araujo_catecismo_1686','sourceNodeId':'root','definition':descriptor['definition']},corpus)
  else:
   from lexical_publication import define_composition
   result=define_composition({**payload,'sourceId':'araujo_catecismo_1686'},corpus)
  result.update(engineFingerprint='canvas-fixture-engine',revisionId=payload.get('revisionId','fixture'))
 elif payload['method']=='node_definition':
  from node_definitions import define_node
  definition=payload.get('definition','')
  if payload.get('dictionarySelection'):
   descriptor,_=dictionary_entry(Path(payload['parent'])/'nhe-enga',payload['dictionarySelection'])
   definition=descriptor['definition']
  result=define_node({**payload,'sourceId':'araujo_catecismo_1686','definition':definition},corpus)
  result.update(engineFingerprint='canvas-fixture-engine',revisionId=payload.get('revisionId','fixture'))
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
  dictionary = false,
) {
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const source = { sourceId: 'araujo_catecismo_1686', label: 'Léxico local' };
    let result: unknown;
    if (request.method === 'dictionary_lookup')
      result = dictionary ? run(request.method, request.params) : { results: [], total: 0 };
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
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
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

test('the main add field replaces redundant buttons and repeated keyboard shortcuts select its query', async ({
  page,
}) => {
  await openCanvas(page, 'tym');
  const query = page.getByRole('combobox', { name: 'Adicionar peça: buscar em tupi', exact: true });
  await expect(page.locator('.canvas-toolbar')).toContainText('Criar peça');
  await expect(page.locator('.canvas-toolbar').getByRole('combobox')).toHaveCount(1);
  await expect(page.locator('.canvas-view-options').getByLabel('Buscar na árvore')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar peça', exact: true })).toHaveCount(0);
  await expect(page.locator('.canvas-add-bubble, .canvas-empty-add')).toHaveCount(0);
  await query.fill('palavra anterior');
  await page.evaluate(() => {
    const outside = document.createElement('button');
    outside.textContent = 'Controle fora da árvore';
    outside.id = 'outside-canvas-control';
    document.body.append(outside);
    outside.focus();
  });
  for (const shortcut of ['Meta+k', 'Control+k', 'Meta+k']) {
    await page.keyboard.press(shortcut);
    await expect(query).toBeFocused();
    expect(
      await query.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
    ).toEqual([0, 'palavra anterior'.length]);
  }
  await page.keyboard.type('y py');
  await expect(query).toHaveValue('y py');
  await page.getByRole('option').filter({ hasText: 'Léxico local' }).click();
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas?.fragments))
    .toMatchObject([{ raw: 'ypy' }]);
  // A mounted but hidden canvas cannot claim a global shortcut. Nor can a
  // visible one pull focus out of another feature's modal dialog.
  for (const condition of ['hidden', 'modal']) {
    const prevented = await page.evaluate((condition) => {
      const editor = document.querySelector<HTMLElement>('.expression-canvas')!;
      const outside = document.querySelector<HTMLButtonElement>('#outside-canvas-control')!;
      if (condition === 'hidden') editor.hidden = true;
      else {
        editor.hidden = false;
        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        document.body.append(modal);
        modal.append(outside);
      }
      outside.focus();
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      outside.dispatchEvent(event);
      return event.defaultPrevented;
    }, condition);
    expect(prevented).toBe(false);
    await expect(page.locator('#outside-canvas-control')).toBeFocused();
  }
});

test('an unknown search offers manual creation without changing the tree or requiring a dictionary entry', async ({
  page,
}) => {
  const requests = await openCanvas(page, 'tym');
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    if (request.method === 'structure_search')
      await route.fulfill({ json: { results: [], total: 0, indexFingerprint: 'fixture' } });
    else await route.fallback();
  });
  const query = page.getByRole('combobox', { name: 'Adicionar peça: buscar em tupi', exact: true });
  await query.fill('ekat');
  await page.getByRole('button', { name: 'Criar peça sem entrada no dicionário' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await expect(palette.getByRole('tab', { name: 'Criar peça', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(palette.getByRole('button', { name: 'Nome', exact: true })).toBeVisible();
  await expect(page.locator('#canvas-raw')).toHaveText('tym');
  expect(requests.some((request) => request.method === 'predicate_create')).toBe(false);
  await palette.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(query).toHaveValue('ekat');
});

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
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
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
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
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
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette.getByRole('tab', { name: 'Buscar palavra ou trecho', exact: true }).click();
  const query = palette.getByRole('combobox', {
    name: 'Palavra ou trecho da peça: buscar em tupi',
  });
  await query.fill('y py');
  await expect(palette.getByRole('option').first()).toContainText('ypy');
  await expect(palette.getByText('Dicionário Navarro · criar peça', { exact: true })).toBeVisible();
  await expect(palette.getByRole('option').first()).toContainText('Léxico local');
  await palette.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(palette).not.toBeVisible();
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
  await palette.getByRole('tab', { name: 'Buscar palavra ou trecho', exact: true }).click();
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
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette.getByRole('tab', { name: 'Buscar palavra ou trecho', exact: true }).click();
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
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette.getByRole('tab', { name: 'Buscar palavra ou trecho', exact: true }).click();
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

for (const kind of [
  {
    constructor: 'Noun',
    label: 'Nome',
    verbClass: 'default',
    rootParameter: 'value',
    surface: 'tekata',
  },
  {
    constructor: 'Verb',
    label: 'Verbo',
    verbClass: 'stative',
    rootParameter: 'value',
    surface: 'ekat',
  },
]) {
  test(`manual ${kind.constructor} creation preserves an unknown pluriform root and its hypothetical status`, async ({
    page,
  }) => {
    const requests = await openCanvas(page, '');
    await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
    const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
    await palette.getByRole('button', { name: kind.label, exact: true }).click();
    await palette.getByRole('textbox', { name: 'Palavra em tupi', exact: true }).fill('ekat');
    await palette.getByRole('combobox', { name: 'Pluriformidade', exact: true }).selectOption('t');
    if (kind.constructor === 'Verb')
      await palette
        .getByRole('combobox', { name: 'Tipo de verbo', exact: true })
        .selectOption('stative');
    await palette
      .getByRole('combobox', { name: 'Situação da raiz', exact: true })
      .selectOption('hypothetical');
    await expect(
      palette.getByRole('textbox', { name: 'Significado ou observações', exact: true }),
    ).toHaveValue('');
    await palette.getByRole('button', { name: 'Criar e adicionar peça', exact: true }).click();
    await expect(palette).not.toBeVisible();
    await ready(page);

    const creation = requests.find((request) => request.method === 'predicate_create');
    expect(creation?.params).toMatchObject({
      constructor: kind.constructor,
      values: { [kind.rootParameter]: 'ekat' },
      lexical: { pluriform: 't', verbClass: kind.verbClass, status: 'hypothetical' },
    });
    expect(requests.some((request) => request.method === 'dictionary_predicate')).toBe(false);
    const expression = (await page.locator('#canvas-raw').textContent())!;
    expect(expression).toContain('[LEXICAL_STATUS:HYPOTHETICAL]');
    if (kind.constructor === 'Noun') {
      expect(expression).toMatch(/^studio_define\(Noun\(/);
      expect(expression).toMatch(/definition=['"]\(t\)['"]/);
    } else expect(expression).toMatch(/verb_class=['"]\(t\) adj\.['"]/);
    const result = run('fixture', { raw: expression });
    expect(result.failures).toEqual([]);
    expect(result.evaluatedRoot).toMatchObject({
      runtimeType: kind.constructor,
      definition: '',
      lexicalStatus: 'hypothetical',
      evaluation: { status: 'ok', surface: kind.surface },
    });
    await expect(card(page, 'main:root')).toHaveAttribute('data-lexical-status', 'hypothetical');
    await expect(card(page, 'main:root').locator('.runtime-result-caption')).toHaveText(
      'Hipótese não atestada',
    );
    await expect(node(page, 'main:root')).toHaveAttribute(
      'aria-label',
      /Hipótese não atestada · significado desconhecido/,
    );
    // The portable source, rather than transient form state, retains the hypothesis.
    await page.reload();
    await ready(page);
    await expect(page.locator('#canvas-raw')).toHaveText(expression);
    await expect(card(page, 'main:root').locator('.runtime-result-caption')).toHaveText(
      'Hipótese não atestada',
    );
  });
}

test('visible create action creates a real predicate in an empty canvas and persists its orientation', async ({
  page,
}) => {
  const requests = await openCanvas(page, '', {
    layout: 'bottom-up',
    fragments: [],
    positions: {},
  });
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await expect(palette.getByRole('tab', { name: 'Criar peça', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await palette.getByRole('button', { name: 'Nome', exact: true }).click();
  await palette.getByRole('textbox', { name: 'Palavra em tupi', exact: true }).fill('ara');
  await palette
    .getByRole('textbox', { name: 'Significado ou observações', exact: true })
    .fill('dia');
  await palette.getByRole('button', { name: 'Criar e adicionar peça', exact: true }).click();
  await expect(palette).not.toBeVisible();
  await ready(page);
  expect(await page.locator('#canvas-raw').textContent()).toContain('Noun(');
  expect(requests.find((request) => request.method === 'predicate_create')?.params).toMatchObject({
    constructor: 'Noun',
    values: { value: 'ara', definition: 'dia' },
  });
  // Constructor scalars now live inside Noun(...). A method's real receiver
  // supplies the parent/child relationship for the orientation check.
  await expect(card(page, 'main:root/kw:value')).toHaveCount(0);
  await menu(page, 'main:root', 'Escolher variante…');
  await page
    .getByRole('dialog', { name: 'Adicionar operação', exact: true })
    .getByRole('button', { name: 'Criar operação', exact: true })
    .click();
  await ready(page);
  const raw = (await page.locator('#canvas-raw').textContent())!;
  const parsed = run('parse_expression', { raw }).root;
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
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
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
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
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Forma prevista', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  const root = run('parse_expression', {
    raw: await page.locator('#canvas-raw').textContent(),
  }).root;
  expect(root.method).toBe('imp');
  expect(root.children[0].node.method).toBe('var');
  expect(root.children[0].node.children[1].node.code).toBe('2');
  expect(root.children[0].node.children[0].node.code).toBe('pysyro');
});

test('combination previews follow order and operator without editing until the exact candidate is confirmed', async ({
  page,
}) => {
  const initial: CanvasState = {
    layout: 'bottom-up',
    fragments: [{ id: 'prefix', raw: 'emi', x: 500, y: 260 }],
    positions: {},
  };
  const requests = await openCanvas(page, 'tym', initial);
  await expect(card(page, 'prefix:root').locator('[data-evaluation-state="ok"]')).toHaveCount(1);
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
  await dragTo(page, 'main:root', 'prefix:root');
  const dialog = page.getByRole('dialog', { name: 'Combinar peças', exact: true });
  const preview = dialog.getByRole('region', { name: 'Prévia do resultado', exact: true });
  const form = preview.getByLabel('Forma prevista', { exact: true });
  await expect(form).toHaveText('temityma');
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: 'tym', canvas: initial });
  await expect(page.locator('#canvas-history')).toHaveText('0');

  await dialog.getByRole('button', { name: 'Inverter ordem das peças', exact: true }).click();
  await expect(form).toHaveText('oîotym emi');
  await dialog.getByRole('combobox', { name: 'Operação para combinar peças' }).selectOption('+');
  await expect(form).toHaveText('tym emi');
  await expect(
    dialog.getByRole('button', { name: 'Combinar peças', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: '/private/tmp/pydicate-tree-operation-preview.png' });
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: 'tym', canvas: initial });
  await expect(page.locator('#canvas-history')).toHaveText('0');
  const candidate = String(
    requests.filter((request) => request.method === 'evaluate_expression').at(-1)!.params.raw,
  );
  const parsed = run('parse_expression', { raw: candidate }).root;
  expect(parsed.operator).toBe('+');
  expect(parsed.children.map((child: { node: { code: string } }) => child.node.code)).toEqual([
    'tym',
    'emi',
  ]);
  expect(run('fixture', { raw: candidate }).evaluatedRoot.evaluation.surface).toBe('tym emi');

  await dialog.getByRole('button', { name: 'Combinar peças', exact: true }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(candidate);
  await expect(card(page, 'main:root')).toContainText('tym emi');
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
  await expect(page.locator('#canvas-history')).toHaveText('1');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: 'tym', canvas: initial });
});

test('variant and negation previews evaluate current inputs before separate undoable confirmations', async ({
  page,
}) => {
  const requests = await openCanvas(page, 'oka');
  await menu(page, 'main:root', 'Escolher variante…');
  const dialog = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  const preview = dialog.getByRole('region', { name: 'Prévia do resultado', exact: true });
  const form = preview.getByLabel('Forma prevista', { exact: true });
  const variant = dialog.getByRole('spinbutton', { name: 'Número da variante' });
  await expect(form).toHaveText('toka');
  await variant.fill('');
  await expect(form).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Criar operação', exact: true })).toBeDisabled();
  await variant.fill('2');
  await expect
    .poll(
      () =>
        requests.filter((request) => request.method === 'evaluate_expression').at(-1)?.params.raw,
    )
    .toContain('.var(2)');
  await expect(form).toHaveText('toka');
  const variantCandidate = String(
    requests.filter((request) => request.method === 'evaluate_expression').at(-1)!.params.raw,
  );
  await expect(page.locator('#canvas-raw')).toHaveText('oka');
  await expect(page.locator('#canvas-history')).toHaveText('0');
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(variantCandidate);

  await menu(page, 'main:root', 'Adicionar operação');
  await dialog.getByRole('combobox', { name: 'Operação na peça' }).selectOption('negate');
  await expect(form).toHaveText("toke'yma");
  const negatedCandidate = String(
    requests.filter((request) => request.method === 'evaluate_expression').at(-1)!.params.raw,
  );
  await expect(page.locator('#canvas-raw')).toHaveText(variantCandidate);
  await expect(page.locator('#canvas-history')).toHaveText('1');
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(negatedCandidate);
  expect(run('fixture', { raw: negatedCandidate }).evaluatedRoot.evaluation.surface).toBe(
    "toke'yma",
  );
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(variantCandidate);
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText('oka');
});

test('operation previews keep empty slots explicit and replace invalid operand evidence with the valid result', async ({
  page,
}) => {
  await openCanvas(page, 'tym');
  const initial = await page.evaluate(() => window.canvasSnapshot);
  await menu(page, 'main:root', 'Adicionar operação');
  const dialog = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  const preview = dialog.getByRole('region', { name: 'Prévia do resultado', exact: true });
  const form = preview.getByLabel('Forma prevista', { exact: true });
  await expect(preview).toContainText(/argumento|peça|encaixe/i);
  await expect(form).toHaveCount(0);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(initial);
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toContainText('__studio_slot_');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(initial);

  await menu(page, 'main:root', 'Adicionar operação');
  await dialog.getByText('Editar código Pydicate', { exact: true }).click();
  const argument = dialog.getByRole('textbox', { name: 'Argumento da nova operação', exact: true });
  await argument.fill('missing_preview_argument');
  await expect(preview).toContainText(/incompleta|Não foi possível obter a forma/);
  await expect(form).toHaveCount(0);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(initial);

  await argument.fill('emi');
  await dialog.getByRole('combobox', { name: 'Posição do novo encaixe' }).selectOption('left');
  await expect(form).toHaveText('temityma');
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(initial);
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).not.toContainText('__studio_slot_');
  await expect(card(page, 'main:root')).toContainText('temityma');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(initial);
});

test('optional operation arguments are previewed and committed as the same engine expression', async ({
  page,
}) => {
  const requests = await openCanvas(page, 'potar * moro');
  await menu(page, 'main:root', 'Adicionar operação');
  const dialog = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  const form = dialog
    .getByRole('region', { name: 'Prévia do resultado', exact: true })
    .getByLabel('Forma prevista', { exact: true });
  await dialog.getByRole('combobox', { name: 'Operação na peça' }).selectOption('base_nominal');
  await expect(form).toHaveText('moropotara');
  await dialog.getByText('Editar código Pydicate', { exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Argumento da nova operação', exact: true })
    .fill('True');
  await expect
    .poll(
      () =>
        requests.filter((request) => request.method === 'evaluate_expression').at(-1)?.params.raw,
    )
    .toContain('.base_nominal(True)');
  await expect(form).toHaveText('moropotara');
  await expect(page.locator('#canvas-raw')).toHaveText('potar * moro');
  await expect(page.locator('#canvas-history')).toHaveText('0');
  const candidate = String(
    requests.filter((request) => request.method === 'evaluate_expression').at(-1)!.params.raw,
  );
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(candidate);
  await expect(card(page, 'main:root')).toContainText('moropotara');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText('potar * moro');
});

test('a restored sole loose tree automatically becomes the principal tree', async ({ page }) => {
  const raw = '(emi * tym)';
  await openCanvas(page, '', {
    layout: 'bottom-up',
    fragments: [{ id: 'only', raw, x: 300, y: 200 }],
    positions: {},
  });
  await expect(page.locator('#canvas-raw')).toHaveText(raw);
  await expect.poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
  await expect(card(page, 'main:root')).toContainText('temityma');
  await expect(card(page, 'only:root')).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(raw);
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
});

test('combining the final two loose trees promotes the result and undoes as one edit', async ({
  page,
}) => {
  const initial: CanvasState = {
    layout: 'bottom-up',
    fragments: [
      { id: 'prefix', raw: 'emi', x: 280, y: 200 },
      { id: 'verb', raw: 'tym', x: 700, y: 300 },
    ],
    positions: {},
  };
  await openCanvas(page, '', initial);
  await expect(card(page, 'prefix:root').locator('[data-evaluation-state="ok"]')).toHaveCount(1);
  await expect(card(page, 'verb:root').locator('[data-evaluation-state="ok"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: '', canvas: initial });
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
  await dragTo(page, 'verb:root', 'prefix:root');
  const dialog = page.getByRole('dialog', { name: 'Combinar peças', exact: true });
  await expect(dialog.getByLabel('Forma prevista', { exact: true })).toHaveText('temityma');
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: '', canvas: initial });
  await expect(page.locator('#canvas-history')).toHaveText('0');
  await dialog.getByRole('button', { name: 'Combinar peças', exact: true }).click();
  await ready(page);
  await expect(card(page, 'main:root')).toContainText('temityma');
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
  await expect(page.locator('#canvas-history')).toHaveText('1');
  const result = await page.locator('#canvas-raw').textContent();
  expect(run('fixture', { raw: result }).evaluatedRoot.evaluation.surface).toBe('temityma');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: '', canvas: initial });
  await expect(page.locator('#canvas-history')).toHaveText('0');
});

for (const primary of ['tym', 'helper( # unfinished']) {
  test(`a nonempty ${primary === 'tym' ? 'valid' : 'invalid'} principal tree is never replaced by its sole loose tree`, async ({
    page,
  }) => {
    const canvas: CanvasState = {
      fragments: [{ id: 'saved', raw: 'emi', x: 500, y: 280 }],
      positions: {},
    };
    await openCanvas(page, primary, canvas);
    await expect(card(page, 'saved:root').locator('[data-evaluation-state="ok"]')).toHaveCount(1);
    expect(await page.evaluate(() => window.canvasSnapshot)).toEqual({ raw: primary, canvas });
    await expect(page.locator('#canvas-history')).toHaveText('0');
    await expect(card(page, 'main:root')).toHaveCount(1);
  });
}

test('inline scalar arguments preserve number and text values with one source edit and undo', async ({
  page,
}) => {
  const original = 'pysyro.var(1)  # escolha do colaborador';
  await openCanvas(page, original);
  const argument = () =>
    page.getByRole('button', { name: 'Editar argumento 1 de .var', exact: true });
  const input = page.getByRole('textbox', { name: 'Valor do argumento', exact: true });
  await expect(argument()).toHaveText('1');
  await expect(card(page, 'main:root/arg0')).toHaveCount(0);
  await expect(card(page, 'main:root/receiver')).toBeVisible();
  await argument().click();
  await expect(input).toHaveValue('1');
  await input.fill('1,5');
  await input.press('Enter');
  await expect(page.locator('#canvas-ready')).toHaveText('ready');
  const decimal = await page.locator('#canvas-raw').textContent();
  expect(run('parse_expression', { raw: decimal }).root.children[1].node.value).toBe(1.5);
  expect(decimal).toContain('# escolha do colaborador');
  await expect(card(page, 'main:root/arg0')).toHaveCount(0);
  // Do not click a toolbar control first: Enter must retain canvas focus so
  // contributors can immediately undo using the keyboard.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(original);
  await expect(page.getByRole('button', { name: 'Desfazer edição na árvore' })).toBeDisabled();

  const text = 'i "îepé" \\ ypy';
  await argument().click();
  await input.fill(text);
  await page.locator('h2').first().click();
  await ready(page);
  const quoted = await page.locator('#canvas-raw').textContent();
  expect(run('parse_expression', { raw: quoted }).root.children[1].node.value).toBe(text);
  expect(quoted).toContain('# escolha do colaborador');
  await argument().click();
  await expect(input).toHaveValue(text);
  await input.fill('');
  await input.press('Enter');
  await ready(page);
  const empty = await page.locator('#canvas-raw').textContent();
  expect(run('parse_expression', { raw: empty }).root.children[1].node.value).toBe('');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText(quoted!);
});

test('inline scalar insertion keeps empty-call cancellation and real predicate arguments distinct', async ({
  page,
}) => {
  const original = 'pysyro.var()';
  await openCanvas(page, original);
  const add = page.getByRole('button', { name: 'Adicionar argumento de .var', exact: true });
  const input = page.getByRole('textbox', { name: 'Valor do argumento', exact: true });
  await add.dblclick();
  await expect(input).toHaveValue('');
  await input.fill('2');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.locator('#canvas-raw')).toHaveText(original);
  await add.dblclick();
  await page.locator('h2').first().click();
  await expect(input).toHaveCount(0);
  await expect(page.locator('#canvas-raw')).toHaveText(original);
  await expect(page.getByRole('button', { name: 'Desfazer edição na árvore' })).toBeDisabled();
  await add.dblclick();
  await input.fill('2');
  await page.locator('h2').first().click();
  await ready(page);
  expect(
    run('parse_expression', { raw: await page.locator('#canvas-raw').textContent() }).root
      .children[1].node.value,
  ).toBe(2);
  await expect(card(page, 'main:root/arg0')).toHaveCount(0);

  await page.evaluate(() => window.canvasReplaceRaw('pysyro.var(ypy)'));
  await ready(page);
  await expect(card(page, 'main:root/arg0')).toContainText('ypy');
  await expect(
    page.getByRole('button', { name: 'Editar argumento 1 de .var', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.canvasReplaceRaw('pysyro.base_nominal(True)'));
  await ready(page);
  await expect(card(page, 'main:root/arg0')).toContainText('True');
});

test('inline scalar input is discarded when its source revision or passage changes', async ({
  page,
}) => {
  await openCanvas(page, 'pysyro.var(1)');
  const argument = page.getByRole('button', { name: 'Editar argumento 1 de .var', exact: true });
  const input = page.getByRole('textbox', { name: 'Valor do argumento', exact: true });
  await argument.click();
  await input.fill('99');
  await page.evaluate(() => window.canvasReplaceRaw('pysyro.var(2)'));
  await ready(page);
  await expect(input).toHaveCount(0);
  await expect(page.locator('#canvas-raw')).toHaveText('pysyro.var(2)');
  await argument.click();
  await input.fill('88');
  await page.evaluate(() => window.canvasSetPassageId('another-passage'));
  await ready(page);
  await expect(input).toHaveCount(0);
  await expect(page.locator('#canvas-passage')).toHaveText('another-passage');
  await expect(page.locator('#canvas-raw')).toHaveText('pysyro.var(2)');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page);
  await expect(page.locator('#canvas-raw')).toHaveText('pysyro.var(1)');
  await expect(page.getByRole('button', { name: 'Desfazer edição na árvore' })).toBeDisabled();
});

for (const fixture of [
  {
    name: 'nested variant',
    raw: 'oka + (emi * tym).var(1)  # preserve sentence note',
    key: 'main:root/right',
    surface: 'toka temityma',
    keptKind: 'binary',
  },
  {
    name: 'nested negation',
    raw: 'oka + (-oka).var(1)',
    key: 'main:root/right/receiver',
    surface: 'toka toka',
    keptKind: 'method',
  },
]) {
  test(`removing only a ${fixture.name} reconnects its child and preserves its parent and sibling`, async ({
    page,
  }) => {
    await openCanvas(page, fixture.raw);
    const before = await page.evaluate(() => window.canvasSnapshot);
    await menu(page, fixture.key, 'Retirar só a operação…');
    const dialog = page.getByRole('dialog', { name: 'Retirar operação', exact: true });
    await expect(dialog.getByLabel('Forma prevista', { exact: true })).toHaveText(fixture.surface);
    expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
    await expect(page.locator('#canvas-history')).toHaveText('0');
    await dialog.getByRole('button', { name: 'Retirar operação', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await ready(page);
    const raw = (await page.locator('#canvas-raw').textContent())!;
    const root = run('parse_expression', { raw }).root;
    expect(root.operator).toBe('+');
    expect(root.children.find((child: { slot: string }) => child.slot === 'left').node.code).toBe(
      'oka',
    );
    const retained = root.children.find((child: { slot: string }) => child.slot === 'right').node;
    expect(retained.kind).toBe(fixture.keptKind);
    if (fixture.keptKind === 'binary') {
      expect(retained.operator).toBe('*');
      expect(raw).not.toContain('.var(');
      expect(raw).toContain('# preserve sentence note');
    } else {
      expect(retained.method).toBe('var');
      expect(
        retained.children.find((child: { slot: string }) => child.slot === 'receiver').node.code,
      ).toBe('oka');
    }
    expect(raw).not.toContain('__studio_slot_');
    expect(run('fixture', { raw }).evaluatedRoot.evaluation.surface).toBe(fixture.surface);
    expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
    await expect(page.locator('#canvas-history')).toHaveText('1');
    await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
    await ready(page);
    expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
    await expect(page.locator('#canvas-history')).toHaveText('0');
  });
}

test('removing only a binary operation lets the chosen child reconnect and preserves the other as a loose tree', async ({
  page,
}) => {
  const original = 'oka + (emi * tym)';
  await openCanvas(page, original);
  const before = await page.evaluate(() => window.canvasSnapshot);
  const dialog = page.getByRole('dialog', { name: 'Retirar operação', exact: true });
  await menu(page, 'main:root/right', 'Retirar só a operação…');
  await expect(dialog.getByLabel('Forma prevista', { exact: true })).toHaveText('toka emi');
  await dialog
    .getByRole('combobox', { name: 'Parte que continuará ligada' })
    .selectOption({ label: 'Lado direito · tym' });
  await expect(dialog.getByLabel('Forma prevista', { exact: true })).toHaveText('toka tym');
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
  await expect(page.locator('#canvas-history')).toHaveText('0');
  await expect(
    dialog.getByRole('button', { name: 'Retirar operação', exact: true }),
  ).toBeInViewport();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);

  await menu(page, 'main:root/right', 'Retirar só a operação…');
  await dialog
    .getByRole('combobox', { name: 'Parte que continuará ligada' })
    .selectOption({ label: 'Lado direito · tym' });
  await expect(dialog.getByLabel('Forma prevista', { exact: true })).toHaveText('toka tym');
  await dialog.getByRole('button', { name: 'Retirar operação', exact: true }).click();
  await ready(page);
  const state = await page.evaluate(() => window.canvasSnapshot);
  const root = run('parse_expression', { raw: state.raw }).root;
  expect(root.operator).toBe('+');
  expect(root.children.map((child: { node: { code: string } }) => child.node.code)).toEqual([
    'oka',
    'tym',
  ]);
  expect(state.raw).not.toContain('__studio_slot_');
  expect(state.canvas.fragments).toHaveLength(1);
  expect(state.canvas.fragments[0].raw).toBe('emi');
  await expect(card(page, `${state.canvas.fragments[0].id}:root`)).toContainText('emi');
  await expect(page.locator('#canvas-history')).toHaveText('1');
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
});

test('removing only an annotated operation discards its meaning while retaining the child annotation', async ({
  page,
}) => {
  const original =
    'studio_define(studio_define(-oka, "meaning of retained child").var(1), "meaning of removed operation")';
  await openCanvas(page, original);
  const before = await page.evaluate(() => window.canvasSnapshot);
  await menu(page, 'main:root', 'Retirar só a operação…');
  const dialog = page.getByRole('dialog', { name: 'Retirar operação', exact: true });
  await expect(dialog.getByLabel('Forma prevista', { exact: true })).toHaveText("toke'yma");
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
  await dialog.getByRole('button', { name: 'Retirar operação', exact: true }).click();
  await ready(page);
  const raw = (await page.locator('#canvas-raw').textContent())!;
  expect(raw).not.toContain('.var(');
  expect(raw).not.toContain('meaning of removed operation');
  expect(raw).toContain('meaning of retained child');
  expect(raw.match(/studio_define/g)).toHaveLength(1);
  const result = run('fixture', { raw }).evaluatedRoot;
  expect(result.compositeDefinition).toBe('meaning of retained child');
  expect(result.evaluation.surface).toBe("toke'yma");
  expect(await page.evaluate(() => window.canvasSnapshot.canvas.fragments)).toEqual([]);
  await expect(page.locator('#canvas-history')).toHaveText('1');
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
});

test('removing only an operation from a loose tree preserves the principal and all other work', async ({
  page,
}) => {
  const canvas: CanvasState = {
    layout: 'bottom-up',
    fragments: [{ id: 'loose', raw: '(-oka).var(1)', x: 650, y: 280 }],
    positions: {},
  };
  await openCanvas(page, 'emi * tym', canvas);
  await expect(card(page, 'loose:root').locator('[data-evaluation-state="ok"]')).toHaveCount(1);
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
  const before = await page.evaluate(() => window.canvasSnapshot);
  await menu(page, 'loose:root', 'Retirar só a operação…');
  const dialog = page.getByRole('dialog', { name: 'Retirar operação', exact: true });
  await expect(dialog.getByLabel('Forma prevista', { exact: true })).toHaveText("toke'yma");
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
  await dialog.getByRole('button', { name: 'Retirar operação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.canvasSnapshot.canvas.fragments[0].raw))
    .not.toContain('.var(');
  const state = await page.evaluate(() => window.canvasSnapshot);
  expect(state.raw).toBe('emi * tym');
  expect(state.canvas.fragments).toHaveLength(1);
  expect(state.canvas.fragments[0].id).toBe('loose');
  expect(run('parse_expression', { raw: state.canvas.fragments[0].raw }).root.kind).toBe('unary');
  await expect(card(page, 'loose:root')).toContainText("toke'yma");
  await expect(page.locator('#canvas-history')).toHaveText('1');
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await ready(page);
  expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
});

test('removing only an operation cannot apply a late preview after switching passages', async ({
  page,
}) => {
  const original = 'oka + (-oka).var(1)';
  await openCanvas(page, original);
  const before = await page.evaluate(() => window.canvasSnapshot);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pending = false;
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    if (request.method !== 'evaluate_expression' || request.params.raw === original)
      return route.fallback();
    const result = run(request.method, request.params);
    pending = true;
    await held;
    await route.fulfill({ json: result });
  });
  try {
    await menu(page, 'main:root/right/receiver', 'Retirar só a operação…');
    const dialog = page.getByRole('dialog', { name: 'Retirar operação', exact: true });
    await expect.poll(() => pending).toBe(true);
    await page.evaluate(() => window.canvasSetPassageId('new-passage-during-removal'));
    await expect(dialog).toHaveCount(0);
    await ready(page);
    const response = page.waitForResponse((item) => {
      if (!item.url().endsWith('/__canvas_rpc')) return false;
      const request = item.request().postDataJSON();
      return request.method === 'evaluate_expression' && request.params.raw !== original;
    });
    release();
    await response;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasSnapshot)).toEqual(before);
    await expect(page.locator('#canvas-history')).toHaveText('0');
    await expect(
      page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
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
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
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
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
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
  await page.getByRole('button', { name: 'Corrigir gramática / árvore', exact: true }).click();
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
  await page.getByRole('button', { name: 'Corrigir gramática / árvore', exact: true }).click();
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
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
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

test('whole-composition definition keeps base meanings and undo through the real engine', async ({
  page,
}) => {
  const original =
    "(nhe * (mo * Noun(value='abaré', definition='base meaning to retain'))).var(1).base_nominal()";
  await openCanvas(page, original);
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  const visibleNodes = await svg(page).locator('[data-canvas-key]').count();
  await menu(page, 'main:root', 'Definir significado do conjunto…');
  const dialog = page.getByRole('dialog', { name: 'Definir composição', exact: true });
  await dialog.getByLabel('Definição do conjunto').fill('sacramento da ordem');
  await dialog.getByRole('button', { name: 'Usar definição no rascunho', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await ready(page);
  const raw = (await page.locator('#canvas-raw').textContent())!;
  expect(raw).toContain('studio_define');
  const result = run('fixture', { raw }).evaluatedRoot;
  expect(raw).toContain(original);
  expect(JSON.stringify(result.children)).toContain('base meaning to retain');
  expect(result.definition).toBe('sacramento da ordem');
  expect(result.evaluation.surface).toBe('nhemoabaré');
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(svg(page).locator('[data-canvas-key]')).toHaveCount(visibleNodes);
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.locator('#canvas-raw')).toHaveText(original);
});

test('redefining a visible operation adds no tree level and preserves inline variant editing', async ({
  page,
}) => {
  const original = 'oka.var(1)';
  await openCanvas(page, original);
  const beforeCount = await svg(page).locator('[data-canvas-key]').count();
  const dialog = page.getByRole('dialog', { name: 'Definir composição', exact: true });
  const definitions: string[] = [];
  for (const meaning of ['morada neste contexto', 'nova leitura da mesma morada']) {
    await menu(page, 'main:root', 'Definir significado do conjunto…');
    await dialog.getByLabel('Definição do conjunto').fill(meaning);
    await dialog.getByRole('button', { name: 'Usar definição no rascunho', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await ready(page);
    const raw = (await page.locator('#canvas-raw').textContent())!;
    definitions.push(raw);
    expect(raw.match(/studio_define/g)).toHaveLength(1);
    expect(run('fixture', { raw }).evaluatedRoot.compositeDefinition).toBe(meaning);
    await expect(svg(page).locator('[data-canvas-key]')).toHaveCount(beforeCount);
    await expect(card(page, 'main:root')).toHaveCount(1);
    await expect(card(page, 'main:root/arg0')).toHaveCount(0);
  }
  const variant = page.getByRole('button', { name: 'Editar argumento 1 de .var', exact: true });
  await expect(variant).toHaveText('1');
  await variant.click();
  const input = page.getByRole('textbox', { name: 'Valor do argumento', exact: true });
  await input.fill('2');
  await input.press('Enter');
  await ready(page);
  const revised = (await page.locator('#canvas-raw').textContent())!;
  expect(revised).toContain('.var(2)');
  expect(revised.match(/studio_define/g)).toHaveLength(1);
  const result = run('fixture', { raw: revised }).evaluatedRoot;
  expect(result.compositeDefinition).toBe('nova leitura da mesma morada');
  expect(result.evaluation.surface).toBe('toka');
  await expect(svg(page).locator('[data-canvas-key]')).toHaveCount(beforeCount);
  for (const previous of [definitions[1], definitions[0], original]) {
    await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
    await ready(page);
    await expect(page.locator('#canvas-raw')).toHaveText(previous);
  }
});

test('Navarro supplies the whole meaning while the composed tree and undo remain intact', async ({
  page,
}) => {
  const original = '(potar * moro).var(1).base_nominal()';
  const constituentMeanings = (root: AuthorNode) =>
    flattenNodes(root)
      .filter((node) => ['potar', 'moro'].includes(node.lexicalReference ?? ''))
      .map((node) => [node.lexicalReference, node.baseDefinition ?? node.definition]);
  const beforeMeanings = constituentMeanings(run('fixture', { raw: original }).evaluatedRoot);
  expect(beforeMeanings).toHaveLength(2);
  const requests = await openCanvas(page, original, undefined, true);
  await menu(page, 'main:root', 'Definir significado do conjunto…');
  const dialog = page.getByRole('dialog', { name: 'Definir composição', exact: true });
  await expect(dialog).toContainText('Forma do conjunto: moropotara');
  await dialog.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  await expect(dialog.getByLabel('Forma ou significado a buscar')).toHaveValue('moropotara');
  await dialog.getByLabel('Forma ou significado a buscar').fill('poropotara');
  await dialog.getByRole('button', { name: 'Buscar no Navarro', exact: true }).click();
  await dialog.getByRole('button', { name: 'Usar definição de poropotara', exact: true }).click();
  const selected = await dialog.getByLabel('Definição do conjunto').inputValue();
  expect(selected).toContain('lascívia');
  await expect(
    dialog.getByLabel('Reutilizar definições das peças no léxico ou dicionário'),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Usar definição no rascunho', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await ready(page);
  const raw = (await page.locator('#canvas-raw').textContent())!;
  expect(raw).toContain(original);
  const evaluated = run('fixture', { raw }).evaluatedRoot;
  expect(evaluated.compositeDefinition).toBe(selected);
  expect(constituentMeanings(evaluated)).toEqual(beforeMeanings);
  expect(evaluated.evaluation.surface).toBe('moropotara');
  expect(requests.find((request) => request.method === 'node_definition')?.params).toMatchObject({
    raw: original,
    sourceNodeId: 'root',
    action: 'set',
    dictionarySelection: {
      entryIndex: expect.any(Number),
      datasetFingerprint: expect.stringMatching(/^sha256:/),
    },
  });
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.locator('#canvas-raw')).toHaveText(original);
});

test('Navarro example for tekateyme yma informs the compound without copying avareza', async ({
  page,
}) => {
  const original = '-ekateyma';
  await openCanvas(page, original, undefined, true);
  await menu(page, 'main:root', 'Definir significado do conjunto…');
  const dialog = page.getByRole('dialog', { name: 'Definir composição', exact: true });
  await expect(dialog).toContainText("tekate'yme'yma");
  await expect(dialog.getByLabel('Definição do conjunto')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  await expect(dialog.getByText('Forma citada nesta entrada', { exact: true })).toBeVisible();
  await expect(dialog.locator('blockquote')).toContainText('liberalidade');
  await expect(dialog.getByRole('button', { name: /Usar definição de/ })).toHaveCount(0);
  await expect(dialog.getByLabel('Definição do conjunto')).toHaveValue('');
  await dialog.getByLabel('Definição do conjunto').fill('liberalidade');
  await dialog.getByRole('button', { name: 'Usar definição no rascunho', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await ready(page);
  const evaluated = run('fixture', {
    raw: await page.locator('#canvas-raw').textContent(),
  }).evaluatedRoot;
  expect(evaluated.compositeDefinition).toBe('liberalidade');
  expect(JSON.stringify(evaluated.children)).toContain('avareza');
  expect(evaluated.evaluation.surface).toBe("tekate'yme'yma");
});

test('the selected tree constituent shows its scoped whole meaning and separate lexical base meanings', async ({
  page,
}) => {
  const definition = 'sentido provisório do conjunto, conservado sem substituir suas peças';
  const raw = `studio_define((potar * moro).var(1).base_nominal(), ${JSON.stringify(definition)})`;
  await openCanvas(page, raw);
  const evaluated = run('fixture', { raw }).evaluatedRoot;
  await node(page, 'main:root').click();
  const inspector = page.getByRole('complementary', { name: 'Constituinte selecionado' });
  await expect(inspector.getByTestId('canvas-composite-definition')).toHaveText(
    `Significado do conjunto: ${definition}`,
  );
  await expect(inspector.getByTestId('canvas-base-definition')).toHaveCount(0);
  const findReference = (value: typeof evaluated): typeof evaluated | undefined =>
    value.code === 'potar'
      ? value
      : value.children
          .map((child: { node: typeof evaluated }) => findReference(child.node))
          .find(Boolean);
  const base = findReference(evaluated)!;
  expect(base.baseDefinition).toBeTruthy();
  expect(base.baseDefinition).not.toBe(definition);
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await page
    .locator('.expression-canvas > .canvas-toolbar')
    .getByRole('button', { name: 'Ajustar', exact: true })
    .click();
  await node(page, `main:${base.id}`).click();
  await expect(inspector.getByTestId('canvas-base-definition')).toHaveText(
    `Significado da peça: ${base.baseDefinition}`,
  );
  await expect(inspector.getByTestId('canvas-composite-definition')).toHaveCount(0);
  const inner = evaluated.children.find((child: { slot: string }) => child.slot === 'arg0').node;
  await expect(card(page, `main:${inner.id}`)).toHaveCount(0);
  const intermediate = inner.children.find(
    (child: { slot: string }) => child.slot === 'receiver',
  ).node;
  await node(page, `main:${intermediate.id}`).click();
  await expect(inspector.getByTestId('canvas-base-definition')).toHaveCount(0);
  await expect(inspector.getByTestId('canvas-composite-definition')).toHaveCount(0);
  await expect(page.locator('#canvas-raw')).toHaveText(raw);
});

test('a shared reference reveals its object tree and uses before making an editable local copy', async ({
  page,
}) => {
  await openCanvas(page, 'risetoheaven');
  const inspector = page.getByRole('region', { name: 'Estrutura de risetoheaven', exact: true });
  await expect(inspector).toBeVisible();
  await expect(
    inspector.getByRole('group', { name: 'Diagrama interativo da análise realizada' }),
  ).toBeVisible();
  await expect(inspector).toContainText('araujo_catecismo_1686');
  await expect(page.locator('#canvas-raw')).toHaveText('risetoheaven');
  await inspector.getByRole('button', { name: 'Preparar cópia para editar a árvore' }).click();
  await expect(inspector.getByLabel('Forma prevista', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Usar cópia nesta ocorrência' }).click();
  await expect(page.locator('#canvas-raw')).toContainText('saguera');
  await expect(page.locator('#canvas-raw')).not.toHaveText('risetoheaven');
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.locator('#canvas-raw')).toHaveText('risetoheaven');
});

test('a reference meaning can change locally without replacing its grammar', async ({ page }) => {
  await openCanvas(page, 'risetoheaven');
  const inspector = page.getByRole('region', { name: 'Estrutura de risetoheaven', exact: true });
  await inspector.getByText('Editar significado desta referência', { exact: true }).click();
  await inspector
    .getByLabel('Significado da referência', { exact: true })
    .fill('aquele que subiu ao céu');
  await inspector
    .getByRole('button', { name: 'Aplicar significado nesta ocorrência', exact: true })
    .click();
  await expect(page.locator('#canvas-raw')).toContainText('studio_define((risetoheaven),');
  await expect(page.locator('#canvas-raw')).toContainText('aquele que subiu ao céu');
  await expect(page.locator('#canvas-ready')).toHaveText('ready');
  await expect(node(page, 'main:root')).toContainText('ybakype oîeupiragûera');
  await page
    .locator('.canvas-toolbar')
    .getByRole('button', { name: 'Desfazer edição na árvore', exact: true })
    .click();
  await expect(page.locator('#canvas-raw')).toHaveText('risetoheaven');
});

test('shared reference meaning requests a source review without changing the passage draft', async ({
  page,
}) => {
  const requests = await openCanvas(page, 'risetoheaven');
  await page.route('**/__canvas_rpc', async (route) => {
    if (route.request().postDataJSON().method !== 'lexicon_update') return route.fallback();
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: { previewId: 'reference-review', kind: 'lexicon', diff: 'reviewed meaning change' },
    });
  });
  const inspector = page.getByRole('region', { name: 'Estrutura de risetoheaven', exact: true });
  await inspector.getByText('Editar significado desta referência', { exact: true }).click();
  await inspector.getByLabel('Significado da referência', { exact: true }).fill('ascensão');
  await inspector.getByLabel('Alcance do significado da referência').selectOption('shared');
  await inspector
    .getByRole('button', { name: 'Revisar alteração compartilhada', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.canvasLexicalPreview))
    .toMatchObject({ previewId: 'reference-review' });
  expect(requests.find((request) => request.method === 'lexicon_update')?.params).toMatchObject({
    name: 'risetoheaven',
    scope: 'shared',
    definition: 'ascensão',
    preserveGrammar: true,
  });
  expect(requests.some((request) => request.method === 'source_apply')).toBe(false);
  await expect(page.locator('#canvas-raw')).toHaveText('risetoheaven');
});

test('a delayed reference meaning edit cannot overwrite a different passage', async ({ page }) => {
  await openCanvas(page, 'risetoheaven');
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/__canvas_rpc', async (route) => {
    const request = route.request().postDataJSON();
    if (request.method !== 'node_definition') return route.fallback();
    requested = true;
    const response = run(request.method, request.params);
    await held;
    await route.fulfill({ json: response });
  });
  const inspector = page.getByRole('region', { name: 'Estrutura de risetoheaven', exact: true });
  await inspector.getByText('Editar significado desta referência', { exact: true }).click();
  await inspector
    .getByLabel('Significado da referência', { exact: true })
    .fill('não aplicar na outra passagem');
  await inspector
    .getByRole('button', { name: 'Aplicar significado nesta ocorrência', exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => window.canvasSetPassageId('different-passage'));
  await expect(page.locator('#canvas-passage')).toHaveText('different-passage');
  release!();
  await expect(page.locator('#canvas-ready')).toHaveText('ready');
  await expect(page.locator('#canvas-raw')).toHaveText('risetoheaven');
});

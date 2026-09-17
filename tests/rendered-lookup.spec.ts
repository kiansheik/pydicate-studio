import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import type { StudioBridge } from '../src/domain/types';
import type { OperationFixture } from './expression-tree-harness';

interface Candidate {
  id: string;
  surface: string;
  expression: string;
  name?: string;
  definition?: string;
  kind: 'reference' | 'expression';
  source: {
    sourceId: string;
    ordinal?: number;
    passageId?: string;
    label: string;
    nodeId?: string;
    draft?: boolean;
  };
  match: 'exact' | 'prefix' | 'contains' | 'name' | 'definition' | 'relaxed' | 'segment';
}

interface Invocation {
  method: string;
  params: Record<string, unknown>;
}

const named: Candidate = {
  id: 'candidate:tupapotaba',
  surface: 'Tupã potaba',
  expression: 'source_alias_requiring_resolution',
  name: 'source_alias_requiring_resolution',
  definition: 'vontade de Deus',
  kind: 'reference',
  source: { sourceId: 'araujo_catecismo_1686', label: 'Léxico do projeto' },
  match: 'exact',
};
const first: Candidate = {
  id: 'candidate:ypy',
  surface: 'ypy',
  expression: 'ypy',
  name: 'ypy',
  definition: 'início, primeiro',
  kind: 'reference',
  source: { sourceId: 'araujo_catecismo_1686', label: 'Léxico do projeto' },
  match: 'exact',
};
const compound: Candidate = {
  id: 'candidate:unnamed-compound',
  surface: 'oemitymbûerypy',
  expression: '(pûera * (og * (emi * tym))) / ypy',
  kind: 'expression',
  source: {
    sourceId: 'araujo_catecismo_1686',
    ordinal: 81,
    passageId: 'araujo:81',
    label: 'Araújo · passagem 81',
    nodeId: 'root/left/right',
    draft: true,
  },
  match: 'exact',
};
const results = (...candidates: Candidate[]) => ({
  results: candidates,
  total: candidates.length,
  indexFingerprint: 'fixture-index-1',
});
const resolved = (candidate: Candidate) => ({
  expression: candidate.id === named.id ? 'tupapotaba' : candidate.expression,
  surface: candidate.surface,
  kind: candidate.kind,
  source: candidate.source,
});

function parse(raw: string): OperationFixture {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        "import json,sys;sys.path.insert(0,'python');from studio_authoring import expression_tree;raw=json.load(sys.stdin)['raw'];print(json.dumps({'raw':raw,'root':expression_tree(raw)['root']}))",
      ],
      { input: JSON.stringify({ raw }), encoding: 'utf8' },
    ),
  ) as OperationFixture;
}

async function openTree(
  page: Page,
  raw: string,
  handle: (request: Invocation) => unknown | Promise<unknown>,
) {
  const requests: Invocation[] = [];
  await page.route('**/__operation_parse', async (route) => {
    await route.fulfill({ json: parse(route.request().postDataJSON().raw) });
  });
  await page.route('**/__lookup_invoke', async (route) => {
    const request = route.request().postDataJSON() as Invocation;
    requests.push(request);
    try {
      await route.fulfill({ json: { result: await handle(request) } });
    } catch (error) {
      await route.fulfill({
        json: { error: (error as Error).message, code: (error as Error & { code?: string }).code },
      });
    }
  });
  await page.addInitScript((fixture) => {
    window.operationFixture = fixture;
    window.operationUsage = [];
    window.studio = {
      recordUsage: async (record: unknown) => window.operationUsage.push(record),
      invoke: async (method: string, params: Record<string, unknown>) => {
        const response = await fetch('/__lookup_invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, params }),
        });
        const body = (await response.json()) as { result?: unknown; error?: string; code?: string };
        if (body.error) throw Object.assign(new Error(body.error), { code: body.code });
        return body.result;
      },
    } as unknown as StudioBridge;
  }, parse(raw));
  await page.goto('/tests/expression-tree-harness.html');
  await expect(page.locator('#operation-parse-state')).toHaveText('pronto');
  return requests;
}

const svg = (page: Page) =>
  page.getByRole('group', { name: 'Diagrama interativo das operações Pydicate' });
const node = (page: Page, id: string) =>
  svg(page).locator(`[data-source-node="${id}"] > [aria-pressed]`);
const argument = (page: Page) =>
  page.getByRole('combobox', {
    name: 'Argumento da operação na árvore: buscar em tupi',
    exact: true,
  });

async function ready(page: Page, count: number) {
  await expect(page.locator('#operation-parse-state')).toHaveText('pronto');
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(svg(page).locator('[data-source-node]')).toHaveCount(count);
}

test('a rendered form starts a tree only after resolving a known construction to its verified expression', async ({
  page,
}) => {
  const requests = await openTree(page, '', ({ method }) =>
    method === 'structure_search' ? results(named) : resolved(named),
  );
  const input = page.getByRole('combobox', {
    name: 'Palavra ou expressão inicial: buscar em tupi',
    exact: true,
  });
  await input.fill('Tupãpotaba');
  await expect(page.getByRole('button', { name: 'Criar árvore', exact: true })).toBeDisabled();
  await expect(page.getByRole('listbox').getByRole('option')).toContainText('Tupã potaba');
  await page.getByRole('listbox').getByRole('option').click();
  await expect(page.getByRole('button', { name: 'Criar árvore', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Criar árvore', exact: true }).click();
  await ready(page, 1);
  await expect(page.locator('#operation-raw')).toHaveText('tupapotaba');
  await expect(svg(page).locator('.runtime-node-label')).toHaveText('tupapotaba');
  expect(requests.find((request) => request.method === 'structure_search')!.params).toMatchObject({
    passageId: 'operation-fixture',
    query: 'Tupãpotaba',
  });
  expect(requests.find((request) => request.method === 'structure_resolve')!.params).toMatchObject({
    passageId: 'operation-fixture',
    candidateId: named.id,
    indexFingerprint: 'fixture-index-1',
  });
});

test('spaced rendered input can choose and add a lexical operand with the keyboard', async ({
  page,
}) => {
  const requests = await openTree(page, 'tym', ({ method, params }) => {
    if (method === 'structure_search') return results(named, first);
    return resolved(params.candidateId === named.id ? named : first);
  });
  await ready(page, 1);
  const input = argument(page);
  await input.fill('Tupã   potaba');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await input.press('ArrowDown');
  const activeId = await input.getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();
  const activeText = (await page.locator(`[id="${activeId}"]`).textContent())!;
  const selected = activeText.includes('Tupã potaba') ? named : first;
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Aplicar operação', exact: true })).toBeEnabled();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
  await ready(page, 3);
  const root = parse((await page.locator('#operation-raw').textContent())!).root!;
  expect(root.children.find((child) => child.slot === 'left')!.node.code).toBe('tym');
  expect(root.children.find((child) => child.slot === 'right')!.node.code).toBe(
    resolved(selected).expression,
  );
  expect(requests.find((request) => request.method === 'structure_search')!.params.query).toBe(
    'Tupã   potaba',
  );
});

test('an unnamed prior subtree replaces only the selected occurrence and supports undo', async ({
  page,
}) => {
  const raw = 'no + (oré * tym)';
  await openTree(page, raw, ({ method }) =>
    method === 'structure_search' ? results(compound) : resolved(compound),
  );
  await ready(page, 5);
  await node(page, 'root/right/right').click();
  await page.getByText('Reutilizar palavra ou trecho', { exact: true }).click();
  const input = page.getByRole('combobox', {
    name: 'Buscar léxico na árvore: buscar em tupi',
    exact: true,
  });
  await input.fill('oemi tymbûer ypy');
  await expect(page.getByRole('listbox').getByRole('option')).toContainText('oemitymbûerypy');
  await expect(page.getByRole('listbox').getByRole('option')).toContainText('Araújo');
  await page.getByRole('listbox').getByRole('option').click();
  await page.getByRole('button', { name: 'Substituir seleção', exact: true }).click();
  await ready(page, 13);
  const next = (await page.locator('#operation-raw').textContent())!;
  expect(next).toBe(`no + (oré * (${compound.expression}))`);
  expect(parse(next).root!.children[0].node.code).toBe('no');
  expect(parse(next).root!.children[1].node.children[0].node.code).toBe('oré');
  expect(await svg(page).locator('.runtime-node-label').allTextContents()).not.toContain(
    'oemitymbûerypy',
  );
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page, 5);
  await expect(page.locator('#operation-raw')).toHaveText(raw);
});

test('a delayed old search cannot replace newer results and Escape dismisses suggestions', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const requests = await openTree(page, 'tym', async ({ method, params }) => {
    if (method !== 'structure_search') return resolved(first);
    if (params.query === 'Tupã') {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return results(named);
    }
    return results(first);
  });
  await ready(page, 1);
  await argument(page).fill('Tupã');
  await expect.poll(() => Boolean(release)).toBe(true);
  await argument(page).fill('ypy');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('listbox').getByRole('option')).toContainText('ypy');
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/__lookup_invoke') &&
      response.request().postDataJSON().params.query === 'Tupã',
  );
  release!();
  await oldResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole('listbox').getByRole('option')).not.toContainText('Tupã potaba');
  await argument(page).press('Escape');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);
  expect(requests.filter((request) => request.method === 'structure_resolve')).toHaveLength(0);
  await expect(page.locator('#operation-raw')).toHaveText('tym');
});

test('an in-flight candidate resolution cannot insert into a newly selected scope', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  await openTree(page, 'oré * tym', async ({ method }) => {
    if (method === 'structure_search') return results(named);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return resolved(named);
  });
  await ready(page, 3);
  await argument(page).fill('Tupãpotaba');
  await page.getByRole('listbox').getByRole('option').click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await node(page, 'root/right').click();
  await expect(page.locator('#operation-selection')).toHaveText('root/right');
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/__lookup_invoke') &&
      response.request().postDataJSON().method === 'structure_resolve',
  );
  release!();
  await oldResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole('button', { name: 'Aplicar operação', exact: true })).toBeDisabled();
  await expect(page.locator('#operation-raw')).toHaveText('oré * tym');
  await expect(page.locator('output[aria-label="Prévia da operação"]')).toHaveCount(0);
});

test('changing the typed form invalidates an older resolution before a new candidate is selected', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  await openTree(page, 'tym', async ({ method, params }) => {
    if (method === 'structure_search') return results(params.query === 'ypy' ? first : named);
    if (params.candidateId === named.id)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return resolved(params.candidateId === named.id ? named : first);
  });
  await ready(page, 1);
  await argument(page).fill('Tupãpotaba');
  await page.getByRole('listbox').getByRole('option').click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await argument(page).fill('ypy');
  await expect(page.getByRole('listbox').getByRole('option')).toContainText('ypy');
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/__lookup_invoke') &&
      response.request().postDataJSON().params.candidateId === named.id,
  );
  release!();
  await oldResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(argument(page)).toHaveValue('ypy');
  await expect(page.getByRole('button', { name: 'Aplicar operação', exact: true })).toBeDisabled();
  await page.getByRole('listbox').getByRole('option').click();
  await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
  await ready(page, 3);
  const root = parse((await page.locator('#operation-raw').textContent())!).root!;
  expect(root.children.find((child) => child.slot === 'right')!.node.code).toBe('ypy');
});

test('a stale structure index refreshes the same query and requires a fresh explicit selection', async ({
  page,
}) => {
  let refreshed = false;
  const fresh = { ...first, id: 'candidate:ypy-current' };
  const requests = await openTree(page, 'tym', ({ method }) => {
    if (method === 'structure_search')
      return {
        ...results(refreshed ? fresh : first),
        indexFingerprint: refreshed ? 'fixture-index-2' : 'fixture-index-1',
      };
    if (!refreshed) {
      refreshed = true;
      throw Object.assign(new Error('As estruturas mudaram.'), { code: 'STALE_STRUCTURE_INDEX' });
    }
    return resolved(fresh);
  });
  await ready(page, 1);
  await argument(page).fill('y py');
  await page.getByRole('listbox').getByRole('option').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'As estruturas foram atualizadas' }),
  ).toBeVisible();
  await expect
    .poll(() => requests.filter((request) => request.method === 'structure_search').length)
    .toBe(2);
  await expect(page.getByRole('listbox').getByRole('option')).toContainText('ypy');
  await expect(argument(page)).toHaveValue('y py');
  await expect(page.getByRole('button', { name: 'Aplicar operação', exact: true })).toBeDisabled();
  await expect(page.locator('#operation-raw')).toHaveText('tym');
  expect(requests.filter((request) => request.method === 'structure_resolve')).toHaveLength(1);
  await page.getByRole('listbox').getByRole('option').click();
  await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
  await ready(page, 3);
  const resolvedRequests = requests.filter((request) => request.method === 'structure_resolve');
  expect(resolvedRequests[1].params).toMatchObject({
    candidateId: fresh.id,
    indexFingerprint: 'fixture-index-2',
  });
  expect(
    parse((await page.locator('#operation-raw').textContent())!).root!.children.find(
      (child) => child.slot === 'right',
    )!.node.code,
  ).toBe('ypy');
});

test('a known segment inside longer typed text is clearly labelled and inserts only that recognized structure', async ({
  page,
}) => {
  await openTree(page, 'tym', ({ method }) =>
    method === 'structure_search' ? results({ ...named, match: 'segment' }) : resolved(named),
  );
  await ready(page, 1);
  await argument(page).fill('Tupãpotaba porção ainda não definida');
  await expect(page.getByRole('listbox').getByRole('option')).toContainText(
    'Trecho reconhecido · parte do que você escreveu',
  );
  await page.getByRole('listbox').getByRole('option').click();
  await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
  await ready(page, 3);
  const root = parse((await page.locator('#operation-raw').textContent())!).root!;
  expect(root.children.find((child) => child.slot === 'right')!.node.code).toBe('tupapotaba');
  await expect(page.locator('#operation-raw')).not.toContainText('porção ainda não definida');
});

test('search and resolution failures are visible and cannot turn typed surface text into code', async ({
  page,
}) => {
  await openTree(page, 'tym', ({ method, params }) => {
    if (method === 'structure_search') {
      if (params.query === 'falha') throw new Error('O índice local não pôde ser consultado.');
      return results(named);
    }
    throw new Error('A construção mudou. Pesquise novamente.');
  });
  await ready(page, 1);
  await argument(page).fill('falha');
  await expect(page.getByRole('alert')).toContainText('O índice local não pôde ser consultado.');
  await argument(page).fill('Tupãpotaba');
  await page.getByRole('listbox').getByRole('option').click();
  await expect(page.getByRole('alert')).toContainText('A construção mudou. Pesquise novamente.');
  await expect(page.getByRole('button', { name: 'Aplicar operação', exact: true })).toBeDisabled();
  await expect(page.locator('#operation-raw')).toHaveText('tym');
  await expect(page.locator('output[aria-label="Prévia da operação"]')).toHaveCount(0);
});

test('a new passage resolves in its source context and retains the selected expression after restart', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?newPassage');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const supplyResponses = () =>
    page.evaluate(
      ({ search, resolve }) => {
        window.__nextControl.responses = {
          structure_search: search,
          structure_resolve: resolve,
          evidence_status: {
            version: 1,
            revision: 0,
            projectId: window.__nextControl.project.id,
            sourceId: 'araujo_catecismo_1686',
            asset: null,
            passage: null,
            retainedAssetCount: 0,
          },
        };
      },
      { search: results(compound), resolve: resolved(compound) },
    );
  await supplyResponses();
  await page.getByRole('button', { name: 'Nova leitura simulada', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova passagem', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Transcrição da nova passagem', exact: true })
    .fill('oemitymbûerypy');
  await dialog.getByText('Análise opcional', { exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Construção para a nova passagem: buscar em tupi', exact: true })
    .fill('oemi tymbûer ypy');
  await expect(
    dialog.getByRole('button', { name: 'Usar construção escolhida', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('listbox').getByRole('option').click();
  await dialog.getByRole('button', { name: 'Usar construção escolhida', exact: true }).click();
  await expect(
    dialog.getByRole('textbox', { name: 'Pydicate da nova passagem', exact: true }),
  ).toHaveValue(compound.expression);
  const pendingId = await page.evaluate(() => window.__nextStudio.pendingDrafts[0].passageId);
  const lookupRequests = await page.evaluate(() =>
    window.__nextControl.requests.filter((request) => request.method.startsWith('structure_')),
  );
  expect(lookupRequests).toHaveLength(2);
  for (const request of lookupRequests)
    expect(request.params).toMatchObject({
      passageId: pendingId,
      sourceId: 'araujo_catecismo_1686',
    });
  await dialog.getByRole('button', { name: 'Salvar nova leitura', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Rascunho salvo' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('ready')).toHaveText('true');
  await supplyResponses();
  await page.getByRole('button', { name: 'Nova leitura simulada', exact: true }).click();
  await expect(
    dialog.getByRole('textbox', { name: 'Pydicate da nova passagem', exact: true }),
  ).toHaveValue(compound.expression);
  await expect(
    dialog.getByRole('textbox', { name: 'Transcrição da nova passagem', exact: true }),
  ).toHaveValue('oemitymbûerypy');
});

test('the global lexicon reuses an unnamed subtree in the selected scope and retains the separate definition catalog', async ({
  page,
}) => {
  const raw = 'no + tym';
  const edited = `no + (${compound.expression})`;
  await page.goto('/tests/next-hook-harness.html?lexicon&scope=root/right');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await page.evaluate(
    ({ trees, search, resolve }) => {
      window.__nextControl.trees = trees;
      window.__nextControl.responses = {
        structure_search: search,
        structure_resolve: resolve,
        lexicon_search: {
          results: [
            { id: 'lexical:ypy', name: 'ypy', definition: 'início, primeiro', kind: 'word' },
          ],
        },
      };
    },
    {
      trees: { [raw]: parse(raw).root, [edited]: parse(edited).root },
      search: results(compound),
      resolve: resolved(compound),
    },
  );
  await page.getByRole('textbox', { name: 'Pydicate simulado', exact: true }).fill(raw);
  await expect(page.getByTestId('tree')).toHaveText(raw);
  const reuse = page.getByRole('region', { name: 'Reutilizar pelo que se lê', exact: true });
  await expect(reuse).toContainText('Destino: tym');
  await reuse
    .getByRole('combobox', {
      name: 'Palavra ou trecho para reutilizar: buscar em tupi',
      exact: true,
    })
    .fill('oemi tymbûer ypy');
  await expect(reuse.getByRole('listbox').getByRole('option')).toContainText('oemitymbûerypy');
  await reuse.getByRole('listbox').getByRole('option').click();
  await reuse.getByRole('button', { name: 'Reutilizar na parte selecionada', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Pydicate simulado', exact: true })).toHaveValue(
    edited,
  );
  await expect(page.getByTestId('tree')).toHaveText(edited);
  await page.getByRole('button', { name: 'Desfazer simulado', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Pydicate simulado', exact: true })).toHaveValue(
    raw,
  );
  await expect(page.getByTestId('tree')).toHaveText(raw);

  const catalog = page.locator('.lexicon-definition-browser');
  await expect(catalog).toHaveJSProperty('open', false);
  await catalog.getByText('Inspecionar ou editar definições do projeto', { exact: true }).click();
  await expect(catalog).toHaveJSProperty('open', true);
  await catalog
    .getByRole('textbox', { name: 'Buscar no léxico ou Navarro', exact: true })
    .fill('ypy');
  await catalog.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(catalog.locator('.lexicon-results article')).toContainText('início, primeiro');
  const requests = await page.evaluate(() => window.__nextControl.requests);
  expect(requests.filter((request) => request.method === 'lexicon_inspect')).toHaveLength(0);
  expect(requests.filter((request) => request.method === 'structure_resolve')).toHaveLength(1);
  expect(requests.find((request) => request.method === 'structure_resolve')!.params).toMatchObject({
    passageId: 'passage-a',
    candidateId: compound.id,
  });
});

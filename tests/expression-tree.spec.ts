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
const parser = `import json,sys
from pathlib import Path
sys.path.insert(0,'python')
from studio_authoring import expression_tree,source_entries
payload=json.load(sys.stdin)
parsed=expression_tree(payload['raw'])
result={'raw':payload['raw'],'root':parsed['root']}
if payload.get('evaluate'):
    from authoring_runtime import configure,namespace_for,realize
    corpus=configure(Path(payload['parent']))
    path=corpus/'historic/araujo_catecismo_1686.tu.py'
    entry=source_entries(path)[80]
    result['evaluatedRoot']=realize(payload['raw'],namespace_for(corpus,path,entry['statementLine']))['tree']
print(json.dumps(result,ensure_ascii=False))`;

function parse(raw: string, evaluate = false): OperationFixture {
  return JSON.parse(
    execFileSync('python3', ['-B', '-c', parser], {
      input: JSON.stringify({ raw, evaluate, parent: projectParent }),
      encoding: 'utf8',
    }),
  ) as OperationFixture;
}

async function openTree(
  page: Page,
  fixture: OperationFixture,
  beforeParse?: (raw: string) => Promise<void>,
  evaluateUpdates = false,
) {
  await page.route('**/__operation_parse', async (route) => {
    const { raw } = route.request().postDataJSON() as { raw: string };
    await beforeParse?.(raw);
    await route.fulfill({ json: parse(raw, evaluateUpdates) });
  });
  await page.addInitScript((value) => {
    window.operationFixture = value;
    window.operationUsage = [];
    window.studio = {
      recordUsage: async (record: unknown) => window.operationUsage.push(record),
      invoke: async () => ({ results: [] }),
    } as unknown as StudioBridge;
  }, fixture);
  await page.goto('/tests/expression-tree-harness.html');
  await expect(page.locator('#operation-parse-state')).toHaveText('pronto');
}

const svg = (page: Page) =>
  page.getByRole('group', { name: 'Diagrama interativo das operações Pydicate' });
const node = (page: Page, id: string) =>
  svg(page).locator(`[data-source-node="${id}"] > [aria-pressed]`);
const stepResult = (page: Page, id: string) =>
  svg(page).locator(`[data-source-node="${id}"] .runtime-step-result`);

async function ready(page: Page, count: number) {
  await expect(page.locator('#operation-parse-state')).toHaveText('pronto');
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(svg(page).locator('[data-source-node]')).toHaveCount(count);
}

async function enterCode(page: Page, label: string, value: string) {
  const input = page.getByRole('textbox', { name: label, exact: true, includeHidden: true });
  if (!(await input.isVisible()))
    await input.locator('xpath=ancestor::details[1]').locator('summary').click();
  await input.fill(value);
}

test('actual compound displays each Pydicate operation and variable, with Classifier only as evidence', async ({
  page,
}) => {
  test.skip(!hasCorpus, 'Selected local corpus is not installed');
  const raw = '(pûera * (og * (emi * tym))) / ypy';
  await openTree(page, parse(raw, true));
  await ready(page, 9);
  const labels = await svg(page).locator('.runtime-node-label').allTextContents();
  const operations = await svg(page).locator('.runtime-operation-label').allTextContents();
  expect(operations.filter((label) => label === '*')).toHaveLength(3);
  expect(operations.filter((label) => label === '/')).toHaveLength(1);
  expect(labels.sort()).toEqual(['emi', 'og', 'pûera', 'tym', 'ypy'].sort());
  expect(labels).not.toContain('oemitymbûerypy');
  for (const [id, surface] of [
    ['root', 'oemitymbûerypy'],
    ['root/left', 'oemitymbûera'],
    ['root/left/right', 'oemityma'],
    ['root/left/right/right', 'temityma'],
  ]) {
    await expect(stepResult(page, id)).toHaveAttribute('data-evaluation-state', 'ok');
    await expect(stepResult(page, id)).toContainText(surface);
  }
  await expect(node(page, 'root')).toHaveAttribute('aria-label', /Composição lexical/);
  await expect(node(page, 'root')).toHaveAttribute('aria-label', /\//);
  await expect(svg(page).locator('.runtime-edge')).toHaveCount(8);
  const collapse = svg(page).locator('[data-source-node="root"] > .runtime-collapse');
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await expect(collapse.locator('path.runtime-collapse-chevron')).toHaveCount(1);
  await expect(collapse.locator('text')).toHaveCount(0);
  await collapse.click();
  await expect(collapse).toHaveAttribute('aria-expanded', 'false');
  await expect(collapse.locator('path.runtime-collapse-chevron')).toHaveCount(1);
  await expect(collapse.locator('text')).toHaveCount(0);
  await expect(svg(page).locator('[data-source-node]')).toHaveCount(1);
  await collapse.click();
  await expect(svg(page).locator('[data-source-node]')).toHaveCount(9);
  await node(page, 'root/right').click();
  await expect(page.locator('#operation-selection')).toHaveText('root/right');
  await page.getByRole('button', { name: 'Editar conexão /: esquerda', exact: true }).click();
  await expect(page.locator('#operation-selection')).toHaveText('root');
  await node(page, 'root/right').click();
  await page.getByRole('button', { name: 'Editar conexão /: esquerda', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#operation-selection')).toHaveText('root');
  await expect(page.locator('.runtime-inspector-heading h3')).toContainText('Composição lexical');
  await expect(page.locator('.runtime-inspector-heading h3 code')).toHaveText('/');
  await expect(page.getByRole('region', { name: 'Resultado final', exact: true })).toContainText(
    'oemitymbûerypy',
  );
  await page.getByText(/Código e evidência do motor/).click();
  await expect(page.locator('.runtime-inspector')).toContainText('Classifier');
  await expect(page.locator('#operation-raw')).toHaveText(raw);
});

test('building the actual compound updates each operation result and undo restores the previous final result', async ({
  page,
}) => {
  test.skip(!hasCorpus, 'Selected local corpus is not installed');
  await openTree(page, parse('tym', true), undefined, true);
  await ready(page, 1);
  const surfaces = ['temityma', 'oemityma', 'oemitymbûera', 'oemitymbûerypy'];
  for (const [index, modifier] of ['emi', 'og', 'pûera', 'ypy'].entries()) {
    await node(page, 'root').click();
    await page
      .getByRole('combobox', { name: 'Operação na árvore', exact: true })
      .selectOption(modifier === 'ypy' ? '/' : '*');
    await enterCode(page, 'Argumento da operação na árvore', modifier);
    await page
      .getByRole('combobox', { name: 'Posição do novo argumento' })
      .selectOption(modifier === 'ypy' ? 'right' : 'left');
    await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
    await ready(page, 3 + index * 2);
    await expect(stepResult(page, 'root')).toContainText(surfaces[index]);
    await expect(page.getByRole('region', { name: 'Resultado final', exact: true })).toContainText(
      surfaces[index],
    );
    if (index > 0)
      await expect(stepResult(page, modifier === 'ypy' ? 'root/left' : 'root/right')).toContainText(
        surfaces[index - 1],
      );
  }
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page, 7);
  await expect(stepResult(page, 'root')).toContainText('oemitymbûera');
  await expect(stepResult(page, 'root')).not.toContainText('oemitymbûerypy');
  await page.getByRole('button', { name: 'Refazer edição na árvore' }).click();
  await ready(page, 9);
  await expect(stepResult(page, 'root')).toContainText('oemitymbûerypy');
});

test('long operation results stay compact in the graph and complete in the title and inspector', async ({
  page,
}) => {
  const fixture = parse('oré + endé');
  const surface = 'oré endé '.repeat(40).trim();
  fixture.evaluatedRoot = structuredClone(fixture.root!);
  fixture.evaluatedRoot.evaluation = { status: 'ok', surface };
  await openTree(page, fixture);
  await ready(page, 3);
  const preview = stepResult(page, 'root');
  await expect(preview).toHaveAttribute('data-evaluation-state', 'ok');
  expect((await preview.locator('.runtime-result-text').textContent())!.length).toBeLessThan(
    surface.length,
  );
  await expect(node(page, 'root').locator(':scope > title')).toContainText(surface);
  await node(page, 'root').click();
  await expect(page.getByRole('region', { name: 'Resultado final', exact: true })).toContainText(
    surface,
  );
  await expect(svg(page).locator('.runtime-node-label')).toHaveText(['oré', 'endé']);
});

test('an empty evaluated form is distinct from an unavailable intermediate evaluation', async ({
  page,
}) => {
  const fixture = parse('(emi * tym) + (og * tym)');
  fixture.evaluatedRoot = structuredClone(fixture.root!);
  fixture.evaluatedRoot.evaluation = { status: 'ok', surface: 'forma final' };
  fixture.evaluatedRoot.children[0].node.evaluation = { status: 'ok', surface: '' };
  fixture.evaluatedRoot.children[1].node.evaluation = {
    status: 'unavailable',
    message: 'Etapa precisa de um argumento',
  };
  await openTree(page, fixture);
  await ready(page, 7);
  await expect(stepResult(page, 'root/left')).toHaveAttribute('data-evaluation-state', 'ok');
  await expect(stepResult(page, 'root/left')).toContainText(/∅|vazia/i);
  await expect(stepResult(page, 'root/right')).toHaveAttribute(
    'data-evaluation-state',
    'unavailable',
  );
  await node(page, 'root/right').click();
  await expect(
    page.getByRole('region', { name: 'Resultado desta etapa', exact: true }),
  ).toContainText('Etapa precisa de um argumento');
  await expect(page.getByRole('button', { name: 'Aplicar operação', exact: true })).toBeVisible();
  await node(page, 'root/left').click();
  await expect(
    page.getByRole('region', { name: 'Resultado desta etapa', exact: true }),
  ).toContainText(/∅|vazia/i);
});

test('previous results disappear while a new source revision is pending and do not attach to a different expression', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const fixture = parse('emi * tym');
  fixture.evaluatedRoot = structuredClone(fixture.root!);
  fixture.evaluatedRoot.evaluation = { status: 'ok', surface: 'temityma' };
  fixture.retainPreviousEvaluation = true;
  await openTree(page, fixture, async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await ready(page, 3);
  await expect(stepResult(page, 'root')).toContainText('temityma');
  await page.getByRole('textbox', { name: 'Código de teste' }).fill('og * (emi * tym)');
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator('#operation-parse-state')).toHaveText('pendente');
  await expect(svg(page).locator('[data-source-node]')).toHaveCount(3);
  await expect(svg(page).locator('[data-evaluation-state="ok"]')).toHaveCount(0);
  await expect(page.locator('.runtime-inspector')).not.toContainText('temityma');
  release!();
  await ready(page, 5);
  await expect(svg(page).locator('[data-evaluation-state="ok"]')).toHaveCount(0);
  await expect(svg(page)).not.toContainText('temityma');
});

test('operation choices describe their linguistic role in Portuguese while retaining the exact Pydicate operator', async ({
  page,
}) => {
  await openTree(page, parse('tym'));
  await ready(page, 1);
  const operations = page.getByRole('combobox', { name: 'Operação na árvore', exact: true });
  await expect(operations.locator('option[value="/"]')).toHaveText('Composição lexical · /');
  await expect(operations.locator('option[value="@"]')).toHaveText('Predicação com cópula · @');
  await expect(operations.locator('option[value="*"]')).toHaveText('Vincular elementos · *');
  await operations.selectOption('/');
  await expect(page.locator('.tree-operation-help')).toContainText(
    'Combina a base à esquerda com o modificador à direita',
  );
  await operations.selectOption('@');
  await expect(page.locator('.tree-operation-help')).toContainText(/cópula/i);
  await expect(page.locator('#operation-raw')).toHaveText('tym');
});

test('a new compound is built in the tree one correctly ordered operation at a time, with undo and redo', async ({
  page,
}) => {
  await openTree(page, parse(''));
  await enterCode(page, 'Palavra ou expressão inicial', 'tym');
  await page.getByRole('button', { name: 'Criar árvore', exact: true }).click();
  await ready(page, 1);
  const revisions = ['tym'];
  for (const [index, modifier] of ['emi', 'og', 'pûera', 'ypy'].entries()) {
    await node(page, 'root').click();
    await page
      .getByRole('combobox', { name: 'Operação na árvore', exact: true })
      .selectOption(modifier === 'ypy' ? '/' : '*');
    await enterCode(page, 'Argumento da operação na árvore', modifier);
    await page
      .getByRole('combobox', { name: 'Posição do novo argumento' })
      .selectOption(modifier === 'ypy' ? 'right' : 'left');
    await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
    await ready(page, 3 + index * 2);
    const raw = (await page.locator('#operation-raw').textContent())!;
    revisions.push(raw);
    const root = parse(raw).root!;
    expect(root.operator).toBe(modifier === 'ypy' ? '/' : '*');
    const inserted = root.children.find(
      (child) => child.slot === (modifier === 'ypy' ? 'right' : 'left'),
    )!.node;
    expect(inserted.code).toBe(modifier);
    const retained = root.children.find(
      (child) => child.slot === (modifier === 'ypy' ? 'left' : 'right'),
    )!.node;
    expect(retained.code).toBe(parse(revisions.at(-2)!).root!.code);
  }
  for (let index = revisions.length - 2; index >= 0; index--) {
    await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
    await ready(page, 1 + index * 2);
    await expect(page.locator('#operation-raw')).toHaveText(revisions[index]);
  }
  for (let index = 1; index < revisions.length; index++) {
    await page.getByRole('button', { name: 'Refazer edição na árvore' }).click();
    await ready(page, 1 + index * 2);
    await expect(page.locator('#operation-raw')).toHaveText(revisions[index]);
  }
});

test('search highlights each repeated reference without matching its ancestors and edits its exact Unicode span', async ({
  page,
}) => {
  const raw = `Noun("🦜î") + (oré * oré)`;
  await openTree(page, parse(raw));
  await ready(page, 5);
  await expect(svg(page).locator('[data-source-node="root/left/arg0"]')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Buscar na árvore' }).fill('oré');
  await expect(svg(page).locator('[data-source-node].is-match')).toHaveCount(2);
  await expect(svg(page).locator('[data-source-node="root"].is-match')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(page.locator('#operation-selection')).toHaveText('root/right/left');
  await page.getByText('Substituir por expressão ou valor', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Expressão da parte na árvore' }).fill('tym');
  await page.getByRole('button', { name: 'Aplicar substituição', exact: true }).click();
  await ready(page, 5);
  await expect(page.locator('#operation-raw')).toHaveText(`Noun("🦜î") + ((tym) * oré)`);
  await expect(svg(page).locator('[data-source-node].is-match')).toHaveCount(1);
});

test('inspection and unchanged replacement preserve original grouping and comments byte for byte', async ({
  page,
}) => {
  const raw = '(\n  emi * (tym)  # anotação 🌿\n)';
  await openTree(page, parse(raw));
  await ready(page, 3);
  await node(page, 'root').click();
  await page.getByText('Substituir por expressão ou valor', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Aplicar substituição', exact: true }),
  ).toBeDisabled();
  await page.getByRole('textbox', { name: 'Buscar na árvore' }).fill('tym');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(page.locator('#operation-selection')).toHaveText('root/right');
  expect(await page.locator('#operation-raw').textContent()).toBe(raw);
  await expect(page.getByRole('button', { name: 'Desfazer edição na árvore' })).toBeDisabled();
});

test('stale displayed nodes cannot edit different spans while the current source is being parsed', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const changed = 'og * (emi * tym)';
  await openTree(page, parse('emi * tym'), async (raw) => {
    if (raw === changed)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
  });
  await ready(page, 3);
  await node(page, 'root/right').click();
  await expect(page.locator('#operation-selection')).toHaveText('root/right');
  await page.getByRole('textbox', { name: 'Código de teste' }).fill(changed);
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator('#operation-parse-state')).toHaveText('pendente');
  await expect(svg(page).locator('[data-source-node]')).toHaveCount(3);
  await node(page, 'root/right').click();
  await expect(page.getByRole('button', { name: 'Aplicar operação', exact: true })).toHaveCount(0);
  await expect(page.locator('#operation-raw')).toHaveText(changed);
  release!();
  await ready(page, 5);
  await node(page, 'root/right/right').click();
  await expect(page.locator('#operation-selection')).toHaveText('root/right/right');
  await expect(page.locator('.tree-current-expression')).toHaveText('tym');
});

test('valid source operations remain visible and editable when engine evaluation fails', async ({
  page,
}) => {
  const fixture = parse('tym * missing_predicate');
  fixture.status = 'Motor: referência lexical desconhecida: missing_predicate';
  await openTree(page, fixture);
  await ready(page, 3);
  await expect(page.getByRole('status').filter({ hasText: 'Motor:' })).toBeVisible();
  await node(page, 'root/right').click();
  await expect(page.locator('.tree-current-expression')).toHaveText('missing_predicate');
  await page.getByText('Substituir por expressão ou valor', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Expressão da parte na árvore' }).fill('ypy');
  await page.getByRole('button', { name: 'Aplicar substituição', exact: true }).click();
  await ready(page, 3);
  await expect(page.locator('#operation-raw')).toHaveText('tym * (ypy)');
});

test('changing a nested operation, swapping operands and retaining one child preserve surrounding source', async ({
  page,
}) => {
  const raw = '(pupé * (\n  emi  # entre as partes: + e * permanecem 🌿\n  * tym\n)) + no';
  const fixture = parse(raw);
  const initialScope = fixture.root!.children[0].node.children[1].node;
  const prefix = raw.slice(0, initialScope.start);
  const suffix = raw.slice(initialScope.end);
  const comment = '# entre as partes: + e * permanecem 🌿';
  await openTree(page, fixture);
  await ready(page, 7);
  await node(page, 'root/left/right').click();
  await page.getByText('Modificar ou retirar esta operação', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Novo operador desta parte' }).selectOption('/');
  await page.getByRole('button', { name: 'Trocar operador', exact: true }).click();
  await ready(page, 7);
  let edited = (await page.locator('#operation-raw').textContent())!;
  expect(edited.startsWith(prefix)).toBe(true);
  expect(edited.endsWith(suffix)).toBe(true);
  expect(edited).toContain(comment);
  let root = parse(edited).root!;
  expect(root.children[0].node.children[1].node.operator).toBe('/');
  expect(root.children[0].node.children[0].node.code).toBe('pupé');
  expect(root.children[1].node.code).toBe('no');

  await node(page, 'root/left/right').click();
  await page.getByText('Modificar ou retirar esta operação', { exact: true }).click();
  await page.getByRole('button', { name: 'Inverter lados', exact: true }).click();
  await ready(page, 7);
  edited = (await page.locator('#operation-raw').textContent())!;
  expect(edited.startsWith(prefix)).toBe(true);
  expect(edited.endsWith(suffix)).toBe(true);
  expect(edited).toContain(comment);
  root = parse(edited).root!;
  expect(root.children[0].node.children[1].node.children.map((child) => child.node.code)).toEqual([
    'tym',
    'emi',
  ]);

  await node(page, 'root/left/right').click();
  await page.getByText('Modificar ou retirar esta operação', { exact: true }).click();
  await page.getByRole('button', { name: /^Manter lado esquerdo/ }).click();
  await ready(page, 5);
  edited = (await page.locator('#operation-raw').textContent())!;
  expect(edited.startsWith(prefix)).toBe(true);
  expect(edited.endsWith(suffix)).toBe(true);
  root = parse(edited).root!;
  expect(root.children[0].node.children[1].node.code).toBe('tym');
  expect(root.children[0].node.children[0].node.code).toBe('pupé');
  expect(root.children[1].node.code).toBe('no');
});

test('optional method arguments, literal edits and undo keep the same source editor in fullscreen', async ({
  page,
}) => {
  await openTree(page, parse('tym'));
  await ready(page, 1);
  await page.getByRole('button', { name: 'Árvore em tela cheia' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(() =>
    document.fullscreenElement!.setAttribute('data-fullscreen-instance', 'operation-editor'),
  );
  const assertFullscreen = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => document.fullscreenElement?.getAttribute('data-fullscreen-instance')),
      )
      .toBe('operation-editor');
  };
  await page
    .getByRole('combobox', { name: 'Operação na árvore', exact: true })
    .selectOption('base_nominal');
  await enterCode(page, 'Argumento da operação na árvore', 'True');
  await expect(page.locator('output[aria-label="Prévia da operação"]')).toHaveText(
    '(tym).base_nominal(True)',
  );
  await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
  await ready(page, 3);
  await assertFullscreen();
  const withTrue = (await page.locator('#operation-raw').textContent())!;
  expect(parse(withTrue).root!.method).toBe('base_nominal');
  await expect(node(page, 'root/arg0')).toHaveAttribute('aria-label', 'True, Valor');

  await node(page, 'root/arg0').click();
  await page.getByRole('textbox', { name: 'Expressão da parte na árvore' }).fill('False');
  await page.getByRole('button', { name: 'Aplicar substituição', exact: true }).click();
  await ready(page, 3);
  await assertFullscreen();
  await expect(node(page, 'root/arg0')).toHaveAttribute('aria-label', 'False, Valor');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page, 3);
  await assertFullscreen();
  await expect(page.locator('#operation-raw')).toHaveText(withTrue);
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await ready(page, 1);
  await assertFullscreen();
  await expect(page.locator('#operation-raw')).toHaveText('tym');
  await page.getByRole('button', { name: 'Refazer edição na árvore' }).click();
  await ready(page, 3);
  await assertFullscreen();
  await node(page, 'root').click();
  await page.getByText('Modificar ou retirar esta operação', { exact: true }).click();
  await page.getByRole('button', { name: 'Retirar esta operação', exact: true }).click();
  await ready(page, 1);
  await assertFullscreen();
  expect(parse((await page.locator('#operation-raw').textContent())!).root!.code).toBe('tym');
  await page.getByRole('button', { name: 'Árvore em tela cheia' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { RuntimeGraph, RuntimeNode } from '../src/domain/runtime-tree';
import type { StudioBridge } from '../src/domain/types';
import type { AuthorNode } from '../src/domain/authoring';

const makeNode = (id: string, label: string, category = 'noun'): RuntimeNode => ({
  id,
  label,
  runtimeType: category === 'verb' ? 'Verb' : 'Noun',
  category,
  definition: `Definição de ${label}`,
  tag: `[${category.toUpperCase()}]`,
  attributes: { negated: false, mood: category === 'verb' ? 'imperativo' : null },
  morphology: { 'noun.pluriforme': true },
  ...(id === 'a' ? { sourceNodeId: 'root' } : {}),
});
const graph: RuntimeGraph = {
  version: 1,
  rootId: 'a',
  nodes: [
    makeNode('a', 'pysyrõ', 'verb'),
    makeNode('b', 'oré'),
    makeNode('c', 'Tupã'),
    makeNode('d', 'tábá'),
    makeNode('e', 'îekyî', 'verb'),
  ],
  diagnostics: [],
  edges: [
    {
      id: 'ab',
      source: 'a',
      target: 'b',
      field: 'arguments',
      index: 0,
      label: 'sujeito',
      kind: 'child',
      evidence: 'Verb.subject()',
    },
    {
      id: 'ac',
      source: 'a',
      target: 'c',
      field: 'arguments',
      index: 1,
      label: 'objeto',
      kind: 'child',
      evidence: 'Verb.object()',
    },
    {
      id: 'bd',
      source: 'b',
      target: 'd',
      field: 'compositions',
      index: 0,
      label: 'composição 1',
      kind: 'child',
      evidence: 'compositions',
    },
    {
      id: 'ae',
      source: 'a',
      target: 'e',
      field: 'pre_adjuncts',
      index: 0,
      label: 'adjunto anterior 1',
      kind: 'child',
      evidence: 'pre_adjuncts',
    },
    {
      id: 'ea',
      source: 'e',
      target: 'a',
      field: 'principal',
      index: null,
      label: 'oração principal',
      kind: 'reference',
      evidence: 'principal',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((fixture) => {
    window.treeFixture = fixture;
    window.treeUsage = [];
    window.studio = {
      recordUsage: async (record: unknown) => {
        window.treeUsage.push(record);
      },
    } as unknown as StudioBridge;
  }, graph);
  await page.goto('/tests/runtime-tree-harness.html');
});
test('runtime SVG collapses, searches hidden nodes, inspects roles, zooms, pans and exports', async ({
  page,
}) => {
  const svg = page.getByRole('group', { name: 'Diagrama interativo da análise realizada' });
  await expect(svg.locator('[data-runtime-node]')).toHaveCount(5);
  await expect(svg.locator('.runtime-edge.is-reference')).toHaveCount(1);
  await page.getByRole('button', { name: 'Recolher oré', exact: true }).click();
  await expect(svg.locator('[data-runtime-node]')).toHaveCount(4);
  await page.getByRole('textbox', { name: 'Buscar na árvore' }).fill('taba');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(svg.locator('[data-runtime-node]')).toHaveCount(5);
  await expect(
    page
      .getByRole('complementary', { name: 'Constituinte selecionado' })
      .getByRole('heading', { name: 'tábá' }),
  ).toBeVisible();
  await expect(page.getByText('Nó interno do modelo realizado.', { exact: false })).toBeVisible();
  await expect(page.locator('#source-selection')).toHaveText('root');
  await page.getByText('Morfologia no motor (1)', { exact: true }).click();
  await expect(page.getByText('noun.pluriforme', { exact: true })).toBeVisible();
  const before = await svg.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Ampliar árvore', exact: true }).click();
  expect(await svg.getAttribute('viewBox')).not.toBe(before);
  const bounds = await svg.boundingBox();
  await page.mouse.move(bounds!.x + 8, bounds!.y + 8);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 48, bounds!.y + 38);
  await page.mouse.up();
  const afterPan = await svg.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(afterPan);
  await page.getByRole('checkbox', { name: 'Vínculos de referência' }).uncheck();
  await expect(svg.locator('.runtime-edge.is-reference')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toBe('pydicate-arvore.svg');
  const exported = await fs.readFile((await artifact.path())!, 'utf8');
  expect(exported).toContain('http://www.w3.org/2000/svg');
  expect(exported).toContain('stroke-width:');
  expect(exported).toContain('Pydicate Studio');
  expect(exported).toContain('Verb.subject()');
  expect(
    await page.evaluate(
      (source) =>
        new DOMParser().parseFromString(source, 'image/svg+xml').querySelector('parsererror')
          ?.textContent ?? null,
      exported,
    ),
  ).toBeNull();
  const usage = await page.evaluate(() => JSON.stringify(window.treeUsage));
  expect(usage).toContain('tree.export');
  expect(usage).toContain('tree.select');
  expect(usage).not.toContain('tábá');
  expect(usage).not.toContain('Definição');
});

test('keyboard controls expose collapse state and preserve safe text rendering', async ({
  page,
}) => {
  const button = page.getByRole('button', { name: 'Recolher pysyrõ', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Expandir pysyrõ', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('[data-runtime-node]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(page.locator('[data-runtime-node]')).toHaveCount(5);
  await page.getByRole('button', { name: 'îekyî, Verb, imperativo', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('complementary').getByRole('heading', { name: 'îekyî' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '→ oração principal pysyrõ' })).toBeVisible();
});

test('initial overview uses the measured narrow pane without undoing explicit expansion on resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 1050 });
  await page.reload();
  await expect(page.locator('[data-runtime-node]')).toHaveCount(4);
  const initialZoom = Number(
    (await page.locator('output[aria-label="Zoom da árvore"]').textContent())!.replace('%', ''),
  );
  expect(initialZoom).toBeGreaterThanOrEqual(65);
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(page.locator('[data-runtime-node]')).toHaveCount(5);
  await page.setViewportSize({ width: 650, height: 950 });
  await expect(page.locator('[data-runtime-node]')).toHaveCount(5);
});

test('wheel zoom requires canvas focus and keeps the cursor model point fixed', async ({
  page,
}) => {
  const svg = page.getByRole('group', { name: 'Diagrama interativo da análise realizada' });
  const bounds = (await svg.boundingBox())!;
  const point = {
    x: Math.floor(bounds.x + bounds.width * 0.7),
    y: Math.floor(bounds.y + bounds.height * 0.3),
  };
  const initial = await svg.getAttribute('viewBox');
  await svg.dispatchEvent('wheel', {
    deltaY: -80,
    clientX: point.x,
    clientY: point.y,
    bubbles: true,
    cancelable: true,
  });
  expect(await svg.getAttribute('viewBox')).toBe(initial);
  await svg.focus();
  const modelPoint = async () =>
    svg.evaluate((element, p) => {
      const box = element.getBoundingClientRect();
      const view = (element as SVGSVGElement).viewBox.baseVal;
      return {
        x: view.x + ((p.x - box.x) * view.width) / box.width,
        y: view.y + ((p.y - box.y) * view.height) / box.height,
      };
    }, point);
  const before = await modelPoint();
  await svg.dispatchEvent('wheel', {
    deltaY: -80,
    clientX: point.x,
    clientY: point.y,
    bubbles: true,
    cancelable: true,
  });
  await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(initial);
  const after = await modelPoint();
  expect(after.x).toBeCloseTo(before.x, 3);
  expect(after.y).toBeCloseTo(before.y, 3);
  await page.getByRole('textbox', { name: 'Buscar na árvore' }).focus();
  const defocused = await svg.getAttribute('viewBox');
  await svg.dispatchEvent('wheel', {
    deltaY: -80,
    clientX: point.x,
    clientY: point.y,
    bubbles: true,
    cancelable: true,
  });
  expect(await svg.getAttribute('viewBox')).toBe(defocused);
});

test('search hides morphology copies until explicitly included and retains separate identity', async ({
  page,
}) => {
  await page.evaluate(() => {
    const root = window.treeFixture;
    window.treeUpdateGraph!({
      ...root,
      nodes: [...root.nodes, { ...root.nodes[3], id: 'internal-copy' }],
      edges: [
        ...root.edges,
        {
          id: 'internal',
          source: 'a',
          target: 'internal-copy',
          field: 'arg0',
          index: null,
          label: 'cópia para realização',
          kind: 'internal',
          evidence: 'Postposition.arg0',
        },
      ],
    });
  });
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(page.locator('[data-runtime-node]')).toHaveCount(5);
  await page.getByRole('textbox', { name: 'Buscar na árvore' }).fill('taba');
  await expect(page.locator('.runtime-search [role="status"]')).toHaveText('1/1');
  await page.getByRole('checkbox', { name: 'Cópias de realização' }).check();
  await expect(page.locator('[data-runtime-node]')).toHaveCount(6);
  await expect(page.locator('.runtime-search [role="status"]')).toHaveText('1/2');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(page.locator('.runtime-search [role="status"]')).toHaveText('2/2');
  await expect(page.locator('[data-runtime-node="internal-copy"]')).toHaveClass(/is-selected/);
});

test('verified source scope edits from the canvas preserve full expression and undo in fullscreen', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const raw = 'oré * taba';
    const right = {
      id: 'root/right',
      code: 'taba',
      start: 6,
      end: 10,
      kind: 'reference',
      label: 'taba',
      children: [],
    };
    window.treeAuthoring = {
      raw,
      root: {
        id: 'root',
        code: raw,
        start: 0,
        end: raw.length,
        kind: 'binary',
        label: '*',
        children: [{ slot: 'right', node: right }],
      },
    };
    window.treeFixture.nodes[3].sourceOccurrences = [
      {
        sourceNodeId: right.id,
        code: right.code,
        start: right.start,
        end: right.end,
        kind: right.kind,
      },
    ];
    window.treeFixture.nodes[3].sourceNodeId = right.id;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar na árvore' }).fill('taba');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(page.locator('#source-selection')).toHaveText('root/right');
  await page.getByRole('button', { name: 'Árvore em tela cheia' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Editar parte', exact: true }).click();
  await page.getByRole('combobox', { name: 'Operação na árvore' }).selectOption('negate');
  await page.getByRole('button', { name: 'Aplicar operação', exact: true }).click();
  await expect(page.locator('#raw-expression')).toHaveText('oré * (-(taba))');
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await expect(page.locator('#raw-expression')).toHaveText('oré * taba');
  await page.evaluate(() =>
    window.treeUpdateGraph!({ ...window.treeFixture, diagnostics: ['Nova realização conferida'] }),
  );
  await expect(page.getByText('Nova realização conferida')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator('[data-runtime-node="d"]')).toHaveClass(/is-selected/);
});

const actualParent = process.env.PYDICATE_PROJECT_PARENT || path.resolve('..');
function actualTree(
  ordinal: number,
  raw?: string,
): {
  raw: string;
  runtimeTree: RuntimeGraph;
  tree: AuthorNode;
  surface: string;
  annotated: string;
  structureFingerprint: string;
} {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        `
import json,sys
from pathlib import Path
sys.path.insert(0,'python')
from authoring_runtime import configure,namespace_for,realize
from studio_authoring import source_entries
params=json.load(sys.stdin);corpus=configure(Path(params['parent']));path=corpus/'historic/araujo_catecismo_1686.tu.py'
entry=source_entries(path)[params['ordinal']-1];raw=params.get('raw',entry['expression']);result=realize(raw,namespace_for(corpus,path,entry['statementLine']))
print(json.dumps({'raw':raw,**{key:result[key] for key in ('runtimeTree','tree','surface','annotated','structureFingerprint')}},ensure_ascii=False))
`,
      ],
      {
        input: JSON.stringify({
          parent: actualParent,
          ordinal,
          ...(raw === undefined ? {} : { raw }),
        }),
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      },
    ),
  );
}

test('actual first-line tree edits one of three oré occurrences and preserves the full engine result', async ({
  page,
}) => {
  test.skip(
    !existsSync(path.join(actualParent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py')),
    'Selected local corpus unavailable',
  );
  const actual = actualTree(1);
  await page.addInitScript((value) => {
    window.treeFixture = value.runtimeTree;
    window.treeAuthoring = { raw: value.raw, root: value.tree };
  }, actual);
  await page.reload();
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await expect(page.locator('[data-runtime-node]')).toHaveCount(15);
  await page.getByRole('textbox', { name: 'Buscar na árvore' }).fill('"oré"');
  await expect(page.locator('.runtime-search [role="status"]')).toHaveText('1/3');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await page.getByRole('button', { name: 'Árvore em tela cheia' }).click();
  await page.getByRole('button', { name: 'Editar parte', exact: true }).click();
  await page.getByRole('textbox', { name: 'Expressão da parte na árvore' }).fill('(oré)');
  await page.getByRole('button', { name: 'Aplicar substituição', exact: true }).click();
  const raw = (await page.locator('#raw-expression').textContent())!;
  const after = actualTree(1, raw);
  expect(after.surface).toBe(actual.surface);
  expect(after.annotated).toBe(actual.annotated);
  expect(after.structureFingerprint).toBe(actual.structureFingerprint);
  expect(raw).toContain('tupan ==');
  expect(raw).toContain('amotar');
  await page.evaluate((value) => {
    window.treeAuthoring = { raw: value.raw, root: value.tree };
    window.treeUpdateGraph!(value.runtimeTree);
  }, after);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.screenshot({ path: 'test-results/actual-araujo-tree-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Desfazer edição na árvore' }).click();
  await expect(page.locator('#raw-expression')).toHaveText(actual.raw);
});

test('actual reused complex construction keeps its internals read-only and its named scope editable', async ({
  page,
}) => {
  test.skip(
    !existsSync(path.join(actualParent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py')),
    'Selected local corpus unavailable',
  );
  const actual = actualTree(60);
  await page.addInitScript((value) => {
    window.treeFixture = value.runtimeTree;
    window.treeAuthoring = { raw: value.raw, root: value.tree };
  }, actual);
  await page.reload();
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  const internal = actual.runtimeTree.nodes.find((node) => !node.sourceOccurrences?.length)!;
  await page
    .locator(`[data-runtime-node="${internal.id}"] > [aria-pressed]`)
    .evaluate((element) =>
      (element as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
  await expect(
    page.getByText('Parte interna de uma construção reutilizada.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar parte', exact: true })).toHaveCount(0);
  const compound = actual.runtimeTree.nodes.find((node) =>
    node.lexicalOrigins?.includes('risetoheaven'),
  )!;
  await page
    .locator(`[data-runtime-node="${compound.id}"] > [aria-pressed]`)
    .evaluate((element) =>
      (element as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
  await page
    .getByRole('combobox', { name: 'Escopo editável na árvore' })
    .selectOption({ label: 'Referência risetoheaven' });
  await page.getByRole('button', { name: 'Editar parte', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preparar cópia desta ocorrência' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Expressão da parte na árvore' })).toHaveValue(
    'risetoheaven',
  );
});

test('retained old runtime nodes cannot select a different constituent in the next AST revision', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const raw = 'oré * taba';
    const right = {
      id: 'root/right',
      code: 'taba',
      start: 6,
      end: 10,
      kind: 'reference',
      label: 'taba',
      children: [],
    };
    window.treeAuthoring = {
      raw,
      root: {
        id: 'root',
        code: raw,
        start: 0,
        end: raw.length,
        kind: 'binary',
        label: '*',
        children: [{ slot: 'right', node: right }],
      },
    };
    window.treeFixture.nodes[3].sourceOccurrences = [
      {
        sourceNodeId: right.id,
        code: right.code,
        start: right.start,
        end: right.end,
        kind: right.kind,
      },
    ];
    window.treeFixture.nodes[3].sourceNodeId = right.id;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
  await page.locator('[data-runtime-node="d"] > [aria-pressed]').click();
  await page.getByRole('button', { name: 'Editar parte', exact: true }).click();
  await page.getByRole('textbox', { name: 'Expressão da parte na árvore' }).fill('endé');
  await page.getByRole('button', { name: 'Aplicar substituição', exact: true }).click();
  await expect(page.locator('#raw-expression')).toHaveText('oré * (endé)');
  await page.evaluate(() => {
    const raw = 'oré * (endé)';
    window.treeAuthoring = {
      raw,
      root: {
        id: 'root',
        code: raw,
        start: 0,
        end: raw.length,
        kind: 'binary',
        label: '*',
        children: [
          {
            slot: 'right',
            node: {
              id: 'root/right',
              code: 'endé',
              start: 7,
              end: 11,
              kind: 'reference',
              label: 'endé',
              children: [],
            },
          },
        ],
      },
    };
    window.treeUpdateGraph!({
      ...window.treeFixture,
      diagnostics: ['A próxima árvore ainda está sendo avaliada'],
    });
  });
  await expect(
    page.getByText('Aguardando a análise desta revisão para editar este escopo.', { exact: false }),
  ).toBeVisible();
  await page.locator('[data-runtime-node="d"] > [aria-pressed]').click();
  await expect(page.locator('#source-selection')).toHaveText('root');
});

test('an external lexical selection reveals its hidden exact source scope once and preserves later camera changes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const raw = 'oré * taba';
    const right = {
      id: 'root/right',
      code: 'taba',
      start: 6,
      end: 10,
      kind: 'reference',
      label: 'taba',
      children: [],
    };
    window.treeAuthoring = {
      raw,
      root: {
        id: 'root',
        code: raw,
        start: 0,
        end: raw.length,
        kind: 'binary',
        label: '*',
        children: [{ slot: 'right', node: right }],
      },
    };
    window.treeFixture.nodes[3].sourceOccurrences = [
      {
        sourceNodeId: right.id,
        code: right.code,
        start: right.start,
        end: right.end,
        kind: right.kind,
      },
    ];
    window.treeFixture.nodes[3].sourceNodeId = right.id;
  });
  await page.reload();
  const svg = page.getByRole('group', { name: 'Diagrama interativo da análise realizada' });
  await page.getByRole('button', { name: 'Recolher oré', exact: true }).click();
  await expect(page.locator('[data-runtime-node="d"]')).toHaveCount(0);
  await page.locator('#lexicon-reveal').click();
  await expect(page.locator('[data-runtime-node="d"]')).toHaveClass(/is-selected/);
  await expect(page.getByRole('button', { name: 'Recolher oré', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const centered = await svg.evaluate((element) => {
    const root = element as SVGSVGElement;
    const view = root.viewBox.baseVal;
    const selected = root.querySelector<SVGGElement>('[data-runtime-node="d"]')!;
    const transform = selected.transform.baseVal.getItem(0).matrix;
    return {
      x: view.x + view.width / 2,
      y: view.y + view.height / 2,
      targetX: transform.e + 121,
      targetY: transform.f + 50,
    };
  });
  expect(centered.x).toBeCloseTo(centered.targetX, 3);
  expect(centered.y).toBeCloseTo(centered.targetY, 3);
  await page.getByRole('button', { name: 'Ampliar árvore', exact: true }).click();
  const manuallyZoomed = await svg.getAttribute('viewBox');
  await page.evaluate(() =>
    window.treeUpdateGraph!({
      ...window.treeFixture,
      diagnostics: ['Reavaliação sem nova seleção'],
    }),
  );
  await expect(page.getByText('Reavaliação sem nova seleção')).toBeVisible();
  expect(await svg.getAttribute('viewBox')).toBe(manuallyZoomed);
  await expect(page.locator('#source-selection')).toHaveText('root/right');
});

test('a lexical scope selected before the tree mounts survives the measured initial overview', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.treeInitialSelection = 'root/right';
    const raw = 'oré * taba';
    const right = {
      id: 'root/right',
      code: 'taba',
      start: 6,
      end: 10,
      kind: 'reference',
      label: 'taba',
      children: [],
    };
    window.treeAuthoring = {
      raw,
      root: {
        id: 'root',
        code: raw,
        start: 0,
        end: raw.length,
        kind: 'binary',
        label: '*',
        children: [{ slot: 'right', node: right }],
      },
    };
    window.treeFixture.nodes[3].sourceOccurrences = [
      {
        sourceNodeId: right.id,
        code: right.code,
        start: right.start,
        end: right.end,
        kind: right.kind,
      },
    ];
    window.treeFixture.nodes[3].sourceNodeId = right.id;
  });
  await page.setViewportSize({ width: 760, height: 1000 });
  await page.reload();
  await expect(page.locator('[data-runtime-node="d"]')).toHaveClass(/is-selected/);
  await expect(page.locator('output[aria-label="Zoom da árvore"]')).toHaveText('100%');
  await expect(page.locator('#source-selection')).toHaveText('root/right');
});

test('actual first-line overview shows its first relationships in a narrow main editor', async ({
  page,
}) => {
  test.skip(
    !existsSync(path.join(actualParent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py')),
    'Selected local corpus unavailable',
  );
  const actual = actualTree(1);
  await page.addInitScript((value) => {
    window.treeFixture = value.runtimeTree;
    window.treeAuthoring = { raw: value.raw, root: value.tree };
  }, actual);
  await page.setViewportSize({ width: 950, height: 890 });
  await page.reload();
  await expect(page.locator('[data-runtime-node]')).toHaveCount(6);
  await expect(page.locator('.runtime-edge')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Expandir esé', exact: true })).toBeVisible();
});

test('external lexical selection keeps its exact scope when the runtime object also represents the whole line', async ({
  page,
}) => {
  test.skip(
    !existsSync(path.join(actualParent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py')),
    'Selected local corpus unavailable',
  );
  const actual = actualTree(1);
  const lexical = actual.runtimeTree.nodes[0].sourceOccurrences!.find(
    (scope) => scope.kind === 'reference' && scope.code === 'pysyro',
  )!;
  expect(lexical).toBeTruthy();
  await page.addInitScript(
    ({ value, sourceId }) => {
      window.treeFixture = value.runtimeTree;
      window.treeAuthoring = { raw: value.raw, root: value.tree };
      window.treeInitialSelection = sourceId;
    },
    { value: actual, sourceId: lexical.sourceNodeId },
  );
  await page.reload();
  await expect(page.locator('#source-selection')).toHaveText(lexical.sourceNodeId);
  await expect(page.getByRole('combobox', { name: 'Escopo editável na árvore' })).toHaveValue(
    lexical.sourceNodeId,
  );
  await page.getByRole('button', { name: 'Editar parte', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Expressão da parte na árvore' })).toHaveValue(
    'pysyro',
  );
});

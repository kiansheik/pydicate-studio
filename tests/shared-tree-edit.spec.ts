import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import type { AuthorNode, SourcePreview } from '../src/domain/authoring';
import type { SharedDefinitionCandidate } from '../src/domain/shared-definition';

// These fixtures test scope, source review and persistent request wiring. They
// never evaluate linguistic evidence or make requests to an AI provider.
const passageRaw = 'enosem * beta';
const definitionRaw = 'Verb("enosem")';
const proposedRaw = 'mo.var(2) * pytá';
const reusableDefinition: SharedDefinitionCandidate = {
  name: 'enosem_novo',
  headword: 'enosem',
  definition: 'Definição reutilizável simulada',
  availableInDefinition: false,
  treeEdit: {
    editable: true,
    name: 'enosem_novo',
    expression: '(((ero) * (sem)).var(1)).copy()',
    sourceFingerprint: 'lexicon-before',
    declarationId: 'enosem_novo:28',
    storageId: 'shared:enosem_novo',
    scope: 'shared',
    sourceId: 'lexicon',
    line: 28,
  },
};

async function reuseResponse(page: Page, candidate = reusableDefinition) {
  await page.evaluate((candidate) => {
    window.__nextControl.responses.lexicon_search = { results: [candidate], total: 1 };
  }, candidate);
}

function parsedSource(raw: string): AuthorNode {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        'import json,sys;from python.studio_authoring import expression_tree;print(json.dumps(expression_tree(sys.stdin.read())))',
      ],
      { input: raw, encoding: 'utf8' },
    ),
  ).root;
}

function leaf(code: string, id = 'root', start = 0): AuthorNode {
  return {
    id,
    kind: 'reference',
    label: code,
    code,
    start,
    end: start + code.length,
    children: [],
    evaluation: { status: 'ok', surface: `SIMULADO:${code}` },
  };
}

function binary(raw: string, left: string, right: string): AuthorNode {
  return {
    ...leaf(raw),
    kind: 'binary',
    label: '*',
    operator: '*',
    children: [
      { slot: 'left', node: leaf(left, 'root/left') },
      { slot: 'right', node: leaf(right, 'root/right', raw.lastIndexOf(right)) },
    ],
  };
}

const preview: SourcePreview = {
  kind: 'lexicon',
  name: 'enosem',
  previewId: 'shared-tree-preview',
  sourceFingerprint: 'lexicon-before',
  diff: `-enosem = ${definitionRaw}\n+enosem = ${proposedRaw}`,
  regression: {
    ok: true,
    checked: 151,
    changed: 0,
    references: 149,
    baselineIssues: 2,
    pendingReferences: 0,
  },
  reviewSummary: {
    kind: 'lexicon',
    fields: [{ label: 'Árvore compartilhada', before: definitionRaw, after: proposedRaw }],
  },
};

async function openReference(
  page: Page,
  options: {
    name?: string;
    definition?: string;
    storageId?: string;
    trees?: Record<string, AuthorNode>;
  } = {},
) {
  const name = options.name ?? 'enosem';
  const definition = options.definition ?? definitionRaw;
  const raw = `${name} * beta`;
  await page.addInitScript(
    ({ raw, trees, responses }) => {
      window.__nextInitial = { raw, trees, responses };
    },
    {
      raw,
      trees: {
        [raw]: binary(raw, name, 'beta'),
        [definition]: leaf(definition),
        [proposedRaw]: binary(proposedRaw, 'mo.var(2)', 'pytá'),
        ...options.trees,
      },
      responses: {
        lexicon_inspect: {
          name,
          definition: '',
          expression: definition,
          sourcePath: 'historic/lexicon.tu.py',
          line: 12,
          safeOccurrenceExpansion: definition,
          projectUses: {
            uses: [
              {
                sourceId: 'araujo_catecismo_1686',
                ordinal: 1,
                line: 8,
                expression: raw,
                via: [],
                direct: true,
              },
              {
                sourceId: 'outra_fonte',
                ordinal: 4,
                line: 21,
                expression: 'outro_nome * beta',
                via: ['outro_nome'],
                direct: false,
              },
            ],
            diagnostics: [],
          },
          treeEdit: {
            editable: true,
            name,
            expression: definition,
            sourceFingerprint: 'lexicon-before',
            declarationId: `${name}:12`,
            storageId: options.storageId,
            scope: 'shared',
            sourceId: 'lexicon',
            line: 12,
          },
        },
        lexicon_tree_preview: preview,
      },
    },
  );
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await expect(page.getByTestId('generated-surface')).toContainText('SIMULADO:');
  if ((await page.getByTestId('generated-surface').innerText()) === 'SIMULADO:beta')
    await page.getByRole('button', { name: 'Passagem anterior', exact: true }).click();
  await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${raw}`);
  await page
    .locator('.expression-canvas [data-canvas-key="main:root/left"] > [aria-pressed]')
    .click();
  const inspector = page.getByRole('region', { name: `Estrutura de ${name}`, exact: true });
  await expect(
    inspector.getByRole('button', { name: 'Editar árvore compartilhada', exact: true }),
  ).toBeEnabled();
  await expect.poll(() => savedRaw(page)).toBe(raw);
  return inspector;
}

async function savedRaw(page: Page) {
  return page.evaluate(() => window.__nextControl.saved['simulated:a']?.drafts['passage-a']?.raw);
}

async function editor(page: Page) {
  const inspector = await openReference(page);
  await inspector.getByRole('button', { name: 'Editar árvore compartilhada', exact: true }).click();
  const editing = page.getByRole('region', {
    name: 'Editar árvore compartilhada de enosem',
    exact: true,
  });
  await expect(
    editing.getByLabel('Expressão da árvore compartilhada', { exact: true }),
  ).toHaveValue(definitionRaw);
  await editing.getByText('Expressão da árvore compartilhada', { exact: true }).click();
  return editing;
}

test('shared-tree review compares the corpus and never replaces the referencing passage', async ({
  page,
}) => {
  const editing = await editor(page);
  await editing.getByLabel('Expressão da árvore compartilhada', { exact: true }).fill(proposedRaw);
  await editing.getByRole('button', { name: 'Revisar árvore compartilhada', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar entrada do léxico', exact: true });
  await expect(review).toBeVisible();
  await expect(review).toContainText('151 passagens avaliadas');
  await expect(review).toContainText('2 diferenças ou falhas já existiam');
  expect(await savedRaw(page)).toBe(passageRaw);
  const request = await page.evaluate(
    () =>
      window.__nextControl.requests.find((item) => item.method === 'lexicon_tree_preview')!.params,
  );
  expect(request).toMatchObject({
    name: 'enosem',
    raw: proposedRaw,
    expectedExpression: definitionRaw,
    sourceFingerprint: 'lexicon-before',
    passageId: 'passage-a',
  });
  await review.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
  await expect(review).not.toBeVisible();
  expect(await savedRaw(page)).toBe(passageRaw);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests
        .filter((item) =>
          ['source_apply', 'reference_approve', 'node_definition', 'analysis_submit'].includes(
            item.method,
          ),
        )
        .map((item) => item.method),
    ),
  ).toEqual(['source_apply']);
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.find((item) => item.method === 'source_apply')!.params
          .reviewedAnnotationChanges,
    ),
  ).toBeUndefined();
});

test('morphological analysis changes require explicit acknowledgement tied to the current source preview', async ({
  page,
}) => {
  const editing = await editor(page);
  await editing
    .getByLabel('Expressão da árvore compartilhada', { exact: true })
    .fill('enosem_novo.copy()');
  const annotatedPreview: SourcePreview = {
    ...preview,
    previewId: 'annotation-preview-one',
    annotationChanges: [
      {
        sourceId: 'araujo_catecismo_1686',
        ordinal: 58,
        before: 'enosem[ROOT]',
        after: 'eno[CAUSATIVE_PREFIX:ERO]sem[ROOT]',
      },
    ],
  };
  await page.evaluate((value) => {
    window.__nextControl.responses.lexicon_tree_preview = value;
  }, annotatedPreview);
  await editing.getByRole('button', { name: 'Revisar árvore compartilhada', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar entrada do léxico', exact: true });
  const changes = review.getByRole('region', {
    name: 'Alterações na análise morfológica',
    exact: true,
  });
  await expect(changes).toContainText('Araújo · passagem 58');
  await expect(changes.locator('code').nth(0)).toHaveText('enosem[ROOT]');
  await expect(changes.locator('code').nth(1)).toHaveText('eno[CAUSATIVE_PREFIX:ERO]sem[ROOT]');
  const acknowledgement = review.getByRole('checkbox', {
    name: 'Revisei e aceito as alterações de análise morfológica mostradas acima.',
    exact: true,
  });
  const apply = review.getByRole('button', { name: 'Aplicar edição revisada', exact: true });
  await expect(acknowledgement).not.toBeChecked();
  await expect(apply).toBeDisabled();
  await acknowledgement.check();
  await expect(apply).toBeEnabled();
  await review.getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
  await page.evaluate((value) => {
    window.__nextControl.responses.lexicon_tree_preview = {
      ...value,
      previewId: 'annotation-preview-two',
    };
  }, annotatedPreview);
  await editing.getByRole('button', { name: 'Revisar árvore compartilhada', exact: true }).click();
  await expect(acknowledgement).not.toBeChecked();
  await expect(apply).toBeDisabled();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) => item.method === 'source_apply'),
    ),
  ).toHaveLength(0);
  await acknowledgement.check();
  await apply.click();
  await expect(review).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests
        .filter((item) => item.method === 'source_apply')
        .map((item) => item.params),
    ),
  ).toEqual([
    {
      previewId: 'annotation-preview-two',
      sourceFingerprint: 'lexicon-before',
      reviewedAnnotationChanges: true,
    },
  ]);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) => item.method === 'reference_approve'),
    ),
  ).toHaveLength(0);
  expect(await savedRaw(page)).toBe(passageRaw);
});

test('a correction inside a passage targets the selected subtree and preserves its parent', async ({
  page,
}) => {
  await openReference(page);
  await page
    .getByRole('tabpanel', { name: 'Árvore', exact: true })
    .getByRole('button', { name: 'Corrigir gramática / árvore', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Diagnóstico para corrigir a gramática' });
  await expect(dialog.getByLabel('Forma pretendida', { exact: true })).toHaveValue(
    'SIMULADO:enosem',
  );
  await dialog.getByLabel('Forma pretendida', { exact: true }).fill('forma pretendida da peça');
  await dialog.getByLabel('Explicação linguística').fill('Corrija apenas a regra desta parte.');
  await dialog.getByRole('button', { name: 'Enviar ao Codex', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const sent = await page.evaluate(
    () =>
      window.__nextControl.requests.filter((item) => item.method === 'analysis_submit').at(-1)!
        .params,
  );
  expect(sent).toMatchObject({
    task: 'grammar-repair',
    scope: 'constituent',
    grammarRepair: {
      raw: passageRaw,
      selectedNode: { id: 'root/left', code: 'enosem', start: 0, end: 6 },
      intendedSurface: 'forma pretendida da peça',
    },
  });
  expect((sent.grammarRepair as Record<string, unknown>).sharedDefinition).toBeUndefined();
  expect(await savedRaw(page)).toBe(passageRaw);
});

test('a proposed shared definition can request grammar repair without replacing its saved variable', async ({
  page,
}) => {
  const editing = await editor(page);
  await editing.getByLabel('Expressão da árvore compartilhada', { exact: true }).fill(proposedRaw);
  const correct = editing.getByRole('button', {
    name: 'Corrigir gramática desta árvore',
    exact: true,
  });
  await expect(correct).toBeEnabled();
  await correct.click();
  const dialog = page.getByRole('dialog', { name: 'Diagnóstico para corrigir a gramática' });
  await expect(dialog.getByLabel('Forma pretendida', { exact: true })).toHaveValue(
    `SIMULADO:${proposedRaw}`,
  );
  await dialog.getByLabel('Forma pretendida', { exact: true }).fill('mombytá');
  await dialog
    .getByLabel('Explicação linguística')
    .fill('A variante nasal deve agir no causativo.');
  await dialog.getByRole('button', { name: 'Enviar ao Codex', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const sent = await page.evaluate(
    () =>
      window.__nextControl.requests.filter((item) => item.method === 'analysis_submit').at(-1)!
        .params,
  );
  expect(sent).toMatchObject({
    task: 'grammar-repair',
    scope: 'constituent',
    grammarRepair: {
      raw: proposedRaw,
      sharedDefinition: {
        name: 'enosem',
        expectedExpression: definitionRaw,
        sourceFingerprint: 'lexicon-before',
      },
      intendedSurface: 'mombytá',
    },
  });
  expect(await savedRaw(page)).toBe(passageRaw);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) =>
        ['source_apply', 'reference_approve', 'lexicon_tree_preview'].includes(item.method),
      ),
    ),
  ).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${passageRaw}`);
  await page
    .locator('.expression-canvas [data-canvas-key="main:root/left"] > [aria-pressed]')
    .click();
  await page
    .getByRole('region', { name: 'Estrutura de enosem', exact: true })
    .getByRole('button', { name: 'Editar árvore compartilhada', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Editar árvore compartilhada de enosem', exact: true })
      .getByLabel('Expressão da árvore compartilhada', { exact: true }),
  ).toHaveValue(proposedRaw);
});

test('a delayed shared-tree preview cannot review a newer definition draft', async ({ page }) => {
  const editing = await editor(page);
  const code = editing.getByLabel('Expressão da árvore compartilhada', { exact: true });
  await code.fill(proposedRaw);
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'lexicon_tree_preview' }));
  await editing.getByRole('button', { name: 'Revisar árvore compartilhada', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((item) => item.method === 'lexicon_tree_preview'),
      ),
    )
    .toBe(true);
  await code.fill('outra_definicao');
  await page.evaluate(() => window.__nextControl.release('lexicon_tree_preview'));
  await expect(
    editing.getByRole('button', { name: 'Revisar árvore compartilhada', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('dialog', { name: 'Revisar entrada do léxico', exact: true }),
  ).not.toBeVisible();
  await expect(code).toHaveValue('outra_definicao');
  expect(await savedRaw(page)).toBe(passageRaw);
});

test('a correction inside a proposed definition retains both its selected part and shared binding', async ({
  page,
}) => {
  const editing = await editor(page);
  await editing.getByLabel('Expressão da árvore compartilhada', { exact: true }).fill(proposedRaw);
  await expect(
    editing.getByRole('button', { name: 'Corrigir gramática desta árvore', exact: true }),
  ).toBeEnabled();
  await editing.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await editing
    .locator(':scope > .expression-canvas [data-canvas-key="main:root/right"] > [aria-pressed]')
    .click();
  await editing.getByRole('button', { name: 'Corrigir gramática / árvore', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Diagnóstico para corrigir a gramática' });
  await expect(dialog.getByLabel('Forma pretendida', { exact: true })).toHaveValue('SIMULADO:pytá');
  await dialog.getByLabel('Forma pretendida', { exact: true }).fill('forma da parte');
  await dialog.getByRole('button', { name: 'Enviar ao Codex', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const sent = await page.evaluate(
    () =>
      window.__nextControl.requests.filter((item) => item.method === 'analysis_submit').at(-1)!
        .params,
  );
  expect(sent).toMatchObject({
    task: 'grammar-repair',
    scope: 'constituent',
    grammarRepair: {
      raw: proposedRaw,
      selectedNode: {
        id: 'root/right',
        code: 'pytá',
        start: proposedRaw.lastIndexOf('pytá'),
        end: proposedRaw.length,
      },
      sharedDefinition: {
        name: 'enosem',
        expectedExpression: definitionRaw,
        sourceFingerprint: 'lexicon-before',
      },
      intendedSurface: 'forma da parte',
    },
  });
  expect(await savedRaw(page)).toBe(passageRaw);
});

test('Delete and undo in a shared tree keep the parent passage and its own undo history intact', async ({
  page,
}) => {
  const inspector = await openReference(page);
  const outer = page
    .getByRole('tabpanel', { name: 'Árvore', exact: true })
    .locator('.expression-canvas');
  await outer.locator('[data-canvas-key="main:root/left"] > [aria-pressed]').focus();
  await page.keyboard.press('Control+d');
  // Give the parent a meaningful prior edit: accidental bubbling of Ctrl+Z
  // would remove this loose piece even if the passage expression stayed equal.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__nextControl.saved['simulated:a']?.drafts['passage-a']?.canvas?.fragments.length,
      ),
    )
    .toBe(1);
  const before = await page.evaluate(() => {
    const draft = window.__nextControl.saved['simulated:a'].drafts['passage-a'];
    return { raw: draft.raw, canvas: draft.canvas };
  });
  await inspector.getByRole('button', { name: 'Editar árvore compartilhada', exact: true }).click();
  const editing = page.getByRole('region', {
    name: 'Editar árvore compartilhada de enosem',
    exact: true,
  });
  await editing.getByText('Expressão da árvore compartilhada', { exact: true }).click();
  const code = editing.getByLabel('Expressão da árvore compartilhada', { exact: true });
  await code.fill(proposedRaw);
  const inner = editing.locator(':scope > .expression-canvas');
  await expect(inner.locator('[data-canvas-key="main:root/right"]')).toBeAttached();
  await inner.getByRole('button', { name: 'Ajustar', exact: true }).click();
  const selected = inner.locator('[data-canvas-key="main:root/right"] > [aria-pressed]');
  await selected.click();
  await selected.focus();
  await page.keyboard.press('Delete');
  await expect(code).not.toHaveValue(proposedRaw);
  await expect(code).toBeVisible();
  await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${passageRaw}`);
  expect(
    await page.evaluate(() => {
      const draft = window.__nextControl.saved['simulated:a'].drafts['passage-a'];
      return { raw: draft.raw, canvas: draft.canvas };
    }),
  ).toEqual(before);
  await inner
    .getByRole('group', { name: 'Diagrama interativo das operações Pydicate', exact: true })
    .focus();
  await page.keyboard.press('Control+z');
  await expect(code).toHaveValue(proposedRaw);
  expect(
    await page.evaluate(() => {
      const draft = window.__nextControl.saved['simulated:a'].drafts['passage-a'];
      return { raw: draft.raw, canvas: draft.canvas };
    }),
  ).toEqual(before);
  await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${passageRaw}`);
});

test('the shared definition canvas fits an 800 by 600 browser without horizontal page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const editing = await editor(page);
  await editing.getByLabel('Expressão da árvore compartilhada', { exact: true }).fill(proposedRaw);
  const canvas = editing.locator(':scope > .expression-canvas');
  await expect(canvas.locator('[data-canvas-key="main:root/right"]')).toBeAttached();
  const viewport = canvas.locator(':scope > .canvas-viewport');
  await canvas.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await viewport.scrollIntoViewIfNeeded();
  await expect(viewport).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(await editing.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  const box = await viewport.boundingBox();
  expect(box!.width).toBeGreaterThan(150);
  expect(box!.height).toBeGreaterThanOrEqual(200);
  // The editor has scrolled to its canvas; tab navigation must still be usable
  // without scrolling back to the declaration heading.
  const tabs = page.getByRole('tablist', { name: 'Árvores abertas', exact: true });
  const root = canvas.locator('[data-canvas-key="main:root"] > [aria-pressed]');
  await root.focus();
  await root.press('Enter');
  // A focused canvas followed by scrolling can put its raised piece-search
  // input directly underneath the sticky strip. Check the actual tab buttons,
  // not the empty right half of the tablist, where the overlap is invisible.
  await canvas
    .locator('.canvas-piece-search')
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect(tabs).toBeInViewport({ ratio: 1 });
  for (const name of ['Passagem', 'enosem']) {
    const tab = tabs.getByRole('tab', { name, exact: true });
    expect(
      await tab.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
        );
      }),
      `The ${name} tab must remain clickable over the scrolled canvas toolbar`,
    ).toBe(true);
  }
  await page.screenshot({ path: 'test-results/shared-tree-editor.png' });
  await root.focus();
  await root.press('Shift+F10');
  await canvas.getByRole('menuitem', { name: 'Adicionar operação', exact: true }).click();
  const operation = canvas.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  await operation.getByRole('combobox', { name: 'Operação na peça', exact: true }).click();
  await page.keyboard.press('Escape');
  if (await operation.isVisible())
    await operation.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(operation).not.toBeVisible();
  await tabs.getByRole('tab', { name: 'Passagem', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Passagem', exact: true })).toBeVisible();
  await tabs.getByRole('tab', { name: 'enosem', exact: true }).click();
  await expect(
    editing.getByLabel('Expressão da árvore compartilhada', { exact: true }),
  ).toHaveValue(proposedRaw);
});

test('adding a loose piece invalidates a pending shared-definition review even when its expression is unchanged', async ({
  page,
}) => {
  const editing = await editor(page);
  const code = editing.getByLabel('Expressão da árvore compartilhada', { exact: true });
  await expect(editing.getByLabel('Resultado da árvore compartilhada')).toContainText(
    definitionRaw,
  );
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'lexicon_tree_preview' }));
  await editing.getByRole('button', { name: 'Revisar árvore compartilhada', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((item) => item.method === 'lexicon_tree_preview'),
      ),
    )
    .toBe(true);
  const selected = editing.locator('[data-canvas-key="main:root"] > [aria-pressed]');
  await selected.focus();
  await selected.press('Enter');
  await selected.press('Control+d');
  await expect(
    editing.getByText('Conecte ou retire as peças soltas antes de revisar esta definição.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(code).toHaveValue(definitionRaw);
  await page.evaluate(() => window.__nextControl.release('lexicon_tree_preview'));
  await expect(
    editing.getByRole('button', { name: 'Revisar árvore compartilhada', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('dialog', { name: 'Revisar entrada do léxico', exact: true }),
  ).toHaveCount(0);
  expect(await savedRaw(page)).toBe(passageRaw);
});

test('shared-definition morphology uses the declaration namespace instead of the passage evaluator', async ({
  page,
}) => {
  const editing = await editor(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__nextControl.requests.filter(
            (item) =>
              item.method === 'lexicon_tree_evaluate' && item.params.includeMorphology === true,
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const requests = await page.evaluate(() =>
    window.__nextControl.requests.filter(
      (item) => item.params.raw === 'Verb("enosem")' && item.params.includeMorphology === true,
    ),
  );
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.method).toBe('lexicon_tree_evaluate');
    expect(request.params).toMatchObject({
      name: 'enosem',
      expectedExpression: definitionRaw,
      sourceFingerprint: 'lexicon-before',
      declarationId: 'enosem:12',
      declarationSourceId: 'lexicon',
      declarationLine: 12,
      passageId: 'passage-a',
    });
  }
  await expect(editing.getByLabel('Resultado da árvore compartilhada')).toContainText(
    definitionRaw,
  );
  expect(await savedRaw(page)).toBe(passageRaw);
});

test('definition tabs retain the published variant, their undo history and camera without changing the passage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const name = 'enosem_26169d1f';
  const raw = '(((ero) * (sem)).var(1)).copy()';
  const edited = raw.replace('.var(1)', '.var(2)');
  const parentRaw = `${name} * beta`;
  await openReference(page, {
    name,
    definition: raw,
    storageId: 'shared:enosem_26169d1f',
    trees: { [raw]: parsedSource(raw), [edited]: parsedSource(edited) },
  });
  const tabs = page.getByRole('tablist', { name: 'Árvores abertas', exact: true });
  const passage = page.getByRole('tabpanel', { name: 'Passagem', exact: true });
  await passage.getByRole('button', { name: 'Ampliar árvore', exact: true }).click();
  const parentZoom = await passage.getByLabel('Zoom da árvore', { exact: true }).innerText();
  await passage.getByRole('button', { name: 'Abrir peça em aba', exact: true }).click();
  await expect(tabs.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(passage).toBeHidden();
  const editing = page.getByRole('region', {
    name: `Editar árvore compartilhada de ${name}`,
    exact: true,
  });
  const variant = editing.getByRole('button', { name: 'Editar argumento 1 de .var', exact: true });
  await expect(variant).toHaveText('1');
  const graph = editing.getByRole('group', {
    name: 'Diagrama interativo das operações Pydicate',
    exact: true,
  });
  await expect(graph.locator('[data-canvas-key="main:root"]')).toContainText('.copy');
  await expect(graph.locator('[data-canvas-key="main:root/receiver"]')).toContainText('.var');
  await expect(page.getByRole('button', { name: 'Salvar rascunho', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Salvar como referência', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(`Editando ${name} · rascunho guardado nesta aba`, { exact: true }),
  ).toBeVisible();
  await variant.click();
  const input = editing.getByRole('textbox', { name: 'Valor do argumento', exact: true });
  await input.fill('2');
  await input.press('Enter');
  await expect(variant).toHaveText('2');
  await expect(
    editing.getByLabel('Expressão da árvore compartilhada', { exact: true }),
  ).toHaveValue(edited);
  await editing.getByRole('button', { name: 'Ampliar árvore', exact: true }).click();
  const sharedZoom = await editing.getByLabel('Zoom da árvore', { exact: true }).innerText();
  await tabs.getByRole('tab', { name: 'Passagem', exact: true }).click();
  await expect(editing).toBeHidden();
  await expect(passage.getByLabel('Zoom da árvore', { exact: true })).toHaveText(parentZoom);
  await expect(passage.locator('[data-canvas-key="main:root/left"]')).toContainText(name);
  expect(await savedRaw(page)).toBe(parentRaw);
  await tabs.getByRole('tab', { name, exact: true }).click();
  await expect(editing.getByLabel('Zoom da árvore', { exact: true })).toHaveText(sharedZoom);
  await expect(variant).toHaveText('2');
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0002');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
  await expect(tabs.getByRole('tab', { name: 'Passagem', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tabs.getByRole('tab', { name, exact: true })).toHaveCount(1);
  await expect(passage.locator('[data-canvas-key="main:root"]')).toContainText('beta');
  await expect(editing).toBeHidden();
  await tabs.getByRole('tab', { name, exact: true }).click();
  await expect(variant).toHaveText('2');
  await expect(editing.getByLabel('Zoom da árvore', { exact: true })).toHaveText(sharedZoom);
  await page.getByRole('button', { name: 'Passagem anterior', exact: true }).click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0001');
  await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${parentRaw}`);
  await tabs.getByRole('tab', { name, exact: true }).click();
  await expect(editing.getByLabel('Zoom da árvore', { exact: true })).toHaveText(sharedZoom);
  await expect(variant).toHaveText('2');
  await editing.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(variant).toHaveText('1');
  await editing.getByRole('button', { name: 'Refazer edição na árvore', exact: true }).click();
  await expect(variant).toHaveText('2');
  expect(await savedRaw(page)).toBe(parentRaw);
  await tabs.getByRole('button', { name: `Fechar aba ${name}`, exact: true }).click();
  await expect(tabs.getByRole('tab', { name, exact: true })).toHaveCount(0);
  await expect(tabs.getByRole('tab', { name: 'Passagem', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // An unrelated insertion earlier in the file changes declaration coordinates,
  // but the stable binding identity must still recover this definition's draft.
  await page.evaluate(() => {
    const response = window.__nextControl.responses.lexicon_inspect as {
      treeEdit: { declarationId: string; line: number; sourceFingerprint: string };
    };
    response.treeEdit.declarationId = 'enosem_26169d1f:13';
    response.treeEdit.line = 13;
    response.treeEdit.sourceFingerprint = 'lexicon-after-earlier-line-insertion';
  });
  await passage.locator('[data-canvas-key="main:root/left"] > [aria-pressed]').click();
  await passage.getByRole('button', { name: 'Abrir peça em aba', exact: true }).click();
  await expect(variant).toHaveText('2');
  await expect(
    editing.getByLabel('Expressão da árvore compartilhada', { exact: true }),
  ).toHaveValue(edited);
  expect(await savedRaw(page)).toBe(parentRaw);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) =>
        ['source_apply', 'reference_approve', 'analysis_submit'].includes(item.method),
      ),
    ),
  ).toHaveLength(0);
});

test('a retained definition tab keeps grammar correction bound to its original passage after navigation', async ({
  page,
}) => {
  const editing = await editor(page);
  await editing.getByLabel('Expressão da árvore compartilhada', { exact: true }).fill(proposedRaw);
  await expect(editing.getByLabel('Resultado da árvore compartilhada')).toContainText(proposedRaw);
  const openingRevision = await page.evaluate(
    () => window.__nextControl.saved['simulated:a'].drafts['passage-a'].revisionId,
  );
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await expect(page.locator('.breadcrumbs strong')).toHaveText('Passagem 0002');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
  await page
    .getByRole('tablist', { name: 'Árvores abertas', exact: true })
    .getByRole('tab', { name: 'enosem', exact: true })
    .click();
  await expect(
    editing.getByLabel('Expressão da árvore compartilhada', { exact: true }),
  ).toHaveValue(proposedRaw);
  await editing
    .getByRole('button', { name: 'Corrigir gramática desta árvore', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Diagnóstico para corrigir a gramática' });
  await dialog.getByLabel('Forma pretendida', { exact: true }).fill('mombytá');
  await dialog.getByRole('button', { name: 'Enviar ao Codex', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const submitted = await page.evaluate(
    () =>
      window.__nextControl.requests.filter((item) => item.method === 'analysis_submit').at(-1)!
        .params,
  );
  expect(submitted).toMatchObject({
    passageId: 'passage-a',
    revisionId: openingRevision,
    grammarRepair: { raw: proposedRaw, sharedDefinition: { name: 'enosem' } },
  });
  const evaluations = await page.evaluate(() =>
    window.__nextControl.requests.filter(
      (item) => item.method === 'lexicon_tree_evaluate' && item.params.raw === 'mo.var(2) * pytá',
    ),
  );
  expect(evaluations.length).toBeGreaterThan(0);
  for (const evaluation of evaluations) expect(evaluation.params.passageId).toBe('passage-a');
  expect(await savedRaw(page)).toBe(passageRaw);
  expect(
    await page.evaluate(() => window.__nextControl.saved['simulated:a'].drafts['passage-b'].raw),
  ).toBe('beta');
});

test('reusing a later shared definition proposes an alias or an independent copy with undo before review', async ({
  page,
}) => {
  const editing = await editor(page);
  await reuseResponse(page);
  const reuse = editing.locator('.shared-definition-reuse');
  await reuse.getByText('Substituir por peça existente', { exact: true }).click();
  await expect(
    reuse.getByRole('list', { name: 'Definições para reutilizar', exact: true }),
  ).toContainText('enosem_novo');
  await expect(reuse).toContainText(
    'A revisão verificará esta peça e suas dependências compartilhadas.',
  );
  const search = await page.evaluate(
    () =>
      window.__nextControl.requests
        .filter(
          (item) =>
            item.method === 'lexicon_search' && item.params.includeLaterDefinitions === true,
        )
        .at(-1)!.params,
  );
  expect(search).toMatchObject({
    includeLaterDefinitions: true,
    passageId: 'passage-a',
    definitionContext: {
      name: 'enosem',
      expectedExpression: definitionRaw,
      sourceFingerprint: 'lexicon-before',
      declarationId: 'enosem:12',
      declarationSourceId: 'lexicon',
      declarationLine: 12,
    },
  });
  const code = editing.getByLabel('Expressão da árvore compartilhada', { exact: true });
  await reuse.getByRole('button', { name: 'Usar como referência', exact: true }).click();
  await expect(code).toHaveValue('enosem_novo.copy()');
  await reuse.getByText('Substituir por peça existente', { exact: true }).click();
  await reuse.getByRole('button', { name: 'Copiar árvore', exact: true }).click();
  await expect(code).toHaveValue('(((ero) * (sem)).var(1)).copy()');
  await editing.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(code).toHaveValue('enosem_novo.copy()');
  await editing.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(code).toHaveValue(definitionRaw);
  expect(await savedRaw(page)).toBe(passageRaw);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((item) =>
        ['source_apply', 'lexicon_tree_preview', 'reference_approve', 'analysis_submit'].includes(
          item.method,
        ),
      ),
    ),
  ).toHaveLength(0);
});

for (const change of ['query', 'close', 'tab'] as const) {
  test(`a delayed shared-definition search is discarded after ${change} changes`, async ({
    page,
  }) => {
    const editing = await editor(page);
    await expect(editing.getByLabel('Resultado da árvore compartilhada')).toContainText(
      definitionRaw,
    );
    await reuseResponse(page);
    const reuse = editing.locator('.shared-definition-reuse');
    const summary = reuse.getByText('Substituir por peça existente', { exact: true });
    const tabs = page.getByRole('tablist', { name: 'Árvores abertas', exact: true });
    await page.evaluate(() => window.__nextControl.holds.push({ method: 'lexicon_search' }));
    await summary.click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__nextControl.pending.filter((item) => item.method === 'lexicon_search').length,
        ),
      )
      .toBe(1);
    if (change === 'query') {
      await page.evaluate(() => window.__nextControl.holds.push({ method: 'lexicon_search' }));
      await reuse
        .getByLabel('Buscar definição pelo nome ou significado', { exact: true })
        .fill('outra');
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__nextControl.pending.filter((item) => item.method === 'lexicon_search')
                .length,
          ),
        )
        .toBe(2);
    } else if (change === 'close') await summary.click();
    else await tabs.getByRole('tab', { name: 'Passagem', exact: true }).click();
    await page.evaluate(() => window.__nextControl.release('lexicon_search'));
    if (change !== 'query') {
      await page.evaluate(() => window.__nextControl.holds.push({ method: 'lexicon_search' }));
      if (change === 'close') await summary.click();
      else await tabs.getByRole('tab', { name: 'enosem', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__nextControl.pending.filter((item) => item.method === 'lexicon_search')
                .length,
          ),
        )
        .toBe(1);
    }
    await expect(reuse.getByText('Buscando definições…', { exact: true })).toBeVisible();
    await expect(
      reuse.getByRole('list', { name: 'Definições para reutilizar', exact: true }),
    ).toHaveCount(0);
    await reuseResponse(page, { ...reusableDefinition, name: 'outra_definicao' });
    await page.evaluate(() => window.__nextControl.release('lexicon_search'));
    await expect(
      reuse.getByRole('list', { name: 'Definições para reutilizar', exact: true }),
    ).toContainText('outra_definicao');
    await expect(
      reuse.getByRole('list', { name: 'Definições para reutilizar', exact: true }),
    ).not.toContainText('enosem_novo');
    await expect(
      editing.getByLabel('Expressão da árvore compartilhada', { exact: true }),
    ).toHaveValue(definitionRaw);
    expect(await savedRaw(page)).toBe(passageRaw);
  });
}

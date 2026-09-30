import { expect, test, type Page } from '@playwright/test';
import type { AuthorNode } from '../src/domain/authoring';

const source = 'araujo_catecismo_1686';
const base = '/tests/next-hook-harness.html?workspace&analysis';

function route(values: Record<string, string>, suffix = '') {
  return `${base}&${new URLSearchParams({ source, ...values })}${suffix}`;
}

async function expectRoute(page: Page, values: Record<string, string>) {
  await expect
    .poll(() => {
      const search = new URL(page.url()).searchParams;
      return Object.fromEntries(Object.keys(values).map((key) => [key, search.get(key)]));
    })
    .toEqual(values);
}

async function ready(page: Page, raw?: string) {
  await expect(page.locator('.add-next-passage')).toBeEnabled();
  if (raw) await expect(page.getByTestId('generated-surface')).toHaveText(`SIMULADO:${raw}`);
}

test('a passage link overrides latest startup and reload retains projection and support tab', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('simulated-selection:simulated:a', 'passage-b'),
  );
  await page.goto(
    route(
      {
        passage: 'passage-a',
        view: 'analysis',
        tab: 'translation',
        support: 'ai',
        unrelated: 'kept',
      },
      '#kept-anchor',
    ),
  );
  await ready(page, 'alpha');
  await expect(page.getByRole('tab', { name: 'Tradução', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: /^IA/ })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await ready(page, 'alpha');
  await expectRoute(page, {
    passage: 'passage-a',
    view: 'analysis',
    tab: 'translation',
    support: 'ai',
    unrelated: 'kept',
  });
  await expect(page.getByRole('tab', { name: 'Tradução', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: /^IA/ })).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).searchParams.has('workspace')).toBe(true);
  expect(new URL(page.url()).searchParams.has('analysis')).toBe(true);
  expect(new URL(page.url()).hash).toBe('#kept-anchor');
});

test('passage Back and Forward stay in the same document and retain an unsaved note', async ({
  page,
}) => {
  await page.goto(
    route({ passage: 'passage-a', view: 'analysis', tab: 'tree', support: 'source' }),
  );
  await ready(page, 'alpha');
  await expect
    .poll(() => page.evaluate(() => !!window.__nextControl.saved['simulated:a']))
    .toBe(true);
  await page.evaluate(() => {
    document.documentElement.dataset.navigationDocument = 'same-mounted-app';
    window.__nextControl.holds.push({ method: 'draft_save' });
  });
  const note = 'Nota privada ainda em edição: árvore preservada.';
  await page.getByRole('textbox', { name: 'Nota de leitura', exact: true }).fill(note);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((entry) => entry.method === 'draft_save'),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await ready(page, 'beta');
  await expectRoute(page, { passage: 'passage-b' });
  await page.goBack();
  await ready(page, 'alpha');
  await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
    note,
  );
  await expectRoute(page, { passage: 'passage-a' });
  expect(await page.evaluate(() => document.documentElement.dataset.navigationDocument)).toBe(
    'same-mounted-app',
  );
  expect(decodeURIComponent(page.url())).not.toContain(note);
  await page.evaluate(() => window.__nextControl.release('draft_save'));
  await page.goForward();
  await ready(page, 'beta');
  await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue('');
  await page.goBack();
  await ready(page, 'alpha');
  await expect(page.getByRole('textbox', { name: 'Nota de leitura', exact: true })).toHaveValue(
    note,
  );
  expect(await page.evaluate(() => document.documentElement.dataset.navigationDocument)).toBe(
    'same-mounted-app',
  );
});

test('projection and lexicon navigation create reversible history entries and survive reload', async ({
  page,
}) => {
  await page.goto(route({ passage: 'passage-a', view: 'analysis', tab: 'tree' }));
  await ready(page, 'alpha');
  await page.getByRole('tab', { name: 'Tradução', exact: true }).click();
  await expectRoute(page, { view: 'analysis', tab: 'translation' });
  await page.getByRole('button', { name: 'Léxico', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Léxico desta passagem', exact: true }),
  ).toBeVisible();
  await expectRoute(page, { passage: 'passage-a', view: 'lexicon' });
  await page.reload();
  await ready(page, 'alpha');
  await expect(
    page.getByRole('heading', { name: 'Léxico desta passagem', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Tradução', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expectRoute(page, { view: 'analysis', tab: 'translation' });
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Árvore', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expectRoute(page, { view: 'analysis', tab: 'tree' });
  await page.goForward();
  await expect(page.getByRole('tab', { name: 'Tradução', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('passage search and filters restore with the lexicon catalogue without per-keystroke history', async ({
  page,
}) => {
  await page.goto(
    route({
      passage: 'passage-a',
      view: 'lexicon',
      tab: 'tree',
      listQuery: '1',
      filter: 'open',
      catalog: 'open',
    }),
  );
  await ready(page, 'alpha');
  const search = page.getByLabel('Buscar passagem', { exact: true });
  const catalog = page.locator('.lexicon-workspace > details');
  const open = page.getByRole('button', { name: 'Em trabalho', exact: true });
  await expect(search).toHaveValue('1');
  await expect(open).toHaveClass('active');
  await expect(catalog).toHaveAttribute('open', '');
  await expect(
    page.getByLabel('Passagens por seção').getByRole('button', { name: /0002/ }),
  ).toHaveCount(0);
  const historyLength = await page.evaluate(() => history.length);
  await search.fill('12');
  await expectRoute(page, { listQuery: '12' });
  await search.fill('1');
  await expectRoute(page, { listQuery: '1' });
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.getByRole('button', { name: /^Todas / }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has('filter')).toBe(false);
  await page.goBack();
  await expect(open).toHaveClass('active');
  await expectRoute(page, { listQuery: '1', filter: 'open', catalog: 'open' });
  await page.reload();
  await ready(page, 'alpha');
  await expect(search).toHaveValue('1');
  await expect(open).toHaveClass('active');
  await expect(catalog).toHaveAttribute('open', '');
  await catalog.locator(':scope > summary').click();
  await expect.poll(() => new URL(page.url()).searchParams.has('catalog')).toBe(false);
  await page.goBack();
  await expect(catalog).toHaveAttribute('open', '');
});

test('valid default aliases normalize without freezing subsequent navigation', async ({ page }) => {
  await page.goto(
    route({
      passage: 'passage-a',
      view: 'analysis',
      tab: 'tree',
      filter: 'all',
      node: 'object',
      dictionary: '001',
      dataset: 'fixture-dataset',
    }),
  );
  await ready(page, 'alpha');
  await expectRoute(page, { dictionary: '1' });
  await expect.poll(() => new URL(page.url()).searchParams.has('filter')).toBe(false);
  await expect.poll(() => new URL(page.url()).searchParams.has('node')).toBe(false);
  await page.getByRole('tab', { name: 'Tradução', exact: true }).click();
  await expectRoute(page, { view: 'analysis', tab: 'translation' });
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Árvore', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('an imported definition opens at its exact URL and restores through Back and reload', async ({
  page,
}) => {
  const raw = 'enosem * beta';
  const definition = 'Verb("enosem")';
  const leaf = (code: string, id = 'root', start = 0): AuthorNode => ({
    id,
    kind: 'reference',
    label: code,
    code,
    start,
    end: start + code.length,
    children: [],
  });
  await page.addInitScript(
    ({ raw, trees, responses }) => {
      window.__nextInitial = { raw, trees, responses };
    },
    {
      raw,
      trees: {
        [raw]: {
          ...leaf(raw),
          kind: 'binary',
          label: '*',
          operator: '*',
          children: [
            { slot: 'left', node: leaf('enosem', 'root/left') },
            { slot: 'right', node: leaf('beta', 'root/right', 9) },
          ],
        } as AuthorNode,
        [definition]: leaf(definition),
      },
      responses: {
        lexicon_inspect: {
          name: 'enosem',
          definition: '',
          expression: definition,
          sourcePath: 'historic/lexicon.tu.py',
          line: 12,
          safeOccurrenceExpansion: definition,
          projectUses: { uses: [], diagnostics: [] },
          treeEdit: {
            editable: true,
            name: 'enosem',
            expression: definition,
            sourceFingerprint: 'lexicon-before',
            declarationId: 'enosem:12',
            scope: 'shared',
            sourceId: 'lexicon',
            line: 12,
          },
        },
      },
    },
  );
  await page.goto(route({ passage: 'passage-a', view: 'analysis', tab: 'tree' }));
  await ready(page, raw);
  await page
    .locator('.expression-canvas [data-canvas-key="main:root/left"] > [aria-pressed]')
    .click();
  await page
    .getByRole('region', { name: 'Estrutura de enosem', exact: true })
    .getByRole('button', { name: 'Editar árvore compartilhada', exact: true })
    .click();
  const tabs = page.getByRole('tablist', { name: 'Árvores abertas', exact: true });
  const shared = tabs.getByRole('tab', { name: 'enosem', exact: true });
  const target = {
    passage: 'passage-a',
    tree: 'enosem',
    declaration: 'enosem:12',
    declarationSource: 'lexicon',
    declarationLine: '12',
  };
  await expect(shared).toHaveAttribute('aria-selected', 'true');
  await expectRoute(page, target);
  await tabs.getByRole('tab', { name: 'Passagem', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has('tree')).toBe(false);
  await page.goBack();
  await expect(shared).toHaveAttribute('aria-selected', 'true');
  await expectRoute(page, target);
  await page.reload();
  await ready(page, raw);
  await expect(shared).toHaveAttribute('aria-selected', 'true');
  await expect(
    page
      .getByRole('region', { name: 'Editar árvore compartilhada de enosem', exact: true })
      .getByLabel('Expressão da árvore compartilhada', { exact: true }),
  ).toHaveValue(definition);
  await expectRoute(page, target);
  const restores = await page.evaluate(() =>
    window.__nextControl.requests.filter(
      (item) => item.method === 'lexicon_inspect' && item.params.declarationTarget,
    ),
  );
  expect(restores.map((item) => item.params.declarationTarget)).toContainEqual({
    name: 'enosem',
    declarationId: 'enosem:12',
    declarationSourceId: 'lexicon',
    declarationLine: 12,
  });
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((item) =>
        ['source_apply', 'analysis_submit'].includes(item.method),
      ),
    ),
  ).toBe(false);
});

test('source-node links restore tree selection and Back reverses a later node selection', async ({
  page,
}) => {
  const raw = 'alpha * beta';
  const tree: AuthorNode = {
    id: 'root',
    kind: 'binary',
    label: '*',
    operator: '*',
    code: raw,
    start: 0,
    end: raw.length,
    children: [
      {
        slot: 'left',
        node: {
          id: 'root/left',
          kind: 'reference',
          label: 'alpha',
          code: 'alpha',
          start: 0,
          end: 5,
          children: [],
        },
      },
      {
        slot: 'right',
        node: {
          id: 'root/right',
          kind: 'reference',
          label: 'beta',
          code: 'beta',
          start: 8,
          end: 12,
          children: [],
        },
      },
    ],
  };
  await page.addInitScript(
    ({ raw, tree }) => {
      window.__nextInitial = { raw, trees: { [raw]: tree } };
    },
    { raw, tree },
  );
  await page.goto(
    route({ passage: 'passage-a', view: 'analysis', tab: 'tree', node: 'root/left' }),
  );
  await ready(page, raw);
  const left = page.locator(
    '.expression-canvas [data-canvas-key="main:root/left"] > [aria-pressed]',
  );
  const right = page.locator(
    '.expression-canvas [data-canvas-key="main:root/right"] > [aria-pressed]',
  );
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await right.click();
  await expectRoute(page, { node: 'root/right' });
  await page.goBack();
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await expectRoute(page, { node: 'root/left' });
  await page.reload();
  await ready(page, raw);
  await expect(left).toHaveAttribute('aria-pressed', 'true');
});

test('an old pending-passage link resolves its published identity without adding a history entry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const published = localStorage.getItem('url-test-published-project');
    if (published)
      window.__nextInitial = {
        responses: {
          session_restore: { project: JSON.parse(published), selectedPassageId: 'passage-b' },
        },
      };
  });
  await page.goto(base);
  await ready(page, 'beta');
  await expect
    .poll(() => page.evaluate(() => !!window.__nextControl.saved['simulated:a']))
    .toBe(true);
  const pending = await page.evaluate(() => {
    const envelope = structuredClone(window.__nextControl.saved['simulated:a']);
    const pending = 'pending:7d17f7a0-54bc-4a99-a90e-58f929ab60a6';
    envelope.drafts[pending] = {
      ...envelope.drafts['passage-b'],
      passageId: pending,
      raw: 'pending_tree',
      sourceFingerprint: 'pending',
      pending: { sourceId: 'araujo_catecismo_1686', ordinal: 3, beforePassageId: null },
    };
    localStorage.setItem('simulated-next:simulated:a', JSON.stringify(envelope));
    return pending;
  });
  await page.goto(route({ passage: pending, view: 'analysis', tab: 'tree' }));
  await ready(page, 'pending_tree');
  await expectRoute(page, { passage: pending });
  const historyLength = await page.evaluate(() => history.length);
  const canonical = await page.evaluate((pending) => {
    const canonical = pending.replace(/^pending:/, 'passage:');
    const project = structuredClone(window.__nextControl.project);
    project.passages.push({
      ...project.passages[1],
      id: canonical,
      ordinal: 3,
      sourceExpression: 'pending_tree',
      sourceFingerprint: 'published-pending-source',
    });
    const envelope = structuredClone(window.__nextControl.saved[project.id]);
    const draft = envelope.drafts[pending];
    delete envelope.drafts[pending];
    delete draft.pending;
    envelope.drafts[canonical] = {
      ...draft,
      passageId: canonical,
      sourceFingerprint: 'published-pending-source',
    };
    localStorage.setItem('url-test-published-project', JSON.stringify(project));
    localStorage.setItem(`simulated-next:${project.id}`, JSON.stringify(envelope));
    return canonical;
  }, pending);
  await page.reload();
  await ready(page, 'pending_tree');
  await expectRoute(page, { passage: canonical });
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.goBack();
  await ready(page, 'beta');
  await expectRoute(page, { passage: 'passage-b' });
});

for (const target of ['passage:00000000-0000-4000-8000-000000000099', '\u0000invalid']) {
  test(`an ${target.startsWith('passage:') ? 'unknown' : 'invalid'} passage link shows a notice until deliberate navigation`, async ({
    page,
  }) => {
    await page.goto(route({ passage: target, view: 'analysis', tab: 'tree' }));
    await ready(page);
    const notice = page.getByRole('alert').filter({ hasText: /passagem|link|endereço/i });
    await expect(notice).toBeVisible();
    if (target.startsWith('passage:')) await expectRoute(page, { passage: target });
    const pending = await page.evaluate(() =>
      Object.keys(window.__nextControl.saved['simulated:a']?.drafts ?? {}).filter((id) =>
        id.startsWith('pending:'),
      ),
    );
    expect(pending).toEqual([]);
    await page.getByLabel('Buscar passagem', { exact: true }).fill('1');
    await page.getByLabel('Passagens por seção').getByRole('button', { name: /0001/ }).click();
    await ready(page, 'alpha');
    await expectRoute(page, { passage: 'passage-a' });
    await expect(notice).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.__nextControl.requests.some((request) => request.method === 'analysis_submit'),
      ),
    ).toBe(false);
    await page.goBack();
    await expect(notice).toBeVisible();
    expect(new URL(page.url()).searchParams.get('passage')).toBe(target);
  });
}

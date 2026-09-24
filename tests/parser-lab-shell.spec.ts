import { expect, test } from '@playwright/test';

/** The solver lives in the editor tabs, beside the tree it feeds.
 *  Real analysis and engine morphology are covered by tests/parser-lab.spec.ts. */
async function workspace(page: import('@playwright/test').Page) {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByRole('button', { name: 'Aprender', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
}

async function labRequests(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    window.__nextControl.requests
      .map((request) => request.method)
      .filter((method) => method.startsWith('parser_lab_')),
  );
}

test('the solver is a tab in the editor, not hidden behind a setting', async ({ page }) => {
  await workspace(page);
  // No switch to find: it sits with the other projections of this passage.
  await expect(page.getByRole('tab', { name: 'Sugerir', exact: true })).toBeVisible();
  expect(await labRequests(page)).toEqual([]);
});

test('opening the tab reads state only and starts nothing', async ({ page }) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Sugerir uma análise/ })).toBeVisible();
  await expect.poll(() => labRequests(page)).toEqual(['parser_lab_status']);
});

test('without an index the tab offers preparation instead of failing', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.getByRole('button', { name: 'Aprender', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const status = window.__nextControl.responses.parser_lab_status as Record<string, unknown>;
    window.__nextControl.responses.parser_lab_status = { ...status, artifacts: [], active: {} };
  });
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  // Preparation is offered, never performed on its own.
  await expect(page.getByRole('button', { name: /Preparar índice/ })).toBeVisible();
  await expect(page.getByTestId('solver-analyse')).toBeDisabled();
  expect(await labRequests(page)).toEqual(['parser_lab_status']);
});

test('the input starts from the passage transcription', async ({ page }) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  const transcription = await page.evaluate(
    () => window.__nextControl.project.passages[0].normalized,
  );
  if (transcription) await expect(page.getByTestId('solver-input')).toHaveValue(transcription);
  await page.getByTestId('solver-input').fill('Asó xe rokype');
  await expect(page.getByTestId('solver-normalized')).toContainText('asoxerokype');
});

test('the full laboratory opens from the tab and closing returns to the editor', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByRole('button', { name: 'Laboratório', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao trabalho' }).click();
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Sugerir uma análise/ })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((request) =>
        /source_apply|reference_approve/.test(request.method),
      ),
    ),
  ).toBe(false);
});

test('a chosen reading goes into the draft and undo takes it back', async ({ page }) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Pydicate editável', exact: true });
  const before = await editor.inputValue();
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByTestId('solver-input').fill('sapépe');
  await page.getByTestId('solver-analyse').click();

  // Both readings are offered; the form does not decide between them.
  const candidates = page.getByTestId('solver-candidates');
  await expect(candidates.locator('li')).toHaveCount(2);
  await expect(page.getByTestId('solver-status')).toContainText(
    '2 análises estruturalmente distintas',
  );

  // Take the second one into the draft this passage is working on.
  await candidates.locator('li').nth(1).locator('button').first().click();
  await page.getByTestId('solver-use-1').click();
  await expect(page.getByTestId('solver-imported')).toBeVisible();

  // The reading is now the expression this passage is being built from.
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await expect(editor).toHaveValue('(pe * (ae * apé))');

  // It is an ordinary draft edit: undo restores what was there.
  await page.getByRole('tab', { name: 'Árvore', exact: true }).click();
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await expect(editor).toHaveValue(before);

  // The choice is recorded, and nothing was published or approved.
  const calls = await labRequests(page);
  expect(calls).toContain('parser_lab_judgment');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some((request) =>
        /source_apply|reference_approve/.test(request.method),
      ),
    ),
  ).toBe(false);
});

test('unknown lexical hypotheses stay explicit, provisional and editable in the solver', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByTestId('solver-input').fill('Arani');
  await page.getByText('Raízes e nomes não cadastrados', { exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar raiz ou nome' }).click();
  await page.getByLabel('Raiz ou nome 1', { exact: true }).fill(' Arani ');
  await page
    .getByRole('combobox', { name: 'Categoria 1', exact: true })
    .selectOption('proper_noun');
  await page.evaluate(() => {
    const candidate = {
      schemaVersion: 1,
      source: 'Noun("Arani")',
      surface: 'Arani',
      normalized: 'arani',
      route: 'morphology',
      family: 'noun',
      bindings: {},
      spans: [],
      score: 0.5,
      scoreMeaning: 'SIMULADO',
      features: {},
      completeness: 'partial',
      annotated: '',
      morphemes: [],
      editable: true,
      seconds: 0,
      provenance: {
        lexicalStatus: 'provisional',
        lexicalEvidence: [
          { origin: 'user-hypothesis', headword: 'Arani', category: 'proper_noun' },
        ],
      },
    };
    window.__nextControl.responses.parser_lab_analyze = {
      schemaVersion: 1,
      astSchemaVersion: 1,
      input: {
        profile: 'lab-v1',
        raw: 'Arani',
        normalized: 'arani',
        removedPunctuation: [],
        note: '',
      },
      context: {},
      artifacts: {},
      candidates: [candidate],
      best: candidate,
      rejections: [],
      timings: {},
      status: 'partial',
      message: 'SIMULADO: raiz provisória',
      configuration: { diagnostics: { truncated: true, candidateTotal: 3 } },
      coordinateSystem: 'normalized-input-codepoints',
      alignmentNote: '',
    };
  });
  await page.getByTestId('solver-analyse').click();
  await expect(page.getByTestId('solver-candidates')).toContainText('Sintaxe provisória');
  await expect(page.getByTestId('solver-candidates')).toContainText('significado não informado');
  await expect(page.getByTestId('solver-status')).toContainText('Uma hipótese provisória');
  await expect(page.getByTestId('solver-status')).toContainText('Exibindo 1 de 3');
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.find((request) => request.method === 'parser_lab_analyze')
          ?.params.lexicalHints,
    ),
  ).toEqual([{ root: 'Arani', category: 'proper_noun' }]);
  await page.getByTestId('solver-use-0').click();
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.find((request) => request.method === 'parser_lab_judgment')
          ?.params.judgment,
    ),
  ).toMatchObject({
    candidateCompleteness: 'partial',
    lexicalHints: [{ root: 'Arani', category: 'proper_noun' }],
    lexicalEvidence: [{ origin: 'user-hypothesis', headword: 'Arani', category: 'proper_noun' }],
  });
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Pydicate editável', exact: true })).toHaveValue(
    'Noun("Arani")',
  );
});

test('decomposed suggestions separate whole meanings from components and keep the direct entry', async ({
  page,
}) => {
  await workspace(page);
  const compoundDefinition = 'amigo dos outros; sentido registrado do conjunto';
  const expression = `studio_define((potar * moro).var(1).base_nominal(), ${JSON.stringify(compoundDefinition)})`;
  await page.evaluate(
    async ({ expression, compoundDefinition }) => {
      const result = (await window.studio!.invoke!('parser_lab_analyze', {
        text: 'moropotara',
      })) as {
        candidates: Record<string, unknown>[];
        input: Record<string, unknown>;
      };
      const base = result.candidates[0];
      const dictionary = {
        origin: 'navarro',
        headword: 'poropotara',
        definition: compoundDefinition,
      };
      window.__nextControl.responses.parser_lab_analyze = {
        ...result,
        input: { ...result.input, raw: 'moropotara', normalized: 'moropotara' },
        candidates: [
          {
            ...base,
            source: expression,
            surface: 'moropotara',
            family: 'noun',
            morphemes: [],
            provenance: {
              route: 'morphology',
              decomposition: {
                relation: 'surface-linked',
                source: '(potar * moro).var(1).base_nominal()',
                dictionaryHeadword: 'poropotara',
                definition: compoundDefinition,
              },
              lexicalEvidence: [
                { ...dictionary, scope: 'whole' },
                { origin: 'shared', headword: 'potar', definition: 'querer', scope: 'component' },
                { origin: 'shared', headword: 'moro', definition: 'gente', scope: 'component' },
              ],
            },
          },
          {
            ...base,
            source: 'Noun("poropotara")',
            surface: 'moropotara',
            family: 'lexical',
            provenance: { route: 'morphology', lexicalEvidence: [dictionary] },
          },
        ],
      };
    },
    { expression, compoundDefinition },
  );
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByTestId('solver-input').fill('moropotara');
  await page.getByTestId('solver-analyse').click();
  const candidates = page.getByTestId('solver-candidates').locator(':scope > li');
  await expect(candidates).toHaveCount(2);
  await expect(candidates.nth(0)).toContainText('Análise decomposta');
  await expect(candidates.nth(0)).toContainText(
    `Significado de poropotara · Navarro: ${compoundDefinition}`,
  );
  await expect(candidates.nth(0)).toContainText(
    'Peça da composição · Léxico compartilhado · potar: querer',
  );
  await expect(candidates.nth(0)).toContainText(
    'Peça da composição · Léxico compartilhado · moro: gente',
  );
  await expect(candidates.nth(0)).toContainText(
    'A forma coincide com o verbete; a decomposição é uma hipótese a revisar.',
  );
  await expect(candidates.nth(1)).toContainText('Verbete direto');
  const morphology = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Morfemas do motor' }) });
  await morphology.locator('summary').click();
  await expect(morphology).toContainText('O motor não forneceu segmentação em morfemas.');
  await page.getByTestId('solver-use-0').click();
  await page.getByRole('tab', { name: 'Código', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Pydicate editável', exact: true })).toHaveValue(
    expression,
  );
  await page.evaluate(() => {
    const result = window.__nextControl.responses.parser_lab_analyze as {
      candidates: import('../src/domain/parser-lab').LabCandidate[];
      input: Record<string, unknown>;
    };
    const base = result.candidates[0];
    const { decomposition, ...provenance } = base.provenance;
    window.__nextControl.responses.parser_lab_analyze = {
      ...result,
      input: { ...result.input, raw: 'asó moropotara', normalized: 'asomoropotara' },
      candidates: [
        {
          ...base,
          source: `(+ixé * só) + (${base.source})`,
          surface: 'asó moropotara',
          normalized: 'asomoropotara',
          family: 'clause',
          provenance: {
            ...provenance,
            route: 'composition',
            decompositions: [{ ...decomposition!, span: { type: 'noun', start: 3, end: 13 } }],
          },
        },
      ],
    };
  });
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByTestId('solver-input').fill('asó moropotara');
  await page.getByTestId('solver-analyse').click();
  await expect(candidates).toHaveCount(1);
  await expect(candidates.first()).toContainText('Análise decomposta');
  await expect(candidates.first()).toContainText(
    'A forma coincide com o verbete; a decomposição é uma hipótese a revisar.',
  );
  await expect(
    candidates.first().locator('.lab-lexical-evidence').filter({ hasText: compoundDefinition }),
  ).toHaveCount(1);
  await expect(candidates.first()).toContainText(
    `Significado de poropotara · Navarro: ${compoundDefinition}`,
  );
  await expect(candidates.first()).not.toContainText('Significado do conjunto');
});

test('the laboratory sends the declared root and invalidates results after category changes', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByRole('button', { name: 'Laboratório', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Laboratório Tupi para Pydicate' });
  await page.getByTestId('lab-input').fill('asoru');
  await dialog.getByText('Raízes e nomes não cadastrados', { exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar raiz ou nome' }).click();
  await page.getByLabel('Raiz ou nome 1', { exact: true }).fill('soru');
  await page
    .getByRole('combobox', { name: 'Categoria 1', exact: true })
    .selectOption('intransitive_verb');
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-candidates')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.find((request) => request.method === 'parser_lab_analyze')
          ?.params.lexicalHints,
    ),
  ).toEqual([{ root: 'soru', category: 'intransitive_verb' }]);
  await page
    .getByRole('combobox', { name: 'Categoria 1', exact: true })
    .selectOption('transitive_verb');
  await expect(page.getByTestId('lab-candidates')).toHaveCount(0);
});

test('editing the form or a lexical hypothesis invalidates a pending analysis', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByTestId('solver-input').fill('sapépe');
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'parser_lab_analyze' }));
  await page.getByTestId('solver-analyse').click();
  await page.getByTestId('solver-input').fill('outra forma');
  await page.evaluate(() => window.__nextControl.release('parser_lab_analyze'));
  await expect(page.getByTestId('solver-candidates')).toHaveCount(0);
  await expect(page.getByTestId('solver-analyse')).toBeEnabled();

  await page.evaluate(() => window.__nextControl.holds.push({ method: 'parser_lab_analyze' }));
  await page.getByTestId('solver-analyse').click();
  await page.getByText('Raízes e nomes não cadastrados', { exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar raiz ou nome' }).click();
  await page.evaluate(() => window.__nextControl.release('parser_lab_analyze'));
  await expect(page.getByTestId('solver-candidates')).toHaveCount(0);
  await expect(page.getByTestId('solver-analyse')).toBeEnabled();
});

test('repreparing waits for its new job while the previous index remains active', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByRole('button', { name: 'Repreparar índice' }).click();
  await expect
    .poll(
      async () =>
        (await labRequests(page)).filter((method) => method === 'parser_lab_status').length,
    )
    .toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Preparando…' })).toBeDisabled();
  await page.evaluate(async () => {
    const current = await window.__nextInvoke<Record<string, unknown>>('parser_lab_status', {
      projectId: window.__nextControl.project.id,
    });
    window.__nextControl.responses.parser_lab_status = {
      ...current,
      active: { index: 'new-index' },
      jobs: [{ id: 'simulated-job', status: 'succeeded', artifactId: 'new-index' }],
    };
  });
  await expect(page.getByRole('button', { name: 'Repreparar índice' })).toBeEnabled();
});

test('a delayed judgment does not rerun or restore an observation the contributor has changed', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByRole('button', { name: 'Laboratório', exact: true }).click();
  await page.getByTestId('lab-input').fill('sapépe');
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-candidates')).toBeVisible();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'parser_lab_judgment' }));
  await page.getByTestId('lab-choose-0').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((request) => request.method === 'parser_lab_judgment'),
      ),
    )
    .toBe(true);
  await page.getByTestId('lab-input').fill('nova observação');
  await page.evaluate(() => window.__nextControl.release('parser_lab_judgment'));
  await expect(page.getByTestId('lab-candidates')).toHaveCount(0);
  await expect(page.getByTestId('lab-input')).toHaveValue('nova observação');
  expect(
    (await labRequests(page)).filter((method) => method === 'parser_lab_analyze'),
  ).toHaveLength(1);
});

test('the solver cannot report draft adoption while the project is opening', async ({ page }) => {
  await workspace(page);
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByTestId('solver-input').fill('sapépe');
  await page.getByTestId('solver-analyse').click();
  await expect(page.getByTestId('solver-use-0')).toBeEnabled();
  await page.evaluate(() => {
    window.studio!.openProject = () =>
      new Promise((resolve, reject) => {
        window.__nextControl.pending.push({
          id: -1,
          method: 'open_project',
          params: {},
          resolve: () => resolve(window.__nextControl.openedProject),
          reject: (message) => reject(new Error(message)),
        });
      });
  });
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).click();
  await page.getByRole('button', { name: /Abrir projeto existente/ }).click();
  await expect(page.getByTestId('solver-use-0')).toBeDisabled();
  expect(await labRequests(page)).not.toContain('parser_lab_judgment');
  await expect(page.getByTestId('solver-imported')).toHaveCount(0);
  await page.evaluate(() => window.__nextControl.release('open_project'));
});

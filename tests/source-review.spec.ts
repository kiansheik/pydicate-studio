import { expect, test, type Page } from '@playwright/test';
import type { SourcePreview } from '../src/domain/authoring';

async function newPassage(page: Page) {
  await page.goto('/tests/next-hook-harness.html?workspace');
  await expect(page.locator('.add-next-passage')).toBeEnabled();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await page.locator('.add-next-passage').click();
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar peça', exact: true });
  await palette.getByRole('tab', { name: 'Código', exact: true }).click();
  await palette.getByLabel('Código da nova peça').fill('Noun("abá", definition="pessoa") * ixé');
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'evaluate_expression' }));
  await palette.getByRole('button', { name: 'Adicionar código ao espaço', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some(({ method }) => method === 'evaluate_expression'),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const request = window.__nextControl.pending.find(
      ({ method }) => method === 'evaluate_expression',
    )!;
    window.__nextControl.responses.evaluate_expression = {
      expression: request.params.raw,
      revisionId: request.params.revisionId,
      engineFingerprint: window.__nextControl.project.engineFingerprint,
      surface: 'abá ixé',
      annotated: 'abá ixé',
      morphemes: [],
      origin: 'engine',
    };
    window.__nextControl.release('evaluate_expression');
  });
  await expect(page.getByTestId('generated-surface')).toHaveText('abá ixé');
  await expect(
    page.getByRole('button', { name: 'Revisar nova passagem', exact: true }),
  ).toBeEnabled();
}

test('publication review identifies an unattested root without supplying a meaning', async ({
  page,
}) => {
  await newPassage(page);
  await page.evaluate(() => {
    window.__nextControl.responses.source_new_preview = {
      previewId: 'hypothetical-root-preview',
      kind: 'source',
      sourceFingerprint: 'simulated-source-v1',
      diff: '+ekat = Noun("ekat", definition="(t)")',
      lexicalAdditions: [
        {
          name: 'ekat',
          expression: 'Noun("ekat", definition="(t)")',
          headword: 'ekat',
          definition: '',
          lexicalStatus: 'hypothetical',
        },
      ],
    };
  });
  await page.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar passagem e léxico', exact: true });
  await expect(review.getByRole('listitem')).toContainText('ekat');
  await expect(review.getByRole('listitem')).toContainText('Sem significado informado.');
  await expect(review.getByRole('listitem')).toContainText('Raiz hipotética · não atestada');
});

test('plain-language review keeps complete words and both file diffs available before one apply', async ({
  page,
}) => {
  await newPassage(page);
  await page.evaluate(() => {
    const passageId = localStorage.getItem('simulated-selection:simulated:a')!;
    const preview: SourcePreview = {
      previewId: 'combined-lexicon-preview',
      kind: 'source',
      passageId,
      targetPassageId: passageId.replace('pending:', 'passage:'),
      sourceFingerprint: 'simulated-source-v1',
      diff: 'combined fallback',
      diagnostics: ['SIMULATED: a análise completa ainda precisa de revisão.'],
      raw: 'aba * ixe',
      reviewSummary: {
        kind: 'passage-new',
        passageOrdinal: 3,
        fields: [
          { label: 'Página impressa', before: '25', after: '26' },
          { label: 'Notas', after: 'Leitura conferida com o fac-símile.' },
        ],
      },
      lexicalAdditions: [
        {
          name: 'aba',
          expression: 'Noun("abá", definition="pessoa")',
          headword: 'abá',
          definition:
            'Pessoa; ser humano. ' +
            'Observação preservada sobre este sentido. '.repeat(8) +
            'Fim da definição.',
        },
        {
          name: 'ixe',
          expression: 'Pronoun("ixé")',
          headword: 'ixé',
          definition: 'Eu.',
          reused: true,
        },
      ],
      files: [
        {
          path: 'historic/lexicon.tu.py',
          sourceFingerprint: 'simulated-lexicon-v1',
          diff: '+aba = Noun("abá", definition="pessoa")',
        },
        {
          path: 'historic/araujo_catecismo_1686.tu.py',
          sourceFingerprint: 'simulated-source-v1',
          diff: '+aba * ixe',
        },
      ],
    };
    window.__nextControl.responses.source_new_preview = preview;
  });
  await page.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar passagem e léxico', exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByRole('region', { name: 'Resultado atual do rascunho' })).toContainText(
    'abá ixé',
  );
  const words = review.getByRole('region', { name: 'Palavras desta revisão' });
  await expect(words).toContainText('1 nova entrada · 1 entrada reutilizada');
  await expect(words.getByRole('listitem').first()).toContainText('Pessoa; ser humano.');
  await expect(words.getByRole('listitem').last()).toContainText('Já no léxico');
  await expect(
    review.getByRole('region', { name: 'Outras alterações desta revisão' }),
  ).toContainText('Página impressa');
  await expect(review.locator('pre:visible, code:visible')).toHaveCount(0);
  expect(await review.innerText()).not.toContain('historic/');
  expect(await review.innerText()).not.toContain('Noun(');
  expect(await words.innerText()).not.toContain('Fim da definição.');
  await words.getByText('Ler definição completa', { exact: true }).click();
  expect(await words.innerText()).toContain('Fim da definição.');
  await review.getByText('Mostrar diff técnico', { exact: true }).click();
  await expect(review.getByRole('region', { name: 'Diagnósticos desta revisão' })).toContainText(
    'a análise completa ainda precisa de revisão',
  );
  await expect(review.getByRole('row').filter({ hasText: 'abá' })).toContainText('Nova entrada');
  await expect(review.getByRole('row').filter({ hasText: 'ixé' })).toContainText('Já existente');
  await expect(
    review.getByRole('region', { name: 'historic/lexicon.tu.py', exact: true }),
  ).toContainText('+aba = Noun("abá", definition="pessoa")');
  await expect(
    review.getByRole('region', { name: 'historic/araujo_catecismo_1686.tu.py', exact: true }),
  ).toContainText('+aba * ixe');
  await review.getByText('Mostrar diff técnico', { exact: true }).click();
  await expect(review.locator('pre:visible, code:visible')).toHaveCount(0);
  await review.getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter(({ method }) => method === 'source_apply'),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'source_apply' }));
  await review.getByRole('button', { name: 'Salvar fonte e ground truth', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.requests.filter(({ method }) => method === 'source_apply'),
      ),
    )
    .toMatchObject([{ params: { previewId: 'combined-lexicon-preview' } }]);
  await expect(review.getByRole('button', { name: 'Salvando…', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('a source-only review defaults to the draft result and retains its optional complete diff', async ({
  page,
}) => {
  await newPassage(page);
  await page.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar nova passagem', exact: true });
  await expect(review.getByRole('region', { name: 'Resultado atual do rascunho' })).toContainText(
    'abá ixé',
  );
  await expect(review.locator('pre:visible')).toHaveCount(0);
  await review.getByText('Mostrar diff técnico', { exact: true }).click();
  await expect(review.locator('pre')).toHaveText(
    'SIMULATED DIFF: Noun("abá", definition="pessoa") * ixé',
  );
  await expect(
    review.getByRole('button', { name: 'Salvar fonte e ground truth', exact: true }),
  ).toBeEnabled();
  await expect(review.getByRole('table')).toHaveCount(0);
});

for (const kind of ['lexicon', 'recovery'] as const) {
  test(`${kind} review uses its own summary without borrowing the open passage result`, async ({
    page,
  }) => {
    await newPassage(page);
    await page.evaluate((kind) => {
      window.__nextControl.responses.source_new_preview = {
        previewId: 'separate-review',
        kind,
        sourceFingerprint: 'fixture',
        diff: '--- historic/lexicon.tu.py\n+technical_variable = Noun("kunhã")',
        reviewSummary: {
          kind,
          fields:
            kind === 'lexicon'
              ? [
                  { label: 'Palavra', after: 'kunhã' },
                  { label: 'Significado', before: 'mulher', after: '' },
                ]
              : [{ label: 'Léxico', after: 'Restaurar a versão anterior' }],
        },
      } satisfies SourcePreview;
    }, kind);
    await page.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
    const review = page.getByRole('dialog', {
      name: kind === 'lexicon' ? 'Revisar entrada do léxico' : 'Revisar recuperação',
      exact: true,
    });
    await expect(review).toBeVisible();
    await expect(review.getByRole('region', { name: 'Resultado atual do rascunho' })).toHaveCount(
      0,
    );
    await expect(
      review.getByRole('region', { name: 'Outras alterações desta revisão' }),
    ).toContainText(kind === 'lexicon' ? 'Removido' : 'Restaurar a versão anterior');
    expect(await review.innerText()).not.toContain('abá ixé');
    expect(await review.innerText()).not.toContain('technical_variable');
    await expect(review.locator('pre:visible')).toHaveCount(0);
    await review.getByRole('button', { name: 'Aplicar edição revisada', exact: true }).click();
    await expect(review).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.__nextControl.requests.filter(({ method }) => method === 'reference_approve'),
      ),
    ).toHaveLength(0);
  });
}

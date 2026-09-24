import { expect, test } from '@playwright/test';

const sourceTab = (page: import('@playwright/test').Page) =>
  page.getByRole('tab', { name: 'Fonte', exact: true });
const aiTab = (page: import('@playwright/test').Page) => page.getByRole('tab', { name: /^IA/ });

test('new conversation clears context while history and readable activity remain available', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Nhemöabaré.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
    state.jobs[0].summary = '**Resposta anterior**\n\nForma: `nhemoabaré`.';
    state.jobs[0].events = [
      { type: 'text-delta', text: 'fragmento invisível' },
      ...Array.from({ length: 4 }, () => ({
        type: 'tool-start',
        tool: 'studio_dictionary_search',
      })),
    ];
    state.jobs[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    window.__nextControl.setAnalysis(state);
  });
  await expect(
    page.locator('.analysis-answer strong').filter({ hasText: 'Resposta anterior' }),
  ).toHaveCount(1);
  await page.getByText('Entrada salva e atividade', { exact: true }).click();
  await expect(page.getByText('Busca no dicionário', { exact: true })).toHaveCount(1);
  await expect(page.getByText('fragmento invisível', { exact: true })).not.toBeVisible();
  const before = await page.evaluate(
    () => window.__nextControl.requests.filter((r) => r.method === 'analysis_submit').length,
  );
  await page.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue('');
  await expect(page.locator('.analysis-job')).toHaveCount(0);
  await page.reload();
  await aiTab(page).click();
  await expect(page.locator('.analysis-job')).toHaveCount(0);
  await page.getByRole('button', { name: /^Histórico/ }).click();
  await page
    .getByRole('region', { name: 'Histórico de conversas' })
    .getByRole('button', { name: /Analisar passagem/ })
    .click();
  await expect(page.locator('.analysis-answer')).toContainText('Resposta anterior');
  await page.getByRole('button', { name: 'Voltar à conversa atual' }).click();
  await expect(page.locator('.analysis-job')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.__nextControl.requests.filter((r) => r.method === 'analysis_submit').length,
    ),
  ).toBe(0); // reload resets request trace
  expect(before).toBe(1);
  await page.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
  await expect(page.locator('.analysis-job')).toHaveCount(1);
  await expect(page.locator('.analysis-job')).not.toContainText('Resposta anterior');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('simulated-analysis')!));
  expect(saved.jobs).toHaveLength(2);
  expect(saved.jobs[0].conversationId).not.toBe(saved.jobs[1].conversationId);
});

test('unchanged passage can be resubmitted after a result while active sends stay idempotent', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Nhemöabaré.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('simulated-analysis')!));
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('simulated-analysis')!);
    saved.jobs[0].status = 'needs-input';
    saved.jobs[0].summary = 'code-mode host is disabled';
    saved.jobs[0].updatedAt = new Date().toISOString();
    window.__nextControl.setAnalysis(saved);
  });
  await expect(page.getByText('code-mode host is disabled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
  await expect.poll(async () => (await state()).jobs.length).toBe(2);
  let sends = await page.evaluate(() =>
    window.__nextControl.requests
      .filter((r) => r.method === 'analysis_submit')
      .map((r) => r.params),
  );
  expect(sends[1].revisionId).toBe(sends[0].revisionId);
  expect(sends[1].operationId).not.toBe(sends[0].operationId);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('simulated-analysis')!);
    saved.jobs[0].status = 'running';
    saved.jobs[0].updatedAt = new Date().toISOString();
    window.__nextControl.setAnalysis(saved);
  });
  await expect(page.getByText('Analisando', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextControl.requests.filter((r) => r.method === 'analysis_submit').length,
      ),
    )
    .toBe(3);
  sends = await page.evaluate(() =>
    window.__nextControl.requests
      .filter((r) => r.method === 'analysis_submit')
      .map((r) => r.params),
  );
  expect(sends[2].operationId).toBe(sends[1].operationId);
  expect((await state()).jobs).toHaveLength(2);
});

test('question replies bind the named alternative and node and refuse a later candidate revision', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Question source');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
    const candidate = {
      ...state.candidates[0],
      id: 'alternative-b',
      revisionId: 'alternative-revision:b',
    };
    state.candidates.push(candidate);
    state.jobs[0].candidateIds.push(candidate.id);
    state.jobs[0].questions = [
      {
        text: 'Which sense in alternative B?',
        candidateId: candidate.id,
        candidateRevision: candidate.revisionId,
        nodeId: 'root',
      },
    ];
    state.jobs[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    window.__nextControl.setAnalysis(state);
  });
  await page.getByRole('button', { name: 'Responder', exact: true }).click();
  await expect(page.getByLabel('Mensagem para a IA')).toBeFocused();
  await page.getByLabel('Mensagem para a IA').fill('The bishop sense');
  await page.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
  const reply = await page.evaluate(
    () =>
      window.__nextControl.requests.filter((request) => request.method === 'analysis_submit').at(-1)
        ?.params,
  );
  expect(reply).toMatchObject({
    candidateId: 'alternative-b',
    candidateRevision: 'alternative-revision:b',
    feedbackNode: {
      candidateId: 'alternative-b',
      candidateRevision: 'alternative-revision:b',
      nodeId: 'root',
    },
  });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
    state.candidates.find(
      (candidate: { id: string }) => candidate.id === 'alternative-b',
    ).revisionId = 'alternative-revision:new';
    window.__nextControl.setAnalysis(state);
  });
  await page.getByRole('button', { name: /^Histórico/ }).click();
  await page
    .getByRole('region', { name: 'Histórico de conversas' })
    .getByRole('button', { name: /Analisar passagem/ })
    .click();
  await page.getByRole('button', { name: 'Responder', exact: true }).click();
  await expect(page.getByText(/Esta pergunta se refere a uma revisão anterior/)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.filter((request) => request.method === 'analysis_submit')
          .length,
    ),
  ).toBe(2);
});

test('changing only saved lexical notes creates a new submission while unchanged active sends stay idempotent', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.evaluate(() => {
    window.__nextControl.responses.lexical_notes_list = {
      records: [
        {
          id: 'note:shared',
          version: 1,
          scope: 'entry',
          fields: { meaning: 'first reading', grammar: '', note: '' },
        },
      ],
    };
  });
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Nhemöabaré.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('simulated-analysis')!);
    saved.jobs[0].status = 'running';
    saved.jobs[0].updatedAt = new Date().toISOString();
    window.__nextControl.setAnalysis(saved);
  });
  await expect(page.getByText('Analisando', { exact: true }).first()).toBeVisible();
  const submit = async (count: number) => {
    await page.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__nextControl.requests.filter((r) => r.method === 'analysis_submit').length,
        ),
      )
      .toBe(count);
  };
  await submit(2);
  await page.evaluate(() => {
    window.__nextControl.responses.lexical_notes_list = {
      records: [
        {
          id: 'note:shared',
          version: 2,
          scope: 'entry',
          fields: { meaning: 'corrected reading', grammar: '', note: '' },
        },
      ],
    };
  });
  await submit(3);
  const requests = await page.evaluate(() =>
    window.__nextControl.requests
      .filter((r) => r.method === 'analysis_submit')
      .map((r) => r.params),
  );
  expect(requests[1].operationId).toBe(requests[0].operationId);
  expect(requests[2].operationId).not.toBe(requests[0].operationId);
  expect(requests[2].revisionId).toBe(requests[0].revisionId);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('simulated-analysis')!).jobs.length),
  ).toBe(2);
  expect(
    await page.evaluate(
      () => window.__nextControl.requests.filter((r) => r.method === 'lexical_notes_list').length,
    ),
  ).toBe(3);
});

test('summary refresh preserves conversation turns and expands old source-only image evidence', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('History source');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.locator('.analysis-turn')).toHaveCount(1);
  await page.getByLabel('Mensagem para a IA').fill('My next unsent question');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('simulated-analysis')!).conversations[0].composer,
      ),
    )
    .toBe('My next unsent question');
  const lists = await page.evaluate(
    () =>
      window.__nextControl.requests.filter((request) => request.method === 'analysis_list').length,
  );
  await page.evaluate(() =>
    window.__nextControl.emit({ type: 'analysis', projectId: 'simulated:a' }),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__nextControl.requests.filter((request) => request.method === 'analysis_list')
            .length,
      ),
    )
    .toBeGreaterThan(lists);
  await expect(page.locator('.analysis-turn')).toHaveCount(1);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
    state.jobs.push({
      ...state.jobs[0],
      id: 'old-source-only',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
      candidateIds: [],
      input: {
        ...state.jobs[0].input,
        task: 'translate-source',
        evidence: { revision: 3, regions: [{ id: 'physical-region' }], images: [{ id: 'pixels' }] },
      },
    });
    window.__nextControl.setAnalysis(state);
  });
  await page.getByRole('button', { name: /^Histórico/ }).click();
  await page
    .getByRole('region', { name: 'Histórico de conversas' })
    .getByRole('button', { name: /Interpretar a fonte/ })
    .click();
  const history = page.locator('.analysis-job').filter({ hasText: 'Interpretação da fonte' });
  await history.getByText('Entrada salva e atividade', { exact: true }).click();
  await expect(history).toContainText('1 região(ões) salva(s); imagens fornecidas');
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.some(
        (request) =>
          request.method === 'analysis_get' && request.params.jobId === 'old-source-only',
      ),
    ),
  ).toBe(true);
});

test('batch accepts tentative and own PDF preparation and honors image consent before dispatch', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Grafia provável em Navarro').fill('Tentative only');
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await page
    .getByLabel('Significado provável', { exact: true })
    .fill('Keep a saved blank-text draft');
  await page.evaluate(() => {
    window.__nextControl.evidence['passage-a'] = {
      version: 1,
      revision: 2,
      projectId: 'simulated:a',
      sourceId: 'araujo_catecismo_1686',
      asset: {
        id: 'fixture-asset',
        name: 'test.pdf',
        bytes: 1,
        fingerprint: 'fixture',
        managedState: 'ok',
        originalState: 'ok',
      },
      retainedAssetCount: 0,
      passage: {
        regions: [{ id: 'own-a', assetId: 'fixture-asset', pageIndex: 0, rect: [1, 1, 2, 2] }],
        view: { pageIndex: 0, zoom: 1, rotation: 0 },
      },
    };
    window.__nextControl.evidence['passage-b'] = {
      ...window.__nextControl.evidence['passage-a'],
      passage: {
        regions: [],
        view: { pageIndex: 0, zoom: 1, rotation: 0 },
        guide: {
          assetId: 'fixture-asset',
          fromPassageId: 'passage-a',
          region: window.__nextControl.evidence['passage-a'].passage!.regions[0],
        },
      },
    };
  });
  await aiTab(page).click();
  await page.getByRole('button', { name: 'Fila · 0', exact: true }).click();
  await page.getByText('Enviar passagens preparadas em lote', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Passagem 1', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Passagem 2', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fila · 0', exact: true }).click();
  await page.evaluate(() => {
    window.__nextControl.evidence['passage-b'].passage!.regions = [
      { id: 'own-b', assetId: 'fixture-asset', pageIndex: 0, rect: [2, 2, 3, 3] },
    ];
  });
  await page.getByRole('button', { name: 'Fila · 0', exact: true }).click();
  await page.getByText('Enviar passagens preparadas em lote', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Passagem 1', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Passagem 2', exact: true }).check();
  await page
    .getByRole('checkbox', { name: 'Enviar imagem das regiões selecionadas', exact: true })
    .check();
  await page.evaluate(() => {
    window.__nextControl.evidence['passage-a'].passage!.regions = [];
  });
  await page.getByRole('button', { name: 'Analisar 2 selecionada(s)', exact: true }).click();
  await expect(page.getByText(/A passagem 1 não tem uma região própria/)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__nextControl.requests.filter(
          (request) => request.method === 'analysis_submit_batch',
        ).length,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    window.__nextControl.evidence['passage-a'].passage!.regions = [
      { id: 'own-a', assetId: 'fixture-asset', pageIndex: 0, rect: [1, 1, 2, 2] },
    ];
  });
  await page.getByRole('button', { name: 'Analisar 2 selecionada(s)', exact: true }).click();
  await expect(page.getByText('2 análise(s) na fila.', { exact: true })).toBeVisible();
  const items = await page.evaluate(
    () =>
      window.__nextControl.requests.find((request) => request.method === 'analysis_submit_batch')
        ?.params.items as Record<string, unknown>[],
  );
  expect(items).toHaveLength(2);
  expect(items.every((item) => item.includeImages === true && item.evidenceRevision === 2)).toBe(
    true,
  );
});

test('support provider settings save without starting the legacy assistant', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await aiTab(page).click();
  await page
    .getByRole('button', { name: 'Configuração e histórico anterior', exact: true })
    .click();
  await page.getByLabel('Provedor de IA').selectOption('claude');
  await page.getByLabel('Modelo de IA').fill('fixture-selected-model');
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
  await expect(page.getByText('claude · fixture-selected-model', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Solicitar assistência', exact: true }),
  ).toHaveCount(0);
  const requests = await page.evaluate(() => window.__nextControl.requests);
  expect(requests.find((request) => request.method === 'ai_configure')?.params).toMatchObject({
    provider: 'claude',
    model: 'fixture-selected-model',
  });
  expect(requests.filter((request) => request.method === 'ai_start')).toHaveLength(0);
});

test('typed source queues only a saved revision, keeps the builder, and persists per-passage composer across restart', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await page
    .getByLabel('Transcrição diplomática', { exact: true })
    .fill('Original uncertain source');
  await page.getByLabel('Grafia provável em Navarro').fill('Ã b a');
  await page.getByLabel('Significado provável', { exact: true }).fill('Meaning hint');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(aiTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Montar a análise', exact: true })).toHaveClass(
    'active',
  );
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('analysis-support.png') });
  const submission = await page.evaluate(() =>
    window.__nextControl.requests.find((request) => request.method === 'analysis_submit'),
  );
  expect(submission?.params.evidenceRevision).toBe(0);
  const saved = await page.evaluate(
    () => window.__nextControl.saved['simulated:a'].drafts['passage-a'],
  );
  expect(saved.normalized).toBe('');
  expect(saved.aiInput?.tentativeReading).toBe('Ã b a');
  expect(saved.revisionId).toBe(submission?.params.revisionId);
  await page.getByLabel('Mensagem para a IA').fill('Use the other sense, please');
  await sourceTab(page).click();
  await expect(page.getByLabel('Grafia provável em Navarro')).toHaveValue('Ã b a');
  await aiTab(page).click();
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue('Use the other sense, please');
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue('');
  await page.getByLabel('Mensagem para a IA').fill('Second passage question');
  await page.getByRole('button', { name: 'Passagem anterior', exact: true }).click();
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue('Use the other sense, please');
  await page.reload();
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue('Use the other sense, please');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
});

test('inspection immediately adopts the proposal in the vertical editor with working context-menu edits', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Prepared reading');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prévia da proposta de IA' })).toHaveCount(0);
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
  const editor = page.locator('[data-pane="editor"] .expression-canvas');
  await expect(
    editor.getByRole('button', { name: 'De baixo para cima', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(
      () => window.__nextControl.requests.filter((r) => r.method === 'analysis_accept').length,
    ),
  ).toBe(1);
  await editor.getByRole('button', { name: 'Da esquerda para a direita', exact: true }).click();
  await expect(
    editor.getByRole('button', { name: 'Da esquerda para a direita', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect(
    editor.getByRole('button', { name: 'Da esquerda para a direita', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await editor.locator('.canvas-node').first().click({ button: 'right' });
  await editor.getByRole('menuitem', { name: /Duplicar trecho/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__nextControl.saved['simulated:a'].drafts['passage-a'].canvas?.fragments?.length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () => window.__nextControl.requests.filter((r) => r.method === 'analysis_accept').length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) =>
        ['source_apply', 'reference_approve'].includes(request.method),
      ),
    ),
  ).toHaveLength(0);
});

test('inspection uses the current draft revision and preserves human input after an older analysis', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Prepared reading');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  await sourceTab(page).click();
  await page.getByLabel('Tradução', { exact: true }).fill('Minha tradução revisada.');
  await page.getByLabel('Grafia provável em Navarro').fill('Changed while agent worked');
  await page.evaluate(() =>
    window.__nextControl.emit({
      type: 'analysis',
      projectId: 'simulated:a',
      passageId: 'passage-a',
      status: 'ready-for-review',
    }),
  );
  await expect(sourceTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Grafia provável em Navarro')).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__nextControl.saved['simulated:a'].drafts['passage-a'].aiInput?.tentativeReading,
      ),
    )
    .toBe('Changed while agent worked');
  const revision = await page.evaluate(
    () => window.__nextControl.saved['simulated:a'].drafts['passage-a'].revisionId,
  );
  await aiTab(page).click();
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
  const result = await page.evaluate(() => ({
    accepted: window.__nextControl.requests.find((request) => request.method === 'analysis_accept'),
    draft: window.__nextControl.saved['simulated:a'].drafts['passage-a'],
  }));
  expect(result.accepted?.params.expectedDraftRevision).toBe(revision);
  expect(result.draft.translation).toBe('Minha tradução revisada.');
  expect(result.draft.aiInput?.tentativeReading).toBe('Changed while agent worked');
  expect(result.draft.aiAcceptances).toHaveLength(1);
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Desfazer', exact: true })
    .click();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await sourceTab(page).click();
  await expect(page.getByLabel('Tradução', { exact: true })).toHaveValue(
    'Minha tradução revisada.',
  );
  await expect(page.getByLabel('Grafia provável em Navarro')).toHaveValue(
    'Changed while agent worked',
  );
});

test('a draft edit during proposal loading cancels adoption without replacing the human work', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Prepared reading');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'analysis_get' }));
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((request) => request.method === 'analysis_get'),
      ),
    )
    .toBe(true);
  await sourceTab(page).click();
  await page.getByLabel('Tradução', { exact: true }).fill('Keep this concurrent human edit.');
  await page.evaluate(() => window.__nextControl.release('analysis_get'));
  await expect(sourceTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextControl.saved['simulated:a'].drafts['passage-a'].translation,
      ),
    )
    .toBe('Keep this concurrent human edit.');
  await aiTab(page).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'A passagem ou o rascunho mudou. Abra a proposta novamente.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) =>
        ['analysis_accept', 'source_apply', 'reference_approve'].includes(request.method),
      ),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
  expect(
    await page.evaluate(
      () => window.__nextControl.saved['simulated:a'].drafts['passage-a'].translation,
    ),
  ).toBe('Keep this concurrent human edit.');
});

test('failed draft save creates no job and leaves all source input intact', async ({ page }) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Keep this input');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextControl.saved['simulated:a']?.drafts['passage-a']?.diplomatic,
      ),
    )
    .toBe('Keep this input');
  await page.evaluate(() => window.__nextControl.holds.push({ method: 'draft_save' }));
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nextControl.pending.some((request) => request.method === 'draft_save'),
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.__nextControl.reject('draft_save', 'Simulated disk full'));
  await expect(page.getByText('Simulated disk full', { exact: false })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) => request.method === 'analysis_submit'),
    ),
  ).toHaveLength(0);
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue(
    'Keep this input',
  );
  await expect(sourceTab(page)).toHaveAttribute('aria-selected', 'true');
});

test('inspection adoption is undoable, preserves the receipt and reaches ordinary source review', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Prepared reading');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).click();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:beta');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextControl.saved['simulated:a'].drafts['passage-a'].aiAcceptances?.length,
      ),
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar edição da fonte', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar passagem', exact: true })).toBeVisible();
  const source = await page.evaluate(() =>
    window.__nextControl.requests.find((request) => request.method === 'source_preview'),
  );
  expect(source?.params.raw).toBe('beta');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Voltar sem aplicar', exact: true })
    .click();
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Desfazer', exact: true })
    .click();
  await expect(page.getByTestId('generated-surface')).toHaveText('SIMULADO:alpha');
  expect(
    await page.evaluate(
      () => window.__nextControl.saved['simulated:a'].drafts['passage-a'].aiAcceptances?.length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) =>
        ['source_apply', 'reference_approve'].includes(request.method),
      ),
    ),
  ).toHaveLength(0);
});

test('support pane migration preserves layout and remains usable in a narrow window', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'pydicate-studio:workspace:v1',
      JSON.stringify({
        version: 1,
        positions: { navigator: 'left', editor: 'center', source: 'bottom' },
        hidden: { navigator: true, editor: false, source: false },
        maximized: null,
        sizes: { left: 220, right: 390, bottom: 350 },
      }),
    ),
  );
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await expect(page.locator('[data-pane="source"]')).toHaveAttribute('data-position', 'bottom');
  await expect(page.locator('[data-pane="navigator"]')).toBeHidden();
  await page.setViewportSize({ width: 650, height: 900 });
  await page.getByRole('button', { name: 'Assistência IA', exact: true }).click();
  await expect(page.getByLabel('Mensagem para a IA')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('prepared passages queue as a batch and node assistance preserves the tree editor', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('First prepared source');
  const node = page.locator('[data-canvas-key="main:root"] > [aria-pressed]');
  await node.click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Perguntar à IA sobre este constituinte', exact: true })
    .click();
  await expect(aiTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Tarefa da análise')).toHaveValue('explain');
  await expect(page.getByLabel('Escopo da análise')).toHaveValue('constituent');
  await expect(page.getByLabel('Mensagem para a IA')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Montar a análise', exact: true })).toHaveClass(
    'active',
  );
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await sourceTab(page).click();
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Second prepared source');
  await aiTab(page).click();
  await page.getByRole('button', { name: 'Fila · 0', exact: true }).click();
  await page.getByText('Enviar passagens preparadas em lote', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Passagem 1', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Passagem 2', exact: true }).check();
  await page.getByRole('button', { name: 'Analisar 2 selecionada(s)', exact: true }).click();
  await expect(page.getByText('2 análise(s) na fila.', { exact: true })).toBeVisible();
  const submission = await page.evaluate(() =>
    window.__nextControl.requests.find((request) => request.method === 'analysis_submit_batch'),
  );
  expect(submission?.params.items as unknown[]).toHaveLength(2);
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((request) =>
        ['source_apply', 'reference_approve'].includes(request.method),
      ),
    ),
  ).toHaveLength(0);
});

test('paused analysis resumes the same job and conversation with partial response preserved', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Nhemöabaré.');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
  const before = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('simulated-analysis')!);
    saved.jobs[0].status = 'needs-input';
    saved.jobs[0].partialResponse = 'O início da interpretação foi preservado.';
    saved.jobs[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    saved.jobs[0].summary = '';
    saved.jobs[0].questions = [{ text: 'Pode confirmar a interpretação?' }];
    window.__nextControl.setAnalysis(saved);
    return saved.jobs[0];
  });
  await expect(page.getByText('IA · Resposta parcial', { exact: true })).toBeVisible();
  await expect(
    page.getByText('O início da interpretação foi preservado.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Responder', exact: true })).toBeVisible();
  await page.getByLabel('Mensagem para a IA').fill('Continue a análise da árvore.');
  await page.getByRole('button', { name: 'Retomar análise', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__nextControl.requests.filter((r) => r.method === 'analysis_resume').length,
      ),
    )
    .toBe(1);
  const resumed = await page.evaluate(() => ({
    request: window.__nextControl.requests.find((r) => r.method === 'analysis_resume')!.params,
    state: JSON.parse(localStorage.getItem('simulated-analysis')!),
    submits: window.__nextControl.requests.filter((r) => r.method === 'analysis_submit').length,
  }));
  expect(resumed.request).toMatchObject({
    jobId: before.id,
    instruction: 'Continue a análise da árvore.',
  });
  expect(resumed.state.jobs).toHaveLength(1);
  expect(resumed.state.jobs[0].conversationId).toBe(before.conversationId);
  expect(resumed.state.jobs[0].input).toEqual(before.input);
  expect(resumed.submits).toBe(1);
});

test('current tree translation opens without source transcription or a new analysis', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await expect(page.getByLabel('Transcrição diplomática', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Traduzir árvore atual', exact: true }).click();
  const translator = page.getByRole('region', { name: 'Tradução da árvore atual', exact: true });
  await expect(translator).toBeVisible();
  await expect(translator.getByLabel('Idioma da tradução')).toHaveValue('Português');
  await expect(
    translator.getByRole('button', { name: 'Gerar prompt de tradução', exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      window.__nextControl.requests.filter((r) =>
        ['analysis_submit', 'ai_start'].includes(r.method),
      ),
    ),
  ).toEqual([]);
});

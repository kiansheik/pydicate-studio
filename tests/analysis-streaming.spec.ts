import { expect, test, type Page } from '@playwright/test';
import { submitPassageAnalysis } from './explicit-analysis';

async function startFixture(page: Page) {
  await page.goto('/tests/next-hook-harness.html?workspace&analysis');
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('Fonte simulada');
  await submitPassageAnalysis(page);
  await expect(page.getByText('Proposta pronta', { exact: true })).toBeVisible();
}

/** Match the real compact list and full detail responses, advancing between reads. */
async function stream(page: Page, text: string, revision: number, summary?: string) {
  await page.evaluate(
    ({ text, revision, summary }) => {
      const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
      const job = state.jobs[0];
      job.status = summary ? 'ready-for-review' : 'running';
      job.input.task = 'grammar-repair';
      job.summary = summary;
      job.currentAttemptId = 'stream-attempt';
      job.candidateIds = [];
      job.events = [...text].map((text) => ({
        type: 'text-delta',
        attemptId: 'stream-attempt',
        text,
      }));
      job.updatedAt = new Date(Date.UTC(2026, 8, 30, 12, 0, revision)).toISOString();
      state.candidates = [];
      const conversation = state.conversations.find(
        (thread: { id: string }) => thread.id === job.conversationId,
      );
      window.__nextControl.responses.analysis_list = {
        ...state,
        jobs: [{ ...job, events: job.events.slice(-20) }],
        conversations: state.conversations.map((thread: Record<string, unknown>) => ({
          ...thread,
          turns: [],
        })),
      };
      window.__nextControl.responses.analysis_get = {
        job: {
          ...job,
          updatedAt: new Date(Date.UTC(2026, 8, 30, 12, 0, revision, 1)).toISOString(),
        },
        conversation,
        candidates: [],
      };
      window.__nextControl.setAnalysis(state);
    },
    { text, revision, summary },
  );
}

test('grammar-repair streaming keeps the full response when detail advances beyond the compact list', async ({
  page,
}) => {
  await startFixture(page);
  const first =
    'Vou conferir a regra e preservar a expressão original.\n\nA composição precisa manter todas as referências anteriores.';
  await stream(page, first, 1);
  const answer = page.locator('.analysis-answer p');
  await expect(answer).toHaveText(first);
  const next = first + '\n\nAgora verifico as outras passagens, sem alterar suas leituras.';
  await stream(page, next, 2);
  await expect(answer).toHaveText(next);
  await expect(page.locator('.analysis-answer strong').first()).toHaveText('IA · Respondendo…');
  await stream(page, next, 3, 'Verificação concluída. Todas as referências foram preservadas.');
  await expect(answer).toHaveText('Verificação concluída. Todas as referências foram preservadas.');
  await expect(page.locator('.analysis-answer')).toHaveCount(1);
});

test('incomplete streaming markup retains its text until the closing marker arrives', async ({
  page,
}) => {
  await startFixture(page);
  const answer = page.locator('.analysis-answer p');
  await stream(page, '**Conferindo a regra', 1);
  await expect(answer).toHaveText('**Conferindo a regra');
  await expect(answer.locator('strong')).toHaveCount(0);
  await stream(page, '**Conferindo a regra**\n`mo.var(2)', 2);
  await expect(answer).toHaveText('Conferindo a regra\n`mo.var(2)');
  await expect(answer.locator('strong')).toHaveText('Conferindo a regra');
  await expect(answer.locator('code')).toHaveCount(0);
  await stream(page, '**Conferindo a regra**\n`mo.var(2)` permanece.', 3);
  await expect(answer).toHaveText('Conferindo a regra\nmo.var(2) permanece.');
  await expect(answer.locator('code')).toHaveText('mo.var(2)');
});

test('a reply steers the running correction without creating a queued job and survives refresh', async ({
  page,
}) => {
  await startFixture(page);
  await stream(page, 'Estou verificando a regra.', 5);
  await page.evaluate(() => {
    delete window.__nextControl.responses.analysis_list;
    delete window.__nextControl.responses.analysis_get;
  });
  await page.getByLabel('Mensagem para a IA').fill('Generalize a regra para os compostos de ikó.');
  await page.getByRole('button', { name: 'Orientar correção em andamento' }).click();
  await expect(page.locator('.analysis-steering')).toContainText(
    'Orientação enviada à IA nesta correção.',
  );
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue('');
  await expect(page.locator('.analysis-job')).toHaveCount(1);
  const requests = await page.evaluate(() =>
    window.__nextControl.requests.filter((request) =>
      ['analysis_steer', 'analysis_submit'].includes(request.method),
    ),
  );
  expect(requests.filter((request) => request.method === 'analysis_submit')).toHaveLength(1);
  expect(requests.filter((request) => request.method === 'analysis_steer')).toHaveLength(1);
  expect(requests.at(-1)?.params.description).toBe('Generalize a regra para os compostos de ikó.');
  await page.reload();
  await expect(page.locator('.analysis-job')).toHaveCount(1);
  await expect(page.locator('.analysis-steering')).toContainText(
    'Generalize a regra para os compostos de ikó.',
  );
});

test('a queued follow-up keeps the running repair and its complete response visible', async ({
  page,
}) => {
  await startFixture(page);
  const response =
    'A correção inicial continua em execução. ' + 'Texto da resposta preservado. '.repeat(30);
  await stream(page, response, 5);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
    const parent = state.jobs[0];
    const child = {
      ...parent,
      id: 'queued-follow-up',
      parentJobId: parent.id,
      status: 'queued',
      phase: 'queued',
      input: { ...parent.input, description: 'Generalize a regra para todos os compostos.' },
      events: [],
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      currentAttemptId: undefined,
      summary: undefined,
    };
    state.jobs = [child, parent];
    window.__nextControl.responses.analysis_list = {
      ...state,
      jobs: [child, { ...parent, events: parent.events.slice(-20) }],
      conversations: state.conversations.map((thread: Record<string, unknown>) => ({
        ...thread,
        turns: [],
      })),
    };
    // The harness resolves full job details by ID from the saved fixture.
    delete window.__nextControl.responses.analysis_get;
    window.__nextControl.setAnalysis(state);
  });
  await expect(page.locator('.analysis-job')).toHaveCount(2);
  await expect(page.locator('.analysis-answer p')).toHaveText(response);
  await expect(
    page.getByText('Generalize a regra para todos os compostos.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.analysis-waiting')).toContainText(
    'Esta mensagem ainda não foi enviada à IA',
  );
  const details = await page.evaluate(() =>
    window.__nextControl.requests
      .filter((request) => request.method === 'analysis_get')
      .map((request) => request.params.jobId),
  );
  expect(details).toContain('job:1');
  await page.reload();
  await expect(page.locator('.analysis-job')).toHaveCount(2);
  await expect(page.locator('.analysis-answer p')).toHaveText(response);
});

test('grammar edit history labels reverted attempts without presenting their proposed code as applied', async ({
  page,
}) => {
  await startFixture(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('simulated-analysis')!);
    const job = state.jobs[0];
    job.input.task = 'grammar-repair';
    job.updatedAt = new Date(Date.now() + 1000).toISOString();
    job.grammarEdits = [
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `reverted-${index}`,
        path: 'grammar.py',
        oldText: 'original_rule()',
        newText: 'rejected_rule()',
        rolledBack: true,
      })),
      { id: 'applied', path: 'grammar.py', oldText: 'old_rule()', newText: 'checked_rule()' },
    ];
    window.__nextControl.setAnalysis(state);
  });
  const history = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Histórico de edições da gramática (4)' }) });
  await history.locator('summary').click();
  await expect(
    history.getByText('Tentativa revertida · não aplicada.', { exact: true }),
  ).toHaveCount(3);
  await expect(history.getByText('Edição aplicada.', { exact: true })).toHaveCount(1);
  const discarded = history.locator('pre').filter({ hasText: 'rejected_rule()' });
  await expect(discarded).toHaveCount(3);
  for (const block of await discarded.all()) {
    await expect(block).toHaveText(
      'Código preservado:\noriginal_rule()\n\nTentativa descartada:\nrejected_rule()',
    );
  }
  await expect(history.locator('pre').filter({ hasText: 'checked_rule()' })).toHaveText(
    'Antes:\nold_rule()\n\nDepois:\nchecked_rule()',
  );
});

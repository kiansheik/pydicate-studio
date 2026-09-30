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

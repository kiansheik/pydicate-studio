import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { StudioProject } from '../src/domain/types';
import type { LearningLibrary } from '../src/domain/learning';
const require = createRequire(import.meta.url);
const { PythonWorker } = require('../electron/python-worker.cjs');
const parent = process.env.PYDICATE_PROJECT_PARENT ?? path.resolve('..');
let worker: InstanceType<typeof PythonWorker>;
let project: StudioProject;
let library: LearningLibrary;
let temporary: string;
let protectedFiles: Record<string, string>;
const requests: { method: string; params: Record<string, unknown> }[] = [];
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test.beforeAll(async () => {
  test.skip(
    !existsSync(path.join(parent, 'oldtupicorpus/historic')) ||
      !existsSync(path.join(parent, 'nhe-enga/pydicate/pydicate')),
    'Selected local corpus and engine are not installed',
  );
  temporary = await mkdtemp(path.join(tmpdir(), 'studio-learning-test-'));
  worker = new PythonWorker({
    script: path.resolve('python/worker.py'),
    stateDirectory: temporary,
  });
  project = await worker.request('open_project', { parentPath: parent });
  library = await worker.request('learning_library', {
    projectId: project.id,
    engineFingerprint: project.engineFingerprint,
  });
  protectedFiles = {};
  for (const directory of ['historic', 'ground_truth/records/historic']) {
    const root = path.join(parent, 'oldtupicorpus', directory);
    for (const name of await readdir(root)) {
      if (!name.endsWith('.tu.py') && !name.endsWith('.jsonl')) continue;
      const file = path.join(root, name);
      protectedFiles[file] = digest(await readFile(file));
    }
  }
});
test.afterAll(async () => {
  worker?.close();
  for (const [file, before] of Object.entries(protectedFiles ?? {}))
    expect(digest(await readFile(file))).toBe(before);
  if (temporary) await rm(temporary, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    console.error(error.message);
  });
  requests.length = 0;
  const aiRecords: Record<string, unknown>[] = [];
  await page.exposeFunction(
    '__learningRpc',
    async (method: string, params: Record<string, unknown>) => {
      requests.push({ method, params });
      if (method === 'learning_test_project') return project;
      if (method === 'ai_status')
        return { config: { provider: 'codex', models: { codex: 'SIMULATED', claude: '' } } };
      if (method === 'ai_history') return aiRecords;
      if (method === 'ai_start') {
        aiRecords.push({
          ...params,
          context: params.context,
          status: 'completed',
          text: 'Resposta simulada para testar a interface.',
          suggestion: { explanation: 'Resposta simulada para testar a interface.' },
          startedAt: new Date().toISOString(),
        });
        return { requestId: params.requestId };
      }
      if (['source_apply', 'reference_approve', 'source_preview'].includes(method))
        throw new Error('Tutorial must never publish');
      return worker.request(method, params);
    },
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, 'studio', {
      value: {
        invoke: (method: string, params: unknown) =>
          (
            window as unknown as {
              __learningRpc: (method: string, params: unknown) => Promise<unknown>;
            }
          ).__learningRpc(method, params),
      },
    });
  });
  await page.goto('/tests/learning-harness.html');
  await expect(page.getByRole('heading', { name: 'Ligar duas peças' })).toBeVisible();
});

test('five real examples evaluate, quiz checks and isolated progress resume', async ({ page }) => {
  test.setTimeout(90_000);
  for (const [index, lesson] of library.lessons.entries()) {
    await page
      .getByRole('complementary', { name: 'Lições' })
      .getByRole('button', { name: new RegExp(lesson.title) })
      .click();
    await page.getByText('Código da tentativa', { exact: true }).click();
    await page.getByLabel('Expressão da prática').fill(lesson.steps.at(-1)!.raw);
    await expect(page.getByTestId('lesson-surface')).toHaveText(lesson.reference!);
    await page.getByLabel(lesson.choices[lesson.answer], { exact: true }).check();
    await page.getByRole('button', { name: 'Conferir lição' }).click();
    await expect(page.getByRole('status', { name: 'Conferência da lição' })).toContainText(
      'Lição concluída:',
    );
    expect(
      requests.some((request) => /source_apply|reference_approve|draft_save/.test(request.method)),
    ).toBe(false);
    if (!index) {
      await page.locator('.lesson-practice').evaluate((element) => (element.scrollTop = 0));
      await page.screenshot({ path: 'test-results/learning-desktop.png', fullPage: true });
      const nodes = page.locator('.lesson-tree svg');
      expect(await nodes.count()).toBeGreaterThan(0);
    }
  }
  await page.getByRole('button', { name: 'Voltar ao trabalho' }).click();
  await page.getByRole('button', { name: 'Aprender', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Lições' }).getByText('concluída', { exact: false }),
  ).toHaveCount(5);
  await page.reload();
  await expect(
    page.getByRole('complementary', { name: 'Lições' }).getByText('concluída', { exact: false }),
  ).toHaveCount(5);
});

test('a beginner builds the first lesson with word search and tree connectors', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const lesson = library.lessons[0];
  await expect(page.getByTestId('lesson-surface')).toHaveText(lesson.steps[0].evaluation!.surface);
  const feedback = page.getByRole('status', { name: 'Montagem da etapa' });
  await expect(feedback).toContainText('Etapa conferida.');
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Etapa atual' })).toContainText(
    'Etapa 2 de 2: Complete o argumento',
  );
  await expect(feedback).toContainText('Monte o conjunto descrito nesta etapa.');
  const search = page.getByRole('combobox', {
    name: 'Adicionar peça: buscar em tupi',
    exact: true,
  });
  await search.fill('Espírito Santo');
  const existing = page.getByRole('option').filter({
    has: page.locator('code').filter({ hasText: /^espirito_santo$/ }),
  });
  await expect(existing.first()).toBeVisible({ timeout: 30_000 });
  await existing.first().click();

  // Search adds an independent piece: it must not silently replace the tree.
  const main = page.locator('[data-canvas-key="main:root"]');
  const added = page.locator('[data-canvas-key]').filter({
    has: page.getByRole('button', { name: 'Conectar espirito_santo', exact: true }),
  });
  await expect(main.getByRole('button', { name: 'Conectar arobiar', exact: true })).toBeVisible();
  await expect(added).toHaveCount(1);
  await expect(page.getByTestId('lesson-surface')).toHaveText(lesson.steps[0].evaluation!.surface);
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await added.getByRole('button', { name: 'Conectar espirito_santo', exact: true }).click();
  await main.getByRole('button', { name: 'Conectar arobiar', exact: true }).click();
  const combine = page.getByRole('dialog', { name: 'Combinar peças', exact: true });
  await expect(combine).toBeVisible();
  await combine.getByRole('combobox', { name: 'Operação para combinar peças' }).selectOption('*');
  await combine.getByRole('button', { name: 'Combinar peças', exact: true }).click();
  await expect(page.getByTestId('lesson-surface')).toHaveText(lesson.reference!);
  await expect(feedback).toContainText('Montagem conferida.');
  await page.getByLabel(lesson.choices[lesson.answer], { exact: true }).check();
  await page.getByRole('button', { name: 'Conferir lição' }).click();
  await expect(page.getByRole('status', { name: 'Conferência da lição' })).toContainText(
    'Lição concluída:',
  );
  await expect(feedback).toHaveText(
    'Lição concluída. Você pode continuar ou explorar esta árvore.',
  );
  expect(requests.some((request) => request.method === 'structure_search')).toBe(true);
  expect(requests.some((request) => request.method === 'structure_resolve')).toBe(true);
  expect(
    requests.some((request) =>
      /source_apply|reference_approve|draft_save|ai_start/.test(request.method),
    ),
  ).toBe(false);
  await page.locator('.lesson-practice').evaluate((element) => (element.scrollTop = 0));
  await page.screenshot({ path: 'test-results/learning-mouse-completion.png', fullPage: true });
});

test('real tree operation, undo and incomplete input never alter the corpus', async ({ page }) => {
  const lesson = library.lessons[3];
  await page
    .getByRole('complementary', { name: 'Lições' })
    .getByRole('button', { name: new RegExp(lesson.title) })
    .click();
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir modelo desta etapa' }).click();
  await page.getByRole('button', { name: 'Substituir tentativa', exact: true }).click();
  await expect(page.getByTestId('lesson-surface')).toHaveText('Ainda sem forma completa');
  await page.getByText('Código da tentativa', { exact: true }).click();
  await page.getByLabel('Expressão da prática').fill('(');
  await expect(page.getByRole('alert')).toContainText('incompleta');
  await expect(page.getByRole('button', { name: 'Conferir lição' })).toBeDisabled();
  await page.getByLabel('Expressão da prática').fill(lesson.steps.at(-1)!.raw);
  await expect(page.getByTestId('lesson-surface')).toHaveText(lesson.reference!);
  await page.getByRole('button', { name: 'Editar argumento 1 de .var', exact: true }).click();
  await page.getByRole('textbox', { name: 'Valor do argumento', exact: true }).fill('0');
  await page.getByRole('textbox', { name: 'Valor do argumento', exact: true }).press('Enter');
  await expect(page.getByLabel('Expressão da prática')).toHaveValue(/\.var\(0\)/);
  await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.getByLabel('Expressão da prática')).toHaveValue(lesson.steps.at(-1)!.raw);
  await expect(page.getByTestId('lesson-surface')).toHaveText(lesson.reference!);
  await page.getByRole('button', { name: 'Conferir lição' }).click();
  await expect(page.getByRole('status', { name: 'Conferência da lição' })).toContainText(
    'Falta responder',
  );
});

test('reference search, source signatures and narrow layout', async ({ page }) => {
  await page.getByRole('button', { name: 'Referência', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar na referência' }).fill('var');
  await page
    .locator('.reference-list')
    .getByRole('button', { name: '.var(): selecionar uma variante', exact: true })
    .click();
  await expect(page.getByRole('article', { name: 'Verbete da referência' })).toContainText(
    'Predicate.var',
  );
  await expect(page.getByRole('article')).toContainText('No editor');
  await page.getByRole('button', { name: 'Predicate.var(self, setter)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Predicate.var' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar na referência' }).fill('nao-existe');
  await expect(page.getByText('Nenhum resultado.', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar na referência' }).fill('');
  await page.getByRole('button', { name: 'Exemplos', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar na referência' }).fill('bettendorff .redup');
  await expect(
    page.getByText('Coincide com a referência aprovada.', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/reference-mobile.png', fullPage: true });
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Cinco lições · 10 min' }).click();
  await expect(page.getByTestId('lesson-surface')).toHaveText(
    library.lessons[0].steps[0].evaluation!.surface,
  );
  await page.locator('.lesson-tree').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/learning-mobile.png', fullPage: true });
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Voltar ao trabalho' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('question captures the lesson attempt using a simulated provider only', async ({ page }) => {
  await page.getByRole('button', { name: 'Tenho uma dúvida' }).click();
  await page.getByLabel('Minha pergunta').fill('Por que arobiar é uma só peça?');
  await page.getByRole('button', { name: 'Enviar pergunta à IA' }).click();
  await expect(
    page.getByText('Resposta simulada para testar a interface.', { exact: true }),
  ).toBeVisible();
  const sent = requests.find((request) => request.method === 'ai_start')!.params;
  expect(sent.action).toBe('explain');
  expect(sent.context).toMatchObject({ learningLessonId: 'ligar', raw: 'arobiar', ordinal: 38 });
  expect(sent.passageId).toBe(
    project.passages.find(
      (passage) => passage.sourceId === 'araujo_catecismo_1686' && passage.ordinal === 38,
    )!.id,
  );
});

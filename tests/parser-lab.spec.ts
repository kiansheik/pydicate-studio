import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { StudioProject } from '../src/domain/types';

const require = createRequire(import.meta.url);
const { PythonWorker } = require('../electron/python-worker.cjs');
const parent = process.env.PYDICATE_PROJECT_PARENT ?? path.resolve('..');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

let worker: InstanceType<typeof PythonWorker>;
let project: StudioProject;
let temporary: string;
let artifacts: string;
let lab: { request: (method: string, params: unknown) => Promise<unknown>; close: () => void };
let protectedFiles: Record<string, string>;
const requests: { method: string; params: Record<string, unknown> }[] = [];

/** Minimal NDJSON client for the real laboratory worker, mirroring the service. */
function startLab(artifactDirectory: string) {
  const child = spawn(
    process.env.PYDICATE_PYTHON || 'python3',
    [
      '-B',
      path.resolve('python/parser_lab/worker.py'),
      '--parent',
      parent,
      '--artifacts',
      artifactDirectory,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } },
  );
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (e: Error) => void }
  >();
  let buffer = '';
  let sequence = 0;
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiting = pending.get(message.id);
      if (!waiting) continue;
      pending.delete(message.id);
      if (message.error)
        waiting.reject(Object.assign(new Error(message.error.message), message.error));
      else waiting.resolve(message.result);
    }
  });
  return {
    request(method: string, params: unknown) {
      const id = ++sequence;
      return new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    },
    close: () => child.kill('SIGTERM'),
  };
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  temporary = await mkdtemp(path.join(tmpdir(), 'parser-lab-spec-'));
  artifacts = path.join(temporary, 'artifacts');
  worker = new PythonWorker({
    script: path.resolve('python/worker.py'),
    stateDirectory: temporary,
  });
  project = await worker.request('open_project', { parentPath: parent });
  protectedFiles = {};
  for (const directory of ['historic', 'ground_truth/records/historic']) {
    const root = path.join(parent, 'oldtupicorpus', directory);
    for (const name of await readdir(root)) {
      if (!name.endsWith('.tu.py') && !name.endsWith('.jsonl')) continue;
      const file = path.join(root, name);
      protectedFiles[file] = digest(await readFile(file));
    }
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.env.PYDICATE_PYTHON || 'python3',
      [
        '-B',
        path.resolve('scripts/parser-lab/cli.py'),
        '--parent',
        parent,
        '--artifacts',
        artifacts,
        'prepare',
        '--profile',
        'smoke',
        '--activate',
      ],
      { stdio: 'ignore' },
    );
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`preparation failed (${code})`)),
    );
  });
  lab = startLab(artifacts);
});

test.afterAll(async () => {
  lab?.close();
  worker?.close();
  for (const [file, before] of Object.entries(protectedFiles ?? {}))
    expect(digest(await readFile(file))).toBe(before);
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  requests.length = 0;
  page.on('pageerror', (error) => console.error(error.message));
  await page.exposeFunction('__labRpc', async (method: string, params: Record<string, unknown>) => {
    requests.push({ method, params });
    if (method === 'parser_lab_test_project') return project;
    if (['source_apply', 'reference_approve', 'draft_save'].includes(method))
      throw new Error('O laboratório nunca publica nem aprova.');
    if (method === 'parser_lab_status')
      return {
        projectId: project.id,
        engineFingerprint: project.engineFingerprint,
        artifactRoot: artifacts,
        ...((await lab.request('status', {})) as Record<string, unknown>),
        exists: true,
        profiles: [],
        jobs: [],
        busy: false,
        workerRunning: true,
        note: '',
      };
    const direct: Record<string, string> = {
      parser_lab_analyze: 'analyze',
      parser_lab_parse: 'parse',
      parser_lab_evaluate: 'evaluate',
      parser_lab_collisions: 'collisions',
      parser_lab_optional: 'optional_status',
      parser_lab_judgment: 'judgment_add',
    };
    if (direct[method])
      return lab.request(
        direct[method],
        method === 'parser_lab_judgment' ? params.judgment : params,
      );
    throw new Error(`Unexpected laboratory operation: ${method}`);
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'studio', {
      value: {
        invoke: (method: string, params: unknown) =>
          (window as unknown as { __labRpc: (m: string, p: unknown) => Promise<unknown> }).__labRpc(
            method,
            params,
          ),
        copyText: () => Promise.resolve(),
      },
    });
  });
  await page.goto('/tests/parser-lab-harness.html');
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toBeVisible();
});

test('a composed sentence shows its normalized input, morphemes and editable tree', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.getByTestId('lab-input').fill('Asó xe rokype');
  await expect(page.getByTestId('lab-normalized')).toContainText('asoxerokype');
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-status')).toContainText('Análise completa');
  await expect(page.getByTestId('lab-candidates')).toContainText(
    '(+ixé * só) + (pe * (ixé * oka))',
  );
  await expect(page.getByTestId('lab-candidates')).toContainText('Composta de fragmentos');
  await expect(page.getByTestId('lab-surface')).toHaveText('asó xe rokype');
  const morphemes = page.getByTestId('lab-morphemes');
  await expect(morphemes).toContainText('SUBJECT_PREFIX:1ps');
  await expect(morphemes).toContainText('PLURIFORM_PREFIX:R');
  await expect(morphemes).toContainText('POSTPOSITION:LOCATIVE');
  expect(await page.locator('.lab-tree svg').count()).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/parser-lab-desktop.png', fullPage: true });
});

test('editing the possessor in the code changes the realized form and undo restores it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.getByTestId('lab-input').fill('Asó xe rokype');
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó xe rokype');
  await page.getByTestId('lab-code').fill('(+ixé * só) + (pe * (nde * oka))');
  await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó nde rokype');
  const editor = page.locator('.lab-editor');
  await editor.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.getByTestId('lab-code')).toHaveValue('(+ixé * só) + (pe * (ixé * oka))');
  await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó xe rokype');
  await editor.getByRole('button', { name: 'Refazer edição na árvore', exact: true }).click();
  await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó nde rokype');
  expect(requests.some((request) => /source_apply|reference_approve/.test(request.method))).toBe(
    false,
  );
});

test('a tree gesture rewrites the laboratory source and re-evaluates it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByTestId('lab-input').fill('xe roka');
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-code')).toHaveValue('(ixé * oka)');
  await expect(page.getByTestId('lab-editor-surface')).toHaveText('xe roka');
  const tree = page.locator('.lab-tree');
  await tree.getByRole('button', { name: 'Ajustar', exact: true }).click();
  // A real context-menu gesture on the real editor, not a simulated one.
  await tree.locator('.canvas-node').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Escolher variante…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
  await dialog.getByRole('button', { name: 'Criar operação', exact: true }).click();
  await expect(page.getByTestId('lab-code')).toHaveValue(/\.var\(/);
  const editor = page.locator('.lab-editor');
  await editor.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
  await expect(page.getByTestId('lab-code')).toHaveValue('(ixé * oka)');
  await expect(page.getByTestId('lab-editor-surface')).toHaveText('xe roka');
});

test('spacing, case and accent variants give the same analysis; unknown input stays unknown', async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const value of ['ASOXEROKYPE', 'a so xé ró kŷ pe', 'Asó, xe rokype.']) {
    await page.getByTestId('lab-input').fill(value);
    await page.getByTestId('lab-analyse').click();
    await expect(page.getByTestId('lab-normalized')).toContainText('asoxerokype');
    await expect(page.getByTestId('lab-candidates')).toContainText(
      '(+ixé * só) + (pe * (ixé * oka))',
    );
  }
  for (const value of ['zzzz', 'Açó xe rokîpe']) {
    await page.getByTestId('lab-input').fill(value);
    await page.getByTestId('lab-analyse').click();
    await expect(page.getByTestId('lab-status')).toContainText(
      'Nenhuma análise completa foi validada',
    );
    await expect(page.getByTestId('lab-candidates')).toHaveCount(0);
  }
});

test('a sentence absent from the recorded expressions is still composed', async ({ page }) => {
  test.setTimeout(120_000);
  const status = (await lab.request('analyze', { text: 'ereso nde rokype' })) as {
    configuration: { diagnostics: { knownExpression: boolean } };
  };
  expect(status.configuration.diagnostics.knownExpression).toBe(false);
  await page.getByTestId('lab-input').fill('ereso nde rokype');
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-candidates')).toContainText(
    '(+nde * só) + (pe * (nde * oka))',
  );
  await expect(page.getByTestId('lab-surface')).toHaveText('eresó nde rokype');
});

test('both readings of an ambiguous form are shown, and choosing one sticks', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByTestId('lab-input').fill('sapépe');
  await page.getByTestId('lab-analyse').click();
  const candidates = page.getByTestId('lab-candidates');
  await expect(candidates.locator('li')).toHaveCount(2);
  await expect(candidates).toContainText('(pe * apé)');
  await expect(candidates).toContainText('(pe * (ae * apé))');
  // The grammar's own annotation says exactly what separates them.
  await expect(candidates).toContainText('PLURIFORM_PREFIX:S:ABSOLUTE');
  await expect(page.getByTestId('lab-acceptance')).toContainText('a forma não decide entre elas');

  // Choose the second reading; the choice is recorded and applied at once.
  await candidates.locator('li').nth(1).locator('button').first().click();
  await page.getByTestId('lab-choose-1').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Registrado no laboratório' }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await candidates.locator('li').first().innerText()).includes('(pe * (ae * apé))'),
    )
    .toBe(true);
  await expect(candidates.locator('li').first()).toContainText('leitura que você confirmou');
  await expect(page.getByTestId('lab-acceptance')).toContainText('Confirmada por você');

  const judgments = (await lab.request('judgment_list', { limit: 5 })) as {
    judgments: { verdict: string; shownSources: string[]; chosenRank: number }[];
  };
  expect(judgments.judgments[0].verdict).toBe('accepted');
  expect(judgments.judgments[0].shownSources).toHaveLength(2);
  expect(judgments.judgments[0].chosenRank).toBe(2);
});

test('an explicit transfer is confirmed before it reaches a draft', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByTestId('lab-input').fill('Asó xe rokype');
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó xe rokype');
  await page.getByRole('button', { name: 'Levar para um rascunho' }).click();
  expect(
    await page.evaluate(() => (window as never as { __labTransfers: string[] }).__labTransfers),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Manter só no laboratório' }).click();
  await page.getByRole('button', { name: 'Levar para um rascunho' }).click();
  await page.getByRole('button', { name: 'Levar para o rascunho' }).click();
  expect(
    await page.evaluate(() => (window as never as { __labTransfers: string[] }).__labTransfers),
  ).toEqual(['(+ixé * só) + (pe * (ixé * oka))']);
});

test('optional neural and agent routes report their real state, never a placeholder success', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Treinar' }).click();
  await page.getByRole('button', { name: 'Conferir disponibilidade' }).click();
  const optional = page.getByTestId('lab-optional');
  await expect(optional).toContainText('"trained": false');
  await expect(optional).toContainText('"ran": false');
  await expect(optional).toContainText('byt5-small');
});

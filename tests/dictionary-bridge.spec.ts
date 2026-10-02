import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  transformHtml,
  transformScript,
  transformStyles,
} = require('../runtime/dictionary/transform.cjs');
const root = path.resolve(process.env.PYDICATE_PROJECT_PARENT ?? '..', 'nhe-enga');
test('real local dictionary retains senses, conjugations and citation browsing while emitting exact selected identity', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  test.skip(
    !existsSync(path.join(root, 'index.html')),
    'Local dictionary checkout is unavailable.',
  );
  const data = await readFile(path.join(root, 'docs/dict-conjugated.json.gz'));
  const fingerprint = `sha256:${createHash('sha256').update(data).digest('hex')}`;
  const rows = JSON.parse(gunzipSync(data).toString());
  const expected = rows.findIndex(
    (row: { f: string; o: string }) => row.f === 'pysyrõ' && row.o === '1',
  );
  const remote: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(`${origin}/`)) remote.push(request.url());
  });
  await page.addInitScript(() => {
    Object.assign(window, { dictionaryMessages: [] });
    window.addEventListener('message', (event) =>
      (window as unknown as { dictionaryMessages: unknown[] }).dictionaryMessages.push(event.data),
    );
  });
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const bridge = url.pathname.startsWith('/__studio_dictionary/');
    let relative = bridge
      ? url.pathname.slice('/__studio_dictionary/'.length)
      : url.pathname.slice('/nhe-enga/'.length);
    if (relative === '' || relative.endsWith('/')) relative += 'index.html';
    const base = bridge ? path.resolve('runtime/dictionary') : root;
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep) || !(await stat(file).catch(() => null))?.isFile())
      return route.fulfill({ status: 404, body: 'Missing local asset' });
    let body: string | Buffer = await readFile(file);
    if (!bridge && relative === 'index.html')
      body = transformHtml(body.toString(), {
        datasetFingerprint: fingerprint,
        parentOrigin: origin,
      });
    if (!bridge && relative === 'js/index.js') body = transformScript(body.toString());
    if (!bridge && relative === 'styles.css') body = transformStyles(body.toString());
    const contentType =
      (
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.gz': 'application/gzip',
          '.csv': 'text/csv',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
        } as Record<string, string>
      )[path.extname(file)] ?? 'application/octet-stream';
    await route.fulfill({ body, contentType });
  });
  await page.goto('/nhe-enga/');
  const input = page.getByPlaceholder('Digite a palavra a ser pesquisada');
  await expect(input).toBeEnabled();
  await input.fill('pysyrõ');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { dictionaryMessages: { type: string }[] }).dictionaryMessages.filter(
          (message) => message.type === 'studio-dictionary-navigation',
        ),
      ),
    )
    .toEqual([
      {
        type: 'studio-dictionary-navigation',
        version: 1,
        entryIndex: null,
        query: 'pysyrõ',
        datasetFingerprint: fingerprint,
      },
    ]);
  expect(new URL(page.url()).search).toBe('');
  const entries = page
    .locator('#results > .entry')
    .filter({ has: page.locator('.preview > a.search-link').filter({ hasText: /^pysyrõ$/ }) });
  await expect(entries).toHaveCount(4);
  const selected = page.locator(`[data-studio-entry-index="${expected}"]`);
  await selected.locator('.preview > a.search-link').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { dictionaryMessages: { type: string }[] }).dictionaryMessages.filter(
          (message) => message.type === 'studio-dictionary-select',
        ),
      ),
    )
    .toEqual([
      {
        type: 'studio-dictionary-select',
        version: 1,
        entryIndex: expected,
        datasetFingerprint: fingerprint,
      },
    ]);
  await expect(input).toHaveValue('pysyrõ');
  await page.locator('#toggleContainer').click();
  await expect(selected.locator('.options-container').first()).toBeVisible();
  const citation = selected.locator('a[href*="/docs/primary_sources/"]').first();
  await citation.click();
  await expect(page.getByRole('dialog', { name: 'Fonte citada' })).toBeVisible();
  await expect(page.getByTitle('Página da fonte citada')).toHaveAttribute('src', /book_name=/);
  await page.getByRole('button', { name: 'Voltar ao dicionário' }).click();
  await expect(input).toHaveValue('pysyrõ');
  await expect(entries).toHaveCount(4);
  await selected.getByRole('button', { name: 'Adicionar pysyrõ à árvore' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { dictionaryMessages: { type: string }[] }
          ).dictionaryMessages.filter((message) => message.type === 'studio-dictionary-select')
            .length,
      ),
    )
    .toBe(2);
  const reveal = {
    type: 'studio-dictionary-reveal',
    version: 1,
    entryIndex: expected,
    query: '',
    datasetFingerprint: fingerprint,
  };
  await page.evaluate((message) => window.postMessage(message, location.origin), reveal);
  await expect(page.locator('#results > .entry')).toHaveCount(1);
  await expect(selected).toBeVisible();
  // Restoring a link only reveals the exact sense; it never sends an import.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { dictionaryMessages: { type: string }[] }).dictionaryMessages.filter(
          (message) => message.type === 'studio-dictionary-select',
        ).length,
    ),
  ).toBe(2);
  await page.evaluate((message) => window.postMessage(message, location.origin), {
    ...reveal,
    entryIndex: null,
    query: 'pysyrõ',
    datasetFingerprint: 'sha256:' + '0'.repeat(64),
  });
  await page.evaluate(
    (message) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          source: window,
          origin: 'https://outside.invalid',
        }),
      ),
    { ...reveal, entryIndex: null, query: 'pysyrõ' },
  );
  await page.evaluate((message) => window.postMessage(message, location.origin), {
    ...reveal,
    entryIndex: null,
    query: 'pysyrõ',
    extra: true,
  });
  await expect(page.locator('#results > .entry')).toHaveCount(1);
  await page.evaluate((message) => window.postMessage(message, location.origin), {
    ...reveal,
    entryIndex: null,
    query: 'pysyrõ',
  });
  await expect(entries).toHaveCount(4);
  // Restoring the search must not produce another navigation/history event.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { dictionaryMessages: { type: string }[] }).dictionaryMessages.filter(
          (message) => message.type === 'studio-dictionary-navigation',
        ).length,
    ),
  ).toBe(1);
  expect(remote).toEqual([]);
});

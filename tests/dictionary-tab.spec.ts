import { expect, test, type Page } from '@playwright/test';

const fingerprint = 'sha256:' + 'a'.repeat(64);
const selection = (entryIndex = 1) => ({
  type: 'studio-dictionary-select',
  version: 1,
  entryIndex,
  datasetFingerprint: fingerprint,
});
async function open(page: Page) {
  await page.goto('/tests/dictionary-harness.html');
  await page.getByRole('button', { name: 'Abrir aba', exact: true }).click();
  await expect(page.getByTitle('Dicionário de tupi antigo', { exact: true })).toBeVisible();
}
async function choose(page: Page, index = 1) {
  await page.evaluate((message) => window.dictionaryControl.send(message), selection(index));
}

test('controlled dictionary links reveal without conversion or insertion and reject another dataset', async ({
  page,
}) => {
  await page.route('**/nhe-enga/?*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><body>Navarro<script>window.reveals=[]; addEventListener('message', e => window.reveals.push(e.data));</script></body></html>`,
    }),
  );
  await page.goto('/tests/dictionary-harness.html');
  await page.evaluate((fingerprint) => {
    window.dictionaryControl.status.url = window.dictionaryControl.status.url!.replace(
      'studio://dictionary',
      location.origin,
    );
    window.dictionaryControl.setNavigation({ entryIndex: 1, datasetFingerprint: fingerprint });
  }, fingerprint);
  await page.getByRole('button', { name: 'Abrir aba', exact: true }).click();
  await expect(page.getByTitle('Dicionário de tupi antigo', { exact: true })).toBeVisible();
  const reveals = () =>
    page.evaluate(
      () =>
        (document.querySelector('iframe')!.contentWindow as Window & { reveals: unknown[] })
          .reveals,
    );
  await expect.poll(reveals).toContainEqual({
    type: 'studio-dictionary-reveal',
    version: 1,
    entryIndex: 1,
    query: '',
    datasetFingerprint: fingerprint,
  });
  await page.evaluate(() => {
    window.dictionaryControl.frame = document.querySelector('iframe')!;
    window.dictionaryControl.setNavigation({ query: 'pysyrõ' });
  });
  await expect.poll(reveals).toContainEqual({
    type: 'studio-dictionary-reveal',
    version: 1,
    entryIndex: null,
    query: 'pysyrõ',
    datasetFingerprint: fingerprint,
  });
  const beforeStale = (await reveals()).length;
  await page.evaluate(() =>
    window.dictionaryControl.setNavigation({
      entryIndex: 1,
      datasetFingerprint: 'sha256:' + 'b'.repeat(64),
    }),
  );
  await expect(page.locator('.dictionary-tab').getByRole('status')).toContainText(
    'outra versão do dicionário',
  );
  expect((await reveals()).length).toBe(beforeStale);
  await page.evaluate(
    (fingerprint) =>
      window.dictionaryControl.setNavigation({ entryIndex: 1, datasetFingerprint: fingerprint }),
    fingerprint,
  );
  await expect.poll(async () => (await reveals()).length).toBe(beforeStale + 1);
  expect(
    await page.evaluate(() => window.dictionaryControl.frame === document.querySelector('iframe')),
  ).toBe(true);
  expect(await page.evaluate(() => window.dictionaryControl.navigations)).toEqual([]);
  const beforeSearch = (await reveals()).length;
  await page.evaluate(
    (fingerprint) =>
      window.dictionaryControl.send(
        {
          type: 'studio-dictionary-navigation',
          version: 1,
          entryIndex: null,
          query: 'abá',
          datasetFingerprint: fingerprint,
        },
        location.origin,
      ),
    fingerprint,
  );
  await expect
    .poll(() => page.evaluate(() => window.dictionaryControl.navigations))
    .toEqual([{ query: 'abá' }]);
  expect((await reveals()).length).toBe(beforeSearch);
  expect(
    await page.evaluate(() => window.dictionaryControl.requests.map((item) => item.method)),
  ).toEqual(['dictionary_status']);
  await expect(page.locator('#insertions')).toHaveText('0');
});

test('explicit dictionary navigation notifies the parent while restored navigation cancels late imports', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.dictionaryControl.setNavigation(null));
  await choose(page);
  await expect(page.locator('#insertions')).toHaveText('1');
  expect(await page.evaluate(() => window.dictionaryControl.navigations)).toEqual([
    { entryIndex: 1, datasetFingerprint: fingerprint },
  ]);
  await page.evaluate(() => {
    window.dictionaryControl.hold = true;
  });
  await choose(page, 3);
  await expect.poll(() => page.evaluate(() => window.dictionaryControl.pending.length)).toBe(1);
  await page.evaluate(
    (fingerprint) =>
      window.dictionaryControl.setNavigation({ entryIndex: 2, datasetFingerprint: fingerprint }),
    fingerprint,
  );
  await expect(page.getByRole('region', { name: 'Adicionar verbete à árvore' })).toHaveCount(0);
  await page.evaluate(() => window.dictionaryControl.pending.shift()!.resolve());
  await expect(page.locator('#insertions')).toHaveText('1');
  await page.evaluate(
    (fingerprint) =>
      window.dictionaryControl.send({
        type: 'studio-dictionary-navigation',
        version: 1,
        entryIndex: null,
        query: 'abá',
        datasetFingerprint: fingerprint,
      }),
    fingerprint,
  );
  await expect
    .poll(() => page.evaluate(() => window.dictionaryControl.navigations.at(-1)))
    .toEqual({ query: 'abá' });
});

// The custom desktop protocol itself is covered natively. Here MessageEvents and
// conversion RPCs are explicitly simulated to isolate origin/context race contracts.
test('dictionary loads once on first use and keeps the same sandboxed iframe across hidden tabs and passage changes', async ({
  page,
}) => {
  await page.goto('/tests/dictionary-harness.html');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => window.dictionaryControl.requests)).toEqual([]);
  await page.getByRole('button', { name: 'Abrir aba', exact: true }).click();
  const frame = page.getByTitle('Dicionário de tupi antigo', { exact: true });
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  await expect(frame).toHaveAttribute(
    'src',
    /studio:\/\/dictionary\/nhe-enga\/\?projectId=dictionary-fixture&dataset=sha256/,
  );
  await page.evaluate(() => {
    window.dictionaryControl.frame = document.querySelector('iframe')!;
  });
  await page.getByRole('button', { name: 'Fechar aba', exact: true }).click();
  await expect(frame).toBeHidden();
  await page.evaluate(() => window.dictionaryControl.setContext('r2'));
  await page.getByRole('button', { name: 'Abrir aba', exact: true }).click();
  expect(
    await page.evaluate(() => window.dictionaryControl.frame === document.querySelector('iframe')),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      window.dictionaryControl.requests.filter((request) => request.method === 'dictionary_status'),
    ),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Atualizar dicionário', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.dictionaryControl.requests.filter(
            (request) => request.method === 'dictionary_status',
          ).length,
      ),
    )
    .toBe(2);
});

test('only the current dictionary iframe, origin, pinned dataset and bounded exact message can insert', async ({
  page,
}) => {
  await open(page);
  await page.evaluate((good) => {
    const send = window.dictionaryControl.send;
    send(good, 'https://outside.invalid');
    send(good, 'studio://dictionary', 'parent');
    for (const value of [
      null,
      [],
      { ...good, entryIndex: -1 },
      { ...good, entryIndex: 1.5 },
      { ...good, entryIndex: 1_000_001 },
      { ...good, datasetFingerprint: 'sha256:' + 'b'.repeat(64) },
      { ...good, version: 2 },
      { ...good, expression: 'arbitrary()' },
    ])
      send(value);
  }, selection());
  expect(
    await page.evaluate(() =>
      window.dictionaryControl.requests.filter(
        (request) => request.method === 'dictionary_predicate',
      ),
    ),
  ).toEqual([]);
  await choose(page);
  await expect(page.locator('#insertions')).toHaveText('1');
  const inserted = await page.evaluate(() => window.dictionaryControl.inserted[0]);
  expect(inserted).toEqual({
    expression: 'Noun("abá", definition="Acepção exata 1")',
    revision: 'r1',
  });
});

test('ambiguous senses require a constructor choice while partial candidates require explicit diagnostic insertion', async ({
  page,
}) => {
  await open(page);
  await choose(page, 2);
  await expect(page.getByRole('button', { name: 'Pronome', exact: true })).toBeVisible();
  await expect(page.locator('#insertions')).toHaveText('0');
  await page.getByRole('button', { name: 'Pronome', exact: true }).click();
  await expect(page.locator('#insertions')).toHaveText('1');
  expect((await page.evaluate(() => window.dictionaryControl.inserted[0])).expression).toBe(
    'Pronoun("abá", definition="Acepção exata 2")',
  );
  await choose(page, 3);
  await expect(page.getByText('Precisa de contexto verbal.', { exact: true })).toBeVisible();
  await expect(page.locator('#insertions')).toHaveText('1');
  await page
    .getByRole('button', { name: 'Adicionar à árvore com diagnóstico', exact: true })
    .click();
  await expect(page.locator('#insertions')).toHaveText('2');
});

test('delayed conversions cannot insert into another revision or after leaving the dictionary', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.dictionaryControl.hold = true;
  });
  await choose(page);
  await expect.poll(() => page.evaluate(() => window.dictionaryControl.pending.length)).toBe(1);
  await page.evaluate(() => window.dictionaryControl.setContext('r2'));
  await page.evaluate(() => {
    window.dictionaryControl.pending.shift()!.resolve();
  });
  await expect(page.locator('#insertions')).toHaveText('0');
  await choose(page);
  await expect.poll(() => page.evaluate(() => window.dictionaryControl.pending.length)).toBe(1);
  await page.getByRole('button', { name: 'Fechar aba', exact: true }).click();
  await page.evaluate(() => {
    window.dictionaryControl.pending.shift()!.resolve();
    window.dictionaryControl.hold = false;
  });
  await expect(page.locator('#insertions')).toHaveText('0');
  await page.getByRole('button', { name: 'Abrir aba', exact: true }).click();
  await choose(page);
  await expect(page.locator('#insertions')).toHaveText('1');
  expect(await page.evaluate(() => window.dictionaryControl.inserted[0].revision)).toBe('r2');
});

test('failed conversion and rejected insertion keep the dictionary available for explicit refresh', async ({
  page,
}) => {
  await open(page);
  await choose(page, 4);
  await expect(page.getByRole('alert')).toContainText('Dicionário mudou');
  await expect(page.locator('#insertions')).toHaveText('0');
  await page.getByRole('button', { name: 'Atualizar dicionário', exact: true }).click();
  await expect(page.getByTitle('Dicionário de tupi antigo', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.dictionaryControl.rejectInsertion = true;
  });
  await choose(page);
  await expect(page.getByRole('alert')).toContainText('A passagem ou a seleção mudou');
  await expect(page.locator('#insertions')).toHaveText('0');
});

test('hosted dictionary accepts only its own origin and receives verified iframe selections', async ({
  page,
}) => {
  await page.goto('/tests/dictionary-harness.html');
  await page.route('**/nhe-enga/?*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Navarro</body></html>' }),
  );
  await page.evaluate(() => {
    window.dictionaryControl.status.url = window.dictionaryControl.status.url!.replace(
      'studio://dictionary',
      location.origin,
    );
  });
  await page.getByRole('button', { name: 'Abrir aba', exact: true }).click();
  await expect(page.getByTitle('Dicionário de tupi antigo', { exact: true })).toBeVisible();
  await page.evaluate(
    (message) => window.dictionaryControl.send(message, 'https://outside.invalid'),
    selection(),
  );
  expect(await page.evaluate(() => window.dictionaryControl.inserted.length)).toBe(0);
  await page.evaluate(
    (message) => window.dictionaryControl.send(message, location.origin),
    selection(),
  );
  await expect(page.locator('#insertions')).toHaveText('1');
});

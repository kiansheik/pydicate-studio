import { expect, test } from '@playwright/test';

test('accordion opens the current final subsection and remains usable by keyboard on a cramped screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/tests/passage-navigation-harness.html');
  const list = page.getByLabel('Passagens por seção');
  const first = list.getByRole('button', { name: 'Primeira seção 2', exact: true });
  const final = list.getByRole('button', { name: 'Última seção 2', exact: true });
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(final).toHaveAttribute('aria-expanded', 'true');
  await expect(list.getByRole('button', { name: /0004/ })).toBeVisible();
  await expect(list.getByText('Aguardando revisão')).toBeVisible();
  await first.focus();
  await page.keyboard.press('Enter');
  await list.getByRole('button', { name: 'Subseção inicial 2', exact: true }).click();
  await list.getByRole('button', { name: /0001/ }).click();
  await expect(page.getByLabel('Seleção', { exact: true })).toHaveText('a');
  expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('edited metadata and filtered matches open their current groups without reordering rows', async ({
  page,
}) => {
  await page.goto('/tests/passage-navigation-harness.html');
  await page.getByRole('button', { name: 'Editar localizador da última passagem' }).click();
  const list = page.getByLabel('Passagens por seção');
  await expect(list.getByRole('button', { name: 'Seção editada 1', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(list.getByRole('button', { name: /0004/ })).toContainText('Resultado salvo');
  await page.getByLabel('Busca do ensaio').fill('Leitura a');
  await expect(list.getByRole('button', { name: /0001/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /0004/ })).toHaveCount(0);
});

test('startup goes to the final passage only once and later explicit navigation remains selected', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('simulated-selection:simulated:a', 'passage-a'),
  );
  await page.goto('/tests/next-hook-harness.html?startup');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(page.getByTestId('passage')).toHaveText('passage-b');
  await page.evaluate(() => window.__nextStudio.setSelectedId('passage-a'));
  await expect(page.getByTestId('passage')).toHaveText('passage-a');
  await page.getByLabel('Nota simulada').fill('Edited earlier passage');
  await expect(page.getByTestId('passage')).toHaveText('passage-a');
});

test('startup follows shared list ordering and includes its final unpublished passage', async ({
  page,
}) => {
  await page.goto('/tests/next-hook-harness.html?startup');
  await expect(page.getByTestId('passage')).toHaveText('passage-b');
  await page.evaluate(() => {
    const studio = window.__nextStudio;
    const envelope = structuredClone(studio.envelope);
    const sourceId = studio.passage.sourceId;
    envelope.drafts['passage-a'].organization = { sourceId, position: 1, deleted: false };
    envelope.drafts['passage-b'].organization = { sourceId, position: 0, deleted: false };
    localStorage.setItem(`simulated-next:${studio.project.id}`, JSON.stringify(envelope));
  });
  await page.reload();
  await expect(page.getByTestId('passage')).toHaveText('passage-a');
  const pendingId = await page.evaluate(() => {
    const studio = window.__nextStudio;
    const envelope = structuredClone(studio.envelope);
    const id = 'pending:' + crypto.randomUUID();
    const draft = structuredClone(envelope.drafts['passage-a']);
    delete draft.organization;
    draft.passageId = id;
    draft.sourceFingerprint = 'pending';
    draft.pending = { sourceId: studio.passage.sourceId, ordinal: 3, beforePassageId: null };
    envelope.drafts[id] = draft;
    localStorage.setItem(`simulated-next:${studio.project.id}`, JSON.stringify(envelope));
    return id;
  });
  await page.reload();
  await expect(page.getByTestId('passage')).toHaveText(pendingId);
});

import { test, expect } from '@playwright/test';
import type { LexicalNote, PassageLexiconInventory } from '../src/domain/passage-lexicon';
import type { StudioBridge } from '../src/domain/types';

const inventory: PassageLexiconInventory = {
  version: 1,
  revisionId: 'revision:1',
  engineFingerprint: 'engine:test',
  expressionFingerprint: 'sha256:test',
  diagnostics: [],
  entries: [
    {
      id: 'entry:compound',
      name: 'compound',
      kind: 'compound',
      runtimeType: 'Noun',
      category: 'noun',
      headword: '',
      definition: 'construção composta',
      expression: 'oré * tuba',
      provenance: { sourcePath: 'lexicon.tu.py', line: 3 },
      elements: [],
      occurrenceIds: ['occurrence:compound'],
    },
    {
      id: 'entry:ore',
      name: 'oré',
      kind: 'predicate',
      runtimeType: 'Pronoun',
      category: 'pronoun',
      headword: 'oré',
      definition: 'nós exclusivo',
      expression: 'Pronoun("oré")',
      provenance: { sourcePath: 'lexicon.tu.py', line: 2 },
      elements: [{ name: 'argumento 1', code: '"oré"' }],
      occurrenceIds: ['occurrence:ore-inner', 'occurrence:ore-direct'],
    },
  ],
  occurrences: [
    {
      id: 'occurrence:compound',
      lexicalId: 'entry:compound',
      name: 'compound',
      path: 'root/left',
      sourceNodeId: 'root/left',
      direct: true,
      certainty: 'source',
      via: [],
      binding: null,
      runtimeNodeIds: [],
    },
    {
      id: 'occurrence:ore-inner',
      lexicalId: 'entry:ore',
      name: 'oré',
      path: 'root/left/expand:compound/left',
      sourceNodeId: 'root/left',
      direct: false,
      certainty: 'source',
      via: ['compound'],
      binding: null,
      runtimeNodeIds: [],
    },
    {
      id: 'occurrence:ore-direct',
      lexicalId: 'entry:ore',
      name: 'oré',
      path: 'root/right',
      sourceNodeId: 'root/right',
      direct: true,
      certainty: 'source',
      via: [],
      binding: null,
      runtimeNodeIds: [],
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript((fixture) => {
    window.studio = {
      invoke: async (method: string, params: Record<string, unknown>) => {
        const records: LexicalNote[] = JSON.parse(
          localStorage.getItem('lexical-test-records') ?? '[]',
        );
        if (method === 'passage_lexicon') return fixture;
        if (method === 'lexical_notes_list') {
          await new Promise((resolve) => setTimeout(resolve, 75));
          return { records };
        }
        if (method === 'lexical_notes_save') {
          const note = params.note as LexicalNote;
          const id = [note.scope, note.lexicalId, note.occurrenceId ?? ''].join(':');
          const previous = records.find((record) => record.id === id);
          if ((previous?.version ?? 0) !== params.expectedVersion) throw new Error('STALE_NOTE');
          const version = (previous?.version ?? 0) + 1;
          const result = {
            ...note,
            id,
            version,
            createdAt: previous?.createdAt ?? '2026-09-17',
            updatedAt: '2026-09-17',
            history: [
              ...(previous?.history ?? []),
              { version, revisionId: note.revisionId, savedAt: '2026-09-17', fields: note.fields },
            ],
          };
          localStorage.setItem(
            'lexical-test-records',
            JSON.stringify([...records.filter((record) => record.id !== id), result]),
          );
          return result;
        }
        if (method === 'lexical_notes_export') return { format: 'pydicate-lexical-notes', records };
        throw new Error('Unexpected request: ' + method);
      },
    } as unknown as StudioBridge;
  }, inventory);
  await page.goto('/tests/passage-lexicon-harness.html');
});
test('expanded occurrences select their source and save separate general/context notes across restart', async ({
  page,
}) => {
  const search = page.getByRole('searchbox', { name: 'Buscar no léxico desta passagem' });
  await search.fill('ore');
  await page.getByRole('button', { name: 'oré oré 2', exact: true }).click();
  // A compound's internal lexical usage shares its source anchor, without changing lexical selection.
  await expect(page.getByLabel('Ocorrência lexical')).toHaveValue('occurrence:ore-inner');
  await expect(page.locator('#lexical-selection')).toHaveText('root/left');
  await expect(page.locator('#lexical-revealed')).toHaveText('');
  await page.getByRole('button', { name: 'Localizar na estrutura', exact: true }).click();
  await expect(page.locator('#lexical-revealed')).toHaveText('root/left');
  await page.getByLabel('Sentido atribuído aqui').fill('possuidor do parentesco');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Notas salvas neste dispositivo.');
  await page.getByLabel('Ocorrência lexical').selectOption('occurrence:ore-direct');
  await page.getByLabel('Sentido atribuído aqui').fill('objeto do pedido');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Notas salvas neste dispositivo.');
  await page.getByRole('button', { name: 'Sobre a entrada', exact: true }).click();
  await page.getByLabel('Significado geral').fill('Primeira pessoa plural exclusiva');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Notas salvas neste dispositivo.');
  await page.reload();
  await page.getByRole('button', { name: 'oré oré 2', exact: true }).click();
  await expect(page.getByLabel('Sentido atribuído aqui')).toHaveValue('possuidor do parentesco');
  await page.getByRole('button', { name: 'Sobre a entrada', exact: true }).click();
  await expect(page.getByLabel('Significado geral')).toHaveValue(
    'Primeira pessoa plural exclusiva',
  );
  await page.getByText('Caderno lexical do projeto', { exact: false }).click();
  await expect(
    page.getByText('1 notas gerais · 1 passagens · 3 versões preservadas'),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar notas e histórico' }).click();
  expect((await download).suggestedFilename()).toBe('pydicate-notas-lexicais.json');
});

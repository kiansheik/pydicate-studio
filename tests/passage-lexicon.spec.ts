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
      id: 'entry:root',
      name: 'compound * oré',
      kind: 'construction',
      runtimeType: 'Noun',
      category: 'noun',
      headword: '',
      definition: 'glossa herdada que não define o conjunto',
      expression: 'compound * oré',
      provenance: {},
      elements: [],
      occurrenceIds: ['occurrence:root'],
    },
    {
      id: 'entry:compound',
      name: 'compound',
      kind: 'compound',
      runtimeType: 'Noun',
      category: 'noun',
      headword: '',
      definition: 'construção composta',
      lexicalName: 'compound',
      sharedDefinitionTarget: { name: 'compound', scope: 'shared' },
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
      id: 'occurrence:root',
      lexicalId: 'entry:root',
      name: 'compound * oré',
      path: 'root',
      sourceNodeId: 'root',
      direct: true,
      certainty: 'source',
      via: [],
      binding: null,
      runtimeNodeIds: [],
      start: 0,
      end: 14,
      expression: 'compound * oré',
      nodeKind: 'binary',
      label: 'Vincular',
      depth: 0,
      isRoot: true,
      editable: true,
      surface: 'conjunto simulado',
      compositeDefinition: 'Sentido explícito do conjunto',
      noteOccurrenceId: 'stable:root',
      nodeFingerprint: 'node:root',
      evaluation: { status: 'ok', surface: 'conjunto simulado' },
    },
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
      start: 0,
      end: 8,
      expression: 'compound',
      nodeKind: 'reference',
      depth: 1,
      editable: true,
      surface: 'obaixuara',
      baseDefinition: 'sentido inadequado de obaixuara',
      noteOccurrenceId: 'stable:compound',
      nodeFingerprint: 'node:compound',
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
      editable: false,
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
      start: 11,
      end: 14,
      expression: 'oré',
      nodeKind: 'reference',
      depth: 1,
      editable: true,
      surface: 'oré',
      baseDefinition: 'nós exclusivo',
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript((fixture) => {
    const control = (window.__lexicalFixture = {
      requests: [] as { method: string; params: Record<string, unknown> }[],
      inventory: fixture,
      holdDefinition: false,
      releaseDefinition: undefined as (() => void) | undefined,
    });
    window.studio = {
      invoke: async (method: string, params: Record<string, unknown>) => {
        control.requests.push({ method, params: structuredClone(params) });
        const records: LexicalNote[] = JSON.parse(
          localStorage.getItem('lexical-test-records') ?? '[]',
        );
        if (method === 'passage_lexicon')
          return {
            ...structuredClone(control.inventory),
            revisionId: params.revisionId,
            engineFingerprint: params.engineFingerprint,
          };
        if (method === 'node_definition') {
          if (control.holdDefinition)
            await new Promise<void>((resolve) => {
              control.releaseDefinition = resolve;
            });
          const occurrence = control.inventory.occurrences.find(
            (item) => item.sourceNodeId === params.sourceNodeId,
          )!;
          occurrence.inheritedDefinition =
            params.action === 'set'
              ? (occurrence.inheritedDefinition ??
                occurrence.compositeDefinition ??
                occurrence.baseDefinition)
              : undefined;
          occurrence.hasDefinitionOverride = params.action === 'set';
          occurrence.compositeDefinition =
            params.action === 'set' ? String(params.definition) : undefined;
          return {
            raw:
              params.action === 'set'
                ? `studio_define((${params.raw}), ${JSON.stringify(params.definition)})`
                : 'compound * oré',
            revisionId: params.revisionId,
            engineFingerprint: params.engineFingerprint,
          };
        }
        if (method === 'lexicon_update')
          return {
            previewId: 'definition-preview',
            kind: 'lexicon',
            sourceFingerprint: 'fixture',
            diff: `SIMULATED SHARED DIFF: ${params.definition}`,
          };
        if (method === 'lexical_notes_list') {
          await new Promise((resolve) => setTimeout(resolve, 75));
          return { records };
        }
        if (method === 'dictionary_lookup') {
          if (window.__lexicalFixture.holdDictionary)
            await new Promise<void>((resolve) => {
              window.__lexicalFixture.releaseDictionary = resolve;
            });
          const datasetFingerprint = 'sha256:' + 'd'.repeat(64);
          const results =
            params.query === "tekate'yme'yma" || params.query === 'avareza'
              ? [
                  {
                    entryIndex: 31,
                    datasetFingerprint,
                    headword: "ekate'yma",
                    optionalNumber: '',
                    definition: "(s.) AVAREZA. Exemplo simulado: tekate'yme'yma — LIBERALIDADE.",
                    matchedField: 'definition',
                    matchedExcerpt: "tekate'yme'yma — LIBERALIDADE.",
                  },
                ]
              : params.query === 'obaixuara'
                ? [
                    {
                      entryIndex: 41,
                      datasetFingerprint,
                      headword: 'obaixuara',
                      optionalNumber: '1',
                      definition: '(s.) mão de pilão; primeira acepção simulada.',
                      matchedField: 'headword',
                    },
                    {
                      entryIndex: 42,
                      datasetFingerprint,
                      headword: 'obaixuara',
                      optionalNumber: '2',
                      definition: '(s.) oposto, contrário; segunda acepção simulada completa.',
                      matchedField: 'headword',
                    },
                  ]
                : [];
          return {
            results,
            total: results.length,
            datasetFingerprint,
            nextOffset: null,
            engineFingerprint: params.engineFingerprint,
          };
        }
        if (method === 'ai_status')
          return {
            config: { provider: 'codex', models: { codex: 'simulated', claude: 'simulated' } },
            providers: [],
          };
        if (method === 'ai_history') return [];
        if (method === 'ai_prompt_preview')
          return {
            prompt: JSON.stringify(records.map((record) => record.fields)),
            targetLanguage: 'Português',
            analysisTarget: { scope: 'passage' },
            inputHash: 'simulated',
          };
        if (method === 'lexical_notes_save') {
          if (window.__lexicalFixture.holdNotes)
            await new Promise<void>((resolve) => {
              window.__lexicalFixture.releaseNotes = resolve;
            });
          if (window.__lexicalFixture.failNotes) {
            window.__lexicalFixture.failedNoteWrites =
              (window.__lexicalFixture.failedNoteWrites ?? 0) + 1;
            throw new Error('SIMULATED_NOTE_FAILURE');
          }
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
  await page.getByRole('button', { name: /oré Dentro de compound/ }).click();
  // A compound's internal lexical usage shares its source anchor, without changing lexical selection.
  await expect(page.getByLabel('Ocorrência lexical')).toHaveValue('occurrence:ore-inner');
  await expect(page.locator('#lexical-selection')).toHaveText('root/left');
  await expect(page.locator('#lexical-revealed')).toHaveText('');
  await page.getByRole('button', { name: 'Localizar na estrutura', exact: true }).click();
  await expect(page.locator('#lexical-revealed')).toHaveText('root/left');
  await page.getByLabel('Sentido atribuído aqui').fill('possuidor do parentesco');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.locator('.lexical-note-editor').getByRole('status')).toHaveText(
    'Notas salvas neste dispositivo.',
  );
  await page.getByLabel('Ocorrência lexical').selectOption('occurrence:ore-direct');
  await page.getByLabel('Sentido atribuído aqui').fill('objeto do pedido');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.locator('.lexical-note-editor').getByRole('status')).toHaveText(
    'Notas salvas neste dispositivo.',
  );
  await page.getByRole('button', { name: 'Sobre esta construção', exact: true }).click();
  await page.getByLabel('Significado geral').fill('Primeira pessoa plural exclusiva');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.locator('.lexical-note-editor').getByRole('status')).toHaveText(
    'Notas salvas neste dispositivo.',
  );
  await page.reload();
  await page.getByRole('button', { name: /oré Dentro de compound/ }).click();
  await expect(page.getByLabel('Sentido atribuído aqui')).toHaveValue('possuidor do parentesco');
  await page.getByRole('button', { name: 'Sobre esta construção', exact: true }).click();
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

test('whole expression and each tree occurrence expose scoped meanings and independent notes', async ({
  page,
}) => {
  const inventory = page.locator('.lexical-inventory');
  await expect(inventory.getByRole('button')).toHaveCount(4);
  await expect(inventory.getByRole('button').first()).toContainText('Expressão inteira');
  await expect(page.locator('.lexical-engine-definition')).toContainText(
    'Sentido explícito do conjunto',
  );
  await expect(page.locator('.lexical-entry-detail')).not.toContainText(
    'glossa herdada que não define o conjunto',
  );
  await page.getByLabel('Sentido atribuído aqui').fill('Leitura contextual da expressão inteira');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.locator('.lexical-note-editor').getByRole('status')).toHaveText(
    'Notas salvas neste dispositivo.',
  );
  await page.getByRole('button', { name: 'Sobre esta construção', exact: true }).click();
  await page.getByLabel('Significado geral').fill('Interpretação reutilizável do conjunto');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.locator('.lexical-note-editor').getByRole('status')).toHaveText(
    'Notas salvas neste dispositivo.',
  );
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lexical-test-records')!),
  );
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scope: 'occurrence',
        occurrenceId: 'stable:root',
        nodeFingerprint: 'node:root',
      }),
      expect.objectContaining({ scope: 'entry', lexicalId: 'entry:root' }),
    ]),
  );
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) =>
        ['node_definition', 'lexicon_update', 'source_apply', 'reference_approve'].includes(
          item.method,
        ),
      ),
    ),
  ).toEqual([]);
});

test('a wrong named sense can be corrected for this occurrence or reviewed generally', async ({
  page,
}) => {
  await page.getByRole('button', { name: /obaixuara Construção reutilizada/ }).click();
  await expect(page.locator('.lexical-engine-definition')).toContainText('sentido inadequado');
  await page.getByText('Editar significado', { exact: true }).click();
  await page.getByLabel('Significado revisado').fill('Sentido correto nesta passagem.');
  await page.getByRole('button', { name: 'Usar significado no rascunho', exact: true }).click();
  await expect(page.getByTestId('lexical-raw')).toContainText('Sentido correto nesta passagem.');
  await expect(page.locator('.lexical-engine-definition')).toContainText(
    'Definição herdada: sentido inadequado de obaixuara',
  );
  await expect(page.locator('.lexical-engine-definition')).toContainText(
    'Significado do conjunto: Sentido correto nesta passagem.',
  );
  const local = await page.evaluate(
    () =>
      window.__lexicalFixture.requests.find((item) => item.method === 'node_definition')!.params,
  );
  expect(local).toMatchObject({
    sourceNodeId: 'root/left',
    raw: 'compound * oré',
    action: 'set',
    revisionId: 'revision:1',
    engineFingerprint: 'engine:test',
  });
  await page.getByText('Editar significado', { exact: true }).click();
  await page.getByLabel('Alcance do significado').selectOption('general');
  await page.getByLabel('Significado revisado').fill('Significado geral corrigido.');
  await page.getByRole('button', { name: 'Revisar definição geral', exact: true }).click();
  await expect(page.getByTestId('lexical-preview')).toContainText('Significado geral corrigido.');
  const general = await page.evaluate(
    () => window.__lexicalFixture.requests.find((item) => item.method === 'lexicon_update')!.params,
  );
  expect(general).toMatchObject({
    name: 'compound',
    scope: 'shared',
    preserveGrammar: true,
    engineFingerprint: 'engine:test',
  });
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) =>
        ['source_apply', 'reference_approve'].includes(item.method),
      ),
    ),
  ).toEqual([]);
});

test('dictionary citations expose their example and full entry without assigning the headword meaning to a composition', async ({
  page,
}) => {
  await page.getByText('Editar significado', { exact: true }).click();
  await page.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Definições no Navarro' });
  await expect(picker.getByLabel('Forma ou significado a buscar')).toHaveValue('conjunto simulado');
  await picker.getByLabel('Forma ou significado a buscar').fill("tekate'yme'yma");
  await picker.getByRole('button', { name: 'Buscar no Navarro', exact: true }).click();
  await expect(picker.getByText('Forma citada nesta entrada', { exact: true })).toBeVisible();
  await expect(picker.locator('blockquote')).toHaveText("tekate'yme'yma — LIBERALIDADE.");
  await expect(picker.getByRole('button', { name: /Usar definição/ })).toHaveCount(0);
  await picker.getByText('Verbete completo', { exact: true }).click();
  await expect(picker.locator('.dictionary-meaning-definition')).toContainText('AVAREZA');
  await expect(page.getByLabel('Significado revisado')).toHaveValue(
    'Sentido explícito do conjunto',
  );
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) =>
        ['node_definition', 'lexicon_update', 'dictionary_predicate'].includes(item.method),
      ),
    ),
  ).toEqual([]);
});

test('explicit dictionary meaning search selects a named sense and switching mode cancels old form results', async ({
  page,
}) => {
  await page.getByRole('button', { name: /obaixuara Construção reutilizada/ }).click();
  await page.getByText('Editar significado', { exact: true }).click();
  await page.evaluate(() => {
    window.__lexicalFixture.holdDictionary = true;
  });
  await page.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Definições no Navarro' });
  await expect
    .poll(() => page.evaluate(() => !!window.__lexicalFixture.releaseDictionary))
    .toBe(true);
  await picker.getByLabel('Tipo de consulta Navarro').selectOption('meaning');
  await page.evaluate(() => {
    window.__lexicalFixture.holdDictionary = false;
    window.__lexicalFixture.releaseDictionary?.();
  });
  await expect(picker.locator('article')).toHaveCount(0);
  await picker.getByLabel('Forma ou significado a buscar').fill('avareza');
  await picker.getByRole('button', { name: 'Buscar no Navarro', exact: true }).click();
  await expect(picker.getByText('Encontrado pelo significado', { exact: true })).toBeVisible();
  await expect(picker.locator('.dictionary-meaning-definition')).toContainText('AVAREZA');
  await picker.getByRole('button', { name: "Usar definição de ekate'yma", exact: true }).click();
  await expect(page.getByLabel('Significado revisado')).toHaveValue(
    "(s.) AVAREZA. Exemplo simulado: tekate'yme'yma — LIBERALIDADE.",
  );
  const lookups = await page.evaluate(() =>
    window.__lexicalFixture.requests.filter((item) => item.method === 'dictionary_lookup'),
  );
  expect(lookups.at(-1)!.params).toMatchObject({ query: 'avareza', matchField: 'definition' });
  await page.getByRole('button', { name: 'Usar significado no rascunho', exact: true }).click();
  await expect(page.getByTestId('lexical-raw')).toContainText('AVAREZA');
  expect(
    await page.evaluate(
      () =>
        window.__lexicalFixture.requests.find((item) => item.method === 'node_definition')!.params,
    ),
  ).toMatchObject({
    dictionarySelection: { entryIndex: 31, datasetFingerprint: 'sha256:' + 'd'.repeat(64) },
  });
});

test('dictionary senses retain exact identity for local and shared meaning edits and manual changes clear it', async ({
  page,
}) => {
  await page.getByRole('button', { name: /obaixuara Construção reutilizada/ }).click();
  await page.getByText('Editar significado', { exact: true }).click();
  await page.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Definições no Navarro' });
  await expect(picker.locator('article')).toHaveCount(2);
  await expect(picker.locator('article').first()).toContainText('mão de pilão');
  await expect(picker.locator('article').nth(1)).toContainText('oposto, contrário');
  await picker
    .getByRole('button', { name: 'Usar definição de obaixuara', exact: true })
    .nth(1)
    .click();
  await expect(page.getByLabel('Significado revisado')).toHaveValue(
    '(s.) oposto, contrário; segunda acepção simulada completa.',
  );
  await page.getByRole('button', { name: 'Usar significado no rascunho', exact: true }).click();
  await expect(page.getByTestId('lexical-raw')).toContainText('segunda acepção simulada completa');
  expect(
    await page.evaluate(
      () =>
        window.__lexicalFixture.requests.find((item) => item.method === 'node_definition')!.params,
    ),
  ).toMatchObject({
    definition: '(s.) oposto, contrário; segunda acepção simulada completa.',
    dictionarySelection: { entryIndex: 42, datasetFingerprint: 'sha256:' + 'd'.repeat(64) },
  });
  await page.getByText('Editar significado', { exact: true }).click();
  await page.getByLabel('Alcance do significado').selectOption('general');
  await page.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  await picker
    .getByRole('button', { name: 'Usar definição de obaixuara', exact: true })
    .nth(1)
    .click();
  await page.getByRole('button', { name: 'Revisar definição geral', exact: true }).click();
  await expect(page.getByTestId('lexical-preview')).toContainText(
    'segunda acepção simulada completa',
  );
  expect(
    await page.evaluate(
      () =>
        window.__lexicalFixture.requests.find((item) => item.method === 'lexicon_update')!.params,
    ),
  ).toMatchObject({
    preserveGrammar: true,
    dictionarySelection: { entryIndex: 42, datasetFingerprint: 'sha256:' + 'd'.repeat(64) },
  });
  await page.getByLabel('Significado revisado').fill('Interpretação própria revisada.');
  await expect(page.getByText('Definição selecionada:', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisar definição geral', exact: true }).click();
  await expect(page.getByTestId('lexical-preview')).toContainText(
    'Interpretação própria revisada.',
  );
  expect(
    await page.evaluate(
      () =>
        window.__lexicalFixture.requests.filter((item) => item.method === 'lexicon_update').at(-1)!
          .params,
    ),
  ).not.toHaveProperty('dictionarySelection');
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) =>
        ['dictionary_predicate', 'source_apply'].includes(item.method),
      ),
    ),
  ).toEqual([]);
});

test('cancelled or superseded dictionary lookups cannot fill a newer meaning editor', async ({
  page,
}) => {
  await page.getByRole('button', { name: /obaixuara Construção reutilizada/ }).click();
  await page.getByText('Editar significado', { exact: true }).click();
  await page.evaluate(() => {
    window.__lexicalFixture.holdDictionary = true;
  });
  await page.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!window.__lexicalFixture.releaseDictionary))
    .toBe(true);
  await page.getByRole('button', { name: 'Fechar consulta Navarro', exact: true }).click();
  await page.evaluate(() => {
    window.__lexicalFixture.holdDictionary = false;
    window.__lexicalFixture.releaseDictionary?.();
    window.__lexicalFixture.releaseDictionary = undefined;
  });
  await expect(page.getByRole('button', { name: /Usar definição/ })).toHaveCount(0);
  await expect(page.getByLabel('Significado revisado')).toHaveValue(
    'sentido inadequado de obaixuara',
  );
  await page.evaluate(() => {
    window.__lexicalFixture.holdDictionary = true;
  });
  await page.getByRole('button', { name: 'Consultar Navarro', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!window.__lexicalFixture.releaseDictionary))
    .toBe(true);
  await page.getByRole('button', { name: 'Alterar rascunho simulado', exact: true }).click();
  await page.evaluate(() => {
    window.__lexicalFixture.holdDictionary = false;
    window.__lexicalFixture.releaseDictionary?.();
  });
  await expect(page.getByTestId('lexical-raw')).toHaveText('changed_during_request');
  await expect(page.getByRole('button', { name: /Usar definição/ })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) =>
        ['node_definition', 'lexicon_update'].includes(item.method),
      ),
    ),
  ).toEqual([]);
});

test('anonymous construction meanings can be emptied and restored without inventing a shared entry', async ({
  page,
}) => {
  await page.getByText('Editar significado', { exact: true }).click();
  await expect(
    page.getByLabel('Alcance do significado').locator('option[value="general"]'),
  ).toHaveAttribute('disabled', '');
  await page.getByLabel('Significado revisado').fill('');
  await page.getByRole('button', { name: 'Usar significado no rascunho', exact: true }).click();
  await expect(page.getByTestId('lexical-raw')).toContainText('studio_define');
  await page.getByText('Editar significado', { exact: true }).click();
  await page.getByRole('button', { name: 'Voltar ao significado herdado', exact: true }).click();
  await expect(page.getByTestId('lexical-raw')).toHaveText('compound * oré');
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests
        .filter((item) => item.method === 'node_definition')
        .map((item) => item.params.action),
    ),
  ).toEqual(['set', 'inherit']);
});

test('expanded dependencies do not redefine their outer alias and delayed edits cannot overwrite a newer draft', async ({
  page,
}) => {
  await page.getByRole('button', { name: /oré Dentro de compound/ }).click();
  await page.getByText('Editar significado', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Usar significado no rascunho', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Esta dependência vem de uma definição reutilizada.', { exact: false }),
  ).toBeVisible();
  await page.locator('.lexical-inventory').getByRole('button').first().click();
  await page.getByText('Editar significado', { exact: true }).click();
  await page.getByLabel('Significado revisado').fill('Atrasado');
  await page.evaluate(() => {
    window.__lexicalFixture.holdDefinition = true;
  });
  await page.getByRole('button', { name: 'Usar significado no rascunho', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!window.__lexicalFixture.releaseDefinition))
    .toBe(true);
  await page.getByRole('button', { name: 'Alterar rascunho simulado', exact: true }).click();
  await page.evaluate(() => window.__lexicalFixture.releaseDefinition?.());
  await expect(page.getByTestId('lexical-raw')).toHaveText('changed_during_request');
});

test('an immediate translation prompt waits for unsaved interpretation notes and refuses a failed save', async ({
  page,
}) => {
  await page.goto('/tests/passage-lexicon-harness.html?translation');
  await expect(page.getByLabel('Sentido atribuído aqui')).toBeVisible();
  await page.evaluate(() => {
    window.__lexicalFixture.holdNotes = true;
  });
  await page.getByLabel('Sentido atribuído aqui').fill('Minha interpretação antes do prompt.');
  await page.getByRole('button', { name: 'Gerar prompt de tradução', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!window.__lexicalFixture.releaseNotes)).toBe(true);
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) => item.method === 'ai_prompt_preview'),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    window.__lexicalFixture.holdNotes = false;
    window.__lexicalFixture.releaseNotes?.();
  });
  await expect(page.getByTestId('translation-prompt')).toContainText(
    'Minha interpretação antes do prompt.',
  );
  const methods = await page.evaluate(() =>
    window.__lexicalFixture.requests.map((item) => item.method),
  );
  expect(methods.indexOf('lexical_notes_save')).toBeLessThan(methods.indexOf('ai_prompt_preview'));
  await page.evaluate(() => {
    window.__lexicalFixture.failNotes = true;
  });
  await page.getByLabel('Sentido atribuído aqui').fill('Uma mudança que ainda não foi salva.');
  await expect(page.getByTestId('translation-prompt')).toHaveCount(0);
  await page.getByRole('button', { name: 'Gerar prompt de tradução', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Tradução da árvore atual' }).getByRole('alert'),
  ).toContainText('SIMULATED_NOTE_FAILURE');
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) => item.method === 'ai_prompt_preview'),
    ),
  ).toHaveLength(1);
});

for (const remount of [false, true]) {
  test(
    remount
      ? 'translation drains the latest note across a rapid close and reopen during an in-flight save'
      : 'translation drains a newer interpretation typed while its first note write is pending',
    async ({ page }) => {
      await page.goto('/tests/passage-lexicon-harness.html?translation');
      await page.evaluate(() => {
        window.__lexicalFixture.holdNotes = true;
      });
      await page.getByLabel('Sentido atribuído aqui').fill('Interpretação A em trânsito.');
      await page.getByRole('button', { name: 'Gerar prompt de tradução', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => !!window.__lexicalFixture.releaseNotes))
        .toBe(true);
      if (remount) {
        await page.getByRole('button', { name: 'Fechar léxico simulado', exact: true }).click();
        await page.getByRole('button', { name: 'Reabrir léxico simulado', exact: true }).click();
        await expect(page.getByLabel('Sentido atribuído aqui')).toHaveValue(
          'Interpretação A em trânsito.',
        );
      }
      await page.getByLabel('Sentido atribuído aqui').fill('Interpretação B mais recente.');
      await page.evaluate(() => window.__lexicalFixture.releaseNotes?.());
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__lexicalFixture.requests.filter(
                (item) => item.method === 'lexical_notes_save',
              ).length,
          ),
        )
        .toBe(2);
      expect(
        await page.evaluate(() =>
          window.__lexicalFixture.requests.filter((item) => item.method === 'ai_prompt_preview'),
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem('lexical-test-records')!)[0].fields.meaning,
        ),
      ).toBe('Interpretação A em trânsito.');
      await page.evaluate(() => {
        window.__lexicalFixture.holdNotes = false;
        window.__lexicalFixture.releaseNotes?.();
      });
      await expect(page.getByTestId('translation-prompt')).toContainText(
        'Interpretação B mais recente.',
      );
      await expect(page.getByTestId('translation-prompt')).not.toContainText('Interpretação A');
      const records: LexicalNote[] = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('lexical-test-records')!),
      );
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        version: 2,
        fields: { meaning: 'Interpretação B mais recente.' },
      });
      expect(records[0].history.map((version) => version.fields.meaning)).toEqual([
        'Interpretação A em trânsito.',
        'Interpretação B mais recente.',
      ]);
    },
  );
}

test('failed detached notes block translation until the same buffered note is reopened and saved', async ({
  page,
}) => {
  await page.goto('/tests/passage-lexicon-harness.html?translation');
  await page.evaluate(() => {
    window.__lexicalFixture.failNotes = true;
  });
  await page.getByLabel('Sentido atribuído aqui').fill('Interpretação preservada ao fechar.');
  await page.getByRole('button', { name: 'Fechar léxico simulado', exact: true }).click();
  await expect(page.getByLabel('Sentido atribuído aqui')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__lexicalFixture.failedNoteWrites ?? 0))
    .toBeGreaterThan(0);
  // The detached save has failed before the next request starts.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  await page.getByRole('button', { name: 'Gerar prompt de tradução', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Tradução da árvore atual' }).getByRole('alert'),
  ).toContainText('SIMULATED_NOTE_FAILURE');
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) => item.method === 'ai_prompt_preview'),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    window.__lexicalFixture.failNotes = false;
  });
  await page.getByRole('button', { name: 'Reabrir léxico simulado', exact: true }).click();
  await expect(page.getByLabel('Sentido atribuído aqui')).toHaveValue(
    'Interpretação preservada ao fechar.',
  );
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.locator('.lexical-note-editor').getByRole('status')).toHaveText(
    'Notas salvas neste dispositivo.',
  );
  await page.getByRole('button', { name: 'Gerar prompt de tradução', exact: true }).click();
  await expect(page.getByTestId('translation-prompt')).toContainText(
    'Interpretação preservada ao fechar.',
  );
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lexical-test-records')!),
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    version: 1,
    fields: { meaning: 'Interpretação preservada ao fechar.' },
  });
});

test('legacy exact-expression notes remain readable and an edit creates stable provenance without erasing history', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'lexical-test-records',
      JSON.stringify([
        {
          id: 'legacy:root',
          scope: 'occurrence',
          lexicalId: 'entry:root',
          lexicalName: 'compound * oré',
          sourceId: 'araujo',
          passageId: 'passage:1',
          occurrenceId: 'occurrence:root',
          revisionId: 'revision:old',
          expressionFingerprint: 'sha256:test',
          provenance: {},
          fields: { meaning: 'Interpretação antiga', grammar: '', note: '' },
          version: 1,
          createdAt: '2026-09-17',
          updatedAt: '2026-09-17',
          history: [
            {
              version: 1,
              revisionId: 'revision:old',
              savedAt: '2026-09-17',
              fields: { meaning: 'Interpretação antiga', grammar: '', note: '' },
            },
          ],
        },
      ]),
    ),
  );
  await page.reload();
  await expect(page.getByLabel('Sentido atribuído aqui')).toHaveValue('Interpretação antiga');
  expect(
    await page.evaluate(() =>
      window.__lexicalFixture.requests.filter((item) => item.method === 'lexical_notes_save'),
    ),
  ).toEqual([]);
  await page.getByLabel('Sentido atribuído aqui').fill('Interpretação antiga, agora revisada');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await expect(page.locator('.lexical-note-editor').getByRole('status')).toHaveText(
    'Notas salvas neste dispositivo.',
  );
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lexical-test-records')!),
  );
  expect(records).toHaveLength(2);
  expect(records.find((record: LexicalNote) => record.id === 'legacy:root')).toMatchObject({
    version: 1,
    fields: { meaning: 'Interpretação antiga' },
  });
  expect(
    records.find((record: LexicalNote) => record.occurrenceId === 'stable:root'),
  ).toMatchObject({
    version: 1,
    nodeFingerprint: 'node:root',
    fields: { meaning: 'Interpretação antiga, agora revisada' },
  });
});

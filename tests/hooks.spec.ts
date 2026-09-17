import { expect, test } from '@playwright/test';
import type { StudioProject } from '../src/domain/types';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__bridgeTest = {
      events: [],
      saved: {},
      failSave: false,
      failLoadProject: null,
      delayOpen: false,
      openedProject: {} as StudioProject,
      refreshedProject: {} as StudioProject,
    };
    window.studio = {
      async openProject() {
        window.__bridgeTest.events.push('open');
        if (window.__bridgeTest.delayOpen)
          await new Promise<void>((resolve) => {
            window.__bridgeTest.releaseOpen = resolve;
          });
        return structuredClone(window.__bridgeTest.openedProject);
      },
      async refreshProject() {
        window.__bridgeTest.events.push('refresh');
        return structuredClone(window.__bridgeTest.refreshedProject);
      },
      async loadDrafts(id) {
        window.__bridgeTest.events.push(`load:${id}`);
        if (window.__bridgeTest.failLoadProject === id)
          throw new Error('Rascunhos temporariamente indisponíveis.');
        return structuredClone(window.__bridgeTest.saved[id] ?? null);
      },
      async saveDrafts(envelope) {
        window.__bridgeTest.events.push(`save:${envelope.projectId}`);
        if (window.__bridgeTest.failSave) throw new Error('Disco indisponível no teste.');
        window.__bridgeTest.saved[envelope.projectId] = structuredClone(envelope);
      },
      async render() {
        throw new Error('Este teste de rascunhos não executa o motor.');
      },
    };
  });
  await page.goto('/tests/hook-harness.html');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(page.getByTestId('save')).toHaveText('Rascunho salvo neste dispositivo');
  await page.evaluate(() => {
    const local = structuredClone(window.__studioTest.project);
    local.id = 'local:hook-test';
    local.mode = 'local';
    window.__bridgeTest.openedProject = local;
    window.__bridgeTest.refreshedProject = structuredClone(local);
  });
});

test('two edits before a render preserve both fields and both undo steps', async ({ page }) => {
  await page.evaluate(() => {
    const studio = window.__studioTest;
    studio.edit({ notes: 'Primeira contribuição.' });
    studio.edit({ translation: 'Segunda contribuição.' });
  });
  await expect(page.getByTestId('notes')).toHaveText('Primeira contribuição.');
  await expect(page.getByTestId('translation')).toHaveText('Segunda contribuição.');
  await page.evaluate(() => window.__studioTest.undo());
  await expect(page.getByTestId('notes')).toHaveText('Primeira contribuição.');
  await expect(page.getByTestId('translation')).not.toHaveText('Segunda contribuição.');
  await page.evaluate(() => window.__studioTest.undo());
  await expect(page.getByTestId('notes')).toHaveText('');
});

test('a failed save prevents switching the active backend project', async ({ page }) => {
  await page.evaluate(async () => {
    window.__bridgeTest.failSave = true;
    window.__bridgeTest.events = [];
    window.__studioTest.edit({ notes: 'Ainda não salvo.' });
    await window.__studioTest.openProject();
  });
  await expect(page.getByTestId('project')).toHaveText('example:araujo-0067');
  await expect(page.getByTestId('notes')).toHaveText('Ainda não salvo.');
  expect(await page.evaluate(() => window.__bridgeTest.events)).not.toContain('open');
  await expect(page.getByTestId('save')).toHaveText('Não foi possível salvar');
});

test('project opening saves first and locks edits while the picker is pending', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__bridgeTest.events = [];
    window.__bridgeTest.delayOpen = true;
    void window.__studioTest.openProject();
  });
  await expect(page.getByTestId('ready')).toHaveText('false');
  await expect.poll(() => page.evaluate(() => !!window.__bridgeTest.releaseOpen)).toBe(true);
  await page.evaluate(() => {
    window.__studioTest.edit({ notes: 'Must not enter the previous project.' });
    window.__bridgeTest.releaseOpen!();
  });
  await expect(page.getByTestId('project')).toHaveText('local:hook-test');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const events = await page.evaluate(() => window.__bridgeTest.events);
  expect(events.indexOf('save:example:araujo-0067')).toBeLessThan(events.indexOf('open'));
  expect(
    await page.evaluate(() =>
      Object.values(window.__bridgeTest.saved['example:araujo-0067'].drafts).some((draft) =>
        draft.notes.includes('Must not'),
      ),
    ),
  ).toBe(false);
});

test('refresh retains selected passage, draft and undo; source changes block undo', async ({
  page,
}) => {
  await page.evaluate(() => window.__studioTest.openProject());
  await expect(page.getByTestId('project')).toHaveText('local:hook-test');
  await expect(page.getByTestId('ready')).toHaveText('true');
  const selected = await page.evaluate(() => window.__studioTest.selectedId);
  await page.evaluate(() => window.__studioTest.edit({ notes: 'Preservar ao atualizar.' }));
  await expect(page.getByTestId('notes')).toHaveText('Preservar ao atualizar.');
  await page.evaluate(async () => {
    window.__bridgeTest.events = [];
    await window.__studioTest.verify();
  });
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(page.getByTestId('notes')).toHaveText('Preservar ao atualizar.');
  expect(await page.evaluate(() => window.__studioTest.selectedId)).toBe(selected);
  expect(await page.evaluate(() => window.__studioTest.canUndo)).toBe(true);
  expect(await page.evaluate(() => window.__bridgeTest.events)).not.toContain(
    'load:local:hook-test',
  );
  await page.evaluate(async () => {
    const passage = window.__bridgeTest.refreshedProject.passages.find(
      (p) => p.id === window.__studioTest.selectedId,
    )!;
    passage.sourceFingerprint = 'changed-outside-studio';
    await window.__studioTest.verify();
  });
  await expect(page.getByTestId('conflict')).toHaveText('true');
  expect(await page.evaluate(() => window.__studioTest.canUndo)).toBe(false);
  await page.evaluate(() => window.__studioTest.undo());
  await expect(page.getByTestId('notes')).toHaveText('Preservar ao atualizar.');
});

test('an externally replaced passage leaves its prior draft available for recovery', async ({
  page,
}) => {
  await page.evaluate(() => window.__studioTest.openProject());
  await expect(page.getByTestId('project')).toHaveText('local:hook-test');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await page.evaluate(() => window.__studioTest.edit({ notes: 'Não perder esta contribuição.' }));
  await page.evaluate(async () => {
    const passage = window.__bridgeTest.refreshedProject.passages.find(
      (p) => p.id === window.__studioTest.selectedId,
    )!;
    passage.id = 'replacement-passage';
    passage.sourceFingerprint = 'externally-replaced-source';
    await window.__studioTest.verify();
  });
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect
    .poll(() => page.evaluate(() => window.__studioTest.orphanDrafts.map((draft) => draft.notes)))
    .toEqual(['Não perder esta contribuição.']);
  expect(await page.evaluate(() => window.__studioTest.draft?.notes)).toBe('');
});

test('reopening the same project retries a failed draft load after recovery', async ({ page }) => {
  await page.evaluate(async () => {
    window.__bridgeTest.failLoadProject = 'local:hook-test';
    await window.__studioTest.openProject();
  });
  await expect(page.getByTestId('project')).toHaveText('local:hook-test');
  await expect
    .poll(() => page.evaluate(() => window.__studioTest.error))
    .toContain('temporariamente indisponíveis');
  await expect(page.getByTestId('ready')).toHaveText('false');
  await page.evaluate(async () => {
    window.__bridgeTest.failLoadProject = null;
    await window.__studioTest.openProject();
  });
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(page.getByTestId('save')).toHaveText('Rascunho salvo neste dispositivo');
  expect(await page.evaluate(() => window.__studioTest.error)).toBe('');
});

test('returning to the example saves the local contribution and restores example drafts', async ({
  page,
}) => {
  await page.evaluate(() => window.__studioTest.edit({ notes: 'Minha nota no exemplo.' }));
  await page.evaluate(() => window.__studioTest.openProject());
  await expect(page.getByTestId('project')).toHaveText('local:hook-test');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await page.evaluate(() => window.__studioTest.edit({ notes: 'Minha nota no projeto local.' }));
  await page.evaluate(() => window.__studioTest.openExample());
  await expect(page.getByTestId('project')).toHaveText('example:araujo-0067');
  await expect(page.getByTestId('ready')).toHaveText('true');
  await expect(page.getByTestId('notes')).toHaveText('Minha nota no exemplo.');
  expect(
    await page.evaluate(() =>
      Object.values(window.__bridgeTest.saved['local:hook-test'].drafts).some(
        (draft) => draft.notes === 'Minha nota no projeto local.',
      ),
    ),
  ).toBe(true);
});

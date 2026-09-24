import { expect, test, type Page } from '@playwright/test';

async function simulatedInstaller(page: Page) {
  await page.addInitScript(() => {
    const listeners = new Set<(event: unknown) => void>();
    let resume!: (value: unknown) => void;
    let finishSetup!: () => void;
    let failSetup!: () => void;
    const restored = new Promise((resolve) => {
      resume = resolve;
    });
    let ready = false;
    const control = {
      completeStartup: () => resume({ project: null, setupRequired: true }),
      finishSetup: () => finishSetup(),
      failSetup: () => failSetup(),
      setups: 0,
    };
    Object.assign(window, { __installation: control });
    window.studio = {
      installationStatus: async () => ({
        update: {
          phase: 'checking',
          currentVersion: '0.2.0',
          canContinue: false,
          message: 'Conferindo atualizações do Studio…',
        },
        workspace: {
          directory: '/fixture/Documents/Pydicate Studio',
          ready,
          busy: false,
          warnings: [],
          progress: { phase: 'idle', message: 'Pronto' },
        },
        warnings: [],
      }),
      onEvent: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      invoke: async (method) => {
        if (method === 'session_restore') return restored;
        if (method === 'ai_history') return [];
        if (method === 'ai_status')
          return {
            providers: [],
            config: {
              provider: 'codex',
              models: { codex: '', claude: '' },
              reasoningEffort: 'medium',
            },
          };
        return {};
      },
      setupProject: async () => {
        control.setups++;
        for (const listener of listeners)
          listener({
            type: 'managed-project',
            phase: 'cloning',
            message: 'Baixando nhe-enga…',
            percent: 42,
          });
        await new Promise<void>((resolve, reject) => {
          finishSetup = resolve;
          failSetup = () => reject(new Error('Sem conexão. Tente novamente.'));
        });
        ready = true;
        const modulePath = '/src/domain/example.ts';
        return (await import(modulePath)).createExampleProject();
      },
      openProject: async () => null,
      refreshProject: async () => {
        throw new Error('unused');
      },
      render: async () => {
        throw new Error('unused');
      },
      loadDrafts: async () => null,
      saveDrafts: async () => {},
    };
  });
  await page.goto('/');
}

test('first launch waits for startup, offers automatic setup and shows progress without duplicate requests', async ({
  page,
}) => {
  await simulatedInstaller(page);
  await expect(page.locator('.startup-screen')).toContainText('Conferindo atualizações');
  await expect(page.getByRole('button', { name: 'Salvar rascunho', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).__installation.completeStartup());
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('/fixture/Documents/Pydicate Studio');
  await expect(dialog.getByRole('button', { name: /Abrir projeto existente/ })).toBeEnabled();
  const prepare = dialog.getByRole('button', { name: /Preparar meu espaço de trabalho/ });
  await prepare.click();
  await expect(prepare).toBeDisabled();
  await expect(dialog.getByRole('status')).toContainText('Baixando nhe-enga');
  await expect(dialog.locator('progress')).toHaveAttribute('value', '42');
  await page.evaluate(() => (window as any).__installation.finishSetup());
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__installation.setups)).toBe(1);
});

test('failed preparation keeps the setup dialog open and allows retry', async ({ page }) => {
  await simulatedInstaller(page);
  await page.evaluate(() => (window as any).__installation.completeStartup());
  const dialog = page.getByRole('dialog');
  const prepare = dialog.getByRole('button', { name: /Preparar meu espaço de trabalho/ });
  await prepare.click();
  await expect(prepare).toBeDisabled();
  await page.evaluate(() => (window as any).__installation.failSetup());
  await expect(dialog.getByRole('alert')).toHaveText('Sem conexão. Tente novamente.');
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await expect(prepare).toBeDisabled();
  await page.evaluate(() => (window as any).__installation.finishSetup());
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__installation.setups)).toBe(2);
});

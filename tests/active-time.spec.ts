import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type UsageRecord = Record<string, unknown> & {
  event: string;
  passageId?: string;
  durationMs?: number;
  intervalStartMs?: number;
  intervalEndMs?: number;
};
declare global {
  interface Window {
    activeTimeFixture: {
      records: UsageRecord[];
      context(passage: string): void;
      foreground(visible: boolean, focused: boolean): void;
    };
  }
}

async function open(page: Page) {
  await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-01T12:00:01Z'));
  await page.route('**/tests/active-time-browser.html', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <button id="read">Conferir passagem</button>
      <button id="next">Próxima passagem</button>
      <label>Nota privada<textarea id="note"></textarea></label>
      <script type="module">
        import {installUsageReporting, setUsageContext} from '/src/domain/usage.ts';
        const records = [];
        window.studio = {recordUsage: async record => {records.push(structuredClone(record));}};
        // Simulate browser foreground state deterministically; inputs below are
        // actual Playwright pointer/keyboard events, whose isTrusted flag is true.
        let visible = true, focused = true;
        Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => visible ? 'visible' : 'hidden'});
        document.hasFocus = () => focused;
        const context = passageId => setUsageContext({projectId: 'project:fixture', passageId, revisionId: 'revision:fixture'});
        window.activeTimeFixture = {records, context, foreground(nextVisible, nextFocused) {
          visible = nextVisible; focused = nextFocused;
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event(focused ? 'focus' : 'blur'));
        }};
        context('passage:a');
        installUsageReporting();
        installUsageReporting(); // Installing twice must not duplicate listeners/timers.
        document.getElementById('next').onclick = () => context('passage:b');
      </script></body></html>`,
    }),
  );
  await page.goto('/tests/active-time-browser.html');
  await page.waitForFunction(() => !!window.activeTimeFixture);
}
const records = (page: Page) => page.evaluate(() => window.activeTimeFixture.records);

test('dictionary iframe relays bounded trusted activity through its verified parent receiver without text', async ({
  page,
  baseURL,
}) => {
  const fingerprint = 'sha256:' + 'a'.repeat(64);
  const origin = new URL(baseURL!).origin;
  await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-01T12:00:01Z'));
  await page.route('**/__activity_dictionary_bridge.js', async (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: await readFile('runtime/dictionary/bridge.js', 'utf8'),
    }),
  );
  await page.route('**/nhe-enga/?*', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body>
    <label>Pesquisa privada<input></label><div id="results"></div>
    <script src="/__activity_dictionary_bridge.js" data-parent-origin="${origin}" data-dataset-fingerprint="${fingerprint}"></script>
    </body></html>`,
    }),
  );
  await page.goto('/tests/dictionary-harness.html');
  await page.evaluate(() => {
    window.dictionaryControl.status.url = window.dictionaryControl.status.url!.replace(
      'studio://dictionary',
      location.origin,
    );
  });
  await page.getByRole('button', { name: 'Abrir aba', exact: true }).click();
  const input = page.frameLocator('iframe').getByLabel('Pesquisa privada');
  await expect(input).toBeVisible();
  await page.evaluate(async () => {
    const url = '/src/domain/usage.ts';
    const usage = await import(url);
    const records: UsageRecord[] = [];
    window.studio!.recordUsage = async (event) => {
      records.push(structuredClone(event) as UsageRecord);
    };
    window.activeTimeFixture = {
      records,
      context: (passageId) => usage.setUsageContext({ projectId: 'project:fixture', passageId }),
      foreground() {},
    };
    window.activeTimeFixture.context('passage:a');
    Object.assign(window, { iframeActivityMessages: [] });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'studio-dictionary-activity')
        (window as unknown as { iframeActivityMessages: unknown[] }).iframeActivityMessages.push(
          event.data,
        );
    });
    usage.installUsageReporting();
  });
  const activity = {
    type: 'studio-dictionary-activity',
    version: 1,
    datasetFingerprint: fingerprint,
  };
  await page.evaluate((activity) => {
    window.dictionaryControl.send(activity, 'https://outside.invalid');
    window.dictionaryControl.send(activity, location.origin, 'parent');
    window.dictionaryControl.send({ ...activity, datasetFingerprint: 'wrong' }, location.origin);
    window.dictionaryControl.send({ ...activity, text: 'must never be accepted' }, location.origin);
  }, activity);
  await page.clock.runFor(90_000);
  expect(await records(page)).toEqual([]);
  await page.evaluate(() => {
    (window as unknown as { iframeActivityMessages: unknown[] }).iframeActivityMessages = [];
  });
  await input.evaluate((element) =>
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'synthetic' })),
  );
  await input.fill('private search text');
  await input.pressSequentially(' still private');
  const messages = () =>
    page.evaluate(
      () => (window as unknown as { iframeActivityMessages: unknown[] }).iframeActivityMessages,
    );
  await expect.poll(messages).toEqual([activity]);
  await page.clock.runFor(5_000);
  await input.press('ArrowLeft');
  await expect.poll(messages).toEqual([activity, activity]);
  await page.clock.runFor(2_000);
  await page.evaluate(() => window.activeTimeFixture.context('passage:b'));
  expect(await records(page)).toEqual([
    expect.objectContaining({
      event: 'activity.active',
      passageId: 'passage:a',
      durationMs: 7_000,
      details: {},
    }),
  ]);
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(25_000);
    await input.press('ArrowRight');
  }
  await page.evaluate(() => window.activeTimeFixture.context('passage:c'));
  expect(
    (await records(page))
      .filter((item) => item.passageId === 'passage:b')
      .reduce((sum, item) => sum + item.durationMs!, 0),
  ).toBe(75_000);
  expect(JSON.stringify(await records(page))).not.toMatch(/private|synthetic|must never/);
  expect(
    (await messages()).every((message) => JSON.stringify(message) === JSON.stringify(activity)),
  ).toBe(true);
});

test('trusted activity splits by passage and excludes hidden/blurred time without recording text', async ({
  page,
}) => {
  await open(page);
  await page.clock.fastForward(30_000);
  expect(await records(page)).toEqual([]);
  await page.evaluate(() =>
    document
      .querySelector('textarea')!
      .dispatchEvent(new InputEvent('input', { bubbles: true, data: 'synthetic secret' })),
  );
  await page.clock.fastForward(30_000);
  expect(await records(page)).toEqual([]);

  await page.getByLabel('Nota privada').pressSequentially('do not collect: private@example.test');
  await page.clock.runFor(7_000);
  await page.getByRole('button', { name: 'Próxima passagem' }).click();
  let events = await records(page);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event: 'activity.active',
    passageId: 'passage:a',
    durationMs: 7_000,
    details: {},
  });
  await page.clock.runFor(5_000);
  await page.evaluate(() => window.activeTimeFixture.foreground(true, false));
  events = await records(page);
  expect(events[1]).toMatchObject({ passageId: 'passage:b', durationMs: 5_000 });
  await page.clock.fastForward(120_000);
  await page.evaluate(() => window.activeTimeFixture.foreground(false, false));
  await page.clock.fastForward(120_000);
  expect(await records(page)).toHaveLength(2);
  await page.evaluate(() => window.activeTimeFixture.foreground(true, true));
  await page.clock.runFor(3_000);
  await page.evaluate(() => window.activeTimeFixture.context('passage:c'));
  events = await records(page);
  expect(events[2]).toMatchObject({ passageId: 'passage:b', durationMs: 3_000 });
  expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length);
  for (const [index, event] of events.entries()) {
    expect(event.intervalEndMs! - event.intervalStartMs!).toBe(event.durationMs);
    if (index)
      expect(event.intervalStartMs!).toBeGreaterThanOrEqual(events[index - 1].intervalEndMs!);
    expect(Object.keys(event).sort()).toEqual([
      'details',
      'durationMs',
      'event',
      'eventId',
      'intervalEndMs',
      'intervalStartMs',
      'passageId',
      'projectId',
      'revisionId',
    ]);
  }
  expect(JSON.stringify(events)).not.toMatch(
    /private@example|do not collect|synthetic secret|Nota privada/,
  );
});

test('idle reading and suspended timers are bounded and pagehide stops credit until pageshow', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Conferir passagem' }).click();
  await page.clock.runFor(90_000);
  expect((await records(page)).map((item) => item.durationMs)).toEqual([30_000, 30_000]);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
  await page.clock.fastForward(30_000);
  expect(await records(page)).toHaveLength(2);
  await page.getByRole('button', { name: 'Conferir passagem' }).click();
  await page.clock.fastForward(600_000);
  expect((await records(page)).map((item) => item.durationMs)).toEqual([30_000, 30_000, 30_000]);
  await page.getByRole('button', { name: 'Conferir passagem' }).click();
  await page.clock.runFor(1_000);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  expect((await records(page)).at(-1)).toMatchObject({ durationMs: 1_000 });
  const count = (await records(page)).length;
  await page.clock.runFor(90_000);
  expect(await records(page)).toHaveLength(count);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await page.clock.runFor(1_000);
  await page.evaluate(() => window.activeTimeFixture.context('passage:b'));
  expect((await records(page)).at(-1)).toMatchObject({ passageId: 'passage:a', durationMs: 1_000 });
});

import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __activityFetches: { keepalive: boolean; input: Record<string, unknown> }[];
    __activityOriginal?: Record<string, unknown>;
  }
}

async function hostedActivity(
  page: Page,
  skew: number,
  response: (attempt: number) => number = () => 200,
) {
  let attempts = 0;
  await page.addInitScript((skew) => {
    const now = Date.now.bind(Date);
    Date.now = () => now() + skew;
    const fetch = window.fetch.bind(window);
    window.__activityFetches = [];
    window.fetch = (input, init) => {
      if (String(input) === '/api/usage')
        window.__activityFetches.push({
          keepalive: init?.keepalive === true,
          input: JSON.parse(String(init?.body)),
        });
      return fetch(input, init);
    };
  }, skew);
  await page.route('**/activity-transport', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Activity transport fixture</title>',
    }),
  );
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/me')
      return route.fulfill({
        json: {
          user: { id: 'fixture', role: 'contributor' },
          csrf: 'fixture-only',
          serverTime: Date.now(),
        },
      });
    if (pathname === '/api/events')
      return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    if (pathname === '/api/usage') {
      const status = response(++attempts);
      return route.fulfill({
        status,
        ...(status === 503 ? { headers: { 'Retry-After': '1' } } : {}),
        json:
          status === 200
            ? { ok: true }
            : { error: { code: 'FIXTURE_FAILURE', message: 'Simulated failure' } },
      });
    }
    throw new Error(`Unexpected fixture request: ${pathname}`);
  });
  await page.goto('/activity-transport');
  await page.addScriptTag({ path: 'server/public/bridge.js' });
}

async function report(page: Page, age = 0) {
  return page.evaluate(async (age) => {
    const end = Date.now() - age;
    const event = {
      event: 'activity.active',
      eventId: crypto.randomUUID(),
      passageId: 'passage:fixture',
      intervalStartMs: end - 30000,
      intervalEndMs: end,
      durationMs: 30000,
    };
    window.__activityOriginal = structuredClone(event);
    await window.studio!.recordUsage!(event);
    return { original: event, fetches: window.__activityFetches };
  }, age);
}

for (const skew of [8 * 3600000, -8 * 3600000]) {
  test(`activity uses the server clock when the browser clock is ${skew > 0 ? 'ahead' : 'behind'}`, async ({
    page,
  }) => {
    await hostedActivity(page, skew);
    const before = Date.now();
    const { original, fetches } = await report(page);
    expect(fetches).toHaveLength(1);
    const sent = fetches[0].input;
    expect(fetches[0].keepalive).toBe(true);
    expect(sent.eventId).toBe(original.eventId);
    expect(Number(sent.intervalEndMs)).toBeGreaterThanOrEqual(before - 1000);
    expect(Number(sent.intervalEndMs)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(Number(sent.intervalEndMs) - Number(sent.intervalStartMs)).toBe(30000);
    expect(Math.abs(original.intervalEndMs - Number(sent.intervalEndMs) - skew)).toBeLessThan(1000);
    expect(original).toEqual(await page.evaluate(() => window.__activityOriginal));
  });
}

test('one transient retry preserves the calibrated interval and event identity exactly', async ({
  page,
}) => {
  await hostedActivity(page, 4 * 3600000, (attempt) => (attempt === 1 ? 503 : 200));
  const { fetches } = await report(page);
  expect(fetches).toHaveLength(2);
  expect(fetches[1]).toEqual(fetches[0]);
  expect(fetches.every((item) => item.keepalive)).toBe(true);
  expect(Number(fetches[1].input.intervalEndMs)).toBeLessThanOrEqual(Date.now() + 1000);
});

test('permanent failures are not retried', async ({ page }) => {
  await hostedActivity(page, 0, () => 400);
  expect((await report(page)).fetches).toHaveLength(1);
});

test('intervals beyond the recent window are not retried', async ({ page }) => {
  await hostedActivity(page, 0, () => 503);
  expect((await report(page, 100000)).fetches).toHaveLength(1);
});

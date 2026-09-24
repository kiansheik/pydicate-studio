import { defineConfig } from '@playwright/test';

// The desk ships streamlined: the secondary tools are off until a reader asks for them.
// The suite covers the full set, so it opens with the preference already on; the default
// desk has its own spec in tests/streamlined-desk.spec.ts.
// Only the origin this config actually serves: an entry for a port nothing is listening on
// makes the browser context initialise against a dead server.
export const advancedTools = (origin: string) => ({
  cookies: [],
  origins: [
    {
      origin,
      localStorage: [
        {
          name: 'pydicate-studio:tools:v1',
          value: JSON.stringify({ version: 1, advanced: true }),
        },
      ],
    },
  ],
});

export default defineConfig({
  testDir: './tests',
  // Independent Node crash probes run via node --test, outside the browser runner.
  testIgnore: '**/*.test.cjs',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    storageState: advancedTools('http://127.0.0.1:5173'),
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

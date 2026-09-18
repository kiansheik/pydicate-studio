import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const port = Number(process.env.STUDIO_TEST_PORT || 5197);
export default defineConfig({
  ...base,
  testMatch: '**/learning.spec.ts',
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});

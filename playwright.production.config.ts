import { defineConfig, devices } from '@playwright/test';

const productionUrl = process.env.PRODUCTION_SMOKE_URL;

if (!productionUrl) throw new Error('PRODUCTION_SMOKE_URL is required.');
if (!process.env.PRODUCTION_E2E_ACCOUNTS_JSON)
  throw new Error('PRODUCTION_E2E_ACCOUNTS_JSON is required.');

export default defineConfig({
  testDir: './e2e',
  testMatch: ['production-smoke.spec.ts', 'real-backend-lifecycle.spec.ts'],
  timeout: 30_000,
  retries: 2,
  reporter: 'list',
  use: {
    baseURL: productionUrl,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

import { defineConfig, devices } from '@playwright/test';

const runtimeProcess = Reflect.get(globalThis, 'process') as
  { env?: Record<string, string | undefined> } | undefined;
const runtimeEnv = runtimeProcess?.env ?? {};
const isCI = Boolean(runtimeEnv.CI);
const serverOrigin = 'http://127.0.0.1:5173';

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '/';

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

const appBaseUrl = new URL(normalizeBasePath(runtimeEnv.VITE_BASE_PATH), serverOrigin).toString();

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: appBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: appBaseUrl,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
      VITE_DEMO_MODE: 'false',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config (Phase 8 §12.2).
 *
 * globalSetup starts the NestJS API (:3001) + builds shared-contracts; the
 * webServer starts Next.js (:3000), whose next.config rewrites proxy /api/*
 * to the API. Tests drive the browser against :3000.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reportDir: 'playwright-report',
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: true,
    cwd: __dirname,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});

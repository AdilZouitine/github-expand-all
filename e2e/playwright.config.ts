import path from 'node:path';

import { defineConfig } from '@playwright/test';

import { E2E_DIR, HARNESS_ORIGIN, REPO_ROOT } from './helpers/paths.ts';

/**
 * Browser E2E for GitHub Expand All.
 *
 * Chromium loads the unpacked WXT build from `.output/chrome-mv3` and visits
 * `https://github.com/...` URLs that Playwright fulfills from the local
 * harness (see `e2e/harness/README.md`).
 *
 * Firefox MV3 extension loading is unsupported in Playwright. The Firefox
 * project runs harness-only tests; CI uses web-ext lint on the Firefox
 * package separately.
 */
export default defineConfig({
  testDir: E2E_DIR,
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: path.join(REPO_ROOT, 'playwright-report'),
      },
    ],
  ],
  outputDir: path.join(REPO_ROOT, 'test-results'),
  use: {
    baseURL: HARNESS_ORIGIN,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/harness/server.mjs',
    cwd: REPO_ROOT,
    url: `${HARNESS_ORIGIN}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        headless: true,
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});

import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
} from '@playwright/test';

import { installGitHubIntercept } from './github.ts';
import { resolveChromeExtensionPath } from './paths.ts';

type ExtensionFixtures = {
  context: BrowserContext;
};

/**
 * Playwright fixtures: Chromium loads the unpacked WXT build; GitHub URLs
 * are fulfilled from the local harness.
 *
 * Firefox cannot reliably load Manifest V3 extensions in Playwright. Specs
 * that import `test` from this module skip on Firefox. Harness-only coverage
 * imports `@playwright/test` instead. CI lints the Firefox package with
 * web-ext separately.
 */
export const test = base.extend<ExtensionFixtures>({
  context: async ({ browserName }, use) => {
    test.skip(
      browserName !== 'chromium',
      'Firefox MV3 extension loading is unsupported in Playwright.',
    );
    const extensionPath = resolveChromeExtensionPath();
    const context = await chromium.launchPersistentContext('', {
      // Chrome for Testing is required to load MV3 extensions in headless mode.
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      viewport: { width: 1280, height: 720 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    if (context.serviceWorkers().length === 0) {
      await context
        .waitForEvent('serviceworker', { timeout: 5_000 })
        .catch(() => {
          return undefined;
        });
    }
    await installGitHubIntercept(context);
    await use(context);
    await context.close();
  },
});

export { expect };

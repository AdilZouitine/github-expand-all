/**
 * Map `https://github.com/**` to the local harness so the production
 * content-script match pattern injects on a fake GitHub origin.
 */

import type { BrowserContext, Page } from '@playwright/test';

import { HARNESS_ORIGIN } from './paths.ts';

/**
 * Fulfill GitHub document and asset requests from the harness server.
 *
 * Other hosts are left untouched. Client-side `pushState` stays on
 * `https://github.com`, so later SPA navigations keep matching the extension.
 *
 * @param context - Browser context that will visit `https://github.com/...`
 * @param harnessOrigin - Local server origin (Playwright webServer).
 */
export async function installGitHubIntercept(
  context: BrowserContext,
  harnessOrigin: string = HARNESS_ORIGIN,
): Promise<void> {
  await context.route('https://github.com/**', async (route) => {
    const githubUrl = new URL(route.request().url());
    const rewritten = new URL(
      `${githubUrl.pathname}${githubUrl.search}`,
      harnessOrigin,
    );
    const response = await route.fetch({ url: rewritten.href });
    await route.fulfill({ response });
  });
}

/**
 * Open a harness route as `https://github.com{pathname}`.
 *
 * @param page - Page in a context that already installed the intercept.
 * @param pathname - Path beginning with `/`, optional query string.
 */
export async function gotoGitHub(page: Page, pathname: string): Promise<void> {
  const url = new URL(pathname, 'https://github.com');
  await page.goto(url.href, { waitUntil: 'load' });
}

/**
 * Wait until `document_idle`-timed content scripts have had a chance to run.
 *
 * Unsupported routes never mount a host; asserting count 0 immediately after
 * `load` can race the MV3 content script. Supported routes should prefer
 * `waitForHost` instead of this helper.
 *
 * @param page - Loaded harness document.
 * @param extraMs - Additional delay after `readyState === 'complete'`.
 */
export async function waitForContentScript(
  page: Page,
  extraMs: number = 800,
): Promise<void> {
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate((delay) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, delay);
    });
  }, extraMs);
}

/**
 * Client-side harness navigation: render, `pushState`, then `turbo:load`.
 *
 * @param page - Page whose document loaded the harness SPA.
 * @param pathname - In-origin path (and optional query).
 */
export async function harnessNavigate(
  page: Page,
  pathname: string,
): Promise<void> {
  await page.evaluate((nextPath) => {
    const win = window as unknown as {
      __harness?: { navigate: (path: string) => void };
    };
    if (win.__harness === undefined) {
      throw new Error('Harness SPA is not loaded');
    }
    win.__harness.navigate(nextPath);
  }, pathname);
}

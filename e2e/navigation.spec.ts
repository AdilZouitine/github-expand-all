import { expect as harnessExpect, test as harnessTest } from '@playwright/test';

import {
  clickExpandAll,
  getExpandButton,
  getExtensionHosts,
  readStatus,
  waitForHost,
} from './helpers/extension.ts';
import { gotoGitHub, harnessNavigate } from './helpers/github.ts';
import {
  ISSUE_PATH,
  PULL_PATH,
  REPO_HOME_PATH,
  SLOW_PATH,
} from './helpers/paths.ts';
import { expect, test } from './helpers/test.ts';

test.describe('SPA navigation with the extension loaded', () => {
  test('supported to supported remounts a single host and aborts in-flight work', async ({
    page,
  }) => {
    await gotoGitHub(page, SLOW_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    await expect.poll(async () => readStatus(page)).toMatch(/Expanding/u);

    await harnessNavigate(page, PULL_PATH);
    await expect(page).toHaveURL(/\/pull\/2(?:\?|$)/u);
    await waitForHost(page);
    await expect(getExtensionHosts(page)).toHaveCount(1);
    await expect(getExpandButton(page)).toHaveText('Expand all');
    await expect.poll(async () => readStatus(page)).not.toMatch(/Expanding/u);
  });

  test('supported to unsupported removes the host', async ({ page }) => {
    await gotoGitHub(page, ISSUE_PATH);
    await waitForHost(page);
    await harnessNavigate(page, REPO_HOME_PATH);
    await expect(page).toHaveURL(/\/owner\/repo(?:\?|$)/u);
    await expect(getExtensionHosts(page)).toHaveCount(0);
    await expect(
      page.locator('[data-testid="issue-viewer-container"]'),
    ).toHaveCount(0);
  });
});

harnessTest.describe('harness SPA (no extension)', () => {
  // Firefox cannot load the MV3 extension in Playwright; this is the
  // documented Firefox subset. Chromium also runs it against localhost.
  harnessTest(
    'renders Issue markup and client-navigates to an unsupported home',
    async ({ page }) => {
      await page.goto('/owner/repo/issues/1');
      await harnessExpect(
        page.locator('[data-testid="issue-viewer-container"]'),
      ).toBeVisible();
      await harnessExpect(
        page.locator('[data-testid="issue-header-actions"]'),
      ).toBeVisible();
      await harnessExpect(
        page.locator('button[data-testid="timeline-load-more"]'),
      ).toBeVisible();

      const turboSeen = await page.evaluate(() => {
        let seen = false;
        const onLoad = (): void => {
          seen = true;
        };
        window.addEventListener('turbo:load', onLoad, { once: true });
        const win = window as unknown as {
          __harness?: { navigate: (path: string) => void };
        };
        if (win.__harness === undefined) {
          throw new Error('Harness SPA is not loaded');
        }
        win.__harness.navigate('/owner/repo');
        window.removeEventListener('turbo:load', onLoad);
        return seen;
      });
      harnessExpect(turboSeen).toBe(true);
      await harnessExpect(
        page.locator('[data-testid="issue-viewer-container"]'),
      ).toHaveCount(0);
      await harnessExpect(
        page.getByRole('heading', { name: 'owner/repo' }),
      ).toBeVisible();
    },
  );
});

import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import {
  clickExpandAll,
  getExpandButton,
  isExpandButtonFocused,
  readStatus,
  triggerExpandAllWithoutFocus,
  waitForHost,
  waitForSettledStatus,
} from './helpers/extension.ts';
import { gotoGitHub } from './helpers/github.ts';
import { EMPTY_PATH, ISSUE_PATH } from './helpers/paths.ts';
import { expect, test } from './helpers/test.ts';

test.describe('accessibility of the extension host', () => {
  test('dark theme still mounts and completes a run', async ({ page }) => {
    await gotoGitHub(page, `${ISSUE_PATH}?theme=dark`);
    await expect(page.locator('html')).toHaveAttribute(
      'data-color-mode',
      'dark',
    );
    await waitForHost(page);
    await clickExpandAll(page);
    await expect
      .poll(async () => readStatus(page))
      .toMatch(/Expanded \d+ items?/u);
  });

  test('Tab then Enter activates Expand all', async ({ page }) => {
    await gotoGitHub(page, ISSUE_PATH);
    await waitForHost(page);
    await page.locator('#page-focus-target').focus();
    await page.keyboard.press('Tab');
    expect(await isExpandButtonFocused(page)).toBe(true);
    await page.keyboard.press('Enter');
    await waitForSettledStatus(page);
  });

  test('Space activates Expand all', async ({ page }) => {
    await gotoGitHub(page, EMPTY_PATH);
    await waitForHost(page);
    await getExpandButton(page).focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => readStatus(page)).toBe('Nothing to expand');
  });

  test('completion does not steal focus from the page', async ({ page }) => {
    await gotoGitHub(page, EMPTY_PATH);
    await waitForHost(page);
    await page.locator('#page-focus-target').focus();
    await expect(page.locator('#page-focus-target')).toBeFocused();
    await triggerExpandAllWithoutFocus(page);
    await waitForSettledStatus(page);
    await expect(page.locator('#page-focus-target')).toBeFocused();
  });

  test('prefers-reduced-motion does not crash a run', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoGitHub(page, ISSUE_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    await waitForSettledStatus(page);
  });

  test('axe finds no critical or serious issues on idle and completed host', async ({
    page,
  }) => {
    await gotoGitHub(page, EMPTY_PATH);
    await waitForHost(page);
    await expectNoSeriousAxeViolations(page);

    await clickExpandAll(page);
    await waitForSettledStatus(page);
    await expectNoSeriousAxeViolations(page);
  });
});

/**
 * Scan `#github-expand-all-host` (including open shadow trees).
 *
 * @param page - Page with a mounted host.
 */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('#github-expand-all-host')
    .analyze();
  const blocking = results.violations.filter((violation) => {
    return violation.impact === 'critical' || violation.impact === 'serious';
  });
  expect(blocking).toEqual([]);
}

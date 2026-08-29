import {
  clickExpandAll,
  expectDestructiveUntouched,
  getExpandButton,
  getExtensionHosts,
  readStatus,
  waitForHost,
  waitForSettledStatus,
} from './helpers/extension.ts';
import { gotoGitHub, waitForContentScript } from './helpers/github.ts';
import {
  EMPTY_PATH,
  ISSUE_LIST_PATH,
  ISSUE_PATH,
  LIMIT_PATH,
  REPO_HOME_PATH,
  SLOW_PATH,
} from './helpers/paths.ts';
import { expect, test } from './helpers/test.ts';

test.describe('GitHub Expand All (Chromium + extension)', () => {
  test('mounts exactly one host on an Issue route', async ({ page }) => {
    await gotoGitHub(page, ISSUE_PATH);
    await waitForHost(page);
    await expect(getExtensionHosts(page)).toHaveCount(1);
    await expect(getExpandButton(page)).toHaveAccessibleName('Expand all');
    await expect(getExpandButton(page)).toHaveText('Expand all');
  });

  test('does not mount on repository home or the issue list', async ({
    page,
  }) => {
    await gotoGitHub(page, REPO_HOME_PATH);
    await waitForContentScript(page);
    await expect(getExtensionHosts(page)).toHaveCount(0);

    await gotoGitHub(page, ISSUE_LIST_PATH);
    await waitForContentScript(page);
    await expect(getExtensionHosts(page)).toHaveCount(0);
  });

  test('one click expands static candidates and an async inserted reveal', async ({
    page,
  }) => {
    await gotoGitHub(page, ISSUE_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    const status = await waitForSettledStatus(page);
    expect(status).toMatch(/Expanded \d+ items?/u);

    await expect(page.locator('#timeline-load-more')).toHaveCount(0);
    await expect(page.locator('#hidden-items-expand')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="comment-show-more"][aria-expanded="false"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="minimized-comment-reveal"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-harness="async-inserted"]')).toBeVisible();
    await expect(
      page.locator('details[data-resolved="true"]'),
    ).toHaveJSProperty('open', true);
    await expect(page.locator('#comment-already-expanded')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.locator('#comment-already-expanded')).not.toHaveAttribute(
      'data-clicked',
      'true',
    );
  });

  test('live region reports Expanded N items and Nothing to expand', async ({
    page,
  }) => {
    await gotoGitHub(page, ISSUE_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    await expect
      .poll(async () => readStatus(page))
      .toMatch(/Expanded \d+ items?/u);
    await expect(getExpandButton(page)).toHaveText('Expand all');

    await gotoGitHub(page, EMPTY_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    await expect.poll(async () => readStatus(page)).toBe('Nothing to expand');
  });

  test('second click while running cancels instead of starting another run', async ({
    page,
  }) => {
    await gotoGitHub(page, SLOW_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    await expect.poll(async () => readStatus(page)).toMatch(/Expanding/u);
    await expect(getExpandButton(page)).toHaveAccessibleName(
      'Cancel expansion',
    );
    await expect(getExpandButton(page)).toHaveText('Cancel');
    await clickExpandAll(page);
    await expect.poll(async () => readStatus(page)).toMatch(/Cancell/u);
    await expect(getExpandButton(page)).toHaveText('Expand all');
  });

  test('cancellation leaves later candidates unactivated', async ({ page }) => {
    await gotoGitHub(page, SLOW_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    await expect(getExpandButton(page)).toHaveText('Cancel');
    await clickExpandAll(page);
    await expect.poll(async () => readStatus(page)).toMatch(/Cancell/u);
    await expect(page.locator('#later-comment-a')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.locator('#later-comment-b')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.locator('#later-minimized')).toBeVisible();
  });

  test('destructive near-matches remain unclicked', async ({ page }) => {
    await gotoGitHub(page, ISSUE_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    await waitForSettledStatus(page);
    await expectDestructiveUntouched(page);
  });

  test('no-progress pagination yields a safety-limit stop', async ({
    page,
  }) => {
    await gotoGitHub(page, LIMIT_PATH);
    await waitForHost(page);
    await clickExpandAll(page);
    const status = await waitForSettledStatus(page);
    expect(status).toMatch(/Stopped after safety limit|could not be expanded/u);
  });
});

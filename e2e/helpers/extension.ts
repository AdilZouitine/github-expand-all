/**
 * Locators and actions for the injected Expand all host.
 */

import { expect, type Locator, type Page } from '@playwright/test';

import { HOST_ATTR, HOST_ATTR_VALUE, HOST_ID } from '../../src/engine/types.ts';

const HOST_LOCATOR = `#${HOST_ID}, [${HOST_ATTR}="${HOST_ATTR_VALUE}"]`;

/**
 * All matching hosts (use for uniqueness assertions).
 *
 * @param page - Page under test.
 */
export function getExtensionHosts(page: Page): Locator {
  return page.locator(HOST_LOCATOR);
}

/**
 * Locator for the unique extension host (open Shadow DOM is pierced).
 *
 * @param page - Page expected to contain the host.
 * @returns Host locator.
 */
export function getExtensionHost(page: Page): Locator {
  return getExtensionHosts(page).first();
}

/**
 * Primary control inside the host (`data-github-expand-all="button"`).
 *
 * @param page - Page expected to contain the host.
 */
export function getExpandButton(page: Page): Locator {
  return getExtensionHost(page).locator('[data-github-expand-all="button"]');
}

/**
 * Polite live-region node inside the host.
 *
 * @param page - Page expected to contain the host.
 */
export function getStatus(page: Page): Locator {
  return getExtensionHost(page).locator('[data-github-expand-all="status"]');
}

/**
 * Click the primary Expand all / Cancel control.
 *
 * @param page - Page expected to contain the host.
 */
export async function clickExpandAll(page: Page): Promise<void> {
  await getExpandButton(page).click();
}

/**
 * Visible live-region text, trimmed.
 *
 * @param page - Page expected to contain the host.
 * @returns Status text, or an empty string if the node has no text.
 */
export async function readStatus(page: Page): Promise<string> {
  const text = await getStatus(page).textContent();
  if (text === null) {
    return '';
  }
  return text.trim();
}

/**
 * Wait until exactly one host is attached and visible.
 *
 * @param page - Supported conversation page.
 */
export async function waitForHost(page: Page): Promise<Locator> {
  const hosts = getExtensionHosts(page);
  await expect(hosts).toHaveCount(1);
  const host = hosts.first();
  await expect(host).toBeVisible();
  return host;
}

/**
 * Wait until the run is no longer in Expanding / Cancelling.
 *
 * @param page - Page with a mounted host.
 */
export async function waitForSettledStatus(page: Page): Promise<string> {
  await expect
    .poll(async () => readStatus(page), { timeout: 15_000 })
    .toMatch(
      /Expanded |Nothing to expand|Stopped after safety limit|Cancelled|Could not finish|could not be expanded/u,
    );
  return readStatus(page);
}

const DESTRUCTIVE_NAMES = [
  'Merge',
  'Close issue',
  'Resolve conversation',
  'Comment',
  'Approve',
] as const;

/**
 * Assert destructive near-matches were never activated.
 *
 * @param page - Conversation page that includes the harness denylist row.
 */
export async function expectDestructiveUntouched(page: Page): Promise<void> {
  for (const name of DESTRUCTIVE_NAMES) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).not.toHaveAttribute('data-clicked', 'true');
  }
}

/**
 * Dispatch `click()` on the primary control without moving focus.
 *
 * @param page - Page expected to contain the host.
 */
export async function triggerExpandAllWithoutFocus(page: Page): Promise<void> {
  await getExpandButton(page).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error('Expand control is not a button');
    }
    node.click();
  });
}

/**
 * True when the expand/cancel button inside the host (or light DOM) is focused.
 *
 * @param page - Page expected to contain the host.
 */
export async function isExpandButtonFocused(page: Page): Promise<boolean> {
  return page.evaluate(
    ({ hostId, hostAttr, hostAttrValue }) => {
      const host = document.querySelector(`#${hostId}`);
      const attrHost = document.querySelector(
        `[${hostAttr}="${hostAttrValue}"]`,
      );
      const root = host ?? attrHost;
      if (root === null) {
        return false;
      }
      const active = document.activeElement;
      const shadowActive = root.shadowRoot?.activeElement ?? null;
      if (shadowActive instanceof HTMLButtonElement) {
        return active === root;
      }
      return root.contains(active) && active instanceof HTMLButtonElement;
    },
    {
      hostId: HOST_ID,
      hostAttr: HOST_ATTR,
      hostAttrValue: HOST_ATTR_VALUE,
    },
  );
}

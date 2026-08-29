/**
 * Idempotent mount of the extension host element.
 *
 * Placement prefers an in-flow header anchor from the selector registry.
 * GitHub expansion controls are never queried from this module.
 */

import {
  HOST_ATTR,
  HOST_ATTR_VALUE,
  HOST_ID,
  HOST_SELECTOR,
} from '../engine/types.ts';
import { findUiAnchor } from '../selectors/registry.ts';
import { findViewButton } from './view.ts';

const FIXED_HOST_CLASS = 'gea-host--fixed';
const STYLE_ATTR_VALUE = 'styles';

/**
 * Return the connected extension host, if one exists.
 *
 * Duplicate connected hosts are removed so mounting stays idempotent.
 *
 * @param doc Document to search.
 */
export function findExistingHost(doc: Document): HTMLElement | null {
  const matches = doc.querySelectorAll(HOST_SELECTOR);
  let found: HTMLElement | null = null;
  for (const node of matches) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (!node.isConnected) {
      node.remove();
      continue;
    }
    if (found !== null && node !== found) {
      node.remove();
      continue;
    }
    found = node;
  }
  return found;
}

/**
 * Mount or reuse the unique extension host and attach an open shadow root.
 *
 * Does not focus any control. When `cssText` is non-empty, it is injected as a
 * `<style>` element inside the shadow root.
 *
 * @param doc Document that will own the host.
 * @param cssText Packaged CSS for shadow isolation. Empty string is allowed.
 */
export function mountHost(doc: Document, cssText: string): HTMLElement {
  const existing = findExistingHost(doc);
  if (existing !== null) {
    ensureShadow(existing, cssText);
    return existing;
  }

  const host = createHostElement(doc);
  const anchor = findUiAnchor(doc);
  if (anchor !== null) {
    host.classList.remove(FIXED_HOST_CLASS);
    anchor.append(host);
    ensureShadow(host, cssText);
    return host;
  }
  host.classList.add(FIXED_HOST_CLASS);
  doc.documentElement.append(host);
  ensureShadow(host, cssText);
  return host;
}

/**
 * Remove the extension host from `doc` if present.
 *
 * @param doc Document that may contain the host.
 */
export function unmountHost(doc: Document): void {
  const host = findExistingHost(doc);
  if (host === null) {
    return;
  }
  host.remove();
}

/**
 * Observe host removal so the controller can remount.
 *
 * The observer never starts an expansion run. Callers must bind `onMissing` to
 * a remount-only path.
 *
 * @param doc Document whose subtree is observed.
 * @param onMissing Called when a previously mounted host is gone.
 * @param signal Aborts observation.
 */
export function attachHostReconcileObserver(
  doc: Document,
  onMissing: () => void,
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (signal.aborted) {
      return;
    }
    if (findExistingHost(doc) !== null) {
      return;
    }
    onMissing();
  });

  observer.observe(doc.documentElement, { childList: true, subtree: true });
  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
    },
    { once: true },
  );
}

/**
 * Return the primary control inside the host shadow tree.
 *
 * @param host Connected extension host.
 */
export function findHostButton(host: HTMLElement): HTMLButtonElement | null {
  const shadow = host.shadowRoot;
  if (shadow === null) {
    return null;
  }
  const button = findViewButton(shadow);
  if (!button?.isConnected) {
    return null;
  }
  return button;
}

/**
 * Restore focus to a replacement host button under strict conditions.
 *
 * Focus is restored only when the initiating control is gone, a host button
 * exists, and `document.activeElement` is `body` or `null`. Never called for
 * first mount (`initiatingControl === null`).
 *
 * @param doc Document that owns focus.
 * @param initiatingControl Control the user activated, if any.
 */
export function restoreHostFocusIfNeeded(
  doc: Document,
  initiatingControl: Element | null,
): void {
  if (initiatingControl === null) {
    return;
  }
  if (initiatingControl.isConnected) {
    return;
  }
  const active = doc.activeElement;
  if (active !== null && active !== doc.body) {
    return;
  }
  const host = findExistingHost(doc);
  if (host === null) {
    return;
  }
  const button = findHostButton(host);
  if (button === null) {
    return;
  }
  button.focus();
}

function createHostElement(doc: Document): HTMLElement {
  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.setAttribute(HOST_ATTR, HOST_ATTR_VALUE);
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'GitHub Expand All');
  return host;
}

function ensureShadow(host: HTMLElement, cssText: string): ShadowRoot {
  if (host.shadowRoot !== null) {
    applyStyles(host.shadowRoot, cssText);
    return host.shadowRoot;
  }
  const shadow = host.attachShadow({ mode: 'open' });
  applyStyles(shadow, cssText);
  return shadow;
}

function applyStyles(shadow: ShadowRoot, cssText: string): void {
  if (cssText.length === 0) {
    return;
  }
  const existing = shadow.querySelector(
    `style[${HOST_ATTR}="${STYLE_ATTR_VALUE}"]`,
  );
  if (existing !== null) {
    existing.textContent = cssText;
    return;
  }
  const style = shadow.ownerDocument.createElement('style');
  style.setAttribute(HOST_ATTR, STYLE_ATTR_VALUE);
  style.textContent = cssText;
  shadow.insertBefore(style, shadow.firstChild);
}

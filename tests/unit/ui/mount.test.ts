import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_ATTR,
  HOST_ATTR_VALUE,
  HOST_ID,
} from '../../../src/engine/types.ts';
import {
  attachHostReconcileObserver,
  findExistingHost,
  findHostButton,
  mountHost,
  restoreHostFocusIfNeeded,
  unmountHost,
} from '../../../src/ui/mount.ts';
import { INITIAL_UI_STATE } from '../../../src/ui/state.ts';
import { renderExpansionView } from '../../../src/ui/view.ts';

function addAnchor(): HTMLElement {
  const anchor = document.createElement('div');
  anchor.setAttribute('data-testid', 'issue-header-actions');
  document.body.append(anchor);
  return anchor;
}

describe('mountHost', () => {
  afterEach(() => {
    unmountHost(document);
    document.body.replaceChildren();
    document.documentElement
      .querySelectorAll('#github-expand-all-host')
      .forEach((node) => {
        node.remove();
      });
  });

  it('removes extra connected hosts', () => {
    addAnchor();
    const first = mountHost(document, '');
    const duplicate = document.createElement('div');
    duplicate.id = HOST_ID;
    duplicate.setAttribute(HOST_ATTR, HOST_ATTR_VALUE);
    document.body.append(duplicate);
    expect(findExistingHost(document)).toBe(first);
    expect(duplicate.isConnected).toBe(false);
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
  });

  it('creates a single identified host with an open shadow root', () => {
    addAnchor();
    const host = mountHost(document, '');
    expect(host.id).toBe(HOST_ID);
    expect(host.getAttribute(HOST_ATTR)).toBe(HOST_ATTR_VALUE);
    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-label')).toBe('GitHub Expand All');
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot?.mode).toBe('open');
    expect(findExistingHost(document)).toBe(host);
    expect(mountHost(document, '')).toBe(host);
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
  });

  it('appends in-flow when a UI anchor exists', () => {
    const anchor = addAnchor();
    const host = mountHost(document, '');
    expect(host.parentElement).toBe(anchor);
    expect(host.classList.contains('gea-host--fixed')).toBe(false);
  });

  it('uses a fixed non-obscuring fallback when no anchor exists', () => {
    const host = mountHost(document, '');
    expect(host.classList.contains('gea-host--fixed')).toBe(true);
    expect(host.parentElement).toBe(document.documentElement);
  });

  it('injects cssText into the shadow tree', () => {
    const host = mountHost(document, '.gea-button { color: red; }');
    const style = host.shadowRoot?.querySelector(
      `style[${HOST_ATTR}="styles"]`,
    );
    expect(style?.textContent).toContain('.gea-button');
    mountHost(document, '.gea-button { color: blue; }');
    expect(style?.textContent).toContain('blue');
  });

  it('does not steal focus on mount', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    mountHost(document, '');
    expect(document.activeElement).toBe(input);
  });

  it('unmounts the host', () => {
    mountHost(document, '');
    unmountHost(document);
    expect(findExistingHost(document)).toBeNull();
    unmountHost(document);
  });

  it('notifies when the host is removed without duplicating it', () => {
    addAnchor();
    const host = mountHost(document, '');
    const onMissing = vi.fn(() => {
      mountHost(document, '');
    });
    const controller = new AbortController();
    attachHostReconcileObserver(document, onMissing, controller.signal);
    host.remove();
    return vi.waitFor(() => {
      expect(onMissing).toHaveBeenCalledTimes(1);
      expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
    });
  });

  it('does not fire onMissing after the observer is aborted', async () => {
    const host = mountHost(document, '');
    const onMissing = vi.fn();
    const controller = new AbortController();
    attachHostReconcileObserver(document, onMissing, controller.signal);
    controller.abort();
    host.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('ignores an already-aborted reconcile signal', () => {
    const onMissing = vi.fn();
    const controller = new AbortController();
    controller.abort();
    attachHostReconcileObserver(document, onMissing, controller.signal);
    mountHost(document, '').remove();
    expect(onMissing).not.toHaveBeenCalled();
  });
});

describe('restoreHostFocusIfNeeded', () => {
  afterEach(() => {
    unmountHost(document);
    document.body.replaceChildren();
  });

  it('does not steal focus when there was no initiating control', () => {
    const host = mountHost(document, '');
    const shadow = host.shadowRoot;
    if (shadow === null) {
      throw new Error('expected shadow');
    }
    renderExpansionView(shadow, {
      state: INITIAL_UI_STATE,
      onIntent: () => undefined,
    });
    restoreHostFocusIfNeeded(document, null);
    expect(document.activeElement).not.toBe(findHostButton(host));
  });

  it('restores focus when the initiator is gone and body is focused', () => {
    addAnchor();
    const firstHost = mountHost(document, '');
    const firstShadow = firstHost.shadowRoot;
    if (firstShadow === null) {
      throw new Error('expected shadow');
    }
    renderExpansionView(firstShadow, {
      state: INITIAL_UI_STATE,
      onIntent: () => undefined,
    });
    const original = findHostButton(firstHost);
    if (original === null) {
      throw new Error('expected button');
    }
    firstHost.remove();
    const replacementHost = mountHost(document, '');
    const replacementShadow = replacementHost.shadowRoot;
    if (replacementShadow === null) {
      throw new Error('expected shadow');
    }
    renderExpansionView(replacementShadow, {
      state: INITIAL_UI_STATE,
      onIntent: () => undefined,
    });
    const replacement = findHostButton(replacementHost);
    if (replacement === null) {
      throw new Error('expected replacement button');
    }
    restoreHostFocusIfNeeded(document, original);
    const focusedInShadow = replacementShadow.activeElement === replacement;
    const focusedHost = document.activeElement === replacementHost;
    expect(focusedInShadow || focusedHost).toBe(true);
  });

  it('does not restore focus when another control is focused', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const host = mountHost(document, '');
    const shadow = host.shadowRoot;
    if (shadow === null) {
      throw new Error('expected shadow');
    }
    renderExpansionView(shadow, {
      state: INITIAL_UI_STATE,
      onIntent: () => undefined,
    });
    const original = findHostButton(host);
    if (original === null) {
      throw new Error('expected button');
    }
    original.remove();
    input.focus();
    restoreHostFocusIfNeeded(document, original);
    expect(document.activeElement).toBe(input);
  });
});

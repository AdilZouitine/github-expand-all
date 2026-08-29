import { afterEach, describe, expect, it } from 'vitest';
import {
  HOST_ATTR,
  HOST_ATTR_VALUE,
  HOST_ID,
} from '../../../src/engine/types.ts';
import { isHostNode } from '../../../src/engine/host.ts';
import { settleMutations } from '../../../src/engine/settle.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

function conversationRoot(): HTMLElement {
  document.body.innerHTML = `
    <div data-testid="issue-viewer-container">
      <div class="timeline"></div>
      <div ${HOST_ATTR}="${HOST_ATTR_VALUE}"><span>host</span></div>
    </div>
    <div id="outside"></div>
  `;
  const root = document.querySelector('[data-testid="issue-viewer-container"]');
  if (!(root instanceof HTMLElement)) {
    throw new Error('missing root');
  }
  return root;
}

describe('settleMutations', () => {
  it('resolves satisfied immediately when isSatisfied is already true', async () => {
    const root = conversationRoot();
    const outcome = await settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 80,
      signal: new AbortController().signal,
      isSatisfied: () => true,
    });
    expect(outcome).toBe('satisfied');
  });

  it('resolves aborted when the signal is already aborted', async () => {
    const root = conversationRoot();
    const controller = new AbortController();
    controller.abort();
    const outcome = await settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 80,
      signal: controller.signal,
    });
    expect(outcome).toBe('aborted');
  });

  it('resets the quiet timer when a second mutation arrives before quiet', async () => {
    const root = conversationRoot();
    const timeline = root.querySelector('.timeline');
    if (!(timeline instanceof HTMLElement)) {
      throw new Error('missing timeline');
    }
    const pending = settleMutations({
      root,
      quietPeriodMs: 40,
      maxSettleMs: 250,
      signal: new AbortController().signal,
    });
    timeline.append(document.createElement('span'));
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 15);
    });
    timeline.append(document.createElement('span'));
    await expect(pending).resolves.toBe('quiet');
  });

  it('resolves satisfied from the quiet timer after a delayed postcondition', async () => {
    const root = conversationRoot();
    const timeline = root.querySelector('.timeline');
    if (!(timeline instanceof HTMLElement)) {
      throw new Error('missing timeline');
    }
    let ready = false;
    const pending = settleMutations({
      root,
      quietPeriodMs: 30,
      maxSettleMs: 250,
      signal: new AbortController().signal,
      isSatisfied: () => ready,
    });
    timeline.append(document.createElement('span'));
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 10);
    });
    ready = true;
    await expect(pending).resolves.toBe('satisfied');
  });

  it('debounces successive relevant mutations into one quiet result', async () => {
    const root = conversationRoot();
    const timeline = root.querySelector('.timeline');
    if (!(timeline instanceof HTMLElement)) {
      throw new Error('missing timeline');
    }
    const pending = settleMutations({
      root,
      quietPeriodMs: 30,
      maxSettleMs: 200,
      signal: new AbortController().signal,
    });
    timeline.append(document.createElement('span'));
    timeline.append(document.createElement('span'));
    await expect(pending).resolves.toBe('quiet');
  });

  it('resolves satisfied from the quiet timer when isSatisfied becomes true', async () => {
    const root = conversationRoot();
    const timeline = root.querySelector('.timeline');
    if (!(timeline instanceof HTMLElement)) {
      throw new Error('missing timeline');
    }
    let ready = false;
    const pending = settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 200,
      signal: new AbortController().signal,
      isSatisfied: () => ready,
    });
    timeline.append(document.createElement('span'));
    ready = true;
    await expect(pending).resolves.toBe('satisfied');
  });

  it('treats abort that races observer setup as aborted', async () => {
    const root = conversationRoot();
    const controller = new AbortController();
    const pending = settleMutations({
      root,
      quietPeriodMs: 40,
      maxSettleMs: 80,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toBe('aborted');
  });

  it('resolves quiet after a relevant mutation and a quiet period', async () => {
    const root = conversationRoot();
    const timeline = root.querySelector('.timeline');
    if (!(timeline instanceof HTMLElement)) {
      throw new Error('missing timeline');
    }
    const pending = settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 200,
      signal: new AbortController().signal,
    });
    timeline.append(document.createElement('span'));
    await expect(pending).resolves.toBe('quiet');
  });

  it('resolves timeout when nothing mutates', async () => {
    const root = conversationRoot();
    const outcome = await settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 30,
      signal: new AbortController().signal,
    });
    expect(outcome).toBe('timeout');
  });

  it('ignores mutations inside the extension host', async () => {
    const root = conversationRoot();
    const host = root.querySelector(`[${HOST_ATTR}]`);
    if (!(host instanceof HTMLElement)) {
      throw new Error('missing host');
    }
    const pending = settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 40,
      signal: new AbortController().signal,
      ignore: (node) => isHostNode(node, host),
    });
    host.append(document.createElement('span'));
    await expect(pending).resolves.toBe('timeout');
  });

  it('does not observe mutations outside the conversation root', async () => {
    const root = conversationRoot();
    const outside = document.querySelector('#outside');
    if (!(outside instanceof HTMLElement)) {
      throw new Error('missing outside');
    }
    const pending = settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 40,
      signal: new AbortController().signal,
    });
    outside.append(document.createElement('span'));
    await expect(pending).resolves.toBe('timeout');
  });

  it('resolves aborted when the signal fires during the wait', async () => {
    const root = conversationRoot();
    const controller = new AbortController();
    const pending = settleMutations({
      root,
      quietPeriodMs: 80,
      maxSettleMs: 200,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toBe('aborted');
  });

  it('treats added nodes as relevant when the mutation target is ignored', async () => {
    const root = conversationRoot();
    const wrapper = document.createElement('div');
    wrapper.id = 'ignored-wrapper';
    root.append(wrapper);
    const pending = settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 200,
      signal: new AbortController().signal,
      ignore: (node) =>
        node instanceof Element && node.id === 'ignored-wrapper',
    });
    wrapper.append(document.createElement('span'));
    await expect(pending).resolves.toBe('quiet');
  });

  it('treats removed nodes as relevant when the mutation target is ignored', async () => {
    const root = conversationRoot();
    const wrapper = document.createElement('div');
    wrapper.id = 'ignored-wrapper';
    const child = document.createElement('span');
    wrapper.append(child);
    root.append(wrapper);
    const pending = settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 200,
      signal: new AbortController().signal,
      ignore: (node) =>
        node instanceof Element && node.id === 'ignored-wrapper',
    });
    child.remove();
    await expect(pending).resolves.toBe('quiet');
  });

  it('resolves satisfied on timeout when isSatisfied became true without mutations', async () => {
    const root = conversationRoot();
    let ready = false;
    const pending = settleMutations({
      root,
      quietPeriodMs: 80,
      maxSettleMs: 30,
      signal: new AbortController().signal,
      isSatisfied: () => ready,
    });
    ready = true;
    await expect(pending).resolves.toBe('satisfied');
  });

  it('resolves satisfied when isSatisfied becomes true after a mutation', async () => {
    const root = conversationRoot();
    const timeline = root.querySelector('.timeline');
    if (!(timeline instanceof HTMLElement)) {
      throw new Error('missing timeline');
    }
    let ready = false;
    const pending = settleMutations({
      root,
      quietPeriodMs: 20,
      maxSettleMs: 200,
      signal: new AbortController().signal,
      isSatisfied: () => ready,
    });
    ready = true;
    timeline.append(document.createElement('span'));
    await expect(pending).resolves.toBe('satisfied');
  });
});

describe('isHostNode', () => {
  it('detects the host element, descendants, and host attribute', () => {
    const root = conversationRoot();
    const host = root.querySelector(`[${HOST_ATTR}]`);
    if (!(host instanceof HTMLElement)) {
      throw new Error('missing host');
    }
    const child = host.querySelector('span');
    if (child === null) {
      throw new Error('missing child');
    }
    expect(isHostNode(host, host)).toBe(true);
    expect(isHostNode(child, host)).toBe(true);
    expect(isHostNode(root, host)).toBe(false);
    expect(isHostNode(child, null)).toBe(true);
  });

  it('detects a host identified only by id', () => {
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.append(host);
    const child = document.createElement('span');
    host.append(child);
    expect(isHostNode(host, null)).toBe(true);
    expect(isHostNode(child, null)).toBe(true);
    expect(isHostNode(document.body, null)).toBe(false);
  });
});

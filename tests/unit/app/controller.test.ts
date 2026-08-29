import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ControllerEngine } from '../../../src/app/controller.ts';
import { startController } from '../../../src/app/controller.ts';
import type {
  Clock,
  ExpansionSummary,
  Logger,
  RunOptions,
  SettleFn,
} from '../../../src/engine/types.ts';
import { emptyRuleCounts, HOST_ID } from '../../../src/engine/types.ts';
import { AbortError, throwIfAborted } from '../../../src/shared/abort.ts';
import { findExistingHost, findHostButton } from '../../../src/ui/mount.ts';
import { loadHtmlFixture } from '../../fixtures/load.ts';

const ISSUE_HREF = 'https://github.com/acme/demo/issues/1';
const ISSUE_HTML = `<!DOCTYPE html><html><body>
<div data-testid="issue-header-actions"></div>
<div data-testid="issue-viewer-container"></div>
</body></html>`;

const silentLogger: Logger = {
  debug(): void {
    return;
  },
};

const settle: SettleFn = async () => 'quiet';

function createTestClock(): Clock {
  let current = 0;
  return {
    now(): number {
      return current;
    },
    async sleep(ms: number, signal: AbortSignal): Promise<void> {
      throwIfAborted(signal);
      current += ms;
    },
  };
}

function completedSummary(
  overrides: Partial<ExpansionSummary> = {},
): ExpansionSummary {
  return {
    outcome: 'completed',
    activated: 0,
    failed: 0,
    skipped: 0,
    passes: 1,
    durationMs: 1,
    terminationReason: 'stable',
    byRule: emptyRuleCounts(),
    ...overrides,
  };
}

function createFakeEngine(
  impl?: (options: RunOptions) => Promise<ExpansionSummary>,
): ControllerEngine & { readonly runMock: ReturnType<typeof vi.fn> } {
  let running = false;
  const runMock = vi.fn(async (options: RunOptions) => {
    running = true;
    try {
      if (impl !== undefined) {
        return await impl(options);
      }
      return completedSummary();
    } finally {
      running = false;
    }
  });
  return {
    runMock,
    isRunning(): boolean {
      return running;
    },
    run: runMock,
  };
}

function hostButton(): HTMLButtonElement {
  const host = findExistingHost(document);
  if (host === null) {
    throw new Error('expected host');
  }
  const button = findHostButton(host);
  if (button === null) {
    throw new Error('expected host button');
  }
  return button;
}

function statusText(): string {
  const host = findExistingHost(document);
  const status = host?.shadowRoot?.querySelector(
    '[data-github-expand-all="status"]',
  );
  return status?.textContent ?? '';
}

describe('startController', () => {
  let handle: { stop(): void } | undefined;
  let href = ISSUE_HREF;

  afterEach(() => {
    handle?.stop();
    handle = undefined;
    document.body.replaceChildren();
  });

  function start(
    engine = createFakeEngine(),
    extra?: { waitForConversationMs?: number },
  ): ReturnType<typeof createFakeEngine> {
    href = ISSUE_HREF;
    const controller = startController({
      document,
      window,
      engine,
      rules: [],
      logger: silentLogger,
      clock: createTestClock(),
      settle,
      cssText: '',
      getHref: () => href,
      ...extra,
    });
    handle = controller;
    return engine;
  }

  it('mounts once on a supported issue page', () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    start();
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
    expect(findExistingHost(document)?.parentElement).not.toBeNull();
  });

  it('does not call the engine until the user expands', () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    const engine = start();
    expect(engine.run).not.toHaveBeenCalled();
  });

  it('calls engine.run with locale en and the conversation root', async () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    const engine = start();
    hostButton().click();
    await vi.waitFor(() => {
      expect(engine.run).toHaveBeenCalledTimes(1);
    });
    const options = engine.runMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error('expected engine.run arguments');
    }
    expect(options.locale).toBe('en');
    expect(options.document).toBe(document);
    expect(options.conversationRoot.getAttribute('data-testid')).toBe(
      'issue-viewer-container',
    );
    expect(options.host?.id).toBe(HOST_ID);
    await vi.waitFor(() => {
      expect(statusText()).toBe('Nothing to expand');
    });
  });

  it('treats a second click as cancel while running', async () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    let captured: AbortSignal | undefined;
    const engine = createFakeEngine(async (options) => {
      captured = options.signal;
      await new Promise<void>((resolve) => {
        options.signal.addEventListener('abort', () => {
          resolve();
        });
      });
      return completedSummary({
        outcome: 'cancelled',
        terminationReason: 'user-cancelled',
      });
    });
    start(engine);
    hostButton().click();
    await vi.waitFor(() => {
      expect(engine.run).toHaveBeenCalledTimes(1);
    });
    hostButton().click();
    await vi.waitFor(() => {
      expect(captured?.aborted).toBe(true);
    });
    expect(captured?.reason).toBe('user-cancelled');
    expect(engine.run).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(statusText()).toBe('Cancelled');
    });
  });

  it('maps engine throws to a failed summary', async () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    const engine = createFakeEngine(async () => {
      throw new Error('boom');
    });
    start(engine);
    hostButton().click();
    await vi.waitFor(() => {
      expect(statusText()).toBe('Could not finish');
    });
  });

  it('maps abort throws to cancelled', async () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    const engine = createFakeEngine(
      async (options: RunOptions): Promise<ExpansionSummary> => {
        await new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new AbortError());
          });
        });
        return completedSummary({
          outcome: 'cancelled',
          terminationReason: 'user-cancelled',
        });
      },
    );
    start(engine);
    hostButton().click();
    await vi.waitFor(() => {
      expect(engine.run).toHaveBeenCalledTimes(1);
    });
    hostButton().click();
    await vi.waitFor(() => {
      expect(statusText()).toBe('Cancelled');
    });
  });

  it('does not mount on unsupported routes', () => {
    loadHtmlFixture(ISSUE_HTML, 'https://github.com/acme/demo');
    href = 'https://github.com/acme/demo';
    handle = startController({
      document,
      window,
      engine: createFakeEngine(),
      rules: [],
      logger: silentLogger,
      clock: createTestClock(),
      settle,
      cssText: '',
      getHref: () => href,
    });
    expect(findExistingHost(document)).toBeNull();
  });

  it('uses window.location when getHref is omitted', () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    handle = startController({
      document,
      window,
      engine: createFakeEngine(),
      rules: [],
      logger: silentLogger,
      clock: createTestClock(),
      settle,
      cssText: '',
    });
    expect(findExistingHost(document)).not.toBeNull();
  });

  it('restores history methods on stop', () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    start();
    expect(window.history.pushState).not.toBe(originalPush);
    handle?.stop();
    handle = undefined;
    expect(window.history.pushState).toBe(originalPush);
    expect(window.history.replaceState).toBe(originalReplace);
  });

  it('times out waiting for a conversation root', async () => {
    document.body.replaceChildren();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(ISSUE_HREF),
    });
    start(createFakeEngine(), { waitForConversationMs: 100 });
    await vi.waitFor(() => {
      expect(findExistingHost(document)).toBeNull();
    });
  });

  it('mounts after the conversation root appears', async () => {
    document.body.replaceChildren();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(ISSUE_HREF),
    });
    start(createFakeEngine(), { waitForConversationMs: 200 });
    const root = document.createElement('div');
    root.setAttribute('data-testid', 'issue-viewer-container');
    document.body.append(root);
    await vi.waitFor(() => {
      expect(findExistingHost(document)).not.toBeNull();
    });
  });

  it('reconciles client-side history.pushState', () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    start();
    expect(findExistingHost(document)).not.toBeNull();
    href = 'https://github.com/acme/demo';
    window.history.pushState({}, '', '/acme/demo');
    expect(findExistingHost(document)).toBeNull();
  });

  it('stop is idempotent', () => {
    loadHtmlFixture(ISSUE_HTML, ISSUE_HREF);
    start();
    handle?.stop();
    handle?.stop();
    handle = undefined;
    expect(findExistingHost(document)).toBeNull();
  });
});

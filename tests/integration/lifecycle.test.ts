import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ControllerEngine } from '../../src/app/controller.ts';
import { startController } from '../../src/app/controller.ts';
import type {
  Clock,
  ExpansionSummary,
  Logger,
  RunOptions,
  SettleFn,
} from '../../src/engine/types.ts';
import { emptyRuleCounts, HOST_ID } from '../../src/engine/types.ts';
import { throwIfAborted } from '../../src/shared/abort.ts';
import { findExistingHost, findHostButton } from '../../src/ui/mount.ts';
import { loadHtmlFixture } from '../fixtures/load.ts';

const ISSUE_HREF = 'https://github.com/acme/demo/issues/1';
const PULL_HREF = 'https://github.com/acme/demo/pull/2';
const HOME_HREF = 'https://github.com/acme/demo';
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

function completedSummary(): ExpansionSummary {
  return {
    outcome: 'completed',
    activated: 0,
    failed: 0,
    skipped: 0,
    passes: 1,
    durationMs: 1,
    terminationReason: 'stable',
    byRule: emptyRuleCounts(),
  };
}

function createFakeEngine(
  impl?: (options: RunOptions) => Promise<ExpansionSummary>,
): ControllerEngine {
  let running = false;
  return {
    isRunning(): boolean {
      return running;
    },
    async run(options: RunOptions): Promise<ExpansionSummary> {
      running = true;
      try {
        if (impl !== undefined) {
          return await impl(options);
        }
        return completedSummary();
      } finally {
        running = false;
      }
    },
  };
}

function clickExpand(): void {
  const host = findExistingHost(document);
  const button = host === null ? null : findHostButton(host);
  if (button === null) {
    throw new Error('expected host button');
  }
  button.click();
}

describe('controller lifecycle', () => {
  let handle: { stop(): void } | undefined;
  let href = ISSUE_HREF;

  afterEach(() => {
    handle?.stop();
    handle = undefined;
    document.body.replaceChildren();
  });

  function boot(
    engine: ControllerEngine = createFakeEngine(),
    startHref = ISSUE_HREF,
  ): ControllerEngine {
    href = startHref;
    loadHtmlFixture(ISSUE_HTML, startHref);
    handle = startController({
      document,
      window,
      engine,
      rules: [],
      logger: silentLogger,
      clock: createTestClock(),
      settle,
      cssText: '',
      getHref: () => href,
    });
    return engine;
  }

  it('mounts exactly once on a supported route', () => {
    boot();
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
  });

  it('does not duplicate the host on repeated turbo:load', () => {
    boot();
    document.dispatchEvent(new Event('turbo:load'));
    document.dispatchEvent(new Event('turbo:load'));
    document.dispatchEvent(new Event('turbo:render'));
    window.dispatchEvent(new Event('pageshow'));
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
  });

  it('unmounts when the route becomes unsupported', () => {
    boot();
    expect(findExistingHost(document)).not.toBeNull();
    href = HOME_HREF;
    document.dispatchEvent(new Event('turbo:load'));
    expect(findExistingHost(document)).toBeNull();
  });

  it('does not remount after SPA render removes the conversation', async () => {
    boot();
    document.body.replaceChildren();
    href = HOME_HREF;
    document.dispatchEvent(new Event('turbo:load'));
    window.dispatchEvent(new Event('turbo:load'));
    await Promise.resolve();
    expect(findExistingHost(document)).toBeNull();
  });

  it('removes UI when navigating supported → unsupported', () => {
    boot();
    href = HOME_HREF;
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(findExistingHost(document)).toBeNull();
  });

  it('cancels an in-flight run when navigating to another supported page', async () => {
    let captured: AbortSignal | undefined;
    const engine = createFakeEngine(async (options) => {
      captured = options.signal;
      await new Promise<void>((resolve) => {
        options.signal.addEventListener('abort', () => {
          resolve();
        });
      });
      return {
        ...completedSummary(),
        outcome: 'cancelled',
        terminationReason: 'navigation',
      };
    });
    boot(engine);
    clickExpand();
    await vi.waitFor(() => {
      expect(captured).toBeDefined();
    });
    href = PULL_HREF;
    document.dispatchEvent(new Event('turbo:load'));
    await vi.waitFor(() => {
      expect(captured?.aborted).toBe(true);
    });
    expect(captured?.reason).toBe('navigation');
    expect(findExistingHost(document)).not.toBeNull();
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
  });

  it('calls the engine on expand intent', async () => {
    const engine = boot(createFakeEngine());
    const run = vi.spyOn(engine, 'run');
    clickExpand();
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call engine.run when recovering a removed host', async () => {
    const engine = boot();
    const run = vi.spyOn(engine, 'run');
    const host = findExistingHost(document);
    if (host === null) {
      throw new Error('expected host');
    }
    host.remove();
    await vi.waitFor(() => {
      expect(findExistingHost(document)).not.toBeNull();
    });
    expect(run).not.toHaveBeenCalled();
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
  });

  it('does not remount after stop', () => {
    boot();
    handle?.stop();
    handle = undefined;
    href = ISSUE_HREF;
    document.dispatchEvent(new Event('turbo:load'));
    expect(findExistingHost(document)).toBeNull();
  });

  it('reconciles through wrapped pushState and replaceState', () => {
    boot();
    href = HOME_HREF;
    window.history.pushState({}, '', '/acme/demo');
    expect(findExistingHost(document)).toBeNull();
    href = ISSUE_HREF;
    window.history.replaceState({}, '', '/acme/demo/issues/1');
    expect(findExistingHost(document)).not.toBeNull();
  });

  it('mounts after a delayed conversation root appears', async () => {
    href = ISSUE_HREF;
    document.body.replaceChildren();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(ISSUE_HREF),
    });
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
      waitForConversationMs: 5_000,
    });
    expect(findExistingHost(document)).toBeNull();
    const root = document.createElement('div');
    root.setAttribute('data-testid', 'issue-viewer-container');
    document.body.append(root);
    await vi.waitFor(() => {
      expect(findExistingHost(document)).not.toBeNull();
    });
  });
});

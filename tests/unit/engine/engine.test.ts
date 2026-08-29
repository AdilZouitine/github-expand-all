import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/engine.ts';
import type {
  ActivationResult,
  ExpansionRule,
  EngineLimits,
  RunOptions,
} from '../../../src/engine/types.ts';
import { AbortError } from '../../../src/shared/abort.ts';
import { createRegistry } from '../../../src/selectors/rules.ts';
import {
  createFakeClock,
  createFakeLogger,
  createImmediateSettle,
} from '../../helpers/fakes.ts';

const registry = createRegistry();

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(inner: string): Element {
  document.body.innerHTML = `<div data-testid="issue-viewer-container">${inner}</div>`;
  const root = document.querySelector('[data-testid="issue-viewer-container"]');
  if (root === null) {
    throw new Error('missing root');
  }
  return root;
}

function runOptions(
  conversationRoot: Element,
  overrides: Partial<RunOptions> = {},
): RunOptions {
  return {
    document,
    conversationRoot,
    host: null,
    locale: 'en',
    rules: registry.rules,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function testEngine(limits?: Partial<EngineLimits>) {
  return createEngine({
    clock: createFakeClock(),
    settle: createImmediateSettle(),
    logger: createFakeLogger(),
    ...(limits === undefined ? {} : { limits }),
  });
}

describe('createEngine', () => {
  it('completes as stable when the conversation is empty', async () => {
    const root = mount(`<p>empty</p>`);
    const engine = testEngine();
    const summary = await engine.run(runOptions(root));
    expect(summary.outcome).toBe('completed');
    expect(summary.terminationReason).toBe('stable');
    expect(summary.activated).toBe(0);
    expect(summary.passes).toBe(1);
    expect(engine.isRunning()).toBe(false);
  });

  it('expands a comment toggle and records byRule counts', async () => {
    const root = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
    `);
    const button = root.querySelector('button');
    if (!(button instanceof HTMLElement)) {
      throw new Error('missing button');
    }
    button.addEventListener('click', () => {
      button.setAttribute('aria-expanded', 'true');
    });
    const summary = await testEngine().run(runOptions(root));
    expect(summary.outcome).toBe('completed');
    expect(summary.activated).toBe(1);
    expect(summary.byRule['comment-expand']).toBe(1);
    expect(summary.byRule['timeline-load-more']).toBe(0);
  });

  it('returns cancelled with duration 0 when a second run starts while busy', async () => {
    const root = mount(`<p>empty</p>`);
    let releaseSettle: (() => void) | undefined;
    let enteredSettle: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enteredSettle = resolve;
    });
    const engine = createEngine({
      clock: createFakeClock(),
      logger: createFakeLogger(),
      settle: async (options) =>
        await new Promise((resolve) => {
          enteredSettle?.();
          if (options.signal.aborted) {
            resolve('aborted');
            return;
          }
          releaseSettle = () => {
            resolve('timeout');
          };
        }),
    });
    const first = engine.run(runOptions(root));
    await entered;
    expect(engine.isRunning()).toBe(true);
    const second = await engine.run(runOptions(root));
    expect(second).toMatchObject({
      outcome: 'cancelled',
      terminationReason: 'user-cancelled',
      durationMs: 0,
      passes: 0,
    });
    releaseSettle?.();
    await first;
  });

  it('maps abort reason navigation vs user-cancelled', async () => {
    const root = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
    `);
    const navigation = new AbortController();
    navigation.abort('navigation');
    const navSummary = await testEngine().run(
      runOptions(root, { signal: navigation.signal }),
    );
    expect(navSummary.outcome).toBe('cancelled');
    expect(navSummary.terminationReason).toBe('navigation');

    const user = new AbortController();
    user.abort();
    const userSummary = await testEngine().run(
      runOptions(root, { signal: user.signal }),
    );
    expect(userSummary.terminationReason).toBe('user-cancelled');
  });

  it('cancels during settle', async () => {
    const root = mount(`<p>empty</p>`);
    const controller = new AbortController();
    const engine = createEngine({
      clock: createFakeClock(),
      logger: createFakeLogger(),
      settle: async (options) => {
        controller.abort();
        if (options.signal.aborted) {
          return 'aborted';
        }
        return 'timeout';
      },
    });
    const summary = await engine.run(
      runOptions(root, { signal: controller.signal }),
    );
    expect(summary.outcome).toBe('cancelled');
  });

  it('cancels during activate when the signal aborts on click', async () => {
    const root = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
    `);
    const controller = new AbortController();
    const button = root.querySelector('button');
    if (!(button instanceof HTMLElement)) {
      throw new Error('missing button');
    }
    button.addEventListener('click', () => {
      controller.abort();
    });
    const summary = await testEngine().run(
      runOptions(root, { signal: controller.signal }),
    );
    expect(summary.outcome).toBe('cancelled');
    expect(summary.terminationReason).toBe('user-cancelled');
  });

  it('cancels during activate when the rule throws AbortError', async () => {
    const root = mount(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>`,
    );
    const aborting: ExpansionRule = {
      ...registry.rule('comment-expand'),
      async activate(): Promise<ActivationResult> {
        throw new AbortError();
      },
    };
    const summary = await testEngine().run(
      runOptions(root, { rules: [aborting] }),
    );
    expect(summary.outcome).toBe('cancelled');
    expect(summary.terminationReason).toBe('user-cancelled');
  });

  it('isolates candidate errors and continues the run', async () => {
    const root = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
    `);
    const comment = registry.rule('comment-expand');
    const throwing: ExpansionRule = {
      ...comment,
      async activate(): Promise<ActivationResult> {
        throw new Error('isolated');
      },
    };
    const loadMore = root.querySelector('[data-testid="timeline-load-more"]');
    if (!(loadMore instanceof HTMLElement)) {
      throw new Error('missing load more');
    }
    loadMore.addEventListener('click', () => {
      loadMore.remove();
    });
    const summary = await testEngine().run(
      runOptions(root, {
        rules: [throwing, registry.rule('timeline-load-more')],
      }),
    );
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(summary.activated).toBeGreaterThanOrEqual(1);
    expect(summary.outcome).toBe('completed');
  });

  it('stops as partial when consecutive no-progress hits the limit', async () => {
    const root = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c2">Show more</button>
    `);
    const summary = await testEngine({
      maxConsecutiveNoProgressPasses: 2,
    }).run(runOptions(root));
    expect(summary.outcome).toBe('partial');
    expect(summary.terminationReason).toBe('limit');
    expect(summary.skipped).toBeGreaterThanOrEqual(2);
  });

  it('stops as partial when pagination clicks never change the DOM', async () => {
    const root = mount(`
      <button type="button" data-testid="timeline-load-more" id="pager-a">Load more</button>
      <button type="button" data-testid="timeline-load-more" id="pager-b">Load more</button>
    `);
    const summary = await testEngine({
      maxConsecutiveNoProgressPasses: 2,
    }).run(runOptions(root));
    expect(summary.outcome).toBe('partial');
    expect(summary.terminationReason).toBe('limit');
    expect(summary.activated).toBe(0);
  });

  it('stops as partial when maxPasses is reached with remaining work', async () => {
    const root = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/t?1">Load more</button>
      <button type="button" data-testid="timeline-load-more" data-url="/t?2">Load more</button>
    `);
    const summary = await testEngine({ maxPasses: 1 }).run(runOptions(root));
    expect(summary.outcome).toBe('partial');
    expect(summary.terminationReason).toBe('limit');
    expect(summary.passes).toBe(1);
  });

  it('stops as partial when maxActivations is reached with remaining work', async () => {
    const root = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/t?1">Load more</button>
      <button type="button" data-testid="timeline-load-more" data-url="/t?2">Load more</button>
    `);
    for (const node of root.querySelectorAll('button')) {
      node.addEventListener('click', () => {
        node.remove();
      });
    }
    const summary = await testEngine({ maxActivations: 1 }).run(
      runOptions(root),
    );
    expect(summary.outcome).toBe('partial');
    expect(summary.activated).toBe(1);
  });

  it('stops as partial when maxRuntimeMs elapses', async () => {
    const root = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/t?1">Load more</button>
    `);
    let now = 0;
    const engine = createEngine({
      logger: createFakeLogger(),
      settle: createImmediateSettle(),
      clock: {
        now(): number {
          now += 100;
          return now;
        },
        async sleep(_ms: number, signal: AbortSignal): Promise<void> {
          if (signal.aborted) {
            throw new AbortError();
          }
        },
      },
      limits: { maxRuntimeMs: 50 },
    });
    const summary = await engine.run(runOptions(root));
    expect(summary.outcome).toBe('partial');
    expect(summary.terminationReason).toBe('limit');
  });

  it('returns failed for unexpected errors', async () => {
    const root = mount(`<button type="button">Show more</button>`);
    const exploding: ExpansionRule = {
      ...registry.rule('comment-expand'),
      selectors: ['button'],
      isCandidate(): boolean {
        throw new Error('discover boom');
      },
    };
    const summary = await testEngine().run(
      runOptions(root, { rules: [exploding] }),
    );
    expect(summary.outcome).toBe('failed');
    expect(summary.terminationReason).toBe('unexpected-error');
  });

  it('does not reactivate a replaced node with the same data-url', async () => {
    const root = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=same">Load more</button>
    `);
    root.addEventListener('click', (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.getAttribute('data-testid') !== 'timeline-load-more') {
        return;
      }
      const clone = target.cloneNode(true);
      if (!(clone instanceof HTMLElement)) {
        return;
      }
      clone.setAttribute('data-url', '/timeline?after=same');
      target.replaceWith(clone);
    });
    const summary = await testEngine().run(runOptions(root));
    expect(summary.activated).toBe(1);
    expect(summary.outcome).toBe('completed');
  });

  it('reactivates pagination when the replacement uses a new data-url', async () => {
    const root = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=page1">Load more</button>
    `);
    root.addEventListener('click', (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.getAttribute('data-testid') !== 'timeline-load-more') {
        return;
      }
      const url = target.getAttribute('data-url');
      if (url === '/timeline?after=page1') {
        const next = target.cloneNode(true);
        if (!(next instanceof HTMLElement)) {
          return;
        }
        next.setAttribute('data-url', '/timeline?after=page2');
        target.replaceWith(next);
        return;
      }
      target.remove();
    });
    const summary = await testEngine().run(runOptions(root));
    expect(summary.activated).toBe(2);
    expect(summary.byRule['timeline-load-more']).toBe(2);
    expect(summary.outcome).toBe('completed');
  });

  it('enforces maxActivationsPerRun even when pagination identity changes', async () => {
    const root = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=page1">Load more</button>
    `);
    root.addEventListener('click', (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const next = target.cloneNode(true);
      if (!(next instanceof HTMLElement)) {
        return;
      }
      next.setAttribute('data-url', '/timeline?after=page2');
      target.replaceWith(next);
    });
    const limited: ExpansionRule = {
      ...registry.rule('timeline-load-more'),
      maxActivationsPerRun: 1,
    };
    const summary = await testEngine().run(
      runOptions(root, { rules: [limited] }),
    );
    expect(summary.activated).toBe(1);
    expect(summary.outcome).toBe('completed');
  });

  it('cancels when settle aborts after a successful activation', async () => {
    const root = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
    `);
    const button = root.querySelector('button');
    if (!(button instanceof HTMLElement)) {
      throw new Error('missing button');
    }
    button.addEventListener('click', () => {
      button.setAttribute('aria-expanded', 'true');
    });
    const controller = new AbortController();
    let activations = 0;
    const engine = createEngine({
      clock: createFakeClock(),
      logger: createFakeLogger(),
      settle: async () => {
        activations += 1;
        if (activations >= 1) {
          controller.abort('user-cancelled');
          return 'aborted';
        }
        return 'quiet';
      },
    });
    const summary = await engine.run(
      runOptions(root, { signal: controller.signal }),
    );
    expect(summary.outcome).toBe('cancelled');
    expect(summary.activated).toBe(1);
  });
});

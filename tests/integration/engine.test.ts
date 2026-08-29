import { afterEach, describe, expect, it } from 'vitest';
import { discoverCandidates } from '../../src/engine/discover.ts';
import { createEngine } from '../../src/engine/engine.ts';
import type { RunOptions } from '../../src/engine/types.ts';
import { conversationRoot, loadHtmlFixture } from '../fixtures/load.ts';
import { readHtmlFixture } from '../fixtures/read.ts';
import { createRegistry } from '../../src/selectors/rules.ts';
import {
  createFakeClock,
  createFakeLogger,
  createImmediateSettle,
} from '../helpers/fakes.ts';
import {
  preventFormSubmit,
  wireAsyncPagination,
  wireStandardExpansions,
} from '../helpers/wire.ts';

const registry = createRegistry();

afterEach(() => {
  document.body.innerHTML = '';
});

function engine() {
  return createEngine({
    clock: createFakeClock(),
    settle: createImmediateSettle(),
    logger: createFakeLogger(),
  });
}

function options(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    document,
    conversationRoot: conversationRoot(),
    host: null,
    locale: 'en',
    rules: registry.rules,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('engine integration', () => {
  it('completes a stable empty conversation', async () => {
    loadHtmlFixture(readHtmlFixture('empty.html'));
    const summary = await engine().run(options());
    expect(summary.outcome).toBe('completed');
    expect(summary.terminationReason).toBe('stable');
    expect(summary.activated).toBe(0);
  });

  it('expands the full issue fixture sequence', async () => {
    loadHtmlFixture(readHtmlFixture('issue.html'));
    preventFormSubmit(document);
    wireStandardExpansions(conversationRoot());
    const summary = await engine().run(options());
    expect(summary.outcome).toBe('completed');
    expect(summary.activated).toBe(4);
    expect(summary.byRule['timeline-load-more']).toBe(1);
    expect(summary.byRule['timeline-hidden-items']).toBe(1);
    expect(summary.byRule['minimized-comment-reveal']).toBe(1);
    expect(summary.byRule['comment-expand']).toBe(1);
    expect(
      discoverCandidates(registry.rules, {
        document,
        conversationRoot: conversationRoot(),
        host: null,
        locale: 'en',
      }),
    ).toEqual([]);
  });

  it('expands pull request review threads and comment pagers', async () => {
    loadHtmlFixture(
      readHtmlFixture('pull.html'),
      'https://github.com/acme/demo/pull/2',
    );
    wireStandardExpansions(conversationRoot());
    const summary = await engine().run(options());
    expect(summary.outcome).toBe('completed');
    expect(summary.byRule['review-thread-expand']).toBeGreaterThanOrEqual(1);
    expect(summary.byRule['review-comments-load-more']).toBe(1);
    expect(summary.activated).toBeGreaterThanOrEqual(2);
  });

  it('follows async pagination inserted by a click listener', async () => {
    loadHtmlFixture(readHtmlFixture('async.html'));
    wireAsyncPagination(conversationRoot());
    const summary = await engine().run(options());
    expect(summary.outcome).toBe('completed');
    expect(summary.byRule['timeline-load-more']).toBe(2);
    expect(summary.activated).toBe(2);
  });

  it('leaves already-expanded conversations untouched', async () => {
    loadHtmlFixture(readHtmlFixture('already-expanded.html'));
    const summary = await engine().run(options());
    expect(summary.outcome).toBe('completed');
    expect(summary.activated).toBe(0);
  });

  it('does not activate negative controls', async () => {
    loadHtmlFixture(readHtmlFixture('negative.html'));
    const summary = await engine().run(options());
    expect(summary.activated).toBe(0);
    expect(summary.outcome).toBe('completed');
  });
});

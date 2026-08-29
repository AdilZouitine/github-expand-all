import { afterEach, describe, expect, it } from 'vitest';
import { discoverCandidates } from '../../src/engine/discover.ts';
import { conversationRoot, loadHtmlFixture } from '../fixtures/load.ts';
import { readHtmlFixture } from '../fixtures/read.ts';
import { createRegistry } from '../../src/selectors/rules.ts';
import { discoveryContext } from '../helpers/fakes.ts';

const registry = createRegistry();

afterEach(() => {
  document.body.innerHTML = '';
});

describe('discovery integration', () => {
  it('finds issue controls in priority order', () => {
    loadHtmlFixture(readHtmlFixture('issue.html'));
    const found = discoverCandidates(
      registry.rules,
      discoveryContext(conversationRoot()),
    );
    expect(found.map((candidate) => candidate.rule.id)).toEqual([
      'timeline-load-more',
      'timeline-hidden-items',
      'minimized-comment-reveal',
      'comment-expand',
    ]);
  });

  it('finds pull request review controls', () => {
    loadHtmlFixture(
      readHtmlFixture('pull.html'),
      'https://github.com/acme/demo/pull/2',
    );
    const found = discoverCandidates(
      registry.rules,
      discoveryContext(conversationRoot()),
    );
    expect(found.map((candidate) => candidate.rule.id)).toEqual([
      'review-thread-expand',
      'review-thread-expand',
      'review-comments-load-more',
    ]);
  });

  it('finds nothing in an empty conversation', () => {
    loadHtmlFixture(readHtmlFixture('empty.html'));
    expect(
      discoverCandidates(registry.rules, discoveryContext(conversationRoot())),
    ).toEqual([]);
  });

  it('finds nothing when controls are already expanded', () => {
    loadHtmlFixture(readHtmlFixture('already-expanded.html'));
    expect(
      discoverCandidates(registry.rules, discoveryContext(conversationRoot())),
    ).toEqual([]);
  });

  it('never discovers destructive or out-of-root controls', () => {
    loadHtmlFixture(readHtmlFixture('negative.html'));
    expect(
      discoverCandidates(registry.rules, discoveryContext(conversationRoot())),
    ).toEqual([]);
  });

  it('is deterministic for the issue fixture', () => {
    loadHtmlFixture(readHtmlFixture('issue.html'));
    const context = discoveryContext(conversationRoot());
    const first = discoverCandidates(registry.rules, context).map((candidate) =>
      candidate.element.getAttribute('data-testid'),
    );
    const second = discoverCandidates(registry.rules, context).map(
      (candidate) => candidate.element.getAttribute('data-testid'),
    );
    expect(first).toEqual(second);
  });
});

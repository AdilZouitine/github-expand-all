import { afterEach, describe, expect, it } from 'vitest';
import { discoverCandidates } from '../../../src/engine/discover.ts';
import type {
  ActivationResult,
  DiscoveryContext,
  ExpansionRule,
} from '../../../src/engine/types.ts';
import { createRegistry } from '../../../src/selectors/rules.ts';
import { discoveryContext } from '../../helpers/fakes.ts';

const registry = createRegistry();

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(inner: string): {
  root: Element;
  context: DiscoveryContext;
} {
  document.body.innerHTML = `<div data-testid="issue-viewer-container">${inner}</div>`;
  const root = document.querySelector('[data-testid="issue-viewer-container"]');
  if (root === null) {
    throw new Error('missing conversation root');
  }
  return { root, context: discoveryContext(root) };
}

describe('discoverCandidates', () => {
  it('returns an empty list when there are no matches', () => {
    const { context } = mount(`<p>nothing</p>`);
    expect(discoverCandidates(registry.rules, context)).toEqual([]);
  });

  it('queries only inside the conversation root', () => {
    document.body.innerHTML = `
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=out">Load more</button>
      <div data-testid="issue-viewer-container">
        <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
      </div>
    `;
    const root = document.querySelector(
      '[data-testid="issue-viewer-container"]',
    );
    if (root === null) {
      throw new Error('missing root');
    }
    const found = discoverCandidates(registry.rules, discoveryContext(root));
    expect(found).toHaveLength(1);
    expect(found[0]?.rule.id).toBe('comment-expand');
  });

  it('sorts by priority then document order', () => {
    const { context } = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
      <div class="minimized-comment">
        <button type="button" data-testid="minimized-comment-reveal">Show comment</button>
      </div>
      <div class="js-timeline-item-hidden">
        <button type="button" data-testid="hidden-items-expand">Show 1 hidden items</button>
      </div>
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
    `);
    const found = discoverCandidates(registry.rules, context);
    expect(found.map((candidate) => candidate.rule.id)).toEqual([
      'timeline-load-more',
      'timeline-hidden-items',
      'minimized-comment-reveal',
      'comment-expand',
    ]);
  });

  it('dedupes the same element matched by multiple selectors of one rule', () => {
    const { context } = mount(`
      <form class="ajax-pagination-form">
        <button type="submit" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
      </form>
    `);
    const found = discoverCandidates(registry.rules, context);
    const loadMore = found.filter(
      (candidate) => candidate.rule.id === 'timeline-load-more',
    );
    expect(loadMore).toHaveLength(1);
  });

  it('omits destructive controls even when they look expandable', () => {
    const { context } = mount(`
      <button type="button">Merge</button>
      <button type="button">Close issue</button>
      <button type="button">Resolve conversation</button>
      <button type="submit" name="comment">Comment</button>
    `);
    expect(discoverCandidates(registry.rules, context)).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const { context } = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
    `);
    const first = discoverCandidates(registry.rules, context).map(
      (candidate) => candidate.rule.id,
    );
    const second = discoverCandidates(registry.rules, context).map(
      (candidate) => candidate.rule.id,
    );
    expect(first).toEqual(second);
  });

  it('skips non-HTMLElement matches such as SVG nodes', () => {
    const { context } = mount(`
      <svg data-testid="timeline-load-more"></svg>
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
    `);
    const found = discoverCandidates(registry.rules, context);
    expect(found).toHaveLength(1);
    expect(found[0]?.element.tagName).toBe('BUTTON');
  });

  it('keeps an element that matches a later rule after an earlier rule already saw it', () => {
    const first: ExpansionRule = {
      id: 'timeline-load-more',
      selectors: ['button'],
      priority: 10,
      maxActivationsPerRun: 10,
      modelsPagination: true,
      isCandidate: () => true,
      activate: async (element): Promise<ActivationResult> => ({
        status: 'activated',
        ruleId: 'timeline-load-more',
        reason: element.tagName,
      }),
    };
    const second: ExpansionRule = {
      ...first,
      id: 'comment-expand',
      priority: 20,
      modelsPagination: false,
    };
    const { context } = mount(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>`,
    );
    const found = discoverCandidates([first, second], context);
    expect(found).toHaveLength(2);
    expect(found.map((candidate) => candidate.rule.id)).toEqual([
      'timeline-load-more',
      'comment-expand',
    ]);
  });

  it('omits matches that fail safety after isCandidate', () => {
    const rule: ExpansionRule = {
      id: 'comment-expand',
      selectors: ['button'],
      priority: 1,
      maxActivationsPerRun: 10,
      modelsPagination: false,
      isCandidate: () => true,
      activate: async (): Promise<ActivationResult> => ({
        status: 'activated',
        ruleId: 'comment-expand',
      }),
    };
    const { context } = mount(
      `<button type="button" hidden aria-expanded="false">Show more</button>`,
    );
    expect(discoverCandidates([rule], context)).toEqual([]);
  });
});

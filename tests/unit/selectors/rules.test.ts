import { afterEach, describe, expect, it } from 'vitest';
import { RULE_IDS, type DiscoveryContext } from '../../../src/engine/types.ts';
import { createRegistry } from '../../../src/selectors/rules.ts';
import { RULE_SELECTORS } from '../../../src/selectors/registry.ts';
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

function firstControl(root: Element): HTMLElement {
  const node =
    root.querySelector('button') ??
    root.querySelector('summary') ??
    root.querySelector('a');
  if (!(node instanceof HTMLElement)) {
    throw new Error('missing control');
  }
  return node;
}

describe('createRegistry', () => {
  it('exposes unique rules for every RuleId', () => {
    const ids = registry.rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(RULE_IDS.length);
    expect(ids).toHaveLength(RULE_IDS.length);
    for (const id of RULE_IDS) {
      expect(registry.rule(id).id).toBe(id);
      expect(registry.rule(id).selectors).toEqual(RULE_SELECTORS[id]);
    }
  });

  it('sorts rules by priority so containers run first', () => {
    const priorities = registry.rules.map((rule) => rule.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    expect(registry.rule('timeline-load-more').priority).toBe(10);
    expect(registry.rule('timeline-hidden-items').priority).toBe(20);
    expect(registry.rule('review-thread-expand').priority).toBe(30);
    expect(registry.rule('review-comments-load-more').priority).toBe(40);
    expect(registry.rule('minimized-comment-reveal').priority).toBe(50);
    expect(registry.rule('comment-expand').priority).toBe(60);
  });

  it('records pagination flags and per-run limits', () => {
    expect(registry.rule('timeline-load-more').modelsPagination).toBe(true);
    expect(registry.rule('timeline-load-more').maxActivationsPerRun).toBe(50);
    expect(registry.rule('timeline-hidden-items').modelsPagination).toBe(false);
    expect(registry.rule('timeline-hidden-items').maxActivationsPerRun).toBe(
      20,
    );
    expect(registry.rule('review-thread-expand').maxActivationsPerRun).toBe(50);
    expect(registry.rule('review-comments-load-more').modelsPagination).toBe(
      true,
    );
    expect(registry.rule('minimized-comment-reveal').maxActivationsPerRun).toBe(
      50,
    );
    expect(registry.rule('comment-expand').maxActivationsPerRun).toBe(100);
  });

  it('throws for an unknown rule id', () => {
    expect(() =>
      registry.rule('not-a-rule' as (typeof RULE_IDS)[number]),
    ).toThrow(/Unknown rule/);
  });
});

describe('rule families', () => {
  it('timeline-load-more matches testid, ajax form, data-url, and English name', () => {
    const rule = registry.rule('timeline-load-more');
    const { root, context } = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
  });

  it('timeline-load-more rejects a near-match comment expand', () => {
    const rule = registry.rule('timeline-load-more');
    const { root, context } = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(false);
  });

  it('timeline-hidden-items matches hidden-item structure and rejects Show more', () => {
    const rule = registry.rule('timeline-hidden-items');
    const { root, context } = mount(`
      <div class="js-timeline-item-hidden">
        <button type="button">Show 4 hidden items</button>
      </div>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
    const other = mount(
      `<button type="button" aria-expanded="false">Show more</button>`,
    );
    expect(rule.isCandidate(firstControl(other.root), other.context)).toBe(
      false,
    );
  });

  it('review-thread-expand matches resolved details and rejects Resolve conversation', () => {
    const rule = registry.rule('review-thread-expand');
    const { root, context } = mount(`
      <details data-resolved="true">
        <summary>Show resolved</summary>
      </details>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
    const destructive = mount(
      `<button type="button">Resolve conversation</button>`,
    );
    expect(
      rule.isCandidate(firstControl(destructive.root), destructive.context),
    ).toBe(false);
  });

  it('review-comments-load-more matches English pager names', () => {
    const rule = registry.rule('review-comments-load-more');
    const { root, context } = mount(`
      <button type="button" data-testid="load-more-review-comments">Load more comments</button>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
    const near = mount(`<button type="button">Load more</button>`);
    expect(rule.isCandidate(firstControl(near.root), near.context)).toBe(false);
  });

  it('minimized-comment-reveal matches wrapper and rejects Show more', () => {
    const rule = registry.rule('minimized-comment-reveal');
    const { root, context } = mount(`
      <div class="minimized-comment">
        <button type="button">Show comment</button>
      </div>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
    const near = mount(
      `<button type="button" data-testid="comment-show-more">Show more</button>`,
    );
    expect(rule.isCandidate(firstControl(near.root), near.context)).toBe(false);
  });

  it('comment-expand matches truncated comments and does not steal other families', () => {
    const rule = registry.rule('comment-expand');
    const { root, context } = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);

    const pagination = mount(
      `<button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1" aria-expanded="false" aria-controls="x">Show more</button>`,
    );
    expect(
      rule.isCandidate(firstControl(pagination.root), pagination.context),
    ).toBe(false);

    const hidden = mount(
      `<div class="js-timeline-item-hidden"><button type="button" aria-expanded="false" aria-controls="h">Show 2 hidden items</button></div>`,
    );
    expect(rule.isCandidate(firstControl(hidden.root), hidden.context)).toBe(
      false,
    );

    const minimized = mount(
      `<div class="minimized-comment"><button type="button" aria-expanded="false" aria-controls="m">Show comment</button></div>`,
    );
    expect(
      rule.isCandidate(firstControl(minimized.root), minimized.context),
    ).toBe(false);
  });

  it('comment-expand matches data-expand-kind', () => {
    const rule = registry.rule('comment-expand');
    const { root, context } = mount(`
      <button type="button" data-expand-kind="comment" aria-expanded="false">Show more</button>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
  });

  it('skips already expanded non-pagination controls', () => {
    const { root, context } = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="true" aria-controls="c1">Show more</button>
    `);
    expect(
      registry.rule('comment-expand').isCandidate(firstControl(root), context),
    ).toBe(false);
  });

  it('timeline-load-more matches ajax pagination forms and data-url without testid', () => {
    const rule = registry.rule('timeline-load-more');
    const form = mount(`
      <form class="ajax-pagination-form">
        <button type="submit">Load more</button>
      </form>
    `);
    expect(rule.isCandidate(firstControl(form.root), form.context)).toBe(true);
    const urlOnly = mount(
      `<button type="button" data-url="/timeline?after=9">Older</button>`,
    );
    expect(rule.isCandidate(firstControl(urlOnly.root), urlOnly.context)).toBe(
      true,
    );
    const english = mount(`<button type="button">Show older</button>`);
    expect(rule.isCandidate(firstControl(english.root), english.context)).toBe(
      true,
    );
  });

  it('timeline-hidden-items matches testid show-hidden-items', () => {
    const rule = registry.rule('timeline-hidden-items');
    const { root, context } = mount(`
      <button type="button" data-testid="show-hidden-items">Reveal</button>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
  });

  it('review-thread-expand matches js-resolvable-timeline-thread-container', () => {
    const rule = registry.rule('review-thread-expand');
    const { root, context } = mount(`
      <details class="js-resolvable-timeline-thread-container">
        <summary>Thread</summary>
      </details>
    `);
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
  });

  it('review-comments-load-more matches English load more review comments', () => {
    const rule = registry.rule('review-comments-load-more');
    const { root, context } = mount(
      `<button type="button">Load more review comments</button>`,
    );
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
  });

  it('minimized-comment-reveal matches testid without wrapper', () => {
    const rule = registry.rule('minimized-comment-reveal');
    const { root, context } = mount(
      `<button type="button" data-testid="minimized-comment-reveal">Open</button>`,
    );
    expect(rule.isCandidate(firstControl(root), context)).toBe(true);
  });
});

describe('locale', () => {
  it('skips text-only matches when locale is unknown', () => {
    const { root } = mount(
      `<button type="button" aria-expanded="false" aria-controls="c1">Show more</button>`,
    );
    const unknown = discoveryContext(root, 'unknown');
    expect(
      registry.rule('comment-expand').isCandidate(firstControl(root), unknown),
    ).toBe(false);
  });

  it('keeps non-text signals when locale is unknown', () => {
    const { root } = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">続きを表示</button>
    `);
    const unknown = discoveryContext(root, 'unknown');
    expect(
      registry
        .rule('timeline-load-more')
        .isCandidate(firstControl(root), unknown),
    ).toBe(true);
  });
});

describe('activate', () => {
  it('clicks a summary and opens details without innerHTML', async () => {
    const { root } = mount(`
      <details data-resolved="true">
        <summary>Show resolved</summary>
      </details>
    `);
    const summary = firstControl(root);
    const details = root.querySelector('details');
    if (!(details instanceof HTMLDetailsElement)) {
      throw new Error('missing details');
    }
    const result = await registry
      .rule('review-thread-expand')
      .activate(summary, new AbortController().signal);
    expect(result.status).toBe('activated');
    expect(details.open).toBe(true);
  });

  it('returns no-progress when a comment toggle does not expand', async () => {
    const { root } = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>
    `);
    const result = await registry
      .rule('comment-expand')
      .activate(firstControl(root), new AbortController().signal);
    expect(result.status).toBe('no-progress');
  });

  it('throws when the signal is aborted before click', async () => {
    const { root } = mount(`
      <button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>
    `);
    const controller = new AbortController();
    controller.abort();
    await expect(
      registry
        .rule('comment-expand')
        .activate(firstControl(root), controller.signal),
    ).rejects.toThrow();
  });

  it('returns no-progress when pagination does not change the DOM', async () => {
    const { root } = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
    `);
    const result = await registry
      .rule('timeline-load-more')
      .activate(firstControl(root), new AbortController().signal);
    expect(result.status).toBe('no-progress');
  });

  it('treats pagination as activated when the control disconnects', async () => {
    const { root } = mount(`
      <button type="button" data-testid="timeline-load-more" data-url="/timeline?after=1">Load more</button>
    `);
    const button = firstControl(root);
    button.addEventListener('click', () => {
      button.remove();
    });
    const result = await registry
      .rule('timeline-load-more')
      .activate(button, new AbortController().signal);
    expect(result.status).toBe('activated');
  });
});

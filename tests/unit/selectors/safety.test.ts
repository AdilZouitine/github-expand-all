import { afterEach, describe, expect, it } from 'vitest';
import { HOST_ATTR, HOST_ATTR_VALUE } from '../../../src/engine/types.ts';
import { createRegistry } from '../../../src/selectors/rules.ts';
import {
  accessibleName,
  isApprovedInteractiveControl,
  isVisibleAndEnabled,
  matchesDestructiveDenylist,
  passesSafetyPredicates,
  semanticFingerprint,
} from '../../../src/selectors/safety.ts';
import { discoveryContext } from '../../helpers/fakes.ts';

const registry = createRegistry();
const commentRule = registry.rule('comment-expand');
const loadMoreRule = registry.rule('timeline-load-more');

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(inner: string): {
  root: Element;
  context: ReturnType<typeof discoveryContext>;
} {
  document.body.innerHTML = `<div data-testid="issue-viewer-container">${inner}</div>`;
  const root = document.querySelector('[data-testid="issue-viewer-container"]');
  if (root === null) {
    throw new Error('missing conversation root');
  }
  return { root, context: discoveryContext(root) };
}

function button(root: Element, selector = 'button'): HTMLButtonElement {
  const node = root.querySelector(selector);
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error('missing button');
  }
  return node;
}

describe('accessibleName', () => {
  it('prefers aria-labelledby over aria-label and text', () => {
    const { root } = mount(
      `<span id="lbl">Show more</span><button aria-labelledby="lbl" aria-label="ignored">text</button>`,
    );
    expect(accessibleName(button(root))).toBe('Show more');
  });

  it('uses aria-label when labelledby ids are missing', () => {
    const { root } = mount(
      `<button aria-labelledby="missing" aria-label="Show comment">inner</button>`,
    );
    expect(accessibleName(button(root))).toBe('Show comment');
  });

  it('uses aria-label when labelledby is empty', () => {
    const { root } = mount(`<button aria-label="Show comment">inner</button>`);
    expect(accessibleName(button(root))).toBe('Show comment');
  });

  it('falls back to text content', () => {
    const { root } = mount(`<button>Load more</button>`);
    expect(accessibleName(button(root))).toBe('Load more');
  });

  it('collapses whitespace', () => {
    const { root } = mount(`<button>Show   \n  more</button>`);
    expect(accessibleName(button(root))).toBe('Show more');
  });
});

describe('isApprovedInteractiveControl', () => {
  it('accepts buttons, summaries, details, and role=button links', () => {
    const { root } = mount(`
      <button type="button">b</button>
      <details><summary>s</summary></details>
      <a href="#" role="button">a</a>
    `);
    expect(isApprovedInteractiveControl(button(root))).toBe(true);
    const summary = root.querySelector('summary');
    const details = root.querySelector('details');
    const link = root.querySelector('a');
    expect(summary !== null && isApprovedInteractiveControl(summary)).toBe(
      true,
    );
    expect(details !== null && isApprovedInteractiveControl(details)).toBe(
      true,
    );
    expect(link !== null && isApprovedInteractiveControl(link)).toBe(true);
  });

  it('rejects divs, plain links, and inputs', () => {
    const { root } = mount(`
      <div>d</div>
      <a href="#">plain</a>
      <input type="button" value="x" />
    `);
    const div = root.querySelector('div');
    const link = root.querySelector('a');
    const input = root.querySelector('input');
    expect(div !== null && isApprovedInteractiveControl(div)).toBe(false);
    expect(link !== null && isApprovedInteractiveControl(link)).toBe(false);
    expect(input !== null && isApprovedInteractiveControl(input)).toBe(false);
  });
});

describe('matchesDestructiveDenylist', () => {
  const denied = [
    'Resolve conversation',
    'Unresolve',
    'Merge',
    'Close issue',
    'Reopen',
    'Delete',
    'Edit',
    'Minimize',
    'Report',
    'Block',
    'Unsubscribe',
    'Approve',
    'Dismiss review',
    'Submit comment',
    'Comment',
    'Add reaction',
  ];

  it.each(denied)('denies %s', (label) => {
    const { root } = mount(`<button type="button">${label}</button>`);
    expect(matchesDestructiveDenylist(button(root))).toBe(true);
  });

  const allowed = [
    'Show resolved',
    'Load more',
    'Show more',
    'Show comment',
    'Show hidden items',
    'Show 3 hidden items',
  ];

  it.each(allowed)('allows %s', (label) => {
    const { root } = mount(`<button type="button">${label}</button>`);
    expect(matchesDestructiveDenylist(button(root))).toBe(false);
  });

  it('matches name and data-action whole phrases', () => {
    const { root } = mount(
      `<button type="submit" name="comment" data-action="comment#submit">Save</button>`,
    );
    expect(matchesDestructiveDenylist(button(root))).toBe(true);
  });

  it('does not treat resolve as a substring of Show resolved', () => {
    const { root } = mount(
      `<button type="button" aria-label="Show resolved">x</button>`,
    );
    expect(matchesDestructiveDenylist(button(root))).toBe(false);
  });
});

describe('isVisibleAndEnabled', () => {
  it('accepts a visible enabled button', () => {
    const { root } = mount(`<button type="button">Show more</button>`);
    expect(isVisibleAndEnabled(button(root))).toBe(true);
  });

  it('rejects hidden, aria-hidden, inert, disabled, and aria-disabled', () => {
    const { root } = mount(`
      <button type="button" hidden>a</button>
      <button type="button" aria-hidden="true">b</button>
      <button type="button" inert>c</button>
      <button type="button" disabled>d</button>
      <button type="button" aria-disabled="true">e</button>
    `);
    const buttons = [...root.querySelectorAll('button')];
    expect(buttons).toHaveLength(5);
    for (const node of buttons) {
      expect(isVisibleAndEnabled(node)).toBe(false);
    }
  });

  it('rejects computed display, visibility, and opacity', () => {
    const { root } = mount(`
      <button type="button" style="display: none">a</button>
      <button type="button" style="visibility: hidden">b</button>
      <button type="button" style="opacity: 0">c</button>
    `);
    for (const node of root.querySelectorAll('button')) {
      expect(isVisibleAndEnabled(node)).toBe(false);
    }
  });

  it('rejects hidden and inert ancestors', () => {
    const { root } = mount(`
      <div hidden><button type="button">a</button></div>
      <div aria-hidden="true"><button type="button">b</button></div>
      <div inert><button type="button">c</button></div>
      <fieldset disabled><button type="button">d</button></fieldset>
    `);
    for (const node of root.querySelectorAll('button')) {
      expect(isVisibleAndEnabled(node)).toBe(false);
    }
  });
});

describe('passesSafetyPredicates', () => {
  it('accepts a connected visible button inside the conversation', () => {
    const { root, context } = mount(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>`,
    );
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      true,
    );
  });

  it('rejects a disconnected element', () => {
    const { root, context } = mount(`<button type="button">Show more</button>`);
    const node = button(root);
    node.remove();
    expect(passesSafetyPredicates(node, context, commentRule)).toBe(false);
  });

  it('rejects a control from another document', () => {
    const { root, context } = mount(`<button type="button">Show more</button>`);
    const foreign = document.implementation.createHTMLDocument('x');
    const foreignBtn = foreign.createElement('button');
    foreignBtn.textContent = 'Show more';
    foreign.body.append(foreignBtn);
    expect(root.contains(button(root))).toBe(true);
    expect(passesSafetyPredicates(foreignBtn, context, commentRule)).toBe(
      false,
    );
  });

  it('rejects non-interactive nodes', () => {
    const { root, context } = mount(`<div>Show more</div>`);
    const div = root.querySelector('div');
    if (div === null) {
      throw new Error('missing div');
    }
    expect(passesSafetyPredicates(div, context, commentRule)).toBe(false);
  });

  it('rejects controls outside the conversation root', () => {
    document.body.innerHTML = `
      <button type="button" id="out">Show more</button>
      <div data-testid="issue-viewer-container"></div>
    `;
    const root = document.querySelector(
      '[data-testid="issue-viewer-container"]',
    );
    const out = document.querySelector('#out');
    if (root === null || !(out instanceof HTMLButtonElement)) {
      throw new Error('missing nodes');
    }
    expect(
      passesSafetyPredicates(out, discoveryContext(root), commentRule),
    ).toBe(false);
  });

  it('rejects controls inside #github-expand-all-host', () => {
    const { root, context } = mount(`
      <div id="github-expand-all-host">
        <button type="button">Show more</button>
      </div>
    `);
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      false,
    );
  });

  it('rejects controls inside the extension host element', () => {
    const { root, context } = mount(`
      <div id="host-wrap" ${HOST_ATTR}="${HOST_ATTR_VALUE}">
        <button type="button">Show more</button>
      </div>
    `);
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      false,
    );
  });

  it('rejects controls contained by the host parameter', () => {
    const { root } = mount(`
      <div id="custom-host"><button type="button">Show more</button></div>
    `);
    const host = root.querySelector('#custom-host');
    if (!(host instanceof HTMLElement)) {
      throw new Error('missing host');
    }
    const context = discoveryContext(root, 'en', host);
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      false,
    );
  });

  it('rejects destructive controls', () => {
    const { root, context } = mount(`<button type="button">Merge</button>`);
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      false,
    );
  });

  it('rejects already expanded controls unless the rule paginates', () => {
    const { root, context } = mount(
      `<button type="button" aria-expanded="true">Show more</button>`,
    );
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      false,
    );
    expect(passesSafetyPredicates(button(root), context, loadMoreRule)).toBe(
      true,
    );
  });

  it('rejects an open details disclosure', () => {
    const { root, context } = mount(
      `<details open><summary>Show resolved</summary></details>`,
    );
    const summary = root.querySelector('summary');
    if (!(summary instanceof HTMLElement)) {
      throw new Error('missing summary');
    }
    expect(
      passesSafetyPredicates(
        summary,
        context,
        registry.rule('review-thread-expand'),
      ),
    ).toBe(false);
  });

  it('rejects disabled fieldset descendants and computed display none', () => {
    const { root, context } = mount(`
      <fieldset disabled><button type="button">Show more</button></fieldset>
    `);
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      false,
    );
    const hidden = mount(
      `<button type="button" style="display:none">Show more</button>`,
    );
    expect(isVisibleAndEnabled(button(hidden.root))).toBe(false);
  });

  it('rejects data-action destructive phrases and prefix words', () => {
    const { root } = mount(
      `<button type="button" data-action="delete comment">x</button>`,
    );
    expect(matchesDestructiveDenylist(button(root))).toBe(true);
    const prefix = mount(
      `<button type="button" aria-label="edit description">x</button>`,
    );
    expect(matchesDestructiveDenylist(button(prefix.root))).toBe(true);
  });

  it('rejects inert HTMLElement ancestors', () => {
    const { root, context } = mount(
      `<div inert><button type="button">Show more</button></div>`,
    );
    expect(passesSafetyPredicates(button(root), context, commentRule)).toBe(
      false,
    );
  });
});

describe('semanticFingerprint', () => {
  it('returns undefined when no identity attributes exist', () => {
    const { root } = mount(`<button type="button">Show more</button>`);
    expect(semanticFingerprint(button(root), 'comment-expand')).toBe(undefined);
  });

  it('includes rule id, id, aria-controls, data-url, and test id', () => {
    const { root } = mount(`
      <button
        id="btn-1"
        data-testid="timeline-load-more"
        data-url="/timeline?after=a"
        aria-controls="pane"
      >Load more</button>
    `);
    const fingerprint = semanticFingerprint(button(root), 'timeline-load-more');
    expect(fingerprint).toContain('timeline-load-more');
    expect(fingerprint).toContain('btn-1');
    expect(fingerprint).toContain('pane');
    expect(fingerprint).toContain('/timeline?after=a');
  });

  it('uses href on role=button anchors', () => {
    const { root } = mount(
      `<a href="/timeline?page=2" role="button" id="pager">Load more</a>`,
    );
    const link = root.querySelector('a');
    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error('missing link');
    }
    expect(semanticFingerprint(link, 'timeline-load-more')).toContain(
      '/timeline?page=2',
    );
  });
});

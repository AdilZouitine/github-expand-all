/**
 * Declarative GitHub-DOM selectors. Application code must import these
 * constants rather than embedding querySelector strings.
 */

import type { ExpansionRule, RuleId } from '../engine/types.ts';

/**
 * Conversation containers in preference order.
 */
export const CONVERSATION_ROOT_SELECTORS: readonly string[] = [
  '[data-testid="issue-viewer-container"]',
  '#discussion_bucket',
  '.js-discussion',
  '.pull-discussion-timeline',
  '.js-quote-selection-container',
];

/**
 * In-flow mount anchors for the extension host, preference order.
 */
export const UI_ANCHOR_SELECTORS: readonly string[] = [
  '[data-testid="issue-header-actions"]',
  '.gh-header-actions',
  '.gh-header-meta',
  '[data-testid="issue-header"]',
];

/**
 * Rule selector lists in evidence-hierarchy preference order.
 */
export const RULE_SELECTORS: Readonly<Record<RuleId, readonly string[]>> = {
  'timeline-load-more': [
    '[data-testid="timeline-load-more"]',
    '[data-testid="load-more-timeline"]',
    'form.ajax-pagination-form button[type="submit"]',
    'button[data-url*="timeline"]',
  ],
  'timeline-hidden-items': [
    '[data-testid="hidden-items-expand"]',
    '[data-testid="show-hidden-items"]',
    '.js-timeline-item-hidden button',
  ],
  'comment-expand': [
    '[data-testid="comment-show-more"]',
    'button[data-expand-kind="comment"][aria-expanded="false"]',
    'button[aria-expanded="false"][aria-controls]',
  ],
  'minimized-comment-reveal': [
    '[data-testid="minimized-comment-reveal"]',
    '.minimized-comment button',
  ],
  'review-thread-expand': [
    '[data-testid="review-thread-expand"]',
    'details[data-resolved="true"]:not([open]) > summary',
    'details.js-resolvable-timeline-thread-container:not([open]) > summary',
    'button[data-testid="review-thread-toggle"][aria-expanded="false"]',
  ],
  'review-comments-load-more': [
    '[data-testid="review-thread-load-more"]',
    'button[data-testid="load-more-review-comments"]',
  ],
};

export interface SelectorRegistry {
  readonly rules: readonly ExpansionRule[];
  rule(id: RuleId): ExpansionRule;
}

/**
 * Return the first connected conversation root in the document.
 */
export function findConversationRoot(doc: Document): Element | null {
  for (const selector of CONVERSATION_ROOT_SELECTORS) {
    const match = doc.querySelector(selector);
    if (match?.isConnected === true) {
      return match;
    }
  }
  return null;
}

/**
 * Return the first connected in-flow UI anchor, if any.
 */
export function findUiAnchor(doc: Document): Element | null {
  for (const selector of UI_ANCHOR_SELECTORS) {
    const match = doc.querySelector(selector);
    if (match?.isConnected === true) {
      return match;
    }
  }
  return null;
}

export { createRegistry } from './rules.ts';

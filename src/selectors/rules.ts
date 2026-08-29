import { throwIfAborted } from '../shared/abort.ts';
import {
  captureActivationSnapshot,
  postconditionSatisfied,
} from '../engine/postcondition.ts';
import type {
  ActivationResult,
  DiscoveryContext,
  ExpansionRule,
  RuleId,
} from '../engine/types.ts';
import { assertNever, RULE_IDS } from '../engine/types.ts';
import type { SelectorRegistry } from './registry.ts';
import { RULE_SELECTORS } from './registry.ts';
import { accessibleName, passesSafetyPredicates } from './safety.ts';

interface RuleConfig {
  readonly priority: number;
  readonly maxActivationsPerRun: number;
  readonly modelsPagination: boolean;
}

const RULE_CONFIG: Readonly<Record<RuleId, RuleConfig>> = {
  'timeline-load-more': {
    priority: 10,
    maxActivationsPerRun: 50,
    modelsPagination: true,
  },
  'timeline-hidden-items': {
    priority: 20,
    maxActivationsPerRun: 20,
    modelsPagination: false,
  },
  'review-thread-expand': {
    priority: 30,
    maxActivationsPerRun: 50,
    modelsPagination: false,
  },
  'review-comments-load-more': {
    priority: 40,
    maxActivationsPerRun: 50,
    modelsPagination: true,
  },
  'minimized-comment-reveal': {
    priority: 50,
    maxActivationsPerRun: 50,
    modelsPagination: false,
  },
  'comment-expand': {
    priority: 60,
    maxActivationsPerRun: 100,
    modelsPagination: false,
  },
};

const TIMELINE_LOAD_MORE_NAME =
  /^(load more|show more|show older|show newer)/iu;
const TIMELINE_HIDDEN_ITEMS_NAME = /show .*\bhidden\b/iu;
const COMMENT_EXPAND_NAME = /^(show more|show full comment|expand comment)$/iu;
const MINIMIZED_COMMENT_NAME =
  /^(show comment|show hidden comment|show minimized)/iu;
const REVIEW_THREAD_NAME = /^(show resolved|expand conversation)/iu;
const REVIEW_COMMENTS_LOAD_MORE_NAME = /load more (review )?comments/iu;

/**
 * Build the V1 selector registry with one rule per `RuleId`.
 *
 * Rule ids are unique. `rule(id)` throws when `id` is not registered.
 *
 * @returns Registry of expansion rules sorted by priority (lower first).
 */
export function createRegistry(): SelectorRegistry {
  const rules = RULE_IDS.map((id) => createRule(id)).sort(
    (left, right) => left.priority - right.priority,
  );
  const byId = new Map<RuleId, ExpansionRule>();
  for (const rule of rules) {
    byId.set(rule.id, rule);
  }
  return {
    rules,
    rule(id: RuleId): ExpansionRule {
      const found = byId.get(id);
      if (found === undefined) {
        throw new Error(`Unknown rule: ${id}`);
      }
      return found;
    },
  };
}

export { RULE_SELECTORS };

function createRule(id: RuleId): ExpansionRule {
  const config = RULE_CONFIG[id];
  const selectors = RULE_SELECTORS[id];
  const rule: ExpansionRule = {
    id,
    selectors,
    priority: config.priority,
    maxActivationsPerRun: config.maxActivationsPerRun,
    modelsPagination: config.modelsPagination,
    isCandidate(element: Element, context: DiscoveryContext): boolean {
      if (!passesSafetyPredicates(element, context, rule)) {
        return false;
      }
      return matchesPositivePredicate(id, element, context);
    },
    activate(
      element: HTMLElement,
      signal: AbortSignal,
    ): Promise<ActivationResult> {
      try {
        return Promise.resolve(activateElement(id, element, signal));
      } catch (error) {
        if (error instanceof Error) {
          return Promise.reject(error);
        }
        return Promise.reject(new Error(String(error)));
      }
    },
  };
  return rule;
}

function activateElement(
  id: RuleId,
  element: HTMLElement,
  signal: AbortSignal,
): ActivationResult {
  throwIfAborted(signal);
  const before = captureActivationSnapshot(element);
  element.click();
  openDetailsIfSummary(element);
  throwIfAborted(signal);
  if (postconditionSatisfied(element, before)) {
    return { status: 'activated', ruleId: id };
  }
  return { status: 'no-progress', ruleId: id };
}

function openDetailsIfSummary(element: HTMLElement): void {
  if (element.tagName !== 'SUMMARY') {
    return;
  }
  const details = element.closest('details');
  if (details instanceof HTMLDetailsElement && !details.open) {
    details.open = true;
  }
}

function matchesPositivePredicate(
  id: RuleId,
  element: Element,
  context: DiscoveryContext,
): boolean {
  switch (id) {
    case 'timeline-load-more':
      return isTimelineLoadMore(element, context);
    case 'timeline-hidden-items':
      return isTimelineHiddenItems(element, context);
    case 'review-thread-expand':
      return isReviewThreadExpand(element, context);
    case 'review-comments-load-more':
      return isReviewCommentsLoadMore(element, context);
    case 'minimized-comment-reveal':
      return isMinimizedCommentReveal(element, context);
    case 'comment-expand':
      return isCommentExpand(element, context);
    default:
      return assertNever(id);
  }
}

function isTimelineLoadMore(
  element: Element,
  context: DiscoveryContext,
): boolean {
  if (
    hasTestId(
      element,
      'comment-show-more',
      'hidden-items-expand',
      'show-hidden-items',
      'minimized-comment-reveal',
      'review-thread-expand',
      'review-thread-toggle',
      'review-thread-load-more',
      'load-more-review-comments',
    )
  ) {
    return false;
  }
  if (element.closest('.minimized-comment') !== null) {
    return false;
  }
  if (element.closest('.js-timeline-item-hidden') !== null) {
    return false;
  }
  if (hasTestId(element, 'timeline-load-more', 'load-more-timeline')) {
    return true;
  }
  if (element.closest('form.ajax-pagination-form') !== null) {
    return true;
  }
  const dataUrl = element.getAttribute('data-url');
  if (dataUrl?.includes('timeline') === true) {
    return true;
  }
  return matchesEnglishName(element, context, TIMELINE_LOAD_MORE_NAME);
}

function isTimelineHiddenItems(
  element: Element,
  context: DiscoveryContext,
): boolean {
  if (hasTestId(element, 'hidden-items-expand', 'show-hidden-items')) {
    return true;
  }
  if (element.closest('.js-timeline-item-hidden') !== null) {
    return true;
  }
  return matchesEnglishName(element, context, TIMELINE_HIDDEN_ITEMS_NAME);
}

function isReviewThreadExpand(
  element: Element,
  context: DiscoveryContext,
): boolean {
  if (hasTestId(element, 'review-thread-expand', 'review-thread-toggle')) {
    return true;
  }
  if (element.closest('details[data-resolved="true"]') !== null) {
    return true;
  }
  if (
    element.closest('details.js-resolvable-timeline-thread-container') !== null
  ) {
    return true;
  }
  return matchesEnglishName(element, context, REVIEW_THREAD_NAME);
}

function isReviewCommentsLoadMore(
  element: Element,
  context: DiscoveryContext,
): boolean {
  if (
    hasTestId(element, 'review-thread-load-more', 'load-more-review-comments')
  ) {
    return true;
  }
  return matchesEnglishName(element, context, REVIEW_COMMENTS_LOAD_MORE_NAME);
}

function isMinimizedCommentReveal(
  element: Element,
  context: DiscoveryContext,
): boolean {
  if (hasTestId(element, 'minimized-comment-reveal')) {
    return true;
  }
  if (element.closest('.minimized-comment') !== null) {
    return true;
  }
  return matchesEnglishName(element, context, MINIMIZED_COMMENT_NAME);
}

function isCommentExpand(element: Element, context: DiscoveryContext): boolean {
  if (belongsToOtherCommentFamily(element)) {
    return false;
  }
  if (hasTestId(element, 'comment-show-more')) {
    return true;
  }
  if (element.getAttribute('data-expand-kind') === 'comment') {
    return true;
  }
  return matchesEnglishName(element, context, COMMENT_EXPAND_NAME);
}

function belongsToOtherCommentFamily(element: Element): boolean {
  if (element.closest('.minimized-comment') !== null) {
    return true;
  }
  if (element.closest('form.ajax-pagination-form') !== null) {
    return true;
  }
  if (element.closest('.js-timeline-item-hidden') !== null) {
    return true;
  }
  if (element.closest('details[data-resolved]') !== null) {
    return true;
  }
  if (
    hasTestId(
      element,
      'timeline-load-more',
      'load-more-timeline',
      'hidden-items-expand',
      'show-hidden-items',
      'minimized-comment-reveal',
      'review-thread-expand',
      'review-thread-toggle',
      'review-thread-load-more',
      'load-more-review-comments',
    )
  ) {
    return true;
  }
  if (element.getAttribute('data-url') !== null) {
    return true;
  }
  const name = accessibleName(element);
  if (TIMELINE_HIDDEN_ITEMS_NAME.test(name)) {
    return true;
  }
  if (MINIMIZED_COMMENT_NAME.test(name)) {
    return true;
  }
  if (REVIEW_THREAD_NAME.test(name)) {
    return true;
  }
  if (REVIEW_COMMENTS_LOAD_MORE_NAME.test(name)) {
    return true;
  }
  return false;
}

function matchesEnglishName(
  element: Element,
  context: DiscoveryContext,
  pattern: RegExp,
): boolean {
  if (context.locale !== 'en') {
    return false;
  }
  return pattern.test(accessibleName(element));
}

function hasTestId(element: Element, ...ids: string[]): boolean {
  const testId = element.getAttribute('data-testid');
  if (testId === null) {
    return false;
  }
  return ids.includes(testId);
}

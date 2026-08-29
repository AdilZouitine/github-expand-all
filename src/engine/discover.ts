import type { Candidate, DiscoveryContext, ExpansionRule } from './types.ts';
import { passesSafetyPredicates } from '../selectors/safety.ts';

/**
 * Query `rules` inside the conversation root and return safe candidates.
 *
 * Matching uses each rule's `selectors` on `context.conversationRoot` only.
 * Results are deduplicated by element and rule id, then sorted by priority
 * (lower first) and document order.
 *
 * @param rules - Expansion rules to query.
 * @param context - Document, conversation root, host, and locale.
 * @returns Deterministic candidate list for a single pass.
 */
export function discoverCandidates(
  rules: readonly ExpansionRule[],
  context: DiscoveryContext,
): Candidate[] {
  const seen = new WeakMap<Element, Set<string>>();
  const discovered: Candidate[] = [];

  for (const rule of rules) {
    for (const selector of rule.selectors) {
      const nodes = context.conversationRoot.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const ruleIds = seen.get(node);
        if (ruleIds?.has(rule.id) === true) {
          continue;
        }
        if (!rule.isCandidate(node, context)) {
          continue;
        }
        if (!passesSafetyPredicates(node, context, rule)) {
          continue;
        }
        if (ruleIds === undefined) {
          seen.set(node, new Set([rule.id]));
        } else {
          ruleIds.add(rule.id);
        }
        discovered.push({ element: node, rule });
      }
    }
  }

  discovered.sort(compareCandidates);
  return discovered;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const priorityDiff = left.rule.priority - right.rule.priority;
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  if (left.element === right.element) {
    return 0;
  }
  const position = left.element.compareDocumentPosition(right.element);
  if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
    return -1;
  }
  if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
    return 1;
  }
  return 0;
}

import { isAbortError, throwIfAborted } from '../shared/abort.ts';
import type { ActivationResult, Candidate, DiscoveryContext } from './types.ts';
import { passesSafetyPredicates } from '../selectors/safety.ts';

/**
 * Activate one candidate after re-checking abort, connectivity, and safety.
 *
 * A thrown abort error propagates. Any other error is converted to
 * `{ status: 'error' }` so a single candidate cannot fail the run.
 *
 * @param candidate - Element and rule to activate.
 * @param context - Discovery context used for the safety re-check.
 * @param signal - Cooperative cancellation signal.
 * @returns Activation status for accounting.
 */
export async function activateCandidate(
  candidate: Candidate,
  context: DiscoveryContext,
  signal: AbortSignal,
): Promise<ActivationResult> {
  throwIfAborted(signal);
  const { element, rule } = candidate;
  if (!element.isConnected) {
    return { status: 'detached', ruleId: rule.id };
  }
  if (!passesSafetyPredicates(element, context, rule)) {
    return { status: 'skipped', ruleId: rule.id, reason: 'safety' };
  }
  try {
    return await rule.activate(element, signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      status: 'error',
      ruleId: rule.id,
      reason: errorReason(error),
    };
  }
}

function errorReason(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return 'activation-failed';
}

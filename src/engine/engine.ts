import { isAbortError } from '../shared/abort.ts';
import { semanticFingerprint } from '../selectors/safety.ts';
import { activateCandidate } from './activate.ts';
import { discoverCandidates } from './discover.ts';
import { isHostNode } from './host.ts';
import {
  captureActivationSnapshot,
  postconditionSatisfied,
} from './postcondition.ts';
import type {
  ActivationStatus,
  Candidate,
  DiscoveryContext,
  EngineDependencies,
  ExpansionOutcome,
  ExpansionSummary,
  RuleId,
  RunOptions,
  SettleOutcome,
  TerminationReason,
} from './types.ts';
import { emptyRuleCounts, mergeLimits } from './types.ts';

export interface ExpansionEngine {
  run(options: RunOptions): Promise<ExpansionSummary>;
  isRunning(): boolean;
}

/**
 * Create an expansion engine with injected clock, settle, logger, and limits.
 *
 * Only one run executes at a time. A second `run()` while busy returns a
 * cancelled summary immediately and does not queue or abort the in-flight run.
 *
 * @param deps - Clock, settle function, logger, and optional limit overrides.
 * @returns Engine with `run` and `isRunning`.
 */
export function createEngine(deps: EngineDependencies): ExpansionEngine {
  const limits = mergeLimits(deps.limits);
  let running = false;

  const engine: ExpansionEngine = {
    isRunning(): boolean {
      return running;
    },
    async run(options: RunOptions): Promise<ExpansionSummary> {
      if (running) {
        return cancelledImmediateSummary();
      }
      running = true;
      const startedAt = deps.clock.now();
      const byRule = emptyRuleCounts();
      const attemptsByRule = emptyRuleCounts();
      const seenByElement = new WeakMap<Element, Set<RuleId>>();
      const seenFingerprints = new Set<string>();
      let activated = 0;
      let failed = 0;
      let skipped = 0;
      let passes = 0;
      let consecutiveNoProgress = 0;

      const context: DiscoveryContext = {
        document: options.document,
        conversationRoot: options.conversationRoot,
        host: options.host,
        locale: options.locale,
      };

      const summarize = (
        outcome: ExpansionOutcome,
        terminationReason: TerminationReason,
      ): ExpansionSummary => {
        const durationMs = deps.clock.now() - startedAt;
        deps.logger.debug('run-end', {
          outcome,
          terminationReason,
          durationMs,
          count: activated,
        });
        return {
          outcome,
          activated,
          failed,
          skipped,
          passes,
          durationMs,
          terminationReason,
          byRule: { ...byRule },
        };
      };

      const abortReason = (): TerminationReason => {
        if (options.signal.reason === 'navigation') {
          return 'navigation';
        }
        return 'user-cancelled';
      };

      const discoverFiltered = (): Candidate[] => {
        const found = discoverCandidates(options.rules, context);
        return found.filter((candidate) => {
          if (hasSeen(seenByElement, candidate)) {
            return false;
          }
          const fingerprint = semanticFingerprint(
            candidate.element,
            candidate.rule.id,
          );
          if (fingerprint !== undefined && seenFingerprints.has(fingerprint)) {
            return false;
          }
          const attempts = attemptsByRule[candidate.rule.id];
          if (attempts >= candidate.rule.maxActivationsPerRun) {
            return false;
          }
          return true;
        });
      };

      const markSeen = (
        candidate: Candidate,
        fingerprint: string | undefined,
      ): void => {
        let ids = seenByElement.get(candidate.element);
        if (ids === undefined) {
          ids = new Set<RuleId>();
          seenByElement.set(candidate.element, ids);
        }
        ids.add(candidate.rule.id);
        if (fingerprint !== undefined) {
          seenFingerprints.add(fingerprint);
        }
      };

      const ignoreHost = (node: Node): boolean =>
        isHostNode(node, options.host);

      try {
        for (;;) {
          if (options.signal.aborted) {
            return summarize('cancelled', abortReason());
          }
          if (deps.clock.now() - startedAt >= limits.maxRuntimeMs) {
            return summarize('partial', 'limit');
          }
          if (passes >= limits.maxPasses) {
            return summarize('partial', 'limit');
          }

          await deps.clock.sleep(0, options.signal);

          passes += 1;
          deps.logger.debug('pass', { pass: passes });

          let candidates = discoverFiltered();
          if (candidates.length === 0) {
            const waitOutcome = await deps.settle({
              root: options.conversationRoot,
              quietPeriodMs: limits.quietPeriodMs,
              maxSettleMs: limits.maxSettleMs,
              signal: options.signal,
              ignore: ignoreHost,
              isSatisfied: () => discoverFiltered().length > 0,
            });
            if (isSettleAborted(waitOutcome, options.signal)) {
              return summarize('cancelled', abortReason());
            }
            candidates = discoverFiltered();
            if (candidates.length === 0) {
              return summarize('completed', 'stable');
            }
          }

          if (activated >= limits.maxActivations) {
            return summarize('partial', 'limit');
          }

          const candidate = candidates[0];
          if (candidate === undefined) {
            return summarize('completed', 'stable');
          }

          const queued = new WeakSet<Element>();
          for (const entry of candidates) {
            queued.add(entry.element);
          }

          const snapshot = captureActivationSnapshot(candidate.element);
          const fingerprintBefore = semanticFingerprint(
            candidate.element,
            candidate.rule.id,
          );
          const result = await activateCandidate(
            candidate,
            context,
            options.signal,
          );
          incrementCount(attemptsByRule, result.ruleId);
          recordStatus(result.status, result.ruleId, {
            activated: (ruleId) => {
              activated += 1;
              incrementCount(byRule, ruleId);
            },
            failed: () => {
              failed += 1;
            },
            skipped: () => {
              skipped += 1;
            },
          });
          deps.logger.debug('activated', {
            ruleId: result.ruleId,
            status: result.status,
            pass: passes,
          });
          markSeen(candidate, fingerprintBefore);

          const settleOutcome = await deps.settle({
            root: options.conversationRoot,
            quietPeriodMs: limits.quietPeriodMs,
            maxSettleMs: limits.maxSettleMs,
            signal: options.signal,
            ignore: ignoreHost,
            isSatisfied: () =>
              postconditionSatisfied(candidate.element, snapshot),
          });
          if (isSettleAborted(settleOutcome, options.signal)) {
            return summarize('cancelled', abortReason());
          }

          const afterCandidates = discoverFiltered();
          const newCandidatesAppeared = afterCandidates.some(
            (entry) => !queued.has(entry.element),
          );
          const madeProgress =
            postconditionSatisfied(candidate.element, snapshot) ||
            newCandidatesAppeared;

          if (madeProgress) {
            consecutiveNoProgress = 0;
          } else {
            consecutiveNoProgress += 1;
          }
          if (consecutiveNoProgress >= limits.maxConsecutiveNoProgressPasses) {
            return summarize('partial', 'limit');
          }
        }
      } catch (error) {
        if (isAbortError(error)) {
          return summarize('cancelled', abortReason());
        }
        deps.logger.debug('unexpected-error', {
          terminationReason: 'unexpected-error',
        });
        return summarize('failed', 'unexpected-error');
      } finally {
        running = false;
      }
    },
  };

  return engine;
}

function cancelledImmediateSummary(): ExpansionSummary {
  return {
    outcome: 'cancelled',
    activated: 0,
    failed: 0,
    skipped: 0,
    passes: 0,
    durationMs: 0,
    terminationReason: 'user-cancelled',
    byRule: emptyRuleCounts(),
  };
}

function hasSeen(
  seenByElement: WeakMap<Element, Set<RuleId>>,
  candidate: Candidate,
): boolean {
  return seenByElement.get(candidate.element)?.has(candidate.rule.id) === true;
}

function incrementCount(counts: Record<RuleId, number>, ruleId: RuleId): void {
  counts[ruleId] += 1;
}

function recordStatus(
  status: ActivationStatus,
  ruleId: RuleId,
  handlers: {
    activated: (ruleId: RuleId) => void;
    failed: () => void;
    skipped: () => void;
  },
): void {
  if (status === 'activated') {
    handlers.activated(ruleId);
    return;
  }
  if (status === 'error') {
    handlers.failed();
    return;
  }
  handlers.skipped();
}

function isSettleAborted(outcome: SettleOutcome, signal: AbortSignal): boolean {
  return outcome === 'aborted' || signal.aborted;
}

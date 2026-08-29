/**
 * Domain types for GitHub Expand All.
 *
 * Numeric defaults and identifiers live here so tests can override timing
 * through injected clocks rather than sleeping.
 */

export const RULE_IDS = [
  'timeline-load-more',
  'timeline-hidden-items',
  'comment-expand',
  'minimized-comment-reveal',
  'review-thread-expand',
  'review-comments-load-more',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export type ExpansionOutcome = 'completed' | 'partial' | 'cancelled' | 'failed';

export type TerminationReason =
  'stable' | 'limit' | 'navigation' | 'user-cancelled' | 'unexpected-error';

export type ActivationStatus =
  'activated' | 'detached' | 'skipped' | 'no-progress' | 'error';

export interface DiscoveryContext {
  readonly document: Document;
  readonly conversationRoot: Element;
  readonly host: Element | null;
  readonly locale: SupportedLocale;
}

export type SupportedLocale = 'en' | 'unknown';

export interface ActivationResult {
  readonly status: ActivationStatus;
  readonly ruleId: RuleId;
  readonly reason?: string;
}

export interface ExpansionRule {
  readonly id: RuleId;
  readonly selectors: readonly string[];
  readonly priority: number;
  readonly maxActivationsPerRun: number;
  readonly modelsPagination: boolean;
  isCandidate(element: Element, context: DiscoveryContext): boolean;
  activate(
    element: HTMLElement,
    signal: AbortSignal,
  ): Promise<ActivationResult>;
}

export interface EngineLimits {
  readonly maxPasses: number;
  readonly maxActivations: number;
  readonly maxRuntimeMs: number;
  readonly quietPeriodMs: number;
  readonly maxSettleMs: number;
  readonly maxConsecutiveNoProgressPasses: number;
}

/**
 * Conservative V1 defaults. Tests inject tighter limits; benchmarks may
 * exercise the production values against large fixtures.
 */
export const DEFAULT_ENGINE_LIMITS: EngineLimits = {
  maxPasses: 50,
  maxActivations: 250,
  maxRuntimeMs: 30_000,
  quietPeriodMs: 150,
  maxSettleMs: 2_000,
  maxConsecutiveNoProgressPasses: 2,
};

export type RuleCounts = Readonly<Record<RuleId, number>>;

export interface ExpansionSummary {
  readonly outcome: ExpansionOutcome;
  readonly activated: number;
  readonly failed: number;
  readonly skipped: number;
  readonly passes: number;
  readonly durationMs: number;
  readonly terminationReason: TerminationReason;
  readonly byRule: RuleCounts;
}

export interface Candidate {
  readonly element: HTMLElement;
  readonly rule: ExpansionRule;
}

export interface Clock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export type SettleOutcome = 'quiet' | 'satisfied' | 'timeout' | 'aborted';

export interface MutationSettleOptions {
  readonly root: Node;
  readonly quietPeriodMs: number;
  readonly maxSettleMs: number;
  readonly signal: AbortSignal;
  readonly ignore?: (node: Node) => boolean;
  readonly isSatisfied?: () => boolean;
}

export type SettleFn = (
  options: MutationSettleOptions,
) => Promise<SettleOutcome>;

export interface LogMeta {
  readonly ruleId?: RuleId;
  readonly count?: number;
  readonly durationMs?: number;
  readonly terminationReason?: TerminationReason;
  readonly outcome?: ExpansionOutcome;
  readonly pass?: number;
  readonly status?: ActivationStatus;
}

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
}

export interface EngineDependencies {
  readonly clock: Clock;
  readonly settle: SettleFn;
  readonly logger: Logger;
  readonly limits?: Partial<EngineLimits>;
}

export interface RunOptions {
  readonly document: Document;
  readonly conversationRoot: Element;
  readonly host: Element | null;
  readonly locale: SupportedLocale;
  readonly rules: readonly ExpansionRule[];
  readonly signal: AbortSignal;
}

export const HOST_ID = 'github-expand-all-host';
export const HOST_ATTR = 'data-github-expand-all';
export const HOST_ATTR_VALUE = 'host';
export const HOST_SELECTOR = `#${HOST_ID}, [${HOST_ATTR}="${HOST_ATTR_VALUE}"]`;

export function emptyRuleCounts(): Record<RuleId, number> {
  return {
    'timeline-load-more': 0,
    'timeline-hidden-items': 0,
    'comment-expand': 0,
    'minimized-comment-reveal': 0,
    'review-thread-expand': 0,
    'review-comments-load-more': 0,
  };
}

export function mergeLimits(
  overrides: Partial<EngineLimits> | undefined,
): EngineLimits {
  if (overrides === undefined) {
    return DEFAULT_ENGINE_LIMITS;
  }
  return {
    ...DEFAULT_ENGINE_LIMITS,
    ...overrides,
  };
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

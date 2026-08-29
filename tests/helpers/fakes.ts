import type {
  Clock,
  DiscoveryContext,
  Logger,
  SettleFn,
  SupportedLocale,
} from '../../src/engine/types.ts';
import { throwIfAborted } from '../../src/shared/abort.ts';

/**
 * Silent logger for tests and benchmarks.
 */
export function createFakeLogger(): Logger {
  return {
    debug(_message: string): void {},
  };
}

/**
 * Clock that never waits. `sleep` advances `now` by `ms`.
 *
 * @param start - Initial timestamp.
 * @returns Test clock.
 */
export function createFakeClock(start = 0): Clock & {
  advance(ms: number): void;
} {
  let current = start;
  return {
    now(): number {
      return current;
    },
    async sleep(ms: number, signal: AbortSignal): Promise<void> {
      throwIfAborted(signal);
      current += ms;
    },
    advance(ms: number): void {
      current += ms;
    },
  };
}

/**
 * Settle function that resolves immediately without observing the DOM.
 */
export function createImmediateSettle(): SettleFn {
  return async (options) => {
    if (options.signal.aborted) {
      return 'aborted';
    }
    if (options.isSatisfied?.() === true) {
      return 'satisfied';
    }
    return 'quiet';
  };
}

/**
 * Build a discovery context for the current document.
 *
 * @param conversationRoot - Conversation container.
 * @param locale - UI locale.
 * @param host - Extension host, if present.
 * @returns Discovery context.
 */
export function discoveryContext(
  conversationRoot: Element,
  locale: SupportedLocale = 'en',
  host: Element | null = null,
): DiscoveryContext {
  return {
    document,
    conversationRoot,
    host,
    locale,
  };
}

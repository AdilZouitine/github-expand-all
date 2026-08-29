import { AbortError, throwIfAborted } from './abort.ts';
import type { Clock } from '../engine/types.ts';

/**
 * Sleep until `ms` elapses or `signal` aborts.
 */
export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      globalThis.clearTimeout(timeoutId);
      reject(new AbortError());
    };
    const timeoutId = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Clock backed by the platform timer APIs.
 */
export function createDomClock(): Clock {
  return {
    now(): number {
      return Date.now();
    },
    sleep,
  };
}

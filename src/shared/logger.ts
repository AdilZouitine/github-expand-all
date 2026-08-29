import type { Logger, LogMeta } from '../engine/types.ts';

/**
 * Create a logger that is silent in production. Development logging may include
 * rule IDs, counts, timing, and termination reasons only.
 *
 * Never pass comment text, usernames, repository names, URLs, or DOM
 * serialization in `meta`.
 */
export function createLogger(enabled: boolean): Logger {
  return {
    debug(message: string, meta?: LogMeta): void {
      if (!enabled) {
        return;
      }
      if (meta === undefined) {
        // eslint-disable-next-line no-console -- gated development logger
        console.debug(`[github-expand-all] ${message}`);
        return;
      }
      // eslint-disable-next-line no-console -- gated development logger
      console.debug(`[github-expand-all] ${message}`, meta);
    },
  };
}

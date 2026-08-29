import type { MutationSettleOptions, SettleOutcome } from './types.ts';
import { isHostNode } from './host.ts';

/**
 * Wait for DOM mutations under `options.root` to quiet or satisfy.
 *
 * Observes only `options.root` (not the whole document). Mutations inside
 * the extension host (`options.ignore` or `data-github-expand-all="host"`)
 * are ignored. Resolves `satisfied` when `isSatisfied()` is true, `quiet`
 * after at least one relevant mutation followed by `quietPeriodMs` without
 * another, `timeout` at `maxSettleMs`, or `aborted` when `signal` aborts.
 *
 * @param options - Root, timing, ignore predicate, and optional satisfaction.
 * @returns Terminal settle outcome.
 */
export async function settleMutations(
  options: MutationSettleOptions,
): Promise<SettleOutcome> {
  if (options.signal.aborted) {
    return 'aborted';
  }
  if (options.isSatisfied?.() === true) {
    return 'satisfied';
  }

  return await new Promise<SettleOutcome>((resolve) => {
    let settled = false;
    let quietTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

    const finish = (outcome: SettleOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      if (quietTimer !== undefined) {
        globalThis.clearTimeout(quietTimer);
      }
      globalThis.clearTimeout(maxTimer);
      options.signal.removeEventListener('abort', onAbort);
      resolve(outcome);
    };

    const onAbort = (): void => {
      finish('aborted');
    };

    const observer = new MutationObserver((mutations) => {
      if (options.isSatisfied?.() === true) {
        finish('satisfied');
        return;
      }
      if (
        !mutations.some((mutation) => isRelevantMutation(mutation, options))
      ) {
        return;
      }
      if (quietTimer !== undefined) {
        globalThis.clearTimeout(quietTimer);
      }
      quietTimer = globalThis.setTimeout(() => {
        if (options.isSatisfied?.() === true) {
          finish('satisfied');
          return;
        }
        finish('quiet');
      }, options.quietPeriodMs);
    });

    observer.observe(options.root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    const maxTimer = globalThis.setTimeout(() => {
      if (options.isSatisfied?.() === true) {
        finish('satisfied');
        return;
      }
      finish('timeout');
    }, options.maxSettleMs);

    options.signal.addEventListener('abort', onAbort, { once: true });
    if (options.signal.aborted) {
      finish('aborted');
    }
  });
}

function isRelevantMutation(
  mutation: MutationRecord,
  options: MutationSettleOptions,
): boolean {
  if (!isIgnoredNode(mutation.target, options)) {
    return true;
  }
  for (const node of mutation.addedNodes) {
    if (!isIgnoredNode(node, options)) {
      return true;
    }
  }
  for (const node of mutation.removedNodes) {
    if (!isIgnoredNode(node, options)) {
      return true;
    }
  }
  return false;
}

function isIgnoredNode(node: Node, options: MutationSettleOptions): boolean {
  if (options.ignore?.(node) === true) {
    return true;
  }
  return isHostNode(node, null);
}

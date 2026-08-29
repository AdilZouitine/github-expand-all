/**
 * Abort helpers shared by the route controller, engine, and UI.
 */

export class AbortError extends Error {
  public override readonly name = 'AbortError';

  public constructor(message = 'Operation aborted') {
    super(message);
  }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new AbortError(abortReasonMessage(signal));
  }
}

export function abortReasonMessage(signal: AbortSignal): string {
  const reason: unknown = signal.reason;
  if (typeof reason === 'string' && reason.length > 0) {
    return reason;
  }
  return 'Operation aborted';
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof AbortError) {
    return true;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return false;
}

/**
 * Link `source` so that aborting it also aborts `target`.
 */
export function linkAbortSignal(
  source: AbortSignal,
  target: AbortController,
): void {
  if (source.aborted) {
    target.abort(source.reason);
    return;
  }
  source.addEventListener(
    'abort',
    () => {
      target.abort(source.reason);
    },
    { once: true },
  );
}

export function createLinkedAbortController(
  parent: AbortSignal,
): AbortController {
  const controller = new AbortController();
  linkAbortSignal(parent, controller);
  return controller;
}

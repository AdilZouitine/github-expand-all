/**
 * Document-long route lifecycle for GitHub Expand All.
 *
 * The controller decides whether the current location is a supported Issue or
 * Pull Request conversation, mounts exactly one host, and cancels in-flight
 * runs across navigation. It does not implement expansion rules.
 */

import { createLinkedAbortController, isAbortError } from '../shared/abort.ts';
import {
  emptyRuleCounts,
  type Clock,
  type ExpansionRule,
  type ExpansionSummary,
  type Logger,
  type RunOptions,
  type SettleFn,
} from '../engine/types.ts';
import { findConversationRoot } from '../selectors/registry.ts';
import {
  attachHostReconcileObserver,
  findExistingHost,
  findHostButton,
  mountHost,
  restoreHostFocusIfNeeded,
  unmountHost,
} from '../ui/mount.ts';
import {
  INITIAL_UI_STATE,
  isBusy,
  reduceUi,
  type UiIntent,
  type UiViewState,
} from '../ui/state.ts';
import { renderExpansionView, updateExpansionView } from '../ui/view.ts';
import { isSupportedRoute, parseRoute, type ParsedRoute } from './route.ts';

const DEFAULT_WAIT_FOR_CONVERSATION_MS = 4_000;
const CONVERSATION_POLL_INTERVAL_MS = 50;
const V1_LOCALE = 'en';

/**
 * Engine surface required by the route controller.
 */
export interface ControllerEngine {
  /**
   * Run expansion against the current conversation.
   *
   * @param options Document, conversation root, host, locale, rules, and abort.
   */
  run(options: RunOptions): Promise<ExpansionSummary>;

  /**
   * Whether this engine currently has an in-flight run.
   */
  isRunning(): boolean;
}

/**
 * Injected collaborators for {@link startController}.
 */
export interface ControllerDependencies {
  readonly document: Document;
  readonly window: Window;
  readonly engine: ControllerEngine;
  readonly rules: readonly ExpansionRule[];
  readonly logger: Logger;
  readonly clock: Clock;
  readonly settle: SettleFn;
  readonly cssText: string;
  readonly getHref?: () => string;
  readonly waitForConversationMs?: number;
}

/**
 * Handle for a running controller.
 */
export interface ControllerHandle {
  /**
   * Abort all work, restore wrapped history methods, and unmount the host.
   */
  stop(): void;
}

/**
 * Start the document-long SPA controller.
 *
 * @param deps Injected document, engine, and platform adapters.
 */
export function startController(
  deps: ControllerDependencies,
): ControllerHandle {
  const {
    document: doc,
    window: win,
    engine,
    rules,
    logger,
    clock,
    cssText,
  } = deps;
  const getHref = deps.getHref ?? defaultHref(win);
  const waitForConversationMs =
    deps.waitForConversationMs ?? DEFAULT_WAIT_FOR_CONVERSATION_MS;

  const lifetime = new AbortController();
  const historyGuard = wrapHistory(win.history, () => {
    reconcile();
  });

  let lastKey: string | undefined;
  let routeAbort: AbortController | undefined;
  let runAbort: AbortController | undefined;
  let uiState: UiViewState = INITIAL_UI_STATE;
  let mountInFlight = false;
  let lastKnownButton: HTMLButtonElement | null = null;
  let observerAttached = false;

  const onNavigate = (): void => {
    reconcile();
  };

  win.addEventListener('popstate', onNavigate, { signal: lifetime.signal });
  win.addEventListener('pageshow', onNavigate, { signal: lifetime.signal });
  win.addEventListener('turbo:load', onNavigate, { signal: lifetime.signal });
  doc.addEventListener('turbo:load', onNavigate, { signal: lifetime.signal });
  doc.addEventListener('turbo:render', onNavigate, {
    signal: lifetime.signal,
  });

  reconcile();

  return {
    stop(): void {
      lifetime.abort('stopped');
      if (routeAbort !== undefined && !routeAbort.signal.aborted) {
        routeAbort.abort('stopped');
      }
      if (runAbort !== undefined && !runAbort.signal.aborted) {
        runAbort.abort('stopped');
      }
      historyGuard.restore();
      unmountHost(doc);
      lastKey = undefined;
      mountInFlight = false;
      observerAttached = false;
      lastKnownButton = null;
      uiState = INITIAL_UI_STATE;
    },
  };

  function reconcile(): void {
    if (lifetime.signal.aborted) {
      return;
    }
    const route = parseRoute(getHref());
    const key = route.key;

    if (lastKey === key) {
      reconcileUnchanged(route);
      return;
    }

    abortCurrentRoute('navigation');
    unmountHost(doc);
    uiState = INITIAL_UI_STATE;
    lastKnownButton = null;
    lastKey = key;

    if (!isSupportedRoute(route)) {
      logger.debug('unsupported route');
      return;
    }

    beginSupportedRoute();
  }

  function reconcileUnchanged(route: ParsedRoute): void {
    if (!isSupportedRoute(route)) {
      unmountHost(doc);
      return;
    }
    if (findExistingHost(doc) !== null) {
      return;
    }
    if (mountInFlight) {
      return;
    }
    const routeSignal = currentRouteSignal();
    if (routeSignal === undefined || routeSignal.aborted) {
      beginSupportedRoute();
      return;
    }
    activateSupportedRoute(routeSignal, lastKnownButton);
  }

  function beginSupportedRoute(): void {
    const routeController = createLinkedAbortController(lifetime.signal);
    routeAbort = routeController;
    observerAttached = false;
    activateSupportedRoute(routeController.signal, null);
  }

  function activateSupportedRoute(
    signal: AbortSignal,
    restoreFrom: Element | null,
  ): void {
    const root = findConversationRoot(doc);
    if (root !== null) {
      mountUi(signal, restoreFrom);
      return;
    }
    mountInFlight = true;
    void waitThenMount(signal, restoreFrom);
  }

  async function waitThenMount(
    signal: AbortSignal,
    restoreFrom: Element | null,
  ): Promise<void> {
    const root = await waitForConversationRoot(
      doc,
      clock,
      waitForConversationMs,
      signal,
    );
    mountInFlight = false;
    if (signal.aborted) {
      return;
    }
    if (root === null) {
      logger.debug('conversation root wait ended without a match');
      return;
    }
    mountUi(signal, restoreFrom);
  }

  function mountUi(signal: AbortSignal, restoreFrom: Element | null): void {
    if (signal.aborted) {
      return;
    }
    if (!isSupportedRoute(parseRoute(getHref()))) {
      return;
    }
    mountInFlight = false;
    const host = mountHost(doc, cssText);
    bindView(host);
    restoreHostFocusIfNeeded(doc, restoreFrom);
    ensureHostObserver(signal);
    logger.debug('host mounted');
  }

  function ensureHostObserver(signal: AbortSignal): void {
    if (observerAttached) {
      return;
    }
    observerAttached = true;
    attachHostReconcileObserver(
      doc,
      () => {
        recoverHost(signal);
      },
      signal,
    );
    signal.addEventListener(
      'abort',
      () => {
        observerAttached = false;
      },
      { once: true },
    );
  }

  function recoverHost(signal: AbortSignal): void {
    if (signal.aborted) {
      return;
    }
    if (!isSupportedRoute(parseRoute(getHref()))) {
      return;
    }
    if (findConversationRoot(doc) === null) {
      return;
    }
    if (findExistingHost(doc) !== null) {
      return;
    }
    const initiating = lastKnownButton;
    const host = mountHost(doc, cssText);
    bindView(host);
    restoreHostFocusIfNeeded(doc, initiating);
  }

  function bindView(host: HTMLElement): void {
    const shadow = host.shadowRoot;
    if (shadow === null) {
      return;
    }
    renderExpansionView(shadow, {
      state: uiState,
      onIntent: handleIntent,
    });
    lastKnownButton = findHostButton(host);
  }

  function refreshView(): void {
    const shadow = findExistingHost(doc)?.shadowRoot;
    if (shadow === undefined || shadow === null) {
      return;
    }
    updateExpansionView(shadow, uiState);
    const host = findExistingHost(doc);
    lastKnownButton = host === null ? null : findHostButton(host);
  }

  function handleIntent(intent: UiIntent): void {
    if (intent.type === 'cancel') {
      cancelRun();
      return;
    }
    if (isBusy(uiState) || engine.isRunning()) {
      cancelRun();
      return;
    }
    void startRun();
  }

  function cancelRun(): void {
    uiState = reduceUi(uiState, { type: 'cancel-requested' });
    refreshView();
    if (runAbort === undefined || runAbort.signal.aborted) {
      return;
    }
    runAbort.abort('user-cancelled');
  }

  async function startRun(): Promise<void> {
    const conversationRoot = findConversationRoot(doc);
    if (conversationRoot === null) {
      logger.debug('expand ignored: conversation root missing');
      return;
    }
    const host = findExistingHost(doc);
    const routeSignal = currentRouteSignal();
    if (routeSignal === undefined || routeSignal.aborted) {
      return;
    }

    uiState = reduceUi(uiState, { type: 'start' });
    refreshView();

    const runController = createLinkedAbortController(routeSignal);
    runAbort = runController;
    logger.debug('run started');

    try {
      const summary = await engine.run({
        document: doc,
        conversationRoot,
        host,
        locale: V1_LOCALE,
        rules,
        signal: runController.signal,
      });
      finishRun(summary, routeSignal);
    } catch (error) {
      finishRun(summaryFromError(error, runController.signal), routeSignal);
    }
  }

  function finishRun(
    summary: ExpansionSummary,
    routeSignal: AbortSignal,
  ): void {
    runAbort = undefined;
    if (routeSignal.aborted) {
      return;
    }
    uiState = reduceUi(uiState, { type: 'finished', summary });
    refreshView();
    logger.debug('run finished', {
      outcome: summary.outcome,
      terminationReason: summary.terminationReason,
      count: summary.activated,
      durationMs: summary.durationMs,
    });
  }

  function abortCurrentRoute(reason: string): void {
    if (runAbort !== undefined && !runAbort.signal.aborted) {
      runAbort.abort(reason);
    }
    if (routeAbort !== undefined && !routeAbort.signal.aborted) {
      routeAbort.abort(reason);
    }
    routeAbort = undefined;
    runAbort = undefined;
    mountInFlight = false;
    observerAttached = false;
  }

  function currentRouteSignal(): AbortSignal | undefined {
    if (routeAbort === undefined) {
      return undefined;
    }
    return routeAbort.signal;
  }
}

function defaultHref(win: Window): () => string {
  return (): string => win.location.href;
}

function wrapHistory(
  history: History,
  onNavigate: () => void,
): { restore(): void } {
  // Native History methods must be restored identically for SPA teardown.
  /* eslint-disable @typescript-eslint/unbound-method -- capturing native methods for restore */
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  /* eslint-enable @typescript-eslint/unbound-method */

  history.pushState = function (
    this: History,
    ...args: Parameters<History['pushState']>
  ): void {
    originalPushState.apply(this, args);
    onNavigate();
  };

  history.replaceState = function (
    this: History,
    ...args: Parameters<History['replaceState']>
  ): void {
    originalReplaceState.apply(this, args);
    onNavigate();
  };

  return {
    restore(): void {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    },
  };
}

async function waitForConversationRoot(
  doc: Document,
  clock: Clock,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Element | null> {
  const immediate = findConversationRoot(doc);
  if (immediate !== null) {
    return immediate;
  }

  return await new Promise((resolve) => {
    let settled = false;
    const observer = new MutationObserver(() => {
      const found = findConversationRoot(doc);
      if (found === null) {
        return;
      }
      finish(found);
    });

    const finish = (value: Element | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      resolve(value);
    };

    observer.observe(doc.documentElement, { childList: true, subtree: true });

    if (signal.aborted) {
      finish(null);
      return;
    }

    signal.addEventListener(
      'abort',
      () => {
        finish(null);
      },
      { once: true },
    );

    void pollForConversationRoot(doc, clock, timeoutMs, signal, finish);
  });
}

async function pollForConversationRoot(
  doc: Document,
  clock: Clock,
  timeoutMs: number,
  signal: AbortSignal,
  finish: (value: Element | null) => void,
): Promise<void> {
  const deadline = clock.now() + timeoutMs;
  while (clock.now() < deadline) {
    const found = findConversationRoot(doc);
    if (found !== null) {
      finish(found);
      return;
    }
    const remaining = deadline - clock.now();
    if (remaining <= 0) {
      break;
    }
    try {
      await clock.sleep(
        Math.min(CONVERSATION_POLL_INTERVAL_MS, remaining),
        signal,
      );
    } catch {
      finish(null);
      return;
    }
  }
  finish(findConversationRoot(doc));
}

function summaryFromError(
  error: unknown,
  signal: AbortSignal,
): ExpansionSummary {
  if (isAbortError(error) || signal.aborted) {
    const navigation = signal.reason === 'navigation';
    return {
      outcome: 'cancelled',
      activated: 0,
      failed: 0,
      skipped: 0,
      passes: 0,
      durationMs: 0,
      terminationReason: navigation ? 'navigation' : 'user-cancelled',
      byRule: emptyRuleCounts(),
    };
  }
  return {
    outcome: 'failed',
    activated: 0,
    failed: 0,
    skipped: 0,
    passes: 0,
    durationMs: 0,
    terminationReason: 'unexpected-error',
    byRule: emptyRuleCounts(),
  };
}

/**
 * UI state machine for the injected Expand all control.
 */

import type { ExpansionSummary } from '../engine/types.ts';
import { assertNever } from '../engine/types.ts';

export type UiPhase =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'partial'
  | 'cancelled'
  | 'failed';

export type UiIntent =
  { readonly type: 'expand' } | { readonly type: 'cancel' };

export interface UiViewState {
  readonly phase: UiPhase;
  readonly summary: ExpansionSummary | null;
}

export type UiEvent =
  | { readonly type: 'start' }
  | { readonly type: 'cancel-requested' }
  | { readonly type: 'finished'; readonly summary: ExpansionSummary }
  | { readonly type: 'reset' };

export const INITIAL_UI_STATE: UiViewState = {
  phase: 'idle',
  summary: null,
};

/**
 * Transition the injected control between idle, running, and terminal states.
 */
export function reduceUi(state: UiViewState, event: UiEvent): UiViewState {
  switch (event.type) {
    case 'start':
      if (state.phase === 'running' || state.phase === 'cancelling') {
        return state;
      }
      return { phase: 'running', summary: null };
    case 'cancel-requested':
      if (state.phase !== 'running') {
        return state;
      }
      return { phase: 'cancelling', summary: null };
    case 'finished':
      return {
        phase: phaseFromSummary(event.summary),
        summary: event.summary,
      };
    case 'reset':
      return INITIAL_UI_STATE;
    default:
      return assertNever(event);
  }
}

/**
 * Primary button label. Running activation turns the control into Cancel.
 */
export function primaryButtonLabel(state: UiViewState): string {
  if (state.phase === 'running' || state.phase === 'cancelling') {
    return 'Cancel';
  }
  return 'Expand all';
}

/**
 * Accessible name for the primary control.
 */
export function primaryButtonAccessibleName(state: UiViewState): string {
  if (state.phase === 'running') {
    return 'Cancel expansion';
  }
  if (state.phase === 'cancelling') {
    return 'Cancelling expansion';
  }
  return 'Expand all';
}

/**
 * Polite live-region text. Does not announce every click.
 */
export function statusAnnouncement(state: UiViewState): string {
  if (state.phase === 'running') {
    return runningAnnouncement(state.summary);
  }
  if (state.phase === 'cancelling') {
    return 'Cancelling expansion';
  }
  if (state.summary === null) {
    return '';
  }
  return summaryAnnouncement(state.summary);
}

/**
 * Visible status description beside or instead of the button label.
 */
export function statusDescription(state: UiViewState): string {
  return statusAnnouncement(state);
}

export function isBusy(state: UiViewState): boolean {
  return state.phase === 'running' || state.phase === 'cancelling';
}

function phaseFromSummary(summary: ExpansionSummary): UiPhase {
  switch (summary.outcome) {
    case 'completed':
      return 'completed';
    case 'partial':
      return 'partial';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return assertNever(summary.outcome);
  }
}

function runningAnnouncement(summary: ExpansionSummary | null): string {
  if (summary === null || summary.activated === 0) {
    return 'Expanding…';
  }
  return `Expanding… ${summary.activated} ${pluralize(summary.activated, 'item')} expanded`;
}

function summaryAnnouncement(summary: ExpansionSummary): string {
  if (summary.outcome === 'cancelled') {
    return 'Cancelled';
  }
  if (summary.outcome === 'failed') {
    return 'Could not finish';
  }
  if (summary.terminationReason === 'limit') {
    return 'Stopped after safety limit';
  }
  if (summary.outcome === 'partial') {
    return `Expanded ${summary.activated} ${pluralize(summary.activated, 'item')} · ${summary.failed} could not be expanded`;
  }
  if (summary.activated === 0) {
    return 'Nothing to expand';
  }
  return `Expanded ${summary.activated} ${pluralize(summary.activated, 'item')}`;
}

export function pluralize(count: number, noun: string): string {
  if (count === 1) {
    return noun;
  }
  return `${noun}s`;
}

import { describe, expect, it } from 'vitest';
import {
  emptyRuleCounts,
  type ExpansionSummary,
  type TerminationReason,
} from '../../../src/engine/types.ts';
import {
  INITIAL_UI_STATE,
  isBusy,
  pluralize,
  primaryButtonAccessibleName,
  primaryButtonLabel,
  reduceUi,
  statusAnnouncement,
  statusDescription,
  type UiViewState,
} from '../../../src/ui/state.ts';

function summary(
  overrides: Partial<ExpansionSummary> & Pick<ExpansionSummary, 'outcome'>,
): ExpansionSummary {
  return {
    activated: 0,
    failed: 0,
    skipped: 0,
    passes: 0,
    durationMs: 0,
    terminationReason: 'stable',
    byRule: emptyRuleCounts(),
    ...overrides,
  };
}

describe('reduceUi', () => {
  it('starts from idle into running and clears any prior summary', () => {
    const prior: UiViewState = {
      phase: 'completed',
      summary: summary({ outcome: 'completed', activated: 3 }),
    };
    expect(reduceUi(prior, { type: 'start' })).toEqual({
      phase: 'running',
      summary: null,
    });
    expect(reduceUi(INITIAL_UI_STATE, { type: 'start' }).phase).toBe('running');
  });

  it('does not start a concurrent run', () => {
    const running = reduceUi(INITIAL_UI_STATE, { type: 'start' });
    expect(reduceUi(running, { type: 'start' })).toBe(running);
    const cancelling = reduceUi(running, { type: 'cancel-requested' });
    expect(reduceUi(cancelling, { type: 'start' })).toBe(cancelling);
  });

  it('moves running to cancelling only from running', () => {
    const running = reduceUi(INITIAL_UI_STATE, { type: 'start' });
    expect(reduceUi(running, { type: 'cancel-requested' })).toEqual({
      phase: 'cancelling',
      summary: null,
    });
    expect(reduceUi(INITIAL_UI_STATE, { type: 'cancel-requested' })).toBe(
      INITIAL_UI_STATE,
    );
    const completed: UiViewState = {
      phase: 'completed',
      summary: summary({ outcome: 'completed' }),
    };
    expect(reduceUi(completed, { type: 'cancel-requested' })).toBe(completed);
  });

  it('maps each summary outcome onto a terminal phase', () => {
    const running = reduceUi(INITIAL_UI_STATE, { type: 'start' });
    expect(
      reduceUi(running, {
        type: 'finished',
        summary: summary({ outcome: 'completed' }),
      }).phase,
    ).toBe('completed');
    expect(
      reduceUi(running, {
        type: 'finished',
        summary: summary({ outcome: 'partial', terminationReason: 'limit' }),
      }).phase,
    ).toBe('partial');
    expect(
      reduceUi(running, {
        type: 'finished',
        summary: summary({
          outcome: 'cancelled',
          terminationReason: 'user-cancelled',
        }),
      }).phase,
    ).toBe('cancelled');
    expect(
      reduceUi(running, {
        type: 'finished',
        summary: summary({
          outcome: 'failed',
          terminationReason: 'unexpected-error',
        }),
      }).phase,
    ).toBe('failed');
  });

  it('resets to the initial idle state', () => {
    const running = reduceUi(INITIAL_UI_STATE, { type: 'start' });
    expect(reduceUi(running, { type: 'reset' })).toEqual(INITIAL_UI_STATE);
  });
});

describe('labels and status copy', () => {
  it('uses Expand all when idle or terminal', () => {
    expect(primaryButtonLabel(INITIAL_UI_STATE)).toBe('Expand all');
    expect(primaryButtonAccessibleName(INITIAL_UI_STATE)).toBe('Expand all');
    const completed: UiViewState = {
      phase: 'completed',
      summary: summary({ outcome: 'completed', activated: 2 }),
    };
    expect(primaryButtonLabel(completed)).toBe('Expand all');
    expect(primaryButtonAccessibleName(completed)).toBe('Expand all');
  });

  it('turns the primary control into Cancel while running', () => {
    const running: UiViewState = { phase: 'running', summary: null };
    expect(primaryButtonLabel(running)).toBe('Cancel');
    expect(primaryButtonAccessibleName(running)).toBe('Cancel expansion');
    expect(isBusy(running)).toBe(true);
  });

  it('keeps a cancelling accessible name distinct from running', () => {
    const cancelling: UiViewState = { phase: 'cancelling', summary: null };
    expect(primaryButtonLabel(cancelling)).toBe('Cancel');
    expect(primaryButtonAccessibleName(cancelling)).toBe(
      'Cancelling expansion',
    );
    expect(statusAnnouncement(cancelling)).toBe('Cancelling expansion');
    expect(isBusy(cancelling)).toBe(true);
    expect(isBusy(INITIAL_UI_STATE)).toBe(false);
  });

  it('announces Expanding… without a progress count by default', () => {
    const running: UiViewState = { phase: 'running', summary: null };
    expect(statusAnnouncement(running)).toBe('Expanding…');
    expect(statusDescription(running)).toBe('Expanding…');
  });

  it('includes a progress count when a running summary is present', () => {
    const one: UiViewState = {
      phase: 'running',
      summary: summary({ outcome: 'completed', activated: 1 }),
    };
    const many: UiViewState = {
      phase: 'running',
      summary: summary({ outcome: 'completed', activated: 4 }),
    };
    expect(statusAnnouncement(one)).toBe('Expanding… 1 item expanded');
    expect(statusAnnouncement(many)).toBe('Expanding… 4 items expanded');
  });

  it('returns empty status when idle with no summary', () => {
    expect(statusAnnouncement(INITIAL_UI_STATE)).toBe('');
    expect(statusDescription(INITIAL_UI_STATE)).toBe('');
  });

  it('uses nothing-to-expand copy when completed with zero activations', () => {
    const state: UiViewState = {
      phase: 'completed',
      summary: summary({ outcome: 'completed', activated: 0 }),
    };
    expect(statusAnnouncement(state)).toBe('Nothing to expand');
  });

  it('pluralizes completed copy', () => {
    const one: UiViewState = {
      phase: 'completed',
      summary: summary({ outcome: 'completed', activated: 1 }),
    };
    const many: UiViewState = {
      phase: 'completed',
      summary: summary({ outcome: 'completed', activated: 8 }),
    };
    expect(statusAnnouncement(one)).toBe('Expanded 1 item');
    expect(statusAnnouncement(many)).toBe('Expanded 8 items');
  });

  it('prefers the safety-limit copy over partial item counts', () => {
    const limited: UiViewState = {
      phase: 'partial',
      summary: summary({
        outcome: 'partial',
        activated: 12,
        failed: 1,
        terminationReason: 'limit' satisfies TerminationReason,
      }),
    };
    const partial: UiViewState = {
      phase: 'partial',
      summary: summary({
        outcome: 'partial',
        activated: 3,
        failed: 2,
        terminationReason: 'stable',
      }),
    };
    expect(statusAnnouncement(limited)).toBe('Stopped after safety limit');
    expect(statusAnnouncement(partial)).toBe(
      'Expanded 3 items · 2 could not be expanded',
    );
  });

  it('announces cancelled and failed terminals', () => {
    const cancelled: UiViewState = {
      phase: 'cancelled',
      summary: summary({
        outcome: 'cancelled',
        terminationReason: 'user-cancelled',
      }),
    };
    const failed: UiViewState = {
      phase: 'failed',
      summary: summary({
        outcome: 'failed',
        terminationReason: 'unexpected-error',
      }),
    };
    expect(statusAnnouncement(cancelled)).toBe('Cancelled');
    expect(statusAnnouncement(failed)).toBe('Could not finish');
  });

  it('pluralizes nouns', () => {
    expect(pluralize(1, 'item')).toBe('item');
    expect(pluralize(0, 'item')).toBe('items');
    expect(pluralize(2, 'item')).toBe('items');
  });
});

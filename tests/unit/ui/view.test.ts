import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyRuleCounts } from '../../../src/engine/types.ts';
import {
  INITIAL_UI_STATE,
  type UiIntent,
  type UiViewState,
} from '../../../src/ui/state.ts';
import {
  findViewButton,
  renderExpansionView,
  updateExpansionView,
} from '../../../src/ui/view.ts';

const VIEW_SOURCE = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../src/ui/view.ts',
  ),
  'utf8',
);

function runningState(): UiViewState {
  return { phase: 'running', summary: null };
}

function completedState(): UiViewState {
  return {
    phase: 'completed',
    summary: {
      outcome: 'completed',
      activated: 2,
      failed: 0,
      skipped: 0,
      passes: 1,
      durationMs: 10,
      terminationReason: 'stable',
      byRule: emptyRuleCounts(),
    },
  };
}

describe('renderExpansionView', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders a native button and a polite live region', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const onIntent = vi.fn<(intent: UiIntent) => void>();
    renderExpansionView(container, {
      state: INITIAL_UI_STATE,
      onIntent,
    });

    const button = container.querySelector('[data-github-expand-all="button"]');
    const status = container.querySelector('[data-github-expand-all="status"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    if (
      !(button instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement)
    ) {
      throw new Error('expected button and status');
    }
    expect(button.type).toBe('button');
    expect(button.className).toContain('gea-');
    expect(button.getAttribute('aria-label')).toBe('Expand all');
    expect(button.textContent).toBe('Expand all');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.getAttribute('aria-busy')).toBe('false');
    expect(status.textContent).toBe('');
  });

  it('emits expand on click when idle', () => {
    const container = document.createElement('div');
    const onIntent = vi.fn<(intent: UiIntent) => void>();
    renderExpansionView(container, {
      state: INITIAL_UI_STATE,
      onIntent,
    });
    findViewButton(container)?.click();
    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledWith({ type: 'expand' });
  });

  it('emits cancel on repeated clicks while running', () => {
    const container = document.createElement('div');
    const onIntent = vi.fn<(intent: UiIntent) => void>();
    renderExpansionView(container, {
      state: runningState(),
      onIntent,
    });
    const button = findViewButton(container);
    if (button === null) {
      throw new Error('expected button');
    }
    expect(button.textContent).toBe('Cancel');
    expect(button.getAttribute('aria-label')).toBe('Cancel expansion');
    button.click();
    button.click();
    expect(onIntent).toHaveBeenCalledTimes(2);
    expect(onIntent).toHaveBeenNthCalledWith(1, { type: 'cancel' });
    expect(onIntent).toHaveBeenNthCalledWith(2, { type: 'cancel' });
  });

  it('sets aria-busy on the status region while running', () => {
    const container = document.createElement('div');
    renderExpansionView(container, {
      state: INITIAL_UI_STATE,
      onIntent: () => undefined,
    });
    updateExpansionView(container, runningState());
    const status = container.querySelector('[data-github-expand-all="status"]');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.textContent).toBe('Expanding…');
    updateExpansionView(container, completedState());
    expect(status?.getAttribute('aria-busy')).toBe('false');
    expect(status?.textContent).toBe('Expanded 2 items');
  });

  it('preserves button identity across updates', () => {
    const container = document.createElement('div');
    renderExpansionView(container, {
      state: INITIAL_UI_STATE,
      onIntent: () => undefined,
    });
    const first = findViewButton(container);
    updateExpansionView(container, runningState());
    renderExpansionView(container, {
      state: completedState(),
      onIntent: () => undefined,
    });
    expect(findViewButton(container)).toBe(first);
  });

  it('uses textContent rather than innerHTML for labels', () => {
    expect(VIEW_SOURCE).not.toMatch(/\binnerHTML\b/);
    const container = document.createElement('div');
    renderExpansionView(container, {
      state: completedState(),
      onIntent: () => undefined,
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    const status = container.querySelector('[data-github-expand-all="status"]');
    expect(status?.childElementCount).toBe(0);
    expect(status?.textContent).toBe('Expanded 2 items');
  });

  it('is a no-op when update is called before render', () => {
    const container = document.createElement('div');
    updateExpansionView(container, runningState());
    expect(container.childElementCount).toBe(0);
    expect(findViewButton(container)).toBeNull();
  });
});

/**
 * Accessible Expand-all control rendered inside the extension host.
 *
 * DOM is constructed with `createElement` and `textContent` only. This module
 * never queries GitHub expansion controls.
 */

import {
  isBusy,
  primaryButtonAccessibleName,
  primaryButtonLabel,
  statusDescription,
  type UiIntent,
  type UiViewState,
} from './state.ts';

/** Host attribute value for the primary control. */
export const VIEW_BUTTON_ATTR_VALUE = 'button';

/** Host attribute value for the polite status region. */
export const VIEW_STATUS_ATTR_VALUE = 'status';

const BUTTON_ATTR = 'data-github-expand-all';
const ROOT_CLASS = 'gea-root';
const BUTTON_CLASS = 'gea-button';
const STATUS_CLASS = 'gea-status';

export type ViewContainer = Element | ShadowRoot;

/**
 * Options for the first render of the Expand-all control.
 */
export interface ExpansionViewOptions {
  readonly state: UiViewState;
  readonly onIntent: (intent: UiIntent) => void;
}

interface ViewBinding {
  state: UiViewState;
  onIntent: (intent: UiIntent) => void;
  readonly button: HTMLButtonElement;
  readonly status: HTMLElement;
}

const bindings = new WeakMap<ViewContainer, ViewBinding>();

/**
 * Render the Expand-all control into `container`.
 *
 * Re-rendering an already-bound container updates the intent callback and
 * state without replacing the button element, so keyboard focus is preserved.
 *
 * @param container Shadow root or element that owns the control.
 * @param options Initial view state and intent callback.
 */
export function renderExpansionView(
  container: ViewContainer,
  options: ExpansionViewOptions,
): void {
  const existing = bindings.get(container);
  if (existing !== undefined) {
    existing.onIntent = options.onIntent;
    applyState(existing, options.state);
    return;
  }

  const doc = ownerDocument(container);
  const root = doc.createElement('div');
  root.className = ROOT_CLASS;

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.setAttribute(BUTTON_ATTR, VIEW_BUTTON_ATTR_VALUE);

  const status = doc.createElement('div');
  status.className = STATUS_CLASS;
  status.setAttribute(BUTTON_ATTR, VIEW_STATUS_ATTR_VALUE);
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  const binding: ViewBinding = {
    state: options.state,
    onIntent: options.onIntent,
    button,
    status,
  };

  button.addEventListener('click', () => {
    if (isBusy(binding.state)) {
      binding.onIntent({ type: 'cancel' });
      return;
    }
    binding.onIntent({ type: 'expand' });
  });

  root.append(button, status);
  container.append(root);
  bindings.set(container, binding);
  applyState(binding, options.state);
}

/**
 * Update labels and ARIA attributes without remounting the button.
 *
 * @param container Container previously passed to `renderExpansionView`.
 * @param state Next view state.
 */
export function updateExpansionView(
  container: ViewContainer,
  state: UiViewState,
): void {
  const binding = bindings.get(container);
  if (binding === undefined) {
    return;
  }
  applyState(binding, state);
}

/**
 * Return the primary control if it is still bound to `container`.
 *
 * @param container Container previously passed to `renderExpansionView`.
 */
export function findViewButton(
  container: ViewContainer,
): HTMLButtonElement | null {
  const binding = bindings.get(container);
  if (binding === undefined) {
    return null;
  }
  return binding.button;
}

function applyState(binding: ViewBinding, state: UiViewState): void {
  binding.state = state;
  const label = primaryButtonLabel(state);
  const accessibleName = primaryButtonAccessibleName(state);
  binding.button.textContent = label;
  binding.button.setAttribute('aria-label', accessibleName);

  const statusText = visibleStatusText(state);
  binding.status.textContent = statusText;
  if (isBusy(state)) {
    binding.status.setAttribute('aria-busy', 'true');
    return;
  }
  binding.status.setAttribute('aria-busy', 'false');
}

function visibleStatusText(state: UiViewState): string {
  const description = statusDescription(state);
  if (description.length === 0) {
    return '';
  }
  if (!isBusy(state) && description === primaryButtonLabel(state)) {
    return '';
  }
  return description;
}

function ownerDocument(container: ViewContainer): Document {
  return container.ownerDocument;
}

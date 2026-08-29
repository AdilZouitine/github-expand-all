/**
 * DOM snapshot captured immediately before a candidate is activated.
 */
export interface ActivationSnapshot {
  readonly connected: boolean;
  readonly ariaExpanded: string | null;
  readonly detailsOpen: boolean;
  readonly dataUrl: string | null;
}

/**
 * Capture activation-sensitive attributes for postcondition checks.
 *
 * @param element - Element about to be clicked.
 * @returns Snapshot compared after the click and settle window.
 */
export function captureActivationSnapshot(
  element: HTMLElement,
): ActivationSnapshot {
  const details = element.closest('details');
  const detailsOpen =
    details instanceof HTMLDetailsElement ? details.open : false;
  return {
    connected: element.isConnected,
    ariaExpanded: element.getAttribute('aria-expanded'),
    detailsOpen,
    dataUrl: element.getAttribute('data-url'),
  };
}

/**
 * Return whether the click produced a recognizable expansion signal.
 *
 * Recognized signals: disconnection, `aria-expanded` becoming true, a
 * parent `details` opening, or `data-url` changing.
 *
 * @param element - Element that was clicked (may now be detached).
 * @param before - Snapshot taken before `click()`.
 * @returns True when a listed postcondition holds.
 */
export function postconditionSatisfied(
  element: HTMLElement,
  before: ActivationSnapshot,
): boolean {
  if (!element.isConnected) {
    return true;
  }
  if (
    element.getAttribute('aria-expanded') === 'true' &&
    before.ariaExpanded !== 'true'
  ) {
    return true;
  }
  const details = element.closest('details');
  if (
    details instanceof HTMLDetailsElement &&
    details.open &&
    !before.detailsOpen
  ) {
    return true;
  }
  const dataUrl = element.getAttribute('data-url');
  if (dataUrl !== null && dataUrl !== before.dataUrl) {
    return true;
  }
  return false;
}

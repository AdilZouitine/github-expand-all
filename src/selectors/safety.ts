import {
  HOST_SELECTOR,
  type DiscoveryContext,
  type ExpansionRule,
  type RuleId,
} from '../engine/types.ts';

const DESTRUCTIVE_EXACT = new Set([
  'resolve conversation',
  'unresolve',
  'unresolve conversation',
  'merge',
  'merge pull request',
  'close',
  'close issue',
  'close pull request',
  'close pr',
  'reopen',
  'reopen issue',
  'delete',
  'edit',
  'minimize',
  'report',
  'block',
  'unsubscribe',
  'approve',
  'dismiss review',
  'submit comment',
  'comment submit',
  'comment',
  'add reaction',
]);

const DESTRUCTIVE_PREFIX_WORDS = [
  'edit',
  'delete',
  'close',
  'merge',
  'reopen',
  'approve',
  'dismiss',
  'submit',
  'minimize',
  'report',
  'block',
  'unsubscribe',
] as const;

const DESTRUCTIVE_MULTI_WORD = [
  'resolve conversation',
  'unresolve conversation',
  'merge pull request',
  'close issue',
  'close pull request',
  'dismiss review',
  'submit comment',
  'add reaction',
] as const;

/**
 * Collect the accessible name from labelling attributes and contents.
 *
 * @param element - Element whose name should be read.
 * @returns Normalized accessible name, or an empty string when none exists.
 */
export function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy !== null && labelledBy.trim() !== '') {
    const parts = labelledBy.trim().split(/\s+/u);
    const texts: string[] = [];
    for (const id of parts) {
      const ref = element.ownerDocument.getElementById(id);
      if (ref === null) {
        continue;
      }
      texts.push(ref.textContent);
    }
    const combined = normalizeText(texts.join(' '));
    if (combined !== '') {
      return combined;
    }
  }
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel !== null && ariaLabel.trim() !== '') {
    return normalizeText(ariaLabel);
  }
  return normalizeText(element.textContent);
}

/**
 * Return whether the element is an allowed disclosure or button control.
 *
 * Approved: `HTMLButtonElement`, `summary` / `details` disclosures, and
 * `HTMLAnchorElement` with `role="button"`.
 *
 * @param element - Candidate node.
 * @returns True when the node is an approved interactive control.
 */
export function isApprovedInteractiveControl(element: Element): boolean {
  if (element instanceof HTMLButtonElement) {
    return true;
  }
  if (element.tagName === 'SUMMARY' || element.tagName === 'DETAILS') {
    return true;
  }
  if (
    element instanceof HTMLAnchorElement &&
    element.getAttribute('role') === 'button'
  ) {
    return true;
  }
  return false;
}

/**
 * Return whether the control matches a destructive or state-changing action.
 *
 * Matching uses whole-action phrases on accessible name, `aria-label`,
 * `data-action`, and `name`. Substrings such as "resolve" inside "Show
 * resolved" do not match.
 *
 * @param element - Candidate node.
 * @returns True when the control must never be activated.
 */
export function matchesDestructiveDenylist(element: Element): boolean {
  for (const raw of actionStrings(element)) {
    if (matchesDestructivePhrase(normalizeForMatch(raw))) {
      return true;
    }
  }
  return false;
}

/**
 * Return whether the element and its ancestors are visible and enabled.
 *
 * Checks `hidden`, `aria-hidden`, `inert`, `disabled`, `aria-disabled`,
 * ancestor presence of those, and computed style when a view is available.
 * Does not rely on `getClientRects`.
 *
 * @param element - Candidate node.
 * @returns True when the control can be pointed at and activated.
 */
export function isVisibleAndEnabled(element: Element): boolean {
  let current: Element | null = element;
  while (current !== null) {
    if (current.hasAttribute('hidden')) {
      return false;
    }
    if (current.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    if (current.hasAttribute('inert')) {
      return false;
    }
    if (current instanceof HTMLElement && current.inert) {
      return false;
    }
    if (current.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    if (isDisabledFormControl(current)) {
      return false;
    }
    if (isComputedHidden(current)) {
      return false;
    }
    current = current.parentElement;
  }
  if (element.closest('fieldset[disabled]') !== null) {
    return false;
  }
  return true;
}

/**
 * Build a stable identity key for deduplication across DOM replacements.
 *
 * Combines `ruleId` with `id`, `aria-controls`, `data-url`/`href`, and
 * `data-testid`. Returns `undefined` when none of those identity attributes
 * exist.
 *
 * @param element - Candidate node.
 * @param ruleId - Rule that nominated the element.
 * @returns Fingerprint string, or `undefined` when identity is missing.
 */
export function semanticFingerprint(
  element: Element,
  ruleId: RuleId,
): string | undefined {
  const id = emptyToUndefined(element.id);
  const ariaControls = emptyToUndefined(element.getAttribute('aria-controls'));
  const url = identityUrl(element);
  const testId = emptyToUndefined(element.getAttribute('data-testid'));
  if (
    id === undefined &&
    ariaControls === undefined &&
    url === undefined &&
    testId === undefined
  ) {
    return undefined;
  }
  return [ruleId, id ?? '', ariaControls ?? '', url ?? '', testId ?? ''].join(
    '\0',
  );
}

/**
 * Return whether `element` may be activated for `rule` in `context`.
 *
 * Predicates: connected to `context.document`, approved interactive control,
 * visible and enabled, inside the conversation root, outside the extension
 * host, not on the destructive denylist, and not already expanded unless
 * `rule.modelsPagination` is true.
 *
 * @param element - Candidate node.
 * @param context - Discovery context for the current run.
 * @param rule - Rule that nominated the element.
 * @returns True when every safety predicate passes.
 */
export function passesSafetyPredicates(
  element: Element,
  context: DiscoveryContext,
  rule: ExpansionRule,
): boolean {
  if (!element.isConnected) {
    return false;
  }
  if (element.ownerDocument !== context.document) {
    return false;
  }
  if (!isApprovedInteractiveControl(element)) {
    return false;
  }
  if (!isVisibleAndEnabled(element)) {
    return false;
  }
  if (!context.conversationRoot.contains(element)) {
    return false;
  }
  if (
    context.host !== null &&
    (element === context.host || context.host.contains(element))
  ) {
    return false;
  }
  if (element.closest(HOST_SELECTOR) !== null) {
    return false;
  }
  if (matchesDestructiveDenylist(element)) {
    return false;
  }
  if (!rule.modelsPagination && isAlreadyExpanded(element)) {
    return false;
  }
  return true;
}

function isAlreadyExpanded(element: Element): boolean {
  if (element.getAttribute('aria-expanded') === 'true') {
    return true;
  }
  const details = element.closest('details');
  if (details instanceof HTMLDetailsElement && details.open) {
    return true;
  }
  return false;
}

function isDisabledFormControl(element: Element): boolean {
  if (element instanceof HTMLButtonElement && element.disabled) {
    return true;
  }
  if (element instanceof HTMLInputElement && element.disabled) {
    return true;
  }
  if (element instanceof HTMLSelectElement && element.disabled) {
    return true;
  }
  if (element instanceof HTMLTextAreaElement && element.disabled) {
    return true;
  }
  if (element instanceof HTMLFieldSetElement && element.disabled) {
    return true;
  }
  return false;
}

function isComputedHidden(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    return false;
  }
  const style = view.getComputedStyle(element);
  if (style.display === 'none') {
    return true;
  }
  if (style.visibility === 'hidden' || style.visibility === 'collapse') {
    return true;
  }
  if (style.opacity === '0') {
    return true;
  }
  return false;
}

function actionStrings(element: Element): string[] {
  const values = [accessibleName(element)];
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel !== null) {
    values.push(ariaLabel);
  }
  const dataAction = element.getAttribute('data-action');
  if (dataAction !== null) {
    values.push(dataAction);
  }
  const name = element.getAttribute('name');
  if (name !== null) {
    values.push(name);
  }
  return values;
}

function matchesDestructivePhrase(normalized: string): boolean {
  if (normalized === '') {
    return false;
  }
  if (DESTRUCTIVE_EXACT.has(normalized)) {
    return true;
  }
  for (const phrase of DESTRUCTIVE_MULTI_WORD) {
    if (normalized === phrase || normalized.startsWith(`${phrase} `)) {
      return true;
    }
  }
  for (const word of DESTRUCTIVE_PREFIX_WORDS) {
    if (normalized.startsWith(`${word} `)) {
      return true;
    }
  }
  return false;
}

function identityUrl(element: Element): string | undefined {
  const dataUrl = emptyToUndefined(element.getAttribute('data-url'));
  if (dataUrl !== undefined) {
    return dataUrl;
  }
  if (element instanceof HTMLAnchorElement) {
    return emptyToUndefined(element.getAttribute('href'));
  }
  return undefined;
}

function emptyToUndefined(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  return trimmed;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/**
 * Attach expansion behavior that happy-dom will not infer from markup.
 *
 * Inline fixture scripts do not run when HTML is written via `document.write`.
 * Tests call this helper so clicks remove pagers, expand comments, and reveal
 * minimized rows.
 *
 * @param root - Conversation root.
 */
export function wireStandardExpansions(root: Element): void {
  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const testId = target.getAttribute('data-testid');
    if (testId === 'timeline-load-more' || testId === 'load-more-timeline') {
      target.remove();
      return;
    }
    if (testId === 'hidden-items-expand' || testId === 'show-hidden-items') {
      target.closest('.js-timeline-item-hidden')?.remove();
      target.remove();
      return;
    }
    if (testId === 'comment-show-more') {
      target.setAttribute('aria-expanded', 'true');
      return;
    }
    if (testId === 'minimized-comment-reveal') {
      target.closest('.minimized-comment')?.remove();
      target.remove();
      return;
    }
    if (
      testId === 'review-thread-load-more' ||
      testId === 'load-more-review-comments'
    ) {
      target.remove();
      return;
    }
    if (testId === 'review-thread-toggle') {
      target.setAttribute('aria-expanded', 'true');
    }
  });
}

/**
 * Prevent form navigation when pagination submit buttons are clicked.
 *
 * @param doc - Document that contains ajax pagination forms.
 */
export function preventFormSubmit(doc: Document): void {
  doc.addEventListener('submit', (event: Event) => {
    event.preventDefault();
  });
}

/**
 * Replace a timeline pager with a new `data-url` (or remove the last page).
 *
 * @param root - Conversation root.
 */
export function wireAsyncPagination(root: Element): void {
  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.getAttribute('data-testid') !== 'timeline-load-more') {
      return;
    }
    const url = target.getAttribute('data-url');
    if (url === '/timeline?after=page1') {
      const next = target.cloneNode(true);
      if (!(next instanceof HTMLElement)) {
        return;
      }
      next.setAttribute('data-url', '/timeline?after=page2');
      target.replaceWith(next);
      return;
    }
    target.remove();
  });
}

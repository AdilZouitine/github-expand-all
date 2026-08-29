/**
 * Load sanitized HTML fixtures into the current Vitest document.
 */
export function loadHtmlFixture(
  html: string,
  href = 'https://github.com/acme/demo/issues/1',
): Document {
  document.open();
  document.write(html);
  document.close();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(href),
  });
  return document;
}

export function conversationRoot(doc: Document = document): Element {
  const root =
    doc.querySelector('[data-testid="issue-viewer-container"]') ??
    doc.querySelector('#discussion_bucket') ??
    doc.querySelector('.js-discussion');
  if (root === null) {
    throw new Error('Fixture is missing a conversation root');
  }
  return root;
}

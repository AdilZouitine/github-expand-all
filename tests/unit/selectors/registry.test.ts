import { describe, expect, it } from 'vitest';
import {
  findConversationRoot,
  findUiAnchor,
} from '../../../src/selectors/registry.ts';

describe('findConversationRoot', () => {
  it('returns the first connected preference-order container', () => {
    document.body.innerHTML = `
      <div class="js-discussion"></div>
      <div data-testid="issue-viewer-container"></div>
    `;
    const root = findConversationRoot(document);
    expect(root?.getAttribute('data-testid')).toBe('issue-viewer-container');
  });

  it('returns null when no conversation container exists', () => {
    document.body.innerHTML = `<main></main>`;
    expect(findConversationRoot(document)).toBeNull();
  });
});

describe('findUiAnchor', () => {
  it('prefers issue-header-actions', () => {
    document.body.innerHTML = `
      <div class="gh-header-actions"></div>
      <div data-testid="issue-header-actions"></div>
    `;
    expect(findUiAnchor(document)?.getAttribute('data-testid')).toBe(
      'issue-header-actions',
    );
  });

  it('returns null without anchors', () => {
    document.body.innerHTML = `<div></div>`;
    expect(findUiAnchor(document)).toBeNull();
  });
});

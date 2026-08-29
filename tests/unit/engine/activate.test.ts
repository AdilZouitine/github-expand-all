import { afterEach, describe, expect, it } from 'vitest';
import { activateCandidate } from '../../../src/engine/activate.ts';
import {
  captureActivationSnapshot,
  postconditionSatisfied,
} from '../../../src/engine/postcondition.ts';
import type {
  ActivationResult,
  Candidate,
  ExpansionRule,
} from '../../../src/engine/types.ts';
import { AbortError } from '../../../src/shared/abort.ts';
import { createRegistry } from '../../../src/selectors/rules.ts';
import { discoveryContext } from '../../helpers/fakes.ts';

const registry = createRegistry();

afterEach(() => {
  document.body.innerHTML = '';
});

function mountButton(html: string): {
  candidate: Candidate;
  context: ReturnType<typeof discoveryContext>;
} {
  document.body.innerHTML = `<div data-testid="issue-viewer-container">${html}</div>`;
  const root = document.querySelector('[data-testid="issue-viewer-container"]');
  const element = root?.querySelector('button, summary');
  if (root === null || !(element instanceof HTMLElement)) {
    throw new Error('missing fixture');
  }
  return {
    context: discoveryContext(root),
    candidate: {
      element,
      rule: registry.rule('comment-expand'),
    },
  };
}

describe('activateCandidate', () => {
  it('throws AbortError when the signal is already aborted', async () => {
    const { candidate, context } = mountButton(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>`,
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      activateCandidate(candidate, context, controller.signal),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it('returns detached when the element is not connected', async () => {
    const { candidate, context } = mountButton(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>`,
    );
    candidate.element.remove();
    const result = await activateCandidate(
      candidate,
      context,
      new AbortController().signal,
    );
    expect(result).toEqual({
      status: 'detached',
      ruleId: 'comment-expand',
    });
  });

  it('returns skipped when safety fails', async () => {
    const { candidate, context } = mountButton(
      `<button type="button">Merge</button>`,
    );
    const result = await activateCandidate(
      candidate,
      context,
      new AbortController().signal,
    );
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('safety');
  });

  it('returns the rule activation result', async () => {
    const { candidate, context } = mountButton(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c1">Show more</button>`,
    );
    candidate.element.addEventListener('click', () => {
      candidate.element.setAttribute('aria-expanded', 'true');
    });
    const result = await activateCandidate(
      candidate,
      context,
      new AbortController().signal,
    );
    expect(result.status).toBe('activated');
  });

  it('converts non-abort throws into error status', async () => {
    const { candidate, context } = mountButton(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>`,
    );
    const throwing: ExpansionRule = {
      ...candidate.rule,
      async activate(): Promise<ActivationResult> {
        throw new Error('boom');
      },
    };
    const result = await activateCandidate(
      { element: candidate.element, rule: throwing },
      context,
      new AbortController().signal,
    );
    expect(result).toEqual({
      status: 'error',
      ruleId: 'comment-expand',
      reason: 'boom',
    });
  });

  it('converts non-error throws into error status', async () => {
    const { candidate, context } = mountButton(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>`,
    );
    const throwing: ExpansionRule = {
      ...candidate.rule,
      async activate(): Promise<ActivationResult> {
        throw new Error('');
      },
    };
    const result = await activateCandidate(
      { element: candidate.element, rule: throwing },
      context,
      new AbortController().signal,
    );
    expect(result.status).toBe('error');
    expect(result.reason).toBe('activation-failed');
  });

  it('rethrows abort errors from rule.activate', async () => {
    const { candidate, context } = mountButton(
      `<button type="button" data-testid="comment-show-more" aria-expanded="false">Show more</button>`,
    );
    const aborting: ExpansionRule = {
      ...candidate.rule,
      async activate(): Promise<ActivationResult> {
        throw new AbortError();
      },
    };
    await expect(
      activateCandidate(
        { element: candidate.element, rule: aborting },
        context,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(AbortError);
  });
});

describe('postcondition', () => {
  it('detects aria-expanded, details.open, data-url, and disconnect', () => {
    document.body.innerHTML = `
      <div data-testid="issue-viewer-container">
        <button type="button" aria-expanded="false" data-url="/a">x</button>
        <details><summary>s</summary></details>
      </div>
    `;
    const button = document.querySelector('button');
    const summary = document.querySelector('summary');
    if (!(button instanceof HTMLElement) || !(summary instanceof HTMLElement)) {
      throw new Error('missing nodes');
    }
    const beforeExpand = captureActivationSnapshot(button);
    expect(postconditionSatisfied(button, beforeExpand)).toBe(false);
    button.setAttribute('aria-expanded', 'true');
    expect(postconditionSatisfied(button, beforeExpand)).toBe(true);

    const beforeSummary = captureActivationSnapshot(summary);
    const details = summary.closest('details');
    if (!(details instanceof HTMLDetailsElement)) {
      throw new Error('missing details');
    }
    details.open = true;
    expect(postconditionSatisfied(summary, beforeSummary)).toBe(true);

    const beforeUrl = captureActivationSnapshot(button);
    button.setAttribute('data-url', '/b');
    expect(postconditionSatisfied(button, beforeUrl)).toBe(true);

    const beforeRemove = captureActivationSnapshot(button);
    button.remove();
    expect(postconditionSatisfied(button, beforeRemove)).toBe(true);
  });
});

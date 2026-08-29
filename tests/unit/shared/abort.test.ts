import { describe, expect, it } from 'vitest';
import {
  AbortError,
  abortReasonMessage,
  createLinkedAbortController,
  isAbortError,
  linkAbortSignal,
  throwIfAborted,
} from '../../../src/shared/abort.ts';

describe('abort helpers', () => {
  it('throwIfAborted uses a string abort reason', () => {
    const controller = new AbortController();
    controller.abort('navigation');
    expect(() => {
      throwIfAborted(controller.signal);
    }).toThrow(AbortError);
    expect(() => {
      throwIfAborted(controller.signal);
    }).toThrow('navigation');
  });

  it('abortReasonMessage falls back when the reason is not a non-empty string', () => {
    const controller = new AbortController();
    controller.abort();
    expect(abortReasonMessage(controller.signal)).toBe('Operation aborted');
  });

  it('recognizes AbortError, DOMException, and named Error values', () => {
    expect(isAbortError(new AbortError())).toBe(true);
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    const named = new Error('stopped');
    named.name = 'AbortError';
    expect(isAbortError(named)).toBe(true);
    expect(isAbortError(new Error('other'))).toBe(false);
    expect(isAbortError('abort')).toBe(false);
  });

  it('linkAbortSignal aborts immediately when the source is already aborted', () => {
    const source = new AbortController();
    source.abort('already');
    const target = new AbortController();
    linkAbortSignal(source.signal, target);
    expect(target.signal.aborted).toBe(true);
    expect(target.signal.reason).toBe('already');
  });

  it('createLinkedAbortController follows a later parent abort', () => {
    const parent = new AbortController();
    const child = createLinkedAbortController(parent.signal);
    parent.abort('later');
    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe('later');
  });
});

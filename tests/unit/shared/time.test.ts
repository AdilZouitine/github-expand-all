import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbortError } from '../../../src/shared/abort.ts';
import { createDomClock, sleep } from '../../../src/shared/time.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('sleep', () => {
  it('returns immediately for non-positive durations', async () => {
    await expect(
      sleep(0, new AbortController().signal),
    ).resolves.toBeUndefined();
    await expect(
      sleep(-5, new AbortController().signal),
    ).resolves.toBeUndefined();
  });

  it('resolves after the requested delay', async () => {
    vi.useFakeTimers();
    const pending = sleep(40, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(40);
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when aborted while waiting', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = sleep(1_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AbortError);
  });

  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(10, controller.signal)).rejects.toBeInstanceOf(
      AbortError,
    );
  });
});

describe('createDomClock', () => {
  it('reports Date.now and sleeps through the platform timer', () => {
    const clock = createDomClock();
    const before = Date.now();
    expect(clock.now()).toBeGreaterThanOrEqual(before);
    expect(clock.sleep).toBe(sleep);
  });
});

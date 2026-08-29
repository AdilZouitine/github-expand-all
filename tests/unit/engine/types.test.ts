import { describe, expect, it } from 'vitest';
import {
  assertNever,
  DEFAULT_ENGINE_LIMITS,
  mergeLimits,
} from '../../../src/engine/types.ts';

describe('mergeLimits', () => {
  it('returns production defaults when no overrides are provided', () => {
    expect(mergeLimits(undefined)).toEqual(DEFAULT_ENGINE_LIMITS);
  });

  it('overrides only the provided fields', () => {
    const merged = mergeLimits({ maxPasses: 3, quietPeriodMs: 5 });
    expect(merged.maxPasses).toBe(3);
    expect(merged.quietPeriodMs).toBe(5);
    expect(merged.maxActivations).toBe(DEFAULT_ENGINE_LIMITS.maxActivations);
  });
});

describe('assertNever', () => {
  it('throws for values that TypeScript believes are unreachable', () => {
    expect(() => {
      assertNever('limit' as never);
    }).toThrow('Unexpected value: limit');
  });
});

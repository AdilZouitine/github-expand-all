import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../src/shared/logger.ts';

describe('createLogger', () => {
  it('is silent when disabled', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {
      return;
    });
    const logger = createLogger(false);
    logger.debug('run-end', { count: 1 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs a message without meta when enabled', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {
      return;
    });
    const logger = createLogger(true);
    logger.debug('host mounted');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toBe('[github-expand-all] host mounted');
    spy.mockRestore();
  });

  it('logs rule counts without page content', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {
      return;
    });
    const logger = createLogger(true);
    logger.debug('run-end', { count: 3, durationMs: 12 });
    expect(spy).toHaveBeenCalledWith('[github-expand-all] run-end', {
      count: 3,
      durationMs: 12,
    });
    spy.mockRestore();
  });
});

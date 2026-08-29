import { bench, describe } from 'vitest';
import { createEngine } from '../../src/engine/engine.ts';
import type { EngineLimits } from '../../src/engine/types.ts';
import { conversationRoot, loadHtmlFixture } from '../fixtures/load.ts';
import { buildLargeConversationHtml } from '../fixtures/large.ts';
import { createRegistry } from '../../src/selectors/rules.ts';
import {
  createFakeClock,
  createFakeLogger,
  createImmediateSettle,
} from '../helpers/fakes.ts';
import { wireStandardExpansions } from '../helpers/wire.ts';

const registry = createRegistry();

function runEngine(limits?: Partial<EngineLimits>): Promise<unknown> {
  const engine = createEngine({
    clock: createFakeClock(),
    settle: createImmediateSettle(),
    logger: createFakeLogger(),
    ...(limits === undefined ? {} : { limits }),
  });
  return engine.run({
    document,
    conversationRoot: conversationRoot(),
    host: null,
    locale: 'en',
    rules: registry.rules,
    signal: new AbortController().signal,
  });
}

describe('engine benches', () => {
  bench('1 candidate', async () => {
    loadHtmlFixture(
      buildLargeConversationHtml({
        nodeCount: 20,
        candidateCount: 1,
        seed: 3,
      }),
    );
    wireStandardExpansions(conversationRoot());
    await runEngine();
  });

  bench('10 candidates', async () => {
    loadHtmlFixture(
      buildLargeConversationHtml({
        nodeCount: 80,
        candidateCount: 10,
        seed: 4,
      }),
    );
    wireStandardExpansions(conversationRoot());
    await runEngine();
  });

  bench('100 candidates', async () => {
    loadHtmlFixture(
      buildLargeConversationHtml({
        nodeCount: 5000,
        candidateCount: 100,
        seed: 5,
      }),
    );
    wireStandardExpansions(conversationRoot());
    await runEngine({
      maxPasses: 200,
      maxActivations: 200,
      maxRuntimeMs: 60_000,
    });
  });
});

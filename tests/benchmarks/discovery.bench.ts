import { bench, describe } from 'vitest';
import { discoverCandidates } from '../../src/engine/discover.ts';
import { conversationRoot, loadHtmlFixture } from '../fixtures/load.ts';
import { buildLargeConversationHtml } from '../fixtures/large.ts';
import { readHtmlFixture } from '../fixtures/read.ts';
import { createRegistry } from '../../src/selectors/rules.ts';
import { passesSafetyPredicates } from '../../src/selectors/safety.ts';
import { discoveryContext } from '../helpers/fakes.ts';

const registry = createRegistry();

describe('discovery benches', () => {
  bench('small issue fixture', () => {
    loadHtmlFixture(readHtmlFixture('issue.html'));
    discoverCandidates(registry.rules, discoveryContext(conversationRoot()));
  });

  bench('medium pull fixture', () => {
    loadHtmlFixture(
      readHtmlFixture('pull.html'),
      'https://github.com/acme/demo/pull/2',
    );
    discoverCandidates(registry.rules, discoveryContext(conversationRoot()));
  });

  bench('large synthetic conversation', () => {
    loadHtmlFixture(
      buildLargeConversationHtml({
        nodeCount: 5000,
        candidateCount: 100,
        seed: 1,
      }),
    );
    discoverCandidates(registry.rules, discoveryContext(conversationRoot()));
  });

  bench('adversarial safety filtering', () => {
    loadHtmlFixture(
      buildLargeConversationHtml({
        nodeCount: 5000,
        candidateCount: 100,
        seed: 2,
        adversarial: true,
      }),
    );
    const context = discoveryContext(conversationRoot());
    const nodes = context.conversationRoot.querySelectorAll('button, summary');
    const comment = registry.rule('comment-expand');
    for (const node of nodes) {
      passesSafetyPredicates(node, context, comment);
    }
  });
});

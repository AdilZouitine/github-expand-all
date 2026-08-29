const DEFAULT_NODE_COUNT = 5000;
const DEFAULT_CANDIDATE_COUNT = 100;
const DEFAULT_SEED = 1;

const CANDIDATE_KINDS = [
  'timeline-load-more',
  'timeline-hidden-items',
  'comment-expand',
  'minimized-comment-reveal',
  'review-thread-expand',
  'review-comments-load-more',
] as const;

type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export interface LargeFixtureOptions {
  readonly nodeCount?: number;
  readonly candidateCount?: number;
  readonly seed?: number;
  readonly adversarial?: boolean;
}

/**
 * Build a large GitHub-like conversation document with a seeded layout.
 *
 * Does not call `Math.random`. Use the same `seed` for reproducible benches.
 *
 * @param options - Node count, candidate count, seed, and adversarial mix.
 * @returns Full HTML document string.
 */
export function buildLargeConversationHtml(
  options: LargeFixtureOptions = {},
): string {
  const nodeCount = options.nodeCount ?? DEFAULT_NODE_COUNT;
  const candidateCount = options.candidateCount ?? DEFAULT_CANDIDATE_COUNT;
  const seed = options.seed ?? DEFAULT_SEED;
  const adversarial = options.adversarial === true;
  const rng = createSeededRng(seed);
  const parts: string[] = [
    '<!doctype html><html lang="en"><body>',
    '<div data-testid="issue-viewer-container" class="js-discussion">',
  ];
  let nodes = 2;
  let candidates = 0;
  let index = 0;
  while (nodes < nodeCount || candidates < candidateCount) {
    const wantCandidate =
      candidates < candidateCount &&
      (nodes >= nodeCount || rng() < candidateCount / nodeCount);
    if (wantCandidate) {
      const kind =
        CANDIDATE_KINDS[index % CANDIDATE_KINDS.length] ?? 'timeline-load-more';
      const chunk = candidateMarkup(kind, index);
      parts.push(chunk.html);
      nodes += chunk.nodes;
      candidates += 1;
      index += 1;
      continue;
    }
    if (adversarial && rng() < 0.15) {
      parts.push('<button type="button">Merge</button>');
      nodes += 1;
      continue;
    }
    parts.push('<div class="filler"><span>x</span></div>');
    nodes += 2;
  }
  parts.push('</div></body></html>');
  return parts.join('');
}

/**
 * Linear congruential generator in `[0, 1)`.
 *
 * @param seed - Integer seed.
 * @returns Deterministic generator.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return (): number => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function candidateMarkup(
  kind: CandidateKind,
  index: number,
): { html: string; nodes: number } {
  const url = `/timeline?after=seed-${index}`;
  switch (kind) {
    case 'timeline-load-more':
      return {
        html: `<button type="button" data-testid="timeline-load-more" data-url="${url}">Load more</button>`,
        nodes: 1,
      };
    case 'timeline-hidden-items':
      return {
        html: `<div class="js-timeline-item-hidden"><button type="button" data-testid="hidden-items-expand">Show 2 hidden items</button></div>`,
        nodes: 2,
      };
    case 'comment-expand':
      return {
        html: `<button type="button" data-testid="comment-show-more" aria-expanded="false" aria-controls="c-${index}">Show more</button>`,
        nodes: 1,
      };
    case 'minimized-comment-reveal':
      return {
        html: `<div class="minimized-comment"><button type="button" data-testid="minimized-comment-reveal">Show comment</button></div>`,
        nodes: 2,
      };
    case 'review-thread-expand':
      return {
        html: `<details data-resolved="true"><summary data-testid="review-thread-expand">Show resolved</summary><p>thread</p></details>`,
        nodes: 3,
      };
    case 'review-comments-load-more':
      return {
        html: `<button type="button" data-testid="load-more-review-comments">Load more comments</button>`,
        nodes: 1,
      };
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

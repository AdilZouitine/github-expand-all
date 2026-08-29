import { bench, describe } from 'vitest';
import { parseRoute } from '../../src/app/route.ts';

const hrefs = [
  'https://github.com/acme/demo/issues/1',
  'https://github.com/acme/demo/issues/1/',
  'https://github.com/acme/demo/issues/1?tab=comments',
  'https://github.com/acme/demo/issues/1#issuecomment-9',
  'https://github.com/acme/demo/pull/42',
  'https://github.com/acme/demo/pull/42/',
  'https://github.com/acme/demo/pull/42/files',
  'https://github.com/acme/demo/issues',
  'https://github.com/acme/demo/issues/new',
  'https://github.com/acme/demo/discussions/1',
  'https://github.com/acme/demo',
  'https://github.company.com/acme/demo/issues/1',
  'https://github.com/foo/issues',
  'https://github.com/acme/demo/issues/1-extra',
  '/octocat/hello-world/issues/7',
];

describe('parseRoute', () => {
  bench('many hrefs', () => {
    for (let index = 0; index < 200; index += 1) {
      for (const href of hrefs) {
        parseRoute(href);
      }
    }
  });
});

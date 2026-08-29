import { bench, describe } from 'vitest';
import { mountHost, unmountHost } from '../../src/ui/mount.ts';

describe('mountHost', () => {
  bench('mount and unmount cycles', () => {
    const anchor = document.createElement('div');
    anchor.setAttribute('data-testid', 'issue-header-actions');
    document.body.append(anchor);
    for (let index = 0; index < 50; index += 1) {
      mountHost(document, '');
      unmountHost(document);
    }
    anchor.remove();
  });
});

import { describe, expect, it } from 'vitest';
import {
  isSupportedRoute,
  parseRoute,
  routeKey,
} from '../../../src/app/route.ts';

describe('parseRoute', () => {
  it('accepts issue URLs with and without a trailing slash', () => {
    const bare = parseRoute('https://github.com/acme/demo/issues/1');
    const slash = parseRoute('https://github.com/acme/demo/issues/1/');
    expect(bare).toEqual({
      kind: 'issue',
      owner: 'acme',
      repository: 'demo',
      number: 1,
      key: 'issue:acme/demo#1',
    });
    expect(slash).toEqual(bare);
    expect(isSupportedRoute(bare)).toBe(true);
  });

  it('accepts pull request URLs with and without a trailing slash', () => {
    const bare = parseRoute('https://github.com/acme/demo/pull/42');
    const slash = parseRoute('https://github.com/acme/demo/pull/42/');
    expect(bare).toEqual({
      kind: 'pull',
      owner: 'acme',
      repository: 'demo',
      number: 42,
      key: 'pull:acme/demo#42',
    });
    expect(slash).toEqual(bare);
  });

  it('ignores query strings and hashes on supported routes', () => {
    const issue = parseRoute(
      'https://github.com/acme/demo/issues/1?tab=comments#issuecomment-9',
    );
    const pull = parseRoute(
      'https://github.com/acme/demo/pull/2?diff=unified#discussion_r1',
    );
    expect(isSupportedRoute(issue)).toBe(true);
    expect(isSupportedRoute(pull)).toBe(true);
    expect(routeKey('https://github.com/acme/demo/issues/1?x=1')).toBe(
      routeKey('https://github.com/acme/demo/issues/1#c'),
    );
  });

  it('accepts relative paths resolved against github.com', () => {
    const route = parseRoute('/octocat/hello-world/issues/7');
    expect(route).toMatchObject({
      kind: 'issue',
      owner: 'octocat',
      repository: 'hello-world',
      number: 7,
    });
  });

  it('rejects issue and pull list pages', () => {
    expect(parseRoute('https://github.com/acme/demo/issues').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://github.com/acme/demo/pulls').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://github.com/acme/demo/issues/').kind).toBe(
      'unsupported',
    );
  });

  it('rejects /issues/new', () => {
    expect(parseRoute('https://github.com/acme/demo/issues/new').kind).toBe(
      'unsupported',
    );
  });

  it('rejects discussions', () => {
    expect(parseRoute('https://github.com/acme/demo/discussions/1').kind).toBe(
      'unsupported',
    );
  });

  it('rejects extra path segments such as /pull/1/files', () => {
    expect(parseRoute('https://github.com/acme/demo/pull/1/files').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://github.com/acme/demo/issues/1/files').kind).toBe(
      'unsupported',
    );
  });

  it('rejects GitHub Enterprise and other hosts', () => {
    expect(
      parseRoute('https://github.company.com/acme/demo/issues/1').kind,
    ).toBe('unsupported');
    expect(parseRoute('https://github.ibm.com/acme/demo/pull/1').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://gist.github.com/acme/demo/issues/1').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://www.github.com/acme/demo/issues/1').kind).toBe(
      'unsupported',
    );
    expect(
      parseRoute('https://github.com.evil.example/acme/demo/issues/1').kind,
    ).toBe('unsupported');
  });

  it('rejects substring traps', () => {
    expect(parseRoute('https://github.com/acme/demo/issues/1-extra').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://github.com/foo/issues').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://github.com/issues/1').kind).toBe('unsupported');
    expect(
      parseRoute('https://github.com/acme/issues-tracker/blob/main').kind,
    ).toBe('unsupported');
  });

  it('rejects issue number 0 and non-numeric segments', () => {
    expect(parseRoute('https://github.com/acme/demo/issues/0').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://github.com/acme/demo/pull/00').kind).toBe(
      'unsupported',
    );
    expect(parseRoute('https://github.com/acme/demo/issues/1e2').kind).toBe(
      'unsupported',
    );
  });

  it('rejects invalid hrefs', () => {
    expect(parseRoute('https://[::1').kind).toBe('unsupported');
  });

  it('uses a stable unsupported key', () => {
    expect(routeKey('https://github.com/acme/demo')).toBe('unsupported');
    expect(routeKey('https://example.com/acme/demo/issues/1')).toBe(
      'unsupported',
    );
  });
});

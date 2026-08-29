/**
 * Route parsing for GitHub Issue and Pull Request conversation pages.
 *
 * Recognition uses the parsed URL pathname and exact segment structure, not
 * substring matching. Query strings, hashes, and trailing slashes do not
 * invalidate an otherwise supported route.
 */

export type RouteKind = 'issue' | 'pull' | 'unsupported';

export interface SupportedRoute {
  readonly kind: 'issue' | 'pull';
  readonly key: string;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}

export interface UnsupportedRoute {
  readonly kind: 'unsupported';
  readonly key: string;
}

export type ParsedRoute = SupportedRoute | UnsupportedRoute;

const SUPPORTED_PATH = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/([0-9]+)\/?$/u;

const UNSUPPORTED_KEY = 'unsupported';

/**
 * Parse an absolute or relative GitHub URL into a normalized route.
 */
export function parseRoute(href: string): ParsedRoute {
  const url = parseUrl(href);
  if (url === undefined) {
    return unsupported();
  }
  if (!isGitHubHost(url.hostname)) {
    return unsupported();
  }
  const match = SUPPORTED_PATH.exec(url.pathname);
  if (match === null) {
    return unsupported();
  }
  const owner = match[1];
  const repository = match[2];
  const kindSegment = match[3];
  const numberSegment = match[4];
  if (
    owner === undefined ||
    repository === undefined ||
    kindSegment === undefined ||
    numberSegment === undefined
  ) {
    return unsupported();
  }
  const kind = kindSegment === 'issues' ? 'issue' : 'pull';
  const number = Number.parseInt(numberSegment, 10);
  if (!Number.isSafeInteger(number) || number <= 0) {
    return unsupported();
  }
  return {
    kind,
    owner,
    repository,
    number,
    key: `${kind}:${owner}/${repository}#${number}`,
  };
}

/**
 * True when the parsed route is an Issue or Pull Request conversation page.
 */
export function isSupportedRoute(route: ParsedRoute): route is SupportedRoute {
  return route.kind !== 'unsupported';
}

/**
 * Normalized comparison key for SPA reconciliation.
 */
export function routeKey(href: string): string {
  return parseRoute(href).key;
}

function parseUrl(href: string): URL | undefined {
  try {
    return new URL(href, 'https://github.com');
  } catch {
    return undefined;
  }
}

function isGitHubHost(hostname: string): boolean {
  return hostname.toLowerCase() === 'github.com';
}

function unsupported(): UnsupportedRoute {
  return { kind: 'unsupported', key: UNSUPPORTED_KEY };
}

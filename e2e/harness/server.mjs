/**
 * Static file server for the GitHub-like E2E harness.
 *
 * Playwright's webServer starts this process on 127.0.0.1:4173. Chromium tests
 * never use that origin as the page URL: they `goto https://github.com/...`
 * and a context route fulfills those requests from this server so the
 * production content script (`https://github.com/*`) injects.
 *
 * Keep the default port in sync with `HARNESS_PORT` in `e2e/helpers/paths.ts`.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 4173;
const harnessDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(harnessDir, '../fixtures');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const port = parsePort(process.env.PORT) ?? DEFAULT_PORT;

const server = createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    if (response.writableEnded) {
      return;
    }
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Internal error');
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Harness listening on http://127.0.0.1:${port}\n`);
});

process.on('SIGTERM', () => {
  server.close();
});
process.on('SIGINT', () => {
  server.close();
});

async function handleRequest(request, response) {
  const host = request.headers.host ?? `127.0.0.1:${port}`;
  const url = new URL(request.url ?? '/', `http://${host}`);

  if (url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  const relative = decodeURIComponent(url.pathname);
  const filePath = resolvePublicPath(relative);
  if (filePath === undefined) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    response.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    const index = path.join(fixturesDir, 'index.html');
    try {
      const body = await readFile(index);
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Harness index.html is missing');
    }
  }
}

function resolvePublicPath(urlPath) {
  const trimmed = urlPath === '/' ? '/index.html' : urlPath;
  const joined = path.resolve(fixturesDir, `.${trimmed}`);
  const relative = path.relative(fixturesDir, joined);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return joined;
}

function parsePort(value) {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return undefined;
  }
  return parsed;
}

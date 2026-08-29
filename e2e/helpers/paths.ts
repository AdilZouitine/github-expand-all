/**
 * Shared E2E constants: harness origin, GitHub-like routes, and WXT output.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helpersDir = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (parent of `e2e/`). */
export const REPO_ROOT: string = path.resolve(helpersDir, '../..');

/** Directory containing Playwright specs and this helpers folder. */
export const E2E_DIR: string = path.resolve(helpersDir, '..');

/**
 * Default local harness port.
 * Keep in sync with `DEFAULT_PORT` in `e2e/harness/server.mjs`.
 */
export const HARNESS_PORT: number = 4173;

/** Origin served by Playwright `webServer` (not used as the page URL). */
export const HARNESS_ORIGIN: string = `http://127.0.0.1:${String(HARNESS_PORT)}`;

/**
 * WXT 0.21 unpacked Chrome MV3 directory.
 */
export const CHROME_MV3_RELATIVE: string = '.output/chrome-mv3';

/** Literal owner/repo used by every harness route. */
export const HARNESS_OWNER: string = 'owner';
export const HARNESS_REPO: string = 'repo';

export const REPO_HOME_PATH: string = `/${HARNESS_OWNER}/${HARNESS_REPO}`;
export const ISSUE_LIST_PATH: string = `${REPO_HOME_PATH}/issues`;
export const ISSUE_PATH: string = `${ISSUE_LIST_PATH}/1`;
export const PULL_PATH: string = `${REPO_HOME_PATH}/pull/2`;
/** Pagination buttons that never mutate the DOM (no-progress / safety limit). */
export const LIMIT_PATH: string = `${ISSUE_LIST_PATH}/3`;
/** Conversation with no expansion candidates. */
export const EMPTY_PATH: string = `${ISSUE_LIST_PATH}/4`;
/** Slow first candidate so Cancel can run mid-expansion. */
export const SLOW_PATH: string = `${ISSUE_LIST_PATH}/5`;

/**
 * Absolute path to the unpacked Chrome MV3 build.
 *
 * @returns Directory containing `manifest.json`.
 * @throws If `pnpm build` has not produced `.output/chrome-mv3/manifest.json`.
 */
export function resolveChromeExtensionPath(): string {
  const dir = path.join(REPO_ROOT, CHROME_MV3_RELATIVE);
  const manifest = path.join(dir, 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(
      `Unpacked Chrome extension not found at ${dir}. Run pnpm build before test:e2e.`,
    );
  }
  return dir;
}

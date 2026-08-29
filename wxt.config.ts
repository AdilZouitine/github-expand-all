import { defineConfig } from 'wxt';

/**
 * Permanent Firefox Add-on ID. Do not change after the first AMO submission.
 */
export const FIREFOX_GECKO_ID = 'github-expand-all@gitscroll.dev';

/**
 * Minimum Firefox version: Manifest V3 content scripts plus
 * `data_collection_permissions` (Firefox 140+).
 */
export const FIREFOX_STRICT_MIN_VERSION = '140.0';

/**
 * Host permission granted to the content script. Runtime route gating further
 * restricts work to Issue and Pull Request conversation pages.
 */
export const HOST_PERMISSIONS = ['https://github.com/*'] as const;

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  publicDir: 'public',
  manifestVersion: 3,
  imports: false,
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip',
    zipSources: false,
  },
  vite: () => ({
    build: {
      sourcemap: false,
    },
  }),
  manifest: ({ browser }) => ({
    name: 'GitHub Expand All',
    description:
      'Expand hidden and collapsed conversation content on GitHub Issues and Pull Requests.',
    permissions: [],
    host_permissions: [...HOST_PERMISSIONS],
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: FIREFOX_GECKO_ID,
              strict_min_version: FIREFOX_STRICT_MIN_VERSION,
              data_collection_permissions: {
                required: ['none'],
              },
            },
          }
        : undefined,
  }),
});

#!/usr/bin/env node
/**
 * Require a release tag `vX.Y.Z` to equal `package.json` version.
 *
 * Reads `GITHUB_REF_NAME` or `argv[2]`. Writes `version` and `tag` to
 * `GITHUB_OUTPUT` when that file is available.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/u;

/**
 * @returns {void}
 */
function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tag = readTag();
  const match = TAG_PATTERN.exec(tag);
  if (match === null) {
    fail(`Tag must match vX.Y.Z, got ${JSON.stringify(tag)}`);
  }
  const tagVersion = match[1];
  if (tagVersion !== pkg.version) {
    fail(`Tag ${tag} does not match package.json version ${pkg.version}`);
  }
  writeOutput('version', pkg.version);
  writeOutput('tag', tag);
  console.log(pkg.version);
}

/**
 * @returns {string}
 */
function readTag() {
  const arg = process.argv[2];
  if (arg !== undefined && arg !== '') {
    return arg;
  }
  const fromEnv = process.env.GITHUB_REF_NAME;
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  fail(
    'Usage: node scripts/verify-tag-version.mjs vX.Y.Z ' +
      '(or set GITHUB_REF_NAME)',
  );
}

/**
 * @param {string} name
 * @param {string} value
 * @returns {void}
 */
function writeOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (output === undefined || output === '') {
    return;
  }
  appendFileSync(output, `${name}=${value}\n`);
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message);
  process.exit(1);
}

main();

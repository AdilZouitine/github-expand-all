#!/usr/bin/env node
/**
 * Validate generated WXT manifests against the V1 permission and identity
 * contract. Reads `.output/<target>/manifest.json` (typically chrome-mv3
 * and firefox-mv3).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_NAME = 'GitHub Expand All';
const EXPECTED_HOST_PERMISSIONS = ['https://github.com/*'];
const EXPECTED_GECKO_ID = 'github-expand-all@gitscroll.dev';

/**
 * @returns {void}
 */
function main() {
  const root = repoRoot();
  const pkg = readJson(join(root, 'package.json'));
  const outputDir = join(root, '.output');
  const manifests = findManifests(outputDir);
  if (manifests.length === 0) {
    fail(`No generated manifests under ${outputDir}/*/manifest.json`);
  }

  let failures = 0;
  for (const manifestPath of manifests) {
    failures += checkManifest(manifestPath, pkg.version);
  }
  if (failures > 0) {
    process.exit(1);
  }
  console.log(`assert-manifest: ${manifests.length} manifest(s) ok`);
}

/**
 * @param {string} manifestPath
 * @param {string} expectedVersion
 * @returns {number}
 */
function checkManifest(manifestPath, expectedVersion) {
  const manifest = readJson(manifestPath);
  const target = parentDirName(manifestPath);
  const isFirefox = target.includes('firefox');
  const errors = [];

  if (manifest.manifest_version !== 3) {
    errors.push(
      `manifest_version is ${String(manifest.manifest_version)}, expected 3`,
    );
  }
  if (manifest.name !== EXPECTED_NAME) {
    errors.push(
      `name is ${JSON.stringify(manifest.name)}, expected ` +
        JSON.stringify(EXPECTED_NAME),
    );
  }
  if (manifest.version !== expectedVersion) {
    errors.push(
      `version is ${JSON.stringify(manifest.version)}, expected ` +
        JSON.stringify(expectedVersion),
    );
  }
  if (!isEmptyArray(manifest.permissions)) {
    errors.push(
      `permissions must be [], got ${JSON.stringify(manifest.permissions)}`,
    );
  }
  if (!sameStringArray(manifest.host_permissions, EXPECTED_HOST_PERMISSIONS)) {
    errors.push(
      'host_permissions must be ' +
        `${JSON.stringify(EXPECTED_HOST_PERMISSIONS)}, got ` +
        JSON.stringify(manifest.host_permissions),
    );
  }

  const geckoId = manifest.browser_specific_settings?.gecko?.id;
  if (isFirefox) {
    if (geckoId !== EXPECTED_GECKO_ID) {
      errors.push(
        `Firefox gecko.id is ${JSON.stringify(geckoId)}, expected ` +
          JSON.stringify(EXPECTED_GECKO_ID),
      );
    }
    const requiredCollection =
      manifest.browser_specific_settings?.gecko?.data_collection_permissions
        ?.required;
    if (!sameStringArray(requiredCollection, ['none'])) {
      errors.push(
        'Firefox gecko.data_collection_permissions.required must be ["none"]',
      );
    }
  }
  if (!isFirefox && geckoId !== undefined) {
    errors.push(
      'Chrome package must not set browser_specific_settings.gecko.id',
    );
  }

  if (errors.length === 0) {
    console.log(`  ok  ${relFromOutput(manifestPath)}`);
    return 0;
  }
  console.error(`  fail ${relFromOutput(manifestPath)}`);
  for (const error of errors) {
    console.error(`       ${error}`);
  }
  return errors.length;
}

/**
 * @param {string} outputDir
 * @returns {string[]}
 */
function findManifests(outputDir) {
  if (!existsSync(outputDir)) {
    return [];
  }
  const found = [];
  for (const name of readdirSync(outputDir, { withFileTypes: true })) {
    if (!name.isDirectory()) {
      continue;
    }
    if (name.name.endsWith('-dev')) {
      continue;
    }
    const manifestPath = join(outputDir, name.name, 'manifest.json');
    if (existsSync(manifestPath)) {
      found.push(manifestPath);
    }
  }
  return found.sort();
}

/**
 * @returns {string}
 */
function repoRoot() {
  const flag = process.argv.indexOf('--root');
  if (flag === -1) {
    return join(dirname(fileURLToPath(import.meta.url)), '..');
  }
  const value = process.argv[flag + 1];
  if (value === undefined || value === '') {
    fail('--root requires a directory path');
  }
  return value;
}

/**
 * @param {string} filePath
 * @returns {any}
 */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * @param {unknown} value
 * @returns {value is unknown[]}
 */
function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

/**
 * @param {unknown} actual
 * @param {readonly string[]} expected
 * @returns {boolean}
 */
function sameStringArray(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  return actual.every((item, index) => item === expected[index]);
}

/**
 * @param {string} manifestPath
 * @returns {string}
 */
function parentDirName(manifestPath) {
  return manifestPath.split('/').at(-2) ?? '';
}

/**
 * @param {string} manifestPath
 * @returns {string}
 */
function relFromOutput(manifestPath) {
  const marker = '/.output/';
  const index = manifestPath.lastIndexOf(marker);
  if (index === -1) {
    return manifestPath;
  }
  return manifestPath.slice(index + 1);
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

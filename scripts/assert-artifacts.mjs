#!/usr/bin/env node
/**
 * Inspect Chrome/Firefox store archives under `.output/`.
 *
 * Fails when a package is missing `manifest.json`, contains source maps,
 * VCS or env files, `node_modules`, leaked test fixtures, parent-traversal
 * paths, oversized non-icon files, or remote http(s) URLs in the manifest
 * beyond the approved GitHub host permission.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MANIFEST_URL = 'https://github.com/*';
const STORE_PACKAGE = /-(chrome|firefox)\.(zip|xpi)$/u;

/**
 * @returns {void}
 */
function main() {
  const root = repoRoot();
  const outputDir = join(root, '.output');
  const archives = findStoreArchives(outputDir);
  if (archives.length === 0) {
    fail(`No Chrome/Firefox zip or xpi archives under ${outputDir}`);
  }

  let failures = 0;
  for (const archivePath of archives) {
    failures += inspectArchive(archivePath);
  }
  if (failures > 0) {
    process.exit(1);
  }
  console.log(`assert-artifacts: ${archives.length} archive(s) ok`);
}

/**
 * @param {string} archivePath
 * @returns {number}
 */
function inspectArchive(archivePath) {
  const buffer = readFileSync(archivePath);
  const entries = listZipEntries(buffer);
  const errors = [];
  let hasManifest = false;

  for (const entry of entries) {
    const name = entry.name.replaceAll('\\', '/');
    if (name === 'manifest.json' || name.endsWith('/manifest.json')) {
      hasManifest = true;
      const manifestText = readZipEntry(buffer, entry).toString('utf8');
      errors.push(...remoteUrlErrors(manifestText));
    }
    if (isUnsafePath(name)) {
      errors.push(`unsafe path ${JSON.stringify(name)}`);
    }
    if (name.endsWith('.map')) {
      errors.push(`source map ${JSON.stringify(name)}`);
    }
    if (isGitPath(name)) {
      errors.push(`git metadata ${JSON.stringify(name)}`);
    }
    if (isEnvPath(name)) {
      errors.push(`env file ${JSON.stringify(name)}`);
    }
    if (name.split('/').includes('node_modules')) {
      errors.push(`node_modules path ${JSON.stringify(name)}`);
    }
    if (isFixtureLeak(name)) {
      errors.push(`test fixture leak ${JSON.stringify(name)}`);
    }
    if (entry.uncompressedSize > MAX_FILE_BYTES && !isIconPath(name)) {
      errors.push(
        `oversized file ${JSON.stringify(name)} (` +
          `${entry.uncompressedSize} bytes)`,
      );
    }
  }

  if (!hasManifest) {
    errors.push('missing manifest.json');
  }

  const label = archivePath.split('/').at(-1) ?? archivePath;
  if (errors.length === 0) {
    console.log(`  ok  ${label} (${entries.length} files)`);
    return 0;
  }
  console.error(`  fail ${label}`);
  for (const error of errors) {
    console.error(`       ${error}`);
  }
  return errors.length;
}

/**
 * @param {string} outputDir
 * @returns {string[]}
 */
function findStoreArchives(outputDir) {
  if (!existsSync(outputDir)) {
    return [];
  }
  const found = [];
  for (const name of readdirSync(outputDir)) {
    const full = join(outputDir, name);
    if (!statSync(full).isFile()) {
      continue;
    }
    if (STORE_PACKAGE.test(name)) {
      found.push(full);
    }
  }
  return found.sort();
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isUnsafePath(name) {
  if (name.startsWith('/') || name.startsWith('\\')) {
    return true;
  }
  if (/^[A-Za-z]:/u.test(name)) {
    return true;
  }
  return name.split('/').some((part) => part === '..');
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isGitPath(name) {
  return name === '.git' || name.startsWith('.git/') || name.includes('/.git/');
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isEnvPath(name) {
  const base = name.split('/').at(-1) ?? name;
  return base === '.env' || base.startsWith('.env.');
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isFixtureLeak(name) {
  const parts = name.split('/');
  if (
    parts.includes('tests') ||
    parts.includes('fixtures') ||
    parts.includes('e2e')
  ) {
    return true;
  }
  const base = parts.at(-1) ?? name;
  return (
    base.includes('.test.') ||
    base.includes('.spec.') ||
    base.endsWith('.test.ts')
  );
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isIconPath(name) {
  const lower = name.toLowerCase();
  return lower.includes('icon');
}

/**
 * @param {string} manifestText
 * @returns {string[]}
 */
function remoteUrlErrors(manifestText) {
  const matches = manifestText.match(/https?:\/\/[^"'\\\s]+/gu) ?? [];
  const errors = [];
  for (const url of matches) {
    if (url === ALLOWED_MANIFEST_URL) {
      continue;
    }
    errors.push(`remote URL in manifest ${JSON.stringify(url)}`);
  }
  return errors;
}

/**
 * @param {Buffer} buffer
 * @returns {Array<{
 *   name: string,
 *   method: number,
 *   compressedSize: number,
 *   uncompressedSize: number,
 *   localOffset: number,
 * }>}
 */
function listZipEntries(buffer) {
  const eocd = findEocd(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory');
    }
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * @param {Buffer} buffer
 * @param {{
 *   name: string,
 *   method: number,
 *   compressedSize: number,
 *   localOffset: number,
 * }} entry
 * @returns {Buffer}
 */
function readZipEntry(buffer, entry) {
  const loc = entry.localOffset;
  if (buffer.readUInt32LE(loc) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header for ${entry.name}`);
  }
  const nameLen = buffer.readUInt16LE(loc + 26);
  const extraLen = buffer.readUInt16LE(loc + 28);
  const dataStart = loc + 30 + nameLen + extraLen;
  const compressed = buffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );
  if (entry.method === 0) {
    return Buffer.from(compressed);
  }
  if (entry.method === 8) {
    return inflateRawSync(compressed);
  }
  throw new Error(`Unsupported ZIP method ${entry.method} for ${entry.name}`);
}

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
function findEocd(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  throw new Error('Invalid ZIP: end of central directory not found');
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
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message);
  process.exit(1);
}

main();

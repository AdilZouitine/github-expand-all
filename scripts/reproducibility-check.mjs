#!/usr/bin/env node
/**
 * Compare two WXT output trees byte-for-byte after extracting archives.
 *
 * Usage:
 *   node scripts/reproducibility-check.mjs <left> <right>
 *
 * Arguments may be `.output` directories or individual zip files. Directory
 * comparison prefers unpacked `*-mv3` trees, then extracted store zips.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db']);
const STORE_PACKAGE = /-(chrome|firefox)\.(zip|xpi)$/u;

/**
 * @returns {void}
 */
function main() {
  const left = process.argv[2];
  const right = process.argv[3];
  if (left === undefined || right === undefined) {
    fail('Usage: node scripts/reproducibility-check.mjs <left> <right>');
  }

  const temps = [];
  try {
    const leftTrees = resolveTrees(left, temps);
    const rightTrees = resolveTrees(right, temps);
    const names = unionKeys(leftTrees, rightTrees).sort();
    if (names.length === 0) {
      fail('No comparable Chrome/Firefox trees or archives found');
    }

    let failed = false;
    for (const name of names) {
      const leftDir = leftTrees.get(name);
      const rightDir = rightTrees.get(name);
      if (leftDir === undefined || rightDir === undefined) {
        console.error(`Missing ${name} on one side`);
        failed = true;
        continue;
      }
      const diffs = compareTrees(leftDir, rightDir);
      if (diffs.length === 0) {
        console.log(`  ok  ${name}`);
        continue;
      }
      failed = true;
      console.error(`  fail ${name}`);
      for (const diff of diffs.slice(0, 20)) {
        console.error(`       ${diff}`);
      }
      if (diffs.length > 20) {
        console.error(`       … ${diffs.length - 20} more`);
      }
    }
    if (failed) {
      process.exit(1);
    }
    console.log(`reproducibility-check: ${names.length} tree(s) match`);
  } finally {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/**
 * @param {string} input
 * @param {string[]} temps
 * @returns {Map<string, string>}
 */
function resolveTrees(input, temps) {
  if (!existsSync(input)) {
    fail(`Path does not exist: ${input}`);
  }
  if (statSync(input).isFile()) {
    const key = treeKeyFromArchive(basename(input));
    return new Map([[key, extractZipToTemp(input, temps)]]);
  }

  const trees = new Map();
  for (const name of readdirSync(input)) {
    const full = join(input, name);
    const info = statSync(full);
    if (info.isDirectory() && name.endsWith('-mv3') && !name.endsWith('-dev')) {
      trees.set(name, full);
      continue;
    }
    if (!info.isFile() || !STORE_PACKAGE.test(name)) {
      continue;
    }
    trees.set(`${treeKeyFromArchive(name)}-zip`, extractZipToTemp(full, temps));
  }
  return trees;
}

/**
 * @param {string} filename
 * @returns {string}
 */
function treeKeyFromArchive(filename) {
  const match = STORE_PACKAGE.exec(filename);
  if (match === null) {
    return filename;
  }
  return match[1];
}

/**
 * @param {string} zipPath
 * @param {string[]} temps
 * @returns {string}
 */
function extractZipToTemp(zipPath, temps) {
  const dest = mkdtempSync(join(tmpdir(), 'gea-repro-'));
  temps.push(dest);
  const buffer = readFileSync(zipPath);
  for (const entry of listZipEntries(buffer)) {
    const name = entry.name.replaceAll('\\', '/');
    if (name.endsWith('/')) {
      continue;
    }
    if (name.split('/').some((part) => part === '..' || part === '')) {
      throw new Error(`Refusing to extract unsafe path ${name}`);
    }
    const outPath = join(dest, name);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, readZipEntry(buffer, entry));
  }
  return dest;
}

/**
 * @param {string} leftDir
 * @param {string} rightDir
 * @returns {string[]}
 */
function compareTrees(leftDir, rightDir) {
  const leftFiles = collectTree(leftDir);
  const rightFiles = collectTree(rightDir);
  const names = unionKeys(leftFiles, rightFiles).sort();
  const diffs = [];
  for (const name of names) {
    const left = leftFiles.get(name);
    const right = rightFiles.get(name);
    if (left === undefined) {
      diffs.push(`only in right: ${name}`);
      continue;
    }
    if (right === undefined) {
      diffs.push(`only in left: ${name}`);
      continue;
    }
    if (left.equals(right)) {
      continue;
    }
    const at = firstDiff(left, right);
    diffs.push(
      `${name} differs at byte ${at} ` +
        `(left ${left.length}B, right ${right.length}B)`,
    );
  }
  return diffs;
}

/**
 * @param {string} root
 * @returns {Map<string, Buffer>}
 */
function collectTree(root) {
  const files = new Map();
  walk(root, root, files);
  return files;
}

/**
 * @param {string} root
 * @param {string} dir
 * @param {Map<string, Buffer>} files
 * @returns {void}
 */
function walk(root, dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name)) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, files);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const rel = full.slice(root.length + 1).replaceAll('\\', '/');
    files.set(rel, readFileSync(full));
  }
}

/**
 * @param {Buffer} left
 * @param {Buffer} right
 * @returns {number}
 */
function firstDiff(left, right) {
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    if (left[i] !== right[i]) {
      return i;
    }
  }
  return n;
}

/**
 * @param {Map<string, unknown>} left
 * @param {Map<string, unknown>} right
 * @returns {string[]}
 */
function unionKeys(left, right) {
  return [...new Set([...left.keys(), ...right.keys()])];
}

/**
 * @param {Buffer} buffer
 * @returns {Array<{
 *   name: string,
 *   method: number,
 *   compressedSize: number,
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
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    entries.push({ name, method, compressedSize, localOffset });
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
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message);
  process.exit(1);
}

main();

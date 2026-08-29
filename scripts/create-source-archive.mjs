#!/usr/bin/env node
/**
 * Build the AMO reviewer source archive:
 * `github-expand-all-VERSION-source.zip`.
 *
 * Includes authored source, tests, lockfile, Node pin, docs, scripts, and
 * configs. Excludes `node_modules`, `.git`, generated outputs, and secrets.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const EXCLUDED_DIRS = new Set([
  '.codspeed',
  '.cursor',
  '.git',
  '.idea',
  '.output',
  '.playwright-browsers',
  '.turbo',
  '.vscode',
  '.wxt',
  'artifacts',
  'blob-report',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

/**
 * @returns {void}
 */
function main() {
  const root = repoRoot();
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const files = collectFiles(root);
  if (files.length === 0) {
    fail('Source archive would be empty');
  }

  const zip = createZip(
    files.map((absPath) => ({
      name: relative(root, absPath).replaceAll('\\', '/'),
      data: readFileSync(absPath),
    })),
  );

  const outputDir = join(root, '.output');
  mkdirSync(outputDir, { recursive: true });
  const outPath = join(
    outputDir,
    `github-expand-all-${pkg.version}-source.zip`,
  );
  writeFileSync(outPath, zip);
  console.log(`Wrote ${outPath} (${files.length} files, ${zip.length} bytes)`);
}

/**
 * @param {string} root
 * @returns {string[]}
 */
function collectFiles(root) {
  const found = [];
  walk(root, root, found);
  return found.sort();
}

/**
 * @param {string} root
 * @param {string} dir
 * @param {string[]} found
 * @returns {void}
 */
function walk(root, dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkipName(entry.name)) {
      continue;
    }
    const full = join(dir, entry.name);
    const rel = relative(root, full).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      walk(root, full, found);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (shouldSkipFile(entry.name, rel)) {
      continue;
    }
    found.push(full);
  }
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function shouldSkipName(name) {
  return name === '.DS_Store' || name === 'Thumbs.db';
}

/**
 * @param {string} name
 * @param {string} rel
 * @returns {boolean}
 */
function shouldSkipFile(name, rel) {
  if (name.endsWith('.zip') || name.endsWith('.xpi') || name.endsWith('.log')) {
    return true;
  }
  if (name.endsWith('.bench.json')) {
    return true;
  }
  if (name.startsWith('.env') && name !== '.env.example') {
    return true;
  }
  return rel === '.env.submit';
}

/**
 * @param {{name: string, data: Buffer}[]} files
 * @returns {Buffer}
 */
function createZip(files) {
  const epoch = Number.parseInt(process.env.SOURCE_DATE_EPOCH ?? '0', 10);
  const { time, date } = toDosDateTime(Number.isFinite(epoch) ? epoch : 0);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const compressed = deflateRawSync(file.data, { level: 9 });
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localHeader = Buffer.concat([local, name, compressed]);
    locals.push(localHeader);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localHeader.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

/**
 * @param {number} epochSec
 * @returns {{time: number, date: number}}
 */
function toDosDateTime(epochSec) {
  const d = new Date(epochSec * 1000);
  const year = d.getUTCFullYear();
  if (year < 1980) {
    return { time: 0, date: (1 << 5) | 1 };
  }
  return {
    time:
      (d.getUTCHours() << 11) |
      (d.getUTCMinutes() << 5) |
      Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

const CRC_TABLE = makeCrcTable();

/**
 * @returns {Uint32Array}
 */
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      if ((c & 1) === 1) {
        c = 0xedb88320 ^ (c >>> 1);
        continue;
      }
      c >>>= 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/**
 * @param {Uint8Array | Buffer} data
 * @returns {number}
 */
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
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

if (!existsSync(join(repoRoot(), 'package.json'))) {
  fail('package.json not found');
}

main();

#!/usr/bin/env node
/**
 * Generate the GitHub Expand All icons with a pure Node PNG writer.
 *
 * Writes both `public/icons/{size}.png` and `public/icon-{size}.png`.
 * WXT auto-discovers `public/icon-16.png` and siblings.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];

const BACKGROUND = [11, 31, 51, 255];
const TEAL = [46, 196, 182, 255];
const BLUE = [61, 155, 233, 255];

const CRC_TABLE = makeCrcTable();

const EXPECTED_CRC32_123456789 = 0xcbf43926;

/**
 * Write icon PNGs into `public/`.
 */
function main() {
  assertCrc32();
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const publicDir = join(repoRoot, 'public');
  const iconsDir = join(publicDir, 'icons');
  mkdirSync(iconsDir, { recursive: true });

  for (const size of SIZES) {
    const png = encodePng(renderIcon(size), size, size);
    writeFileSync(join(iconsDir, `${size}.png`), png);
    writeFileSync(join(publicDir, `icon-${size}.png`), png);
  }
}

/**
 * Rasterize a dark rounded square with teal/blue expand chevrons.
 *
 * @param {number} size Edge length in pixels.
 * @returns {Uint8Array} Tight RGBA buffer, row-major.
 */
function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const radius = size * 0.22;
  const stroke = Math.max(1.15, size * 0.078);
  const inset = size * 0.24;

  const up = [
    [inset, size * 0.44],
    [size / 2, size * 0.22],
    [size - inset, size * 0.44],
  ];
  const down = [
    [inset, size * 0.56],
    [size / 2, size * 0.78],
    [size - inset, size * 0.56],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const bgCover = roundedRectCoverage(px, py, size, radius);
      let color = blend([0, 0, 0, 0], BACKGROUND, bgCover);
      color = blend(color, TEAL, polylineCoverage(px, py, up, stroke));
      color = blend(color, BLUE, polylineCoverage(px, py, down, stroke));
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }
  return pixels;
}

/**
 * Coverage of a rounded rectangle filling `[0, size] × [0, size]`.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} radius
 * @returns {number}
 */
function roundedRectCoverage(x, y, size, radius) {
  const r = Math.min(radius, size / 2);
  const dx = Math.max(r - x, x - (size - r), 0);
  const dy = Math.max(r - y, y - (size - r), 0);
  if (dx === 0 && dy === 0) {
    return 1;
  }
  return coverage(Math.hypot(dx, dy), r, 0.65);
}

/**
 * Coverage of a polyline with circular end-caps.
 *
 * @param {number} x
 * @param {number} y
 * @param {readonly number[][]} points
 * @param {number} stroke
 * @returns {number}
 */
function polylineCoverage(x, y, points, stroke) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    best = Math.min(
      best,
      distToSegment(x, y, start[0], start[1], end[0], end[1]),
    );
  }
  return coverage(best, stroke / 2, 0.6);
}

/**
 * @param {number} px
 * @param {number} py
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Soft edge coverage for a filled disk of the given radius.
 *
 * @param {number} distance
 * @param {number} radius
 * @param {number} aa
 * @returns {number}
 */
function coverage(distance, radius, aa) {
  if (distance <= radius - aa) {
    return 1;
  }
  if (distance >= radius + aa) {
    return 0;
  }
  return (radius + aa - distance) / (2 * aa);
}

/**
 * Source-over blend of `fg` onto `bg` with extra coverage `alpha`.
 *
 * @param {readonly number[]} bg
 * @param {readonly number[]} fg
 * @param {number} alpha
 * @returns {number[]}
 */
function blend(bg, fg, alpha) {
  const a = clamp(alpha, 0, 1) * (fg[3] / 255);
  if (a <= 0) {
    return [bg[0], bg[1], bg[2], bg[3]];
  }
  const outA = a + (bg[3] / 255) * (1 - a);
  return [
    Math.round((fg[0] * a + bg[0] * (bg[3] / 255) * (1 - a)) / outA),
    Math.round((fg[1] * a + bg[1] * (bg[3] / 255) * (1 - a)) / outA),
    Math.round((fg[2] * a + bg[2] * (bg[3] / 255) * (1 - a)) / outA),
    Math.round(outA * 255),
  ];
}

/**
 * Encode an 8-bit RGBA PNG.
 *
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {Buffer}
 */
function encodePng(rgba, width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    const src = y * width * 4;
    raw.set(rgba.subarray(src, src + width * 4), rowStart + 1);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  payload.copy(out, 4);
  out.writeUInt32BE(crc32(payload), 8 + data.length);
  return out;
}

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
 * ISO 3309 / PNG / ZIP CRC-32.
 *
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

function assertCrc32() {
  const got = crc32(Buffer.from('123456789'));
  if (got !== EXPECTED_CRC32_123456789) {
    throw new Error(
      `CRC-32 self-test failed: 0x${got.toString(16)} !== ` +
        `0x${EXPECTED_CRC32_123456789.toString(16)}`,
    );
  }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

main();

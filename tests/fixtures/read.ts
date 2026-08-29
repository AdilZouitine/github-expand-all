import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read a sanitized HTML fixture from this directory.
 *
 * @param name - File name such as `issue.html`.
 * @returns Fixture markup.
 */
export function readHtmlFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, name), 'utf8');
}

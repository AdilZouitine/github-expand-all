import { HOST_ATTR, HOST_ATTR_VALUE, HOST_ID } from './types.ts';

/**
 * Return whether `node` is the extension host or a descendant of it.
 *
 * @param node - Node from a mutation record or candidate walk.
 * @param host - Explicit host element from the current run, if mounted.
 * @returns True when the node must be ignored by discovery and settling.
 */
export function isHostNode(node: Node, host: Element | null): boolean {
  if (host !== null && (node === host || host.contains(node))) {
    return true;
  }
  let current: Node | null = node;
  while (current !== null) {
    if (current instanceof Element) {
      if (current.id === HOST_ID) {
        return true;
      }
      if (current.getAttribute(HOST_ATTR) === HOST_ATTR_VALUE) {
        return true;
      }
    }
    current = current.parentNode;
  }
  return false;
}

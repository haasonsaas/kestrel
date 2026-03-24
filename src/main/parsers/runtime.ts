// Tree traversal runtime — provides findFirst, findAll, traverse helpers
// Mirrors the API that Littlebird's parsers expect from their snapshot objects

import type { AXNode, AXFrame } from './types'

/** Predicate function for tree searches */
export type NodePredicate = (node: AXNode) => boolean

/** Find the first descendant (depth-first) matching a predicate */
export function findFirst(root: AXNode, predicate: NodePredicate): AXNode | null {
  if (predicate(root)) return root
  for (const child of root.children ?? []) {
    const found = findFirst(child, predicate)
    if (found) return found
  }
  return null
}

/** Find all descendants matching a predicate */
export function findAll(root: AXNode, predicate: NodePredicate): AXNode[] {
  const results: AXNode[] = []
  traverse(root, (node) => {
    if (predicate(node)) results.push(node)
    return true // keep going
  })
  return results
}

/** Walk the tree depth-first. Return false from callback to skip children. */
export function traverse(root: AXNode, callback: (node: AXNode) => boolean): void {
  if (!callback(root)) return
  for (const child of root.children ?? []) {
    traverse(child, callback)
  }
}

/** Collect all AXStaticText values from a subtree */
export function collectStaticTexts(node: AXNode): string[] {
  const texts: string[] = []
  traverse(node, (el) => {
    if (el.role === 'AXStaticText' && el.value != null) {
      texts.push(el.value)
    }
    return true
  })
  return texts
}

/** Check if a node has a specific DOM class */
export function hasClass(node: AXNode, className: string): boolean {
  return node.domClassList?.includes(className) ?? false
}

/** Check if a node has a DOM class containing a substring */
export function hasClassContaining(node: AXNode, substring: string): boolean {
  return node.domClassList?.some((c) => c.includes(substring)) ?? false
}

/** Check if identifier contains a substring */
export function hasIdentifierContaining(node: AXNode, substr: string): boolean {
  return typeof node.identifier === 'string' && node.identifier.includes(substr)
}

/** Check if an element is a descendant of another (by reference equality on the tree) */
export function isDescendantOf(
  element: AXNode,
  ancestor: AXNode,
  root: AXNode
): boolean {
  // Build parent map on demand (small helper for per-message checks)
  let found = false
  traverse(ancestor, (node) => {
    if (node === element) {
      found = true
      return false
    }
    return true
  })
  return found
}

// ── Time/format helpers ───────────────────────────────────────────

/** Check if string looks like HH:MM */
export function looksLikeTime(s: string | undefined | null): boolean {
  if (!s) return false
  return /^\d{1,2}:\d{2}$/.test(s.trim())
}

/** Check if string looks like 12-hour time */
export function looksLikeTime12h(s: string | undefined | null): boolean {
  if (!s) return false
  return /^\d{1,2}:\d{2}\s*[AaPp][Mm]$/.test(s.trim())
}

/** Check if string contains the object replacement character (U+FFFC) */
export function hasObjectReplacement(s: string | undefined | null): boolean {
  if (!s) return false
  return s.includes('\uFFFC')
}

/** Determine which side of the container a bubble is on (for self/other detection) */
export function bubbleSide(
  msgFrame: AXFrame | undefined,
  containerFrame: AXFrame | undefined
): 'left' | 'right' | null {
  if (!msgFrame || !containerFrame) return null
  const containerCenter = containerFrame.x + containerFrame.width / 2
  const msgCenter = msgFrame.x + msgFrame.width / 2
  return msgCenter > containerCenter ? 'right' : 'left'
}

/** Strip zero-width / bidi characters and normalize whitespace — for labels only */
export function cleanLabel(s: string | null | undefined): string | null {
  if (s == null) return null
  return s
    .replace(/[\u200b-\u200f\u034f\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

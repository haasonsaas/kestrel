// Per-app parser entry point
// Takes a ContextTreeResult and attempts to extract structured data

import type { ContextTreeResult, ParsedContext } from './types'
import { getParser } from './registry'

/**
 * Try to parse structured context from the AX tree.
 * Returns null if no parser matches or parsing fails.
 */
export function parseContext(ctx: ContextTreeResult): ParsedContext | null {
  if (!ctx.axTree) return null

  const parser = getParser(ctx.bundleId, ctx.url)
  if (!parser) return null

  try {
    return parser(ctx.axTree)
  } catch (err) {
    console.error(`[parsers] Failed to parse ${ctx.bundleId}:`, err)
    return null
  }
}

export type { ParsedContext, ContextTreeResult } from './types'

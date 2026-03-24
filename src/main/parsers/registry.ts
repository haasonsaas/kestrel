// Parser registry — maps bundle IDs and URL patterns to parser functions

import type { AXNode, ParsedContext } from './types'
import { parseSlack } from './slack'
import { parseGmail } from './gmail'
import { parseMessages } from './messages'
import { parseWhatsApp } from './whatsapp'
import { parseMessenger } from './messenger'

export type ParserFn = (tree: AXNode) => ParsedContext | null

interface ParserEntry {
  parse: ParserFn
}

/** Native app parsers keyed by bundle ID */
const bundleIdParsers = new Map<string, ParserEntry>([
  ['com.tinyspeck.slackmacgap', { parse: parseSlack }],
  ['com.apple.MobileSMS', { parse: parseMessages }],
  ['net.whatsapp.WhatsApp', { parse: parseWhatsApp }],
  ['com.facebook.archon', { parse: parseMessenger }],
])

/** Browser-based parsers keyed by URL pattern (substring match) */
const urlParsers: Array<{ pattern: string; entry: ParserEntry }> = [
  { pattern: 'mail.google.com', entry: { parse: parseGmail } },
]

/** Look up a parser for the given app context */
export function getParser(bundleId: string, url?: string): ParserFn | null {
  // Check native app parsers first
  const native = bundleIdParsers.get(bundleId)
  if (native) return native.parse

  // Check URL-based parsers for browser apps
  if (url) {
    for (const { pattern, entry } of urlParsers) {
      if (url.includes(pattern)) return entry.parse
    }
  }

  return null
}

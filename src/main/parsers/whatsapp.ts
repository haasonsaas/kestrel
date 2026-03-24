// WhatsApp parser — extracts conversations from WhatsApp native app AX tree
// Based on WhatsApp macOS accessibility patterns

import type { AXNode, ParsedContext, ParsedConversation, ParsedMessage } from './types'
import { findFirst, findAll, looksLikeTime } from './runtime'
import { USER } from './types'

const LRM = '\u200e'

// Locale tokens for English — extend for other languages
const VERBS = {
  receivedFrom: 'Received from ',
  receivedIn: 'Received in ',
  sentTo: 'Sent to ',
  listened: 'Listened'
}

const TRAILING_STATUSES = ['Delivered', 'Sent', 'Red', 'Edited', 'Read', 'Muted', 'Disappearing message']

export function parseWhatsApp(tree: AXNode): ParsedContext | null {
  // Find the conversation header button
  const headerButton = findFirst(
    tree,
    (el) =>
      el.role === 'AXButton' &&
      el.identifier === 'NavigationBar_HeaderViewButton' &&
      !!el.description
  )

  // Also check for AXHeading variant
  const headerHeading = !headerButton
    ? findFirst(
        tree,
        (el) =>
          el.role === 'AXHeading' &&
          el.identifier === 'NavigationBar_HeaderViewButton' &&
          !!el.description
      )
    : null

  const header = headerButton ?? headerHeading
  if (!header?.description) return null

  const channelName = header.description.split('\n')[0]

  // Find all message cells
  const messageCells = findAll(
    tree,
    (el) =>
      el.role === 'AXCell' &&
      !!el.identifier?.startsWith('WAMessageBubbleTableViewCell') &&
      !!el.description
  )

  // Detect group chat — look for "Received in" in any message
  const isGroup = messageCells.some(
    (cell) => cell.description && cell.description.includes(VERBS.receivedIn)
  )

  const messages: ParsedMessage[] = []
  const participants = new Map<string, { name: string; identifier: string | null }>()

  for (const cell of messageCells) {
    const parsed = parseWAMessage(cell.description!, isGroup)
    if (!parsed) continue

    messages.push(parsed)

    if (parsed.sender && parsed.sender !== USER && parsed.sender !== 'System') {
      participants.set(parsed.sender, { name: parsed.sender, identifier: null })
    }
  }

  const conversation: ParsedConversation = {
    app: 'WhatsApp',
    channel: channelName,
    participants: Array.from(participants.values()),
    messages
  }

  return { activeConversations: [conversation] }
}

function parseWAMessage(
  desc: string,
  isGroup: boolean
): ParsedMessage | null {
  if (!desc) return null

  let sender: string | null = null
  let content = desc
  let messageType: string | null = null

  // Strip LRM prefix
  if (content.startsWith(LRM)) content = content.substring(1)

  // Detect "Your ..." messages (sent by user)
  if (content.startsWith('Your ')) {
    sender = USER
    // Extract type and content: "Your message, content, timestamp, status"
    const commaIdx = content.indexOf(', ')
    if (commaIdx > -1) {
      messageType = content.substring(0, commaIdx)
      content = content.substring(commaIdx + 2)
    }
  }
  // Detect "Received from X in Y" (group message from someone)
  else if (content.includes(VERBS.receivedFrom)) {
    const rfIdx = content.indexOf(VERBS.receivedFrom)
    const beforeRF = content.substring(0, rfIdx)
    const afterRF = content.substring(rfIdx + VERBS.receivedFrom.length)

    // Format: "type, content, Received from Sender in Group"
    // OR: "Received from Sender message content"
    if (beforeRF.includes(',')) {
      // Type prefix before the "Received from"
      const parts = beforeRF.split(',').map((s) => s.trim())
      messageType = parts[0] || null
      // Content is what's between type and "Received from"
      content = parts.slice(1).join(', ').replace(/,\s*$/, '')
    } else {
      content = beforeRF.trim()
    }

    // Extract sender name from "Sender in Group" or just "Sender"
    const inIdx = afterRF.indexOf(' in ')
    sender = inIdx > -1 ? afterRF.substring(0, inIdx).trim() : afterRF.split(',')[0].trim()
  }
  // Detect "Message from X" (group message variant)
  else if (content.startsWith('Message from ')) {
    const rest = content.substring('Message from '.length)
    const commaIdx = rest.indexOf(', ')
    if (commaIdx > -1) {
      sender = rest.substring(0, commaIdx)
      content = rest.substring(commaIdx + 2)
    }
  }
  // Detect "Sent to X" messages
  else if (content.includes(VERBS.sentTo)) {
    sender = USER
    const stIdx = content.indexOf(VERBS.sentTo)
    content = content.substring(0, stIdx).trim().replace(/,\s*$/, '')
  }
  // Simple message — try to extract type prefix
  else {
    const commaIdx = content.indexOf(', ')
    if (commaIdx > -1 && commaIdx < 30) {
      const prefix = content.substring(0, commaIdx)
      // Common type prefixes
      if (['message', 'Photo', 'Video', 'GIF', 'Document', 'Location', 'Sticker', 'Voice message'].includes(prefix)) {
        messageType = prefix
        content = content.substring(commaIdx + 2)
      }
    }
  }

  // Strip trailing status and timestamp
  content = stripTrailingStatus(content)
  content = stripTrailingTimestamp(content)
  content = content.replace(/,\s*$/, '').trim()

  if (!content && messageType) content = `[${messageType}]`
  if (!content) return null

  return { sender, content, timestamp: null }
}

function stripTrailingStatus(s: string): string {
  for (const status of TRAILING_STATUSES) {
    const suffix = `, ${status}`
    if (s.endsWith(suffix)) {
      return s.slice(0, -suffix.length)
    }
    // Also check with LRM
    const lrmSuffix = `, ${LRM}${status}`
    if (s.endsWith(lrmSuffix)) {
      return s.slice(0, -lrmSuffix.length)
    }
  }
  return s
}

function stripTrailingTimestamp(s: string): string {
  // Strip trailing ", HH:MM" or ", HH:MM AM/PM"
  return s.replace(/,\s*\d{1,2}:\d{2}(\s*[AaPp][Mm])?\s*$/, '')
}

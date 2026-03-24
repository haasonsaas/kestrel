// Facebook Messenger parser — extracts conversations from Messenger native app

import type { AXNode, ParsedContext, ParsedConversation, ParsedMessage } from './types'
import { findFirst, findAll, looksLikeTime, bubbleSide } from './runtime'
import { USER } from './types'

export function parseMessenger(tree: AXNode): ParsedContext | null {
  const windowEl =
    tree.role === 'AXWindow' ? tree : findFirst(tree, (el) => el.role === 'AXWindow')

  // Find active conversation header
  const titleButton = findFirst(
    tree,
    (el) =>
      el.role === 'AXButton' &&
      el.identifier === 'navigation-titleview-titlebutton' &&
      !!el.description
  )
  if (!titleButton?.description) return null

  const channelName = titleButton.description.split('\n')[0]

  const messages: ParsedMessage[] = []
  const participantNames: string[] = []
  const seenParticipants = new Set<string>()

  // Find all message elements (AXStaticText with descriptions)
  const messageTexts = findAll(
    tree,
    (el) => el.role === 'AXStaticText' && !!el.description
  )

  // Find timestamp headings
  const headings = findAll(
    tree,
    (el) =>
      el.role === 'AXHeading' &&
      !!el.description &&
      hasTimeOrDate(el.description)
  )

  // Build sorted timestamp list by y position
  const timestamps = headings
    .filter((h) => h.frame?.y != null && !h.description?.includes('created this group'))
    .map((h) => ({ y: h.frame!.y, text: h.description! }))
    .sort((a, b) => a.y - b.y)

  // Sort messages by y position
  const sortedMessages = messageTexts
    .filter((m) => m.frame?.y != null)
    .sort((a, b) => a.frame!.y - b.frame!.y)

  const usedTimestampIndices = new Set<number>()

  for (const msg of sortedMessages) {
    const desc = msg.description
    if (!desc) continue
    const msgY = msg.frame!.y

    // Skip profile UI chrome
    if (desc.toLowerCase().includes('profile') || desc.toLowerCase().includes('avatar'))
      continue

    // Skip group creation headers
    if (desc.includes('created this group')) continue

    // Find profile button for sender detection
    const profileButton = findFirst(
      msg,
      (el) => el.role === 'AXButton' && !!el.description?.startsWith('Open ')
    )

    const parsed = parseMessage(
      desc,
      windowEl?.frame,
      msg.frame,
      profileButton
    )
    if (!parsed) continue

    // Find closest timestamp heading above this message
    let timestamp: string | null = null
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i].y < msgY && !usedTimestampIndices.has(i)) {
        timestamp = timestamps[i].text
        usedTimestampIndices.add(i)
        break
      }
    }

    parsed.timestamp = timestamp
    messages.push(parsed)

    if (parsed.sender && parsed.sender !== USER && parsed.sender !== 'System') {
      if (!seenParticipants.has(parsed.sender)) {
        seenParticipants.add(parsed.sender)
        participantNames.push(parsed.sender)
      }
    }
  }

  const conversation: ParsedConversation = {
    app: 'Messenger',
    channel: channelName,
    participants: participantNames.map((name) => ({ name, identifier: name })),
    messages
  }

  return { activeConversations: [conversation] }
}

// ── Helpers ───────────────────────────────────────────────────────

function hasTimeOrDate(s: string): boolean {
  const parts = s.trim().split(/\s+/)
  const lastPart = parts[parts.length - 1]
  if (looksLikeTime(lastPart)) return true
  // Date patterns
  if (/\d/.test(s) && s.length > 2) return true
  return false
}

function parseMessage(
  description: string,
  containerFrame: { x: number; y: number; width: number; height: number } | undefined,
  messageFrame: { x: number; y: number; width: number; height: number } | undefined,
  profileButton: AXNode | null
): ParsedMessage | null {
  if (!description) return null

  // Reaction/like
  if (/sent like,/i.test(description)) {
    const likeMatch = description.match(/^(.*)\s+sent\s+like,\s*(.*)$/i)
    const sender = likeMatch ? likeMatch[1].trim() || 'System' : 'System'
    const content = likeMatch ? likeMatch[2].trim() : description
    return {
      sender: /^You(r)?\b/i.test(sender) ? USER : sender,
      content,
      timestamp: null
    }
  }

  const firstCommaIndex = description.indexOf(', ')
  if (firstCommaIndex === -1) {
    return { sender: 'System', content: description, timestamp: null }
  }

  let sender = description.substring(0, firstCommaIndex)
  if (/^You(r)?\b/i.test(sender)) sender = USER

  // Use profile button to override sender
  if (profileButton?.description) {
    const other = profileButton.description
      .replace(/^Open\s+/, '')
      .replace(/'s profile.*$/, '')
      .trim()
    if (other) sender = other
  }

  let content = description.substring(firstCommaIndex + 2)

  // Geometry-based sender detection
  if ((!sender || sender === 'Your iMessage') && containerFrame && messageFrame) {
    const side = bubbleSide(messageFrame, containerFrame)
    if (side === 'right') sender = USER
  }

  // Strip trailing emoji reactions
  content = content.replace(/,\s*[\p{Emoji}\p{Extended_Pictographic}]+$/u, '')

  return { sender, content, timestamp: null }
}

// Slack parser — extracts active conversation from the Slack native app AX tree

import type { AXNode, ParsedContext, ParsedConversation, ParsedMessage } from './types'
import {
  findFirst,
  findAll,
  traverse,
  hasClassContaining,
  hasIdentifierContaining,
  looksLikeTime,
  looksLikeTime12h,
  cleanLabel
} from './runtime'

export function parseSlack(tree: AXNode): ParsedContext | null {
  const window = tree.role === 'AXWindow' ? tree : findFirst(tree, (el) => el.role === 'AXWindow')
  if (!window) return null

  // Find the message list
  const messageList = findFirst(
    window,
    (el) => el.role === 'AXList' && el.subrole === 'AXContentList' && !!el.description
  )
  if (!messageList) return null

  // Derive conversation info
  let info = parseConversationFromHeader(window)
  if (!info) info = parseConversationFromListDesc(messageList)
  if (!info) info = parseConversationFromTitle(window.title ?? '')
  if (!info) return null

  const messages = parseMessages(messageList)

  const participants = info.isChannel
    ? []
    : info.participantNames.map((name) => ({ name, identifier: null }))

  const conversation: ParsedConversation = {
    app: 'Slack',
    channel: info.isChannel ? info.channelName : (info.participantNames[0] ?? null),
    participants,
    messages
  }

  return { activeConversations: [conversation] }
}

// ── Conversation info extraction ──────────────────────────────────

interface ConversationInfo {
  isChannel: boolean
  channelName: string | null
  participantNames: string[]
}

function parseConversationFromHeader(window: AXNode): ConversationInfo | null {
  const headerLabel = findFirst(
    window,
    (el) =>
      (el.role === 'AXStaticText' || el.role === 'AXButton') &&
      !!el.value &&
      (hasIdentifierContaining(el, 'title') ||
        hasIdentifierContaining(el, 'channel') ||
        hasClassContaining(el, 'p-view_header') ||
        hasClassContaining(el, 'c-channel_name'))
  )
  if (!headerLabel?.value) return null

  let name = headerLabel.value
    .replace(/\s*\([^)]*(direct message|channel)[^)]*\)\s*$/i, '')
    .trim()
  if (!name) return null

  const isChannel = name.startsWith('#')
  return {
    isChannel,
    channelName: isChannel ? name.replace(/^#\s*/, '') : null,
    participantNames: isChannel ? [] : [name]
  }
}

function parseConversationFromListDesc(list: AXNode): ConversationInfo | null {
  if (!list.description) return null
  const desc = list.description
  const dmMatch = desc.match(/^(.*)\(direct message/i)
  const channelMatch = desc.match(/^(.*)\(channel/i)

  let namePart = dmMatch ? dmMatch[1] : channelMatch ? channelMatch[1] : desc
  const cleaned = namePart
    .replace(/\s*\([^)]*(direct message|channel)[^)]*\)\s*$/i, '')
    .replace(/^#/, '')
    .trim()
  if (!cleaned) return null

  const isChannel = desc.toLowerCase().includes('channel')
  return {
    isChannel,
    channelName: isChannel ? cleaned : null,
    participantNames: isChannel
      ? []
      : cleaned
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
  }
}

function parseConversationFromTitle(title: string): ConversationInfo | null {
  if (!title) return null
  const left = title.split(' - ')[0]
  if (!left) return null

  const namePart = left.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const cleaned = namePart.replace(/^#/, '')
  if (!cleaned) return null

  const isChannel = title.toLowerCase().includes('(channel)')
  return {
    isChannel,
    channelName: isChannel ? cleaned : null,
    participantNames: isChannel
      ? []
      : cleaned
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
  }
}

// ── Message parsing ───────────────────────────────────────────────

function parseMessages(messageList: AXNode): ParsedMessage[] {
  const messages: ParsedMessage[] = []
  let lastSender: string | null = null

  // Messages are AXGroup with subrole AXDocument
  const messageGroups = findAll(
    messageList,
    (el) => el.role === 'AXGroup' && el.subrole === 'AXDocument'
  )

  for (const group of messageGroups) {
    const msg = parseMessageGroup(group, lastSender)
    if (msg) {
      messages.push(msg)
      lastSender = msg.sender
    }
  }

  return messages
}

function parseMessageGroup(group: AXNode, lastSender: string | null): ParsedMessage | null {
  // Find sender button with "sender_button" class
  const senderButton = findFirst(group, (el) => {
    if (el.role !== 'AXButton') return false
    return el.domClassList?.some((c) => c.includes('sender_button')) ?? false
  })

  // Find timestamp link with "timestamp" class
  const timestampLink = findFirst(group, (el) => {
    if (el.role !== 'AXLink') return false
    return el.domClassList?.some((c) => c.includes('timestamp')) ?? false
  })

  // Determine sender
  let sender: string | null = null
  if (senderButton?.title) {
    sender = senderButton.title
  } else if (lastSender) {
    sender = lastSender
  } else {
    return null
  }

  // Extract timestamp
  let timestamp: string | null = null
  if (timestampLink) {
    if (timestampLink.description) {
      timestamp = timestampLink.description
    } else {
      const tsText = findFirst(
        timestampLink,
        (el) =>
          el.role === 'AXStaticText' &&
          !!el.value &&
          (looksLikeTime(el.value) || looksLikeTime12h(el.value))
      )
      if (tsText?.value) timestamp = tsText.value
    }
  }

  // Extract content — collect text excluding sender, timestamp, reactions, thread replies
  const content = extractMessageContent(group, senderButton, timestampLink)
  if (!content) return null

  return { sender, content, timestamp }
}

function extractMessageContent(
  group: AXNode,
  senderButton: AXNode | null,
  timestampLink: AXNode | null
): string | null {
  const skipNodes = new Set<AXNode>()

  // Mark reactions, thread replies, unfurls to skip
  traverse(group, (el) => {
    if (el.domClassList?.some((c) => c.includes('reaction'))) skipNodes.add(el)
    if (el.identifier?.includes('reaction')) skipNodes.add(el)
    if (el.role === 'AXButton' && hasClassContaining(el, 'reply')) skipNodes.add(el)
    if (el.role === 'AXGroup' && hasClassContaining(el, 'thread')) skipNodes.add(el)
    if (hasClassContaining(el, 'reply_count')) skipNodes.add(el)
    return true
  })

  const shouldSkip = (el: AXNode): boolean => {
    if (skipNodes.has(el)) return true
    // Check if any ancestor is in skip set — walk up by re-checking containment
    for (const skip of skipNodes) {
      let found = false
      traverse(skip, (n) => {
        if (n === el) found = true
        return !found
      })
      if (found) return true
    }
    return false
  }

  const texts: string[] = []

  traverse(group, (el) => {
    if (shouldSkip(el)) return true
    if (el.role === 'AXStaticText' && el.value === '(edited)') return true

    // Skip sender button children
    if (senderButton) {
      let inSender = false
      traverse(senderButton, (n) => {
        if (n === el) inSender = true
        return !inSender
      })
      if (inSender && el !== senderButton) return true
    }

    // Skip timestamp link children
    if (timestampLink) {
      let inTs = false
      traverse(timestampLink, (n) => {
        if (n === el) inTs = true
        return !inTs
      })
      if (inTs && el !== timestampLink) return true
    }

    if (el.role === 'AXStaticText' && el.value != null) {
      const val = el.value
      if (val === '  ' || val === '' || /^[\n\r\s]*$/.test(val)) return true
      if (val === ' | ' || val === 'Added by ') return true
      if (val === 'View thread' || val.startsWith('Last reply')) return true
      texts.push(val)
    }

    return true
  })

  const content = texts.join('').replace(/\s+$/, '')
  return content || null
}

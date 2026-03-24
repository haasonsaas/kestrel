// Apple Messages parser — extracts conversations from the Messages app AX tree

import type { AXNode, ParsedContext, ParsedConversation, ParsedMessage } from './types'
import { findFirst, findAll, looksLikeTime, hasObjectReplacement, bubbleSide } from './runtime'
import { USER } from './types'

export function parseMessages(tree: AXNode): ParsedContext | null {
  const window =
    tree.role === 'AXWindow' ? tree : findFirst(tree, (el) => el.role === 'AXWindow')
  if (!window) return null

  const channel = window.title ?? ''
  if (!channel) return null

  // Find the group containing message children
  const allGroups = findAll(tree, (el) => el.role === 'AXGroup')

  let messagesGroup: AXNode | null = null
  for (const group of allGroups) {
    if (!group.children?.length) continue
    const messageLikeChildren = group.children.filter(isMessageGroup)
    if (messageLikeChildren.length > 2) {
      messagesGroup = group
      break
    }
  }

  if (!messagesGroup) return null

  const messages: ParsedMessage[] = []
  const participants = new Map<string, { name: string; identifier: string | null }>()

  const messageGroups = (messagesGroup.children ?? []).filter(
    (el) => !isSystemUIElement(el) && isMessageGroup(el)
  )

  for (const group of messageGroups) {
    if (!group.description) continue

    const parsed = parseMessageDescription(group.description, window.frame, group.frame)
    if (!parsed) continue

    let { sender, content } = parsed
    const { timestamp } = parsed

    // Geometry check for self-messages
    let isSelfMessage = sender === USER
    if (!isSelfMessage && window.frame && group.frame) {
      const side = bubbleSide(group.frame, window.frame)
      if (side === 'right') isSelfMessage = true
    }

    if (!isSelfMessage) {
      participants.set(sender, { name: sender, identifier: null })
    }

    // Get actual content from AXTextArea if available
    const textArea = findFirst(group, (el) => el.role === 'AXTextArea')
    const hasButton = !!findFirst(group, (el) => el.role === 'AXButton')

    const descHasPicture = hasObjectReplacement(group.description)
    const isPictureByStructure = hasButton && !textArea

    if (descHasPicture || isPictureByStructure) {
      content = '[picture]'
    } else if (textArea?.value) {
      content = hasObjectReplacement(textArea.value) ? '[picture]' : textArea.value
    }

    // Normalize whitespace
    if (content.includes('\n')) {
      content = content
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .trim()
    } else {
      content = content.replace(/\s+/g, ' ').trim()
    }

    messages.push({
      sender: isSelfMessage ? USER : sender,
      content,
      timestamp
    })
  }

  // Derive participants from channel name if none found
  if (participants.size === 0 && channel) {
    if (channel.includes(' & ')) {
      for (const name of channel.split(' & ')) {
        const trimmed = name.trim()
        if (trimmed) participants.set(trimmed, { name: trimmed, identifier: null })
      }
    } else {
      participants.set(channel, { name: channel, identifier: null })
    }
  }

  if (messages.length === 0 && !channel) return null

  const conversation: ParsedConversation = {
    app: 'Messages',
    channel,
    participants: Array.from(participants.values()),
    messages
  }

  return { activeConversations: [conversation] }
}

// ── Helpers ───────────────────────────────────────────────────────

function isMessageGroup(group: AXNode): boolean {
  if (!group || group.role !== 'AXGroup' || !group.description) return false
  const desc = group.description
  if (!desc.includes(',')) return false

  const timeAtEnd = /,\s*\d{1,2}:\d{2}\s*$/.test(desc)
  const timeWithMetadata = /,\s*\d{1,2}:\d{2}\s*,\s*[^,]+\s*$/.test(desc)
  return timeAtEnd || timeWithMetadata
}

function isSystemUIElement(group: AXNode): boolean {
  if (!group || group.role !== 'AXGroup') return false
  const hasTextArea = !!findFirst(group, (el) => el.role === 'AXTextArea')
  const hasButton = !!findFirst(group, (el) => el.role === 'AXButton')
  if (hasTextArea || hasButton) return false

  const staticTexts = findAll(group, (el) => el.role === 'AXStaticText')
  return staticTexts.length > 0
}

function parseMessageDescription(
  desc: string,
  containerFrame: { x: number; y: number; width: number; height: number } | undefined,
  groupFrame: { x: number; y: number; width: number; height: number } | undefined
): { sender: string; content: string; timestamp: string | null } | null {
  // Find timestamp: "Sender, Content, HH:MM[, metadata]"
  const timeWithMeta = desc.match(/,\s*(\d{1,2}:\d{2})\s*,\s*[^,]+\s*$/)
  const timeAtEnd = desc.match(/,\s*(\d{1,2}:\d{2})\s*$/)
  const timeMatch = timeWithMeta ?? timeAtEnd
  if (!timeMatch) return null

  const timestamp = timeMatch[1]
  const beforeTime = desc.substring(0, desc.lastIndexOf(timeMatch[0]))

  const firstComma = beforeTime.indexOf(',')
  if (firstComma === -1) return null

  let sender = beforeTime.substring(0, firstComma).trim()
  if (/^Your\b/i.test(sender)) sender = USER

  const content = beforeTime.substring(firstComma + 1).trim()

  // Infer sender via geometry
  if (containerFrame && groupFrame) {
    const side = bubbleSide(groupFrame, containerFrame)
    if (side === 'right') sender = USER
  }

  return { sender, content, timestamp }
}

// Gmail parser — extracts email threads from Gmail web UI in browser AX tree

import type { AXNode, ParsedContext, ParsedConversation, ParsedMessage, ParsedParticipant } from './types'
import { findFirst, findAll, collectStaticTexts, hasClass } from './runtime'
import { USER } from './types'

export function parseGmail(tree: AXNode): ParsedContext | null {
  const conversations: ParsedConversation[] = []

  // Check for compose dialog (draft)
  const composeDialog = findFirst(tree, (el) => el.subrole === 'AXApplicationDialog')
  if (composeDialog) {
    const draft = parseDraft(composeDialog)
    if (draft) conversations.push(draft)
  }

  // Gmail lives inside the AXWebArea
  const webArea = findFirst(
    tree,
    (el) => el.role === 'AXWebArea' && !!el.description?.includes('Gmail')
  )
  if (!webArea) return conversations.length > 0 ? { activeConversations: conversations } : null

  // Main content landmark
  const mainContent = findFirst(webArea, (el) => el.subrole === 'AXLandmarkMain')
  if (!mainContent) return conversations.length > 0 ? { activeConversations: conversations } : null

  // Subject heading with class 'hP'
  const subjectHeading = findFirst(
    mainContent,
    (el) => el.role === 'AXHeading' && hasClass(el, 'hP')
  )
  const subject = subjectHeading?.title ?? null

  // Email thread in content list
  const contentList = findFirst(
    mainContent,
    (el) => el.role === 'AXList' && el.subrole === 'AXContentList'
  )
  if (!contentList) return conversations.length > 0 ? { activeConversations: conversations } : null

  // Each email is AXGroup with class 'h7' (expanded) or 'kv' (collapsed)
  const messageGroups = (contentList.children ?? []).filter(
    (el) => el.role === 'AXGroup' && (hasClass(el, 'h7') || hasClass(el, 'kv'))
  )
  if (messageGroups.length === 0)
    return conversations.length > 0 ? { activeConversations: conversations } : null

  const participants = extractParticipants(messageGroups)
  const messages = messageGroups.map(parseMessage).filter((m): m is ParsedMessage => m !== null)

  conversations.push({
    app: 'Gmail',
    channel: subject,
    participants,
    messages
  })

  return { activeConversations: conversations }
}

function parseDraft(dialog: AXNode): ParsedConversation | null {
  const bodyField = findFirst(
    dialog,
    (el) => el.role === 'AXTextArea' && el.title === 'Message Body'
  )
  if (!bodyField) return null

  const subjectField = findFirst(
    dialog,
    (el) => el.role === 'AXTextField' && el.title === 'Subject'
  )
  const subject = subjectField?.value ?? null

  const recipientEl = findFirst(
    dialog,
    (el) => el.role === 'AXStaticText' && !!el.value && el.value !== 'New Message'
  )
  const recipient = recipientEl?.value ?? null

  return {
    app: 'Gmail',
    channel: subject,
    participants: recipient ? [{ name: recipient, identifier: null }] : [],
    messages: [{ sender: USER, content: bodyField.value ?? null, timestamp: null }]
  }
}

function extractParticipants(messageGroups: AXNode[]): ParsedParticipant[] {
  const seen = new Set<string>()
  const participants: ParsedParticipant[] = []

  for (const group of messageGroups) {
    const info = extractSenderInfo(group)
    if (info && !seen.has(info.name)) {
      seen.add(info.name)
      participants.push({ name: info.name, identifier: info.email })
    }
  }
  return participants
}

function extractSenderInfo(group: AXNode): { name: string; email: string | null } | null {
  // Expanded: sender in AXHeading with class 'gFxsud'
  const heading = findFirst(
    group,
    (el) => el.role === 'AXHeading' && hasClass(el, 'gFxsud')
  )
  if (heading) {
    const cell = findFirst(heading, (el) => el.role === 'AXCell')
    if (cell) {
      const texts = (cell.children ?? []).filter(
        (el) => el.role === 'AXStaticText' && el.value
      )
      const name = texts[0]?.value ?? null
      const email = texts[1]?.value ?? null
      if (name) return { name, email }
    }
  }

  // Collapsed: sender in AXCell with class 'gD'
  const senderCell = findFirst(
    group,
    (el) => el.role === 'AXCell' && hasClass(el, 'gD')
  )
  if (senderCell) {
    const nameEl = (senderCell.children ?? []).find(
      (el) => el.role === 'AXStaticText' && el.value
    )
    if (nameEl?.value) return { name: nameEl.value, email: null }
  }

  return null
}

function extractTimestamp(group: AXNode): string | null {
  const cell = findFirst(group, (el) => el.role === 'AXCell' && hasClass(el, 'g3'))
  if (!cell) return null
  const textEl = (cell.children ?? []).find(
    (el) => el.role === 'AXStaticText' && el.value
  )
  return textEl?.value ?? cell.description ?? null
}

function parseMessage(group: AXNode): ParsedMessage | null {
  const senderInfo = extractSenderInfo(group)
  const sender = senderInfo?.name ?? null
  const timestamp = extractTimestamp(group)

  let content: string | null

  if (hasClass(group, 'kv')) {
    // Collapsed email: snippet in AXCell with class 'iA'
    const snippetCell = findFirst(
      group,
      (el) => el.role === 'AXCell' && hasClass(el, 'iA')
    )
    const snippetEl = snippetCell
      ? (snippetCell.children ?? []).find((el) => el.role === 'AXStaticText' && el.value)
      : null
    content = snippetEl?.value ?? null
  } else {
    // Expanded email: collect all static text, excluding sender/timestamp
    const excluded = new Set<string>()
    excluded.add('to ')
    excluded.add('me')
    if (senderInfo?.name) excluded.add(senderInfo.name)
    if (senderInfo?.email) excluded.add(senderInfo.email)
    if (timestamp) excluded.add(timestamp)

    const allTexts = collectStaticTexts(group)
    const bodyTexts = allTexts.filter((t) => !excluded.has(t))
    content = bodyTexts.length > 0 ? bodyTexts.join('\n') : null
  }

  return { sender, content, timestamp }
}

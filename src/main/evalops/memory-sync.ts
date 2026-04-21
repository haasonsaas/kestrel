import { eq } from 'drizzle-orm'
import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { getSettingValue } from './settings'
import { storeEvalOpsMemory } from './services'

export const EVALOPS_MEMORY_SYNC_SETTING_KEY = 'evalops_memory_sync'

type MemorySyncCategory = 'chat' | 'meetings' | 'journal'

interface EvalOpsMemorySyncSettings {
  enabled?: boolean
  chat?: boolean
  meetings?: boolean
  journal?: boolean
}

export function getEvalOpsMemorySyncSettings(): Required<EvalOpsMemorySyncSettings> {
  const stored = getSettingValue<EvalOpsMemorySyncSettings>(EVALOPS_MEMORY_SYNC_SETTING_KEY) ?? {}
  return {
    enabled: stored.enabled === true,
    chat: stored.chat === true,
    meetings: stored.meetings === true,
    journal: stored.journal === true
  }
}

export async function syncChatThreadMemory(threadId: string): Promise<void> {
  if (!isMemorySyncEnabled('chat')) return

  const db = getDatabase()
  const thread = db.select().from(schema.threads).where(eq(schema.threads.id, threadId)).get()
  if (!thread) return

  const messages = db.select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(schema.messages.createdAt)
    .all()

  if (messages.length === 0) return

  const content = truncateMemoryContent([
    `Chat thread: ${thread.title}`,
    `Thread ID: ${thread.id}`,
    '',
    ...messages.map((message) => `${message.role}: ${message.content}`)
  ].join('\n'))

  await storeEvalOpsMemory({
    id: memoryId('chat-thread', thread.id),
    scope: 'SCOPE_USER',
    content,
    type: 'chat_thread',
    source: 'kestrel',
    confidence: 0.78,
    tags: ['kestrel', 'chat', 'chat_thread', `thread:${thread.id}`]
  })
}

export async function syncMeetingSummaryMemory(meetingId: string, audioPath?: string): Promise<void> {
  if (!isMemorySyncEnabled('meetings')) return

  const db = getDatabase()
  const meeting = db.select().from(schema.meetings).where(eq(schema.meetings.id, meetingId)).get()
  if (!meeting?.summary) return

  const content = truncateMemoryContent([
    `Meeting: ${meeting.title}`,
    `App: ${meeting.app}`,
    `Meeting ID: ${meeting.id}`,
    audioPath ? `Local audio: ${audioPath}` : '',
    '',
    meeting.summary,
    meeting.transcript ? `\nTranscript excerpt:\n${meeting.transcript.slice(0, 4_000)}` : ''
  ].filter(Boolean).join('\n'))

  await storeEvalOpsMemory({
    id: memoryId('meeting-summary', meeting.id),
    scope: 'SCOPE_USER',
    content,
    type: 'meeting_summary',
    source: 'kestrel',
    confidence: 0.84,
    tags: ['kestrel', 'meeting', 'meeting_summary', `meeting:${meeting.id}`]
  })
}

export async function syncJournalEntryMemory(date: string): Promise<void> {
  if (!isMemorySyncEnabled('journal')) return

  const db = getDatabase()
  const entry = db.select().from(schema.journalEntries).where(eq(schema.journalEntries.date, date)).get()
  if (!entry?.content) return

  const content = truncateMemoryContent([
    `Journal: ${entry.title}`,
    `Date: ${entry.date}`,
    entry.tldr ? `TLDR: ${entry.tldr}` : '',
    '',
    entry.content
  ].filter(Boolean).join('\n'))

  await storeEvalOpsMemory({
    id: memoryId('journal', entry.date),
    scope: 'SCOPE_USER',
    content,
    type: 'journal',
    source: 'kestrel',
    confidence: 0.82,
    tags: ['kestrel', 'journal', `date:${entry.date}`]
  })
}

export function syncChatThreadMemoryInBackground(threadId: string): void {
  void syncChatThreadMemory(threadId).catch((err) => {
    console.warn('[evalops:memory] Failed to sync chat thread:', err)
  })
}

export function syncMeetingSummaryMemoryInBackground(meetingId: string, audioPath?: string): void {
  void syncMeetingSummaryMemory(meetingId, audioPath).catch((err) => {
    console.warn('[evalops:memory] Failed to sync meeting summary:', err)
  })
}

export function syncJournalEntryMemoryInBackground(date: string): void {
  void syncJournalEntryMemory(date).catch((err) => {
    console.warn('[evalops:memory] Failed to sync journal entry:', err)
  })
}

function isMemorySyncEnabled(category: MemorySyncCategory): boolean {
  const settings = getEvalOpsMemorySyncSettings()
  return settings.enabled && settings[category]
}

function memoryId(kind: string, id: string): string {
  return `kestrel-${kind}-${id}`.replace(/[^a-zA-Z0-9_.:-]/g, '-')
}

function truncateMemoryContent(content: string): string {
  const maxChars = 16_000
  return content.length > maxChars ? `${content.slice(0, maxChars)}\n...[truncated]` : content
}

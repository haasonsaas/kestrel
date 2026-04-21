import { asc, eq, lte } from 'drizzle-orm'
import { dialog } from 'electron'
import fs from 'fs/promises'
import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { getEvalOpsConfig } from './config'
import { getSettingValue } from './settings'
import { deleteEvalOpsMemory, listEvalOpsMemory, storeEvalOpsMemory } from './services'
import type { EvalOpsMemory } from '../../shared/ipc'

export const EVALOPS_MEMORY_SYNC_SETTING_KEY = 'evalops_memory_sync'

type MemorySyncCategory = 'chat' | 'meetings' | 'journal'

const QUEUE_BATCH_SIZE = 10
const QUEUE_INTERVAL_MS = 60_000
const RETRY_BASE_MS = 30_000
const RETRY_MAX_MS = 60 * 60_000
const SYNCED_MEMORY_TYPES = ['chat_thread', 'meeting_summary', 'journal'] as const

interface EvalOpsMemorySyncSettings {
  enabled?: boolean
  chat?: boolean
  meetings?: boolean
  journal?: boolean
}

export interface EvalOpsMemorySyncQueueStatus {
  pending: number
  failed: number
  nextAttemptAt?: string
  lastError?: string
}

export interface EvalOpsMemorySyncExportResponse {
  cancelled?: boolean
  filePath?: string
  count: number
}

export interface EvalOpsMemorySyncWipeResponse {
  deleted: number
  failed: Array<{ id: string; error: string }>
}

let queueInterval: ReturnType<typeof setInterval> | null = null
let queueFlushPromise: Promise<void> | null = null

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
  void runMemorySyncJob('chat', threadId).catch((err) => {
    console.warn('[evalops:memory] Failed to sync chat thread:', err)
  })
}

export function syncMeetingSummaryMemoryInBackground(meetingId: string, audioPath?: string): void {
  void runMemorySyncJob('meetings', meetingId, audioPath).catch((err) => {
    console.warn('[evalops:memory] Failed to sync meeting summary:', err)
  })
}

export function syncJournalEntryMemoryInBackground(date: string): void {
  void runMemorySyncJob('journal', date).catch((err) => {
    console.warn('[evalops:memory] Failed to sync journal entry:', err)
  })
}

export function startEvalOpsMemorySyncQueue(): void {
  if (queueInterval) return
  void flushEvalOpsMemorySyncQueue().catch((err) => {
    console.warn('[evalops:memory] Failed to flush queued memory syncs:', err)
  })
  queueInterval = setInterval(() => {
    void flushEvalOpsMemorySyncQueue().catch((err) => {
      console.warn('[evalops:memory] Failed to flush queued memory syncs:', err)
    })
  }, QUEUE_INTERVAL_MS)
}

export function stopEvalOpsMemorySyncQueue(): void {
  if (!queueInterval) return
  clearInterval(queueInterval)
  queueInterval = null
}

export function getEvalOpsMemorySyncQueueStatus(): EvalOpsMemorySyncQueueStatus {
  const db = getDatabase()
  const jobs = db.select().from(schema.evalopsMemorySyncQueue).all()
  const nextJob = jobs
    .filter((job) => job.nextAttemptAt instanceof Date)
    .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())[0]
  const lastFailure = jobs
    .filter((job) => Boolean(job.lastError))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

  return {
    pending: jobs.length,
    failed: jobs.filter((job) => job.attempts > 0).length,
    nextAttemptAt: nextJob?.nextAttemptAt.toISOString(),
    lastError: lastFailure?.lastError ?? undefined
  }
}

export async function flushEvalOpsMemorySyncQueue(options: { force?: boolean } = {}): Promise<void> {
  if (queueFlushPromise) return queueFlushPromise
  queueFlushPromise = drainEvalOpsMemorySyncQueue(options.force === true).finally(() => {
    queueFlushPromise = null
  })
  return queueFlushPromise
}

export async function exportEvalOpsMemorySyncCloudCopy(): Promise<EvalOpsMemorySyncExportResponse> {
  const result = await dialog.showSaveDialog({
    title: 'Export EvalOps Memory',
    defaultPath: `kestrel-evalops-memory-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) {
    return { cancelled: true, count: 0 }
  }

  const memories = await listKestrelSyncedMemories()
  const config = getEvalOpsConfig()
  await fs.writeFile(result.filePath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    source: 'kestrel',
    agentId: config.agentId,
    types: SYNCED_MEMORY_TYPES,
    memories
  }, null, 2), 'utf8')

  return { filePath: result.filePath, count: memories.length }
}

export async function wipeEvalOpsMemorySyncCloudCopy(): Promise<EvalOpsMemorySyncWipeResponse> {
  const memories = await listKestrelSyncedMemories()
  clearEvalOpsMemorySyncQueue()
  let deleted = 0
  const failed: Array<{ id: string; error: string }> = []

  for (const memory of memories) {
    if (!memory.id) continue
    try {
      await deleteEvalOpsMemory({ id: memory.id })
      deleted++
    } catch (err) {
      failed.push({ id: memory.id, error: errorMessage(err) })
    }
  }

  return { deleted, failed }
}

async function drainEvalOpsMemorySyncQueue(force: boolean): Promise<void> {
  const db = getDatabase()
  const jobs = force
    ? db.select()
      .from(schema.evalopsMemorySyncQueue)
      .orderBy(asc(schema.evalopsMemorySyncQueue.nextAttemptAt))
      .limit(QUEUE_BATCH_SIZE)
      .all()
    : db.select()
      .from(schema.evalopsMemorySyncQueue)
      .where(lte(schema.evalopsMemorySyncQueue.nextAttemptAt, new Date()))
      .orderBy(asc(schema.evalopsMemorySyncQueue.nextAttemptAt))
      .limit(QUEUE_BATCH_SIZE)
      .all()

  for (const job of jobs) {
    try {
      await runMemorySyncJob(job.category as MemorySyncCategory, job.itemId, job.audioPath ?? undefined)
    } catch (err) {
      console.warn('[evalops:memory] Queued memory sync still failing:', err)
    }
  }
}

async function listKestrelSyncedMemories(): Promise<EvalOpsMemory[]> {
  const config = getEvalOpsConfig()
  const memories: EvalOpsMemory[] = []
  const limit = 100

  for (const type of SYNCED_MEMORY_TYPES) {
    let offset = 0
    for (;;) {
      const response = await listEvalOpsMemory({
        scope: 'SCOPE_USER',
        type,
        agentId: config.agentId,
        limit,
        offset
      })
      if ((response as { offline?: boolean }).offline) {
        throw new Error('evalops_memory_offline')
      }
      memories.push(...response.memories)
      if (!response.hasMore && response.memories.length < limit) break
      offset += limit
    }
  }

  return memories
}

async function runMemorySyncJob(category: MemorySyncCategory, itemId: string, audioPath?: string): Promise<void> {
  try {
    switch (category) {
      case 'chat':
        await syncChatThreadMemory(itemId)
        break
      case 'meetings':
        await syncMeetingSummaryMemory(itemId, audioPath)
        break
      case 'journal':
        await syncJournalEntryMemory(itemId)
        break
    }
    removeQueuedMemorySync(category, itemId)
  } catch (err) {
    queueMemorySyncFailure(category, itemId, audioPath, errorMessage(err))
    throw err
  }
}

function queueMemorySyncFailure(
  category: MemorySyncCategory,
  itemId: string,
  audioPath: string | undefined,
  lastError: string
): void {
  const db = getDatabase()
  const id = queueId(category, itemId)
  const now = new Date()
  const existing = db.select()
    .from(schema.evalopsMemorySyncQueue)
    .where(eq(schema.evalopsMemorySyncQueue.id, id))
    .get()
  const attempts = (existing?.attempts ?? 0) + 1
  const nextAttemptAt = new Date(now.getTime() + retryDelayMs(attempts))
  const queuedAudioPath = audioPath ?? existing?.audioPath ?? null

  db.insert(schema.evalopsMemorySyncQueue)
    .values({
      id,
      category,
      itemId,
      audioPath: queuedAudioPath,
      attempts,
      lastError,
      nextAttemptAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: schema.evalopsMemorySyncQueue.id,
      set: {
        category,
        itemId,
        audioPath: queuedAudioPath,
        attempts,
        lastError,
        nextAttemptAt,
        updatedAt: now
      }
    })
    .run()
}

function removeQueuedMemorySync(category: MemorySyncCategory, itemId: string): void {
  getDatabase()
    .delete(schema.evalopsMemorySyncQueue)
    .where(eq(schema.evalopsMemorySyncQueue.id, queueId(category, itemId)))
    .run()
}

function clearEvalOpsMemorySyncQueue(): void {
  getDatabase().delete(schema.evalopsMemorySyncQueue).run()
}

function isMemorySyncEnabled(category: MemorySyncCategory): boolean {
  const settings = getEvalOpsMemorySyncSettings()
  return settings.enabled && settings[category]
}

function queueId(category: MemorySyncCategory, itemId: string): string {
  return `${category}:${itemId}`
}

function memoryId(kind: string, id: string): string {
  return `kestrel-${kind}-${id}`.replace(/[^a-zA-Z0-9_.:-]/g, '-')
}

function truncateMemoryContent(content: string): string {
  const maxChars = 16_000
  return content.length > maxChars ? `${content.slice(0, maxChars)}\n...[truncated]` : content
}

function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 7))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

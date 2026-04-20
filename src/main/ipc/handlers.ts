import { ipcMain, app } from 'electron'
import { v4 as uuid } from 'uuid'
import { eq, desc } from 'drizzle-orm'
import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { getAllSettingValues, getSettingValue, setSettingValue } from '../evalops/settings'
import type {
  Thread, Message, CreateMessage,
  Meeting, CreateMeeting,
  JournalEntry, CreateJournalEntry,
  PrivacyRule, CreatePrivacyRule,
  ContextSnapshot
} from '../../shared/ipc'
import { DEFAULT_MODEL } from '../../shared/config'

export function registerIpcHandlers(): void {
  const db = getDatabase()

  // ── Settings ──────────────────────────────────────────

  ipcMain.handle('settings:get', async (_e, key: string) => {
    return getSettingValue(key)
  })

  ipcMain.handle('settings:set', async (_e, key: string, value: unknown) => {
    setSettingValue(key, value)
  })

  ipcMain.handle('settings:getAll', async () => {
    return getAllSettingValues()
  })

  // ── Threads ───────────────────────────────────────────

  ipcMain.handle('threads:list', async () => {
    return db.select().from(schema.threads).orderBy(desc(schema.threads.updatedAt)).all()
  })

  ipcMain.handle('threads:create', async (_e, title?: string): Promise<Thread> => {
    const now = Date.now()
    const thread = {
      id: uuid(),
      title: title || 'New Chat',
      model: DEFAULT_MODEL,
      starred: false,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
    db.insert(schema.threads).values(thread).run()
    return {
      ...thread,
      createdAt: now,
      updatedAt: now
    }
  })

  ipcMain.handle('threads:update', async (_e, id: string, data: Partial<Thread>) => {
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() }
    db.update(schema.threads).set(updateData).where(eq(schema.threads.id, id)).run()
    return db.select().from(schema.threads).where(eq(schema.threads.id, id)).get()
  })

  ipcMain.handle('threads:delete', async (_e, id: string) => {
    db.delete(schema.threads).where(eq(schema.threads.id, id)).run()
  })

  // ── Messages ──────────────────────────────────────────

  ipcMain.handle('messages:list', async (_e, threadId: string) => {
    return db.select().from(schema.messages)
      .where(eq(schema.messages.threadId, threadId))
      .orderBy(schema.messages.createdAt)
      .all()
  })

  ipcMain.handle('messages:create', async (_e, data: CreateMessage): Promise<Message> => {
    const now = Date.now()
    const message = {
      id: uuid(),
      ...data,
      createdAt: new Date(now)
    }
    db.insert(schema.messages).values(message).run()
    // Update thread timestamp
    db.update(schema.threads)
      .set({ updatedAt: new Date(now) })
      .where(eq(schema.threads.id, data.threadId))
      .run()
    return { ...message, createdAt: now } as Message
  })

  // ── Meetings ──────────────────────────────────────────

  ipcMain.handle('meetings:list', async () => {
    return db.select().from(schema.meetings).orderBy(desc(schema.meetings.startedAt)).all()
  })

  ipcMain.handle('meetings:get', async (_e, id: string) => {
    return db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).get() || null
  })

  ipcMain.handle('meetings:create', async (_e, data: CreateMeeting): Promise<Meeting> => {
    const meeting = {
      id: uuid(),
      ...data,
      startedAt: new Date()
    }
    db.insert(schema.meetings).values(meeting).run()
    return meeting as unknown as Meeting
  })

  ipcMain.handle('meetings:update', async (_e, id: string, data: Partial<Meeting>) => {
    db.update(schema.meetings).set(data).where(eq(schema.meetings.id, id)).run()
    return db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).get()
  })

  // ── Journal ───────────────────────────────────────────

  ipcMain.handle('journal:list', async () => {
    return db.select().from(schema.journalEntries).orderBy(desc(schema.journalEntries.date)).all()
  })

  ipcMain.handle('journal:get', async (_e, date: string) => {
    return db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.date, date)).get() || null
  })

  ipcMain.handle('journal:upsert', async (_e, data: CreateJournalEntry): Promise<JournalEntry> => {
    const entry = {
      id: uuid(),
      ...data,
      createdAt: new Date()
    }
    db.insert(schema.journalEntries)
      .values(entry)
      .onConflictDoUpdate({
        target: schema.journalEntries.date,
        set: { title: data.title, tldr: data.tldr, content: data.content }
      })
      .run()
    return db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.date, data.date)).get() as unknown as JournalEntry
  })

  // ── Privacy Rules ─────────────────────────────────────

  ipcMain.handle('privacy:list', async () => {
    return db.select().from(schema.privacyRules).all()
  })

  ipcMain.handle('privacy:create', async (_e, data: CreatePrivacyRule): Promise<PrivacyRule> => {
    const rule = {
      id: uuid(),
      ...data,
      enabled: data.enabled ?? true
    }
    db.insert(schema.privacyRules).values(rule).run()
    return rule
  })

  ipcMain.handle('privacy:update', async (_e, id: string, data: Partial<PrivacyRule>) => {
    db.update(schema.privacyRules).set(data).where(eq(schema.privacyRules.id, id)).run()
    return db.select().from(schema.privacyRules).where(eq(schema.privacyRules.id, id)).get()
  })

  ipcMain.handle('privacy:delete', async (_e, id: string) => {
    db.delete(schema.privacyRules).where(eq(schema.privacyRules.id, id)).run()
  })

  // ── Context ───────────────────────────────────────────

  ipcMain.handle('context:snapshots', async (_e, date: string) => {
    const startOfDay = new Date(date).getTime()
    const endOfDay = startOfDay + 86400000
    return db.select().from(schema.contextSnapshots)
      .where(
        // Manual SQL for range query — drizzle has between but this is clearer
        eq(schema.contextSnapshots.appName, schema.contextSnapshots.appName) // placeholder
      )
      .all()
      .filter((s: ContextSnapshot) => s.createdAt >= startOfDay && s.createdAt < endOfDay)
  })

  // ── App ───────────────────────────────────────────────

  ipcMain.handle('app:getVersion', async () => app.getVersion())
  ipcMain.handle('app:getPlatform', async () => process.platform)
}

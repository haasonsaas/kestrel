import { ipcMain } from 'electron'
import { generateJournal } from './generator'
import { v4 as uuid } from 'uuid'
import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'

export function registerJournalHandlers(): void {
  ipcMain.handle('journal:generate', async (_e, date: string) => {
    const db = getDatabase()

    // Check if entry already exists
    const existing = db
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.date, date))
      .get()

    if (existing) {
      return existing
    }

    // Generate new journal entry
    const generated = await generateJournal(date)

    const entry = {
      id: uuid(),
      date,
      title: generated.title,
      tldr: generated.tldr,
      content: generated.content,
      createdAt: new Date()
    }

    db.insert(schema.journalEntries).values(entry).run()
    return entry
  })
}

import { eq } from 'drizzle-orm'
import { getDatabase } from '../db'
import * as schema from '../db/schema'

export function getSettingValue<T>(key: string): T | null {
  const db = getDatabase()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  return row ? JSON.parse(row.value) as T : null
}

export function setSettingValue(key: string, value: unknown): void {
  const db = getDatabase()
  db.insert(schema.settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(value) } })
    .run()
}

export function deleteSettingValue(key: string): void {
  const db = getDatabase()
  db.delete(schema.settings).where(eq(schema.settings.key, key)).run()
}

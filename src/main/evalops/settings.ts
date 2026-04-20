import { safeStorage } from 'electron'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db'
import * as schema from '../db/schema'

interface EncryptedSettingValue {
  __kestrelEncryptedSetting: true
  version: 1
  encrypted: boolean
  data: string
}

export function getSettingValue<T>(key: string): T | null {
  const db = getDatabase()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  return row ? decodeSettingValue(row.value) as T : null
}

export function setSettingValue(key: string, value: unknown): void {
  const db = getDatabase()
  const encodedValue = encodeSettingValue(key, value)
  db.insert(schema.settings)
    .values({ key, value: encodedValue })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: encodedValue } })
    .run()
}

export function getAllSettingValues(): Record<string, unknown> {
  const db = getDatabase()
  const rows = db.select().from(schema.settings).all()
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    result[row.key] = decodeSettingValue(row.value)
  }
  return result
}

export function deleteSettingValue(key: string): void {
  const db = getDatabase()
  db.delete(schema.settings).where(eq(schema.settings.key, key)).run()
}

function encodeSettingValue(key: string, value: unknown): string {
  const json = JSON.stringify(value)
  if (!isSensitiveSettingKey(key)) return json

  const encoded: EncryptedSettingValue = safeStorage.isEncryptionAvailable()
    ? {
        __kestrelEncryptedSetting: true,
        version: 1,
        encrypted: true,
        data: safeStorage.encryptString(json).toString('base64')
      }
    : {
        __kestrelEncryptedSetting: true,
        version: 1,
        encrypted: false,
        data: json
      }
  return JSON.stringify(encoded)
}

function decodeSettingValue(storedValue: string): unknown {
  const parsed = JSON.parse(storedValue) as unknown
  if (!isEncryptedSettingValue(parsed)) return parsed

  const json = parsed.encrypted
    ? safeStorage.decryptString(Buffer.from(parsed.data, 'base64'))
    : parsed.data
  return JSON.parse(json)
}

function isEncryptedSettingValue(value: unknown): value is EncryptedSettingValue {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Partial<EncryptedSettingValue>).__kestrelEncryptedSetting === true &&
    (value as Partial<EncryptedSettingValue>).version === 1 &&
    typeof (value as Partial<EncryptedSettingValue>).encrypted === 'boolean' &&
    typeof (value as Partial<EncryptedSettingValue>).data === 'string'
}

function isSensitiveSettingKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return normalized === 'evalops_config' ||
    normalized.endsWith('_api_key') ||
    normalized.includes('api_key') ||
    normalized.endsWith('_token') ||
    normalized.includes('access_token') ||
    normalized.includes('refresh_token') ||
    normalized.includes('secret')
}

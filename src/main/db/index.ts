import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>>
let sqlite: Database.Database

export function initDatabase(): typeof db {
  const dbDir = path.join(app.getPath('userData'), 'data')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.join(dbDir, 'kestrel.db')
  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  db = drizzle(sqlite, { schema })

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4.6',
      starred INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      model TEXT,
      tool_calls TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      app TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      transcript TEXT,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      tldr TEXT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS privacy_rules (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('app', 'domain', 'category')),
      value TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS context_snapshots (
      id TEXT PRIMARY KEY,
      app_name TEXT NOT NULL,
      bundle_id TEXT NOT NULL,
      window_title TEXT,
      url TEXT,
      content TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arenas (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      models TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arena_responses (
      id TEXT PRIMARY KEY,
      arena_id TEXT NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      content TEXT NOT NULL,
      voted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_context_snapshots_date ON context_snapshots(created_at);
    CREATE INDEX IF NOT EXISTS idx_arena_responses_arena ON arena_responses(arena_id);
  `)

  return db
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function closeDatabase() {
  if (sqlite) sqlite.close()
}

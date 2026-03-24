import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('New Chat'),
  model: text('model').notNull().default('anthropic/claude-sonnet-4.6'),
  starred: integer('starred', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  model: text('model'),
  toolCalls: text('tool_calls'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  app: text('app').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  transcript: text('transcript'),
  summary: text('summary')
})

export const journalEntries = sqliteTable('journal_entries', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  title: text('title').notNull(),
  tldr: text('tldr'),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const privacyRules = sqliteTable('privacy_rules', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['app', 'domain', 'category'] }).notNull(),
  value: text('value').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true)
})

export const contextSnapshots = sqliteTable('context_snapshots', {
  id: text('id').primaryKey(),
  appName: text('app_name').notNull(),
  bundleId: text('bundle_id').notNull(),
  windowTitle: text('window_title'),
  url: text('url'),
  content: text('content'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const arenas = sqliteTable('arenas', {
  id: text('id').primaryKey(),
  prompt: text('prompt').notNull(),
  models: text('models').notNull(), // JSON array of model IDs
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const arenaResponses = sqliteTable('arena_responses', {
  id: text('id').primaryKey(),
  arenaId: text('arena_id').notNull().references(() => arenas.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  content: text('content').notNull(),
  voted: integer('voted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

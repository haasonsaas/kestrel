// Type-safe IPC channel definitions shared between main and preload

export type IpcChannels = {
  // Settings
  'settings:get': { args: [key: string]; return: unknown }
  'settings:set': { args: [key: string, value: unknown]; return: void }
  'settings:getAll': { args: []; return: Record<string, unknown> }

  // EvalOps Platform Auth
  'evalops:authStatus': { args: []; return: EvalOpsAuthStatus }
  'evalops:login': { args: [options?: EvalOpsLoginOptions]; return: EvalOpsAuthStatus }
  'evalops:logout': { args: []; return: EvalOpsAuthStatus }
  'evalops:refreshAuth': { args: []; return: EvalOpsAuthStatus }

  // Database — Threads
  'threads:list': { args: []; return: Thread[] }
  'threads:create': { args: [title?: string]; return: Thread }
  'threads:update': { args: [id: string, data: Partial<Thread>]; return: Thread }
  'threads:delete': { args: [id: string]; return: void }

  // Database — Messages
  'messages:list': { args: [threadId: string]; return: Message[] }
  'messages:create': { args: [data: CreateMessage]; return: Message }

  // Database — Meetings
  'meetings:list': { args: []; return: Meeting[] }
  'meetings:get': { args: [id: string]; return: Meeting | null }
  'meetings:create': { args: [data: CreateMeeting]; return: Meeting }
  'meetings:update': { args: [id: string, data: Partial<Meeting>]; return: Meeting }

  // Database — Journal
  'journal:list': { args: []; return: JournalEntry[] }
  'journal:get': { args: [date: string]; return: JournalEntry | null }
  'journal:upsert': { args: [data: CreateJournalEntry]; return: JournalEntry }
  'journal:generate': { args: [date: string]; return: JournalEntry }

  // Database — Privacy Rules
  'privacy:list': { args: []; return: PrivacyRule[] }
  'privacy:create': { args: [data: CreatePrivacyRule]; return: PrivacyRule }
  'privacy:update': { args: [id: string, data: Partial<PrivacyRule>]; return: PrivacyRule }
  'privacy:delete': { args: [id: string]; return: void }

  // AI
  'ai:chat': { args: [request: ChatRequest]; return: string }
  'ai:chatStream': { args: [request: ChatRequest]; return: void }
  'ai:models': { args: []; return: AIModel[] }

  // Context
  'context:get': { args: []; return: AppContext | null }
  'context:checkPermissions': { args: []; return: PermissionStatus }
  'context:snapshots': { args: [date: string]; return: ContextSnapshot[] }

  // Meeting control
  'meeting:start': { args: []; return: { id: string } }
  'meeting:stop': { args: [id: string]; return: void }
  'meeting:status': { args: []; return: MeetingStatus | null }

  // MCP
  'mcp:listServers': { args: []; return: MCPServerStatus[] }
  'mcp:startServer': { args: [config: MCPServerConfig]; return: void }
  'mcp:stopServer': { args: [name: string]; return: void }
  'mcp:listTools': { args: []; return: MCPTool[] }

  // Permissions
  'permissions:check': { args: []; return: { accessibility: boolean; microphone: boolean; screenRecording: boolean; allGranted: boolean } }
  'permissions:request': { args: [permission: string]; return: boolean }
  'permissions:openSettings': { args: [pane?: string]; return: void }

  // Events / Observability
  'events:snapshot': { args: [windowMinutes?: number]; return: unknown }
  'events:recent': { args: [limit?: number]; return: unknown[] }

  // Window
  'window:toggleOverlay': { args: []; return: void }
  'window:minimize': { args: []; return: void }
  'window:maximize': { args: []; return: void }
  'window:close': { args: []; return: void }

  // App
  'app:getVersion': { args: []; return: string }
  'app:getPlatform': { args: []; return: string }
}

// Push events (main → renderer)
export type IpcEvents = {
  'ai:streamChunk': { threadId: string; chunk: string }
  'ai:streamEnd': { threadId: string }
  'ai:streamError': { threadId: string; error: string }
  'ai:toolStart': { threadId: string; toolName: string; serverName: string }
  'ai:toolEnd': { threadId: string; toolName: string; serverName: string; success: boolean; error?: string }
  'context:updated': AppContext
  'meeting:detected': { app: string; title: string; meetingId: string }
  'meeting:autoStopped': { meetingId: string; reason: string }
  'meeting:transcriptionFailed': { meetingId: string; error: string }
  'meeting:transcriptChunk': { meetingId: string; text: string }
  'mcp:statusUpdate': MCPServerStatus[]
  'app:newChat': Record<string, never>
  'hummingbird:voiceMode': { active: boolean }
  'hummingbird:voiceTranscript': { text: string }
  'hummingbird:voiceRecording': { recording: boolean }
}

// Data types
export interface Thread {
  id: string
  title: string
  model: string
  starred: boolean
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  threadId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  toolCalls?: string
  createdAt: number
}

export interface CreateMessage {
  threadId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  toolCalls?: string
}

export interface Meeting {
  id: string
  title: string
  app: string
  startedAt: number
  endedAt?: number
  transcript?: string
  summary?: string
}

export interface CreateMeeting {
  title: string
  app: string
}

export interface JournalEntry {
  id: string
  date: string
  title: string
  tldr?: string
  content: string
  createdAt: number
}

export interface CreateJournalEntry {
  date: string
  title: string
  tldr?: string
  content: string
}

export interface PrivacyRule {
  id: string
  type: 'app' | 'domain' | 'category'
  value: string
  enabled: boolean
}

export interface CreatePrivacyRule {
  type: 'app' | 'domain' | 'category'
  value: string
  enabled?: boolean
}

export interface ChatRequest {
  threadId: string
  messages: Array<{ role: string; content: string }>
  model: string
  includeContext?: boolean
  stream?: boolean
}

export interface AIModel {
  id: string
  name: string
  provider: string
  contextWindow: number
}

export interface EvalOpsLoginOptions {
  identityBaseUrl?: string
  resource?: string
  scopes?: string[]
  loginHint?: string
  organizationId?: string
  prompt?: string
}

export interface EvalOpsAuthStatus {
  authenticated: boolean
  identityBaseUrl: string
  resource: string
  organizationId?: string
  scopes: string[]
  expiresAt?: number
  refreshExpiresAt?: string
}

export interface AppContext {
  appName: string
  bundleId: string
  windowTitle?: string
  url?: string
  pageTitle?: string
  visibleText?: string[]
}

export interface PermissionStatus {
  accessibility: boolean
  screenRecording: boolean
  microphone: boolean
}

export interface MeetingStatus {
  id: string
  active: boolean
  title: string
  app: string
  duration: number
  recording: boolean
}

export interface ContextSnapshot {
  id: string
  appName: string
  bundleId: string
  windowTitle?: string
  url?: string
  content?: string
  createdAt: number
}

export interface MCPServerConfig {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  enabled: boolean
}

export interface MCPServerStatus {
  name: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  tools: string[]
  error?: string
}

export interface MCPTool {
  server: string
  name: string
  description: string
  inputSchema: unknown
}

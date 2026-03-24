// Types for the structured AX tree and parsed context output

/** A single node in the accessibility tree, as serialized from Swift */
export interface AXNode {
  role?: string
  subrole?: string
  title?: string
  value?: string
  description?: string
  identifier?: string
  domClassList?: string[]
  frame?: AXFrame
  children?: AXNode[]
}

export interface AXFrame {
  x: number
  y: number
  width: number
  height: number
}

/** Enriched context returned by the getContextTree RPC method */
export interface ContextTreeResult {
  appName: string
  bundleId: string
  windowTitle?: string
  url?: string
  pageTitle?: string
  visibleText?: string[]
  axTree?: AXNode
}

// ── Parser output types ─────────────────────────────────────────────

/** A parsed conversation (Slack, Messages, WhatsApp, etc.) */
export interface ParsedConversation {
  app: string
  channel: string | null
  participants: ParsedParticipant[]
  messages: ParsedMessage[]
}

export interface ParsedParticipant {
  name: string
  identifier: string | null
}

export interface ParsedMessage {
  sender: string | null
  content: string | null
  timestamp: string | null
}

/** A parsed task (OmniFocus, Reminders, etc.) */
export interface ParsedTask {
  title: string
  app: string
  status: string
  flagged: boolean
  dueDate: string | null
  tags: string[]
  project: string | null
}

/** Union of all parser output types */
export interface ParsedContext {
  activeConversations?: ParsedConversation[]
  tasks?: ParsedTask[]
}

/** Marker for the current user as sender */
export const USER = '[user]'

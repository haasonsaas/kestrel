/**
 * Presenter Agent — crafts user-facing responses, manages streaming to the renderer.
 * Takes execution results from the Executor and handles all UI-facing concerns.
 *
 * Responsibilities:
 * - Build the system prompt (tone, identity, context injection)
 * - Stream text chunks to the renderer via IPC
 * - Send tool start/end notifications to the renderer
 * - Save completed messages to the database
 * - Auto-title threads
 * - Track presentation metrics via wide events
 *
 * Does NOT:
 * - Execute tool calls
 * - Fetch screen context
 * - Talk to MCP servers
 * - Parse API responses
 */

import { v4 as uuid } from 'uuid'
import { DEFAULT_CHAT_SYSTEM_PROMPT, buildSystemMessage } from './context-builder'
import {
  gatherContext,
  runExecutionLoop,
  setExecutorDeps,
  type ExecutionContext,
  type ToolExecutionResult
} from './executor-agent'
import { WideEvent } from '../observability/wide-event'
import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import type { ChatMessage } from './llm-gateway'
import type { ContextKitClient } from '../native/contextkit-client'
import type { MCPServerManager } from '../mcp/manager'
import type { ChatRequest } from '../../shared/ipc'
import { recordEvalOpsChatTrace } from '../evalops/services'
import { KESTREL_PROMPT_NAMES, resolveEvalOpsPrompt } from '../evalops/prompts'
import {
  buildEvalOpsMemoryRecallBlock,
  syncChatThreadMemoryInBackground
} from '../evalops/memory-sync'

let contextKitRef: ContextKitClient | null = null

export function setPresenterDeps(
  contextKit: ContextKitClient | null,
  mcpManager?: MCPServerManager | null
): void {
  contextKitRef = contextKit
  // Pass through to executor
  setExecutorDeps(contextKit, mcpManager)
}

/**
 * Handle a streaming chat request end-to-end.
 * Orchestrates the Executor for work and handles all renderer communication.
 */
export async function handleChatStream(
  sender: Electron.WebContents,
  request: ChatRequest
): Promise<void> {
  const db = getDatabase()
  const startedAt = new Date()
  const event = WideEvent.start('chat_stream', {
    thread_id: request.threadId,
    model: request.model,
    include_context: request.includeContext !== false,
    message_count: request.messages.length
  })

  // ── Phase 1: Executor gathers context ──
  const execCtx = await gatherContext(request.includeContext !== false)

  if (execCtx.contextResult) {
    console.log(`[presenter] Context: ${execCtx.contextResult.block.length} chars, hasText=${execCtx.contextResult.hasVisibleText}`)
  }

  // ── Phase 2: Presenter builds the conversation ──
  const messages = await buildConversation(request, execCtx)

  // ── Phase 3: Executor runs the model + tool loop ──
  runExecutionLoop(
    messages,
    request.model,
    execCtx.openaiTools,
    {
      // Presenter streams text to renderer
      onTextChunk: (chunk) => {
        if (!sender.isDestroyed()) {
          sender.send('ai:streamChunk', {
            threadId: request.threadId,
            chunk
          })
        }
      },

      // Presenter notifies renderer about tool execution
      onToolStart: (toolName, serverName) => {
        if (!sender.isDestroyed()) {
          sender.send('ai:toolStart', { threadId: request.threadId, toolName, serverName })
        }
      },

      onToolEnd: (toolName, serverName, success, error) => {
        if (!sender.isDestroyed()) {
          sender.send('ai:toolEnd', {
            threadId: request.threadId,
            toolName,
            serverName,
            success,
            error
          })
        }
      },

      // Presenter finalizes: save to DB, notify renderer, track metrics
      onDone: (fullText, toolResults) => {
        const endedAt = new Date()
        event.setMany({
          response_length: fullText.length,
          tool_calls: toolResults.length,
          tool_errors: toolResults.filter(r => !r.success).length,
          has_context: execCtx.contextResult !== null,
          has_visible_text: execCtx.contextResult?.hasVisibleText ?? false
        })
        event.finish()

        void recordEvalOpsChatTrace({
          threadId: request.threadId,
          model: request.model,
          status: 'SPAN_STATUS_OK',
          startedAt,
          endedAt,
          latencyMs: endedAt.getTime() - startedAt.getTime()
        }).catch((err) => {
          console.warn('[evalops:traces] Failed to record chat trace:', err)
        })

        finalize(sender, request, fullText, toolResults, db)
      },

      // Presenter handles errors
      onError: (error) => {
        const endedAt = new Date()
        event.fail(error)
        void recordEvalOpsChatTrace({
          threadId: request.threadId,
          model: request.model,
          status: 'SPAN_STATUS_ERROR',
          startedAt,
          endedAt,
          latencyMs: endedAt.getTime() - startedAt.getTime(),
          error
        }).catch((err) => {
          console.warn('[evalops:traces] Failed to record chat error trace:', err)
        })
        if (!sender.isDestroyed()) {
          sender.send('ai:streamError', {
            threadId: request.threadId,
            error
          })
        }
      }
    }
  )
}

/**
 * Build the full conversation array from request + execution context.
 * This is the Presenter's job — deciding what the AI sees.
 */
async function buildConversation(
  request: ChatRequest,
  execCtx: ExecutionContext
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = []

  // System prompt — Presenter decides the AI's identity and tone
  const basePrompt = await resolveEvalOpsPrompt(KESTREL_PROMPT_NAMES.chat, DEFAULT_CHAT_SYSTEM_PROMPT)
  let systemPrompt = buildSystemMessage(execCtx.contextResult, execCtx.mcpToolsBlock, basePrompt)
  const memoryBlock = await buildRelevantMemoryBlock(request.messages)
  if (memoryBlock) {
    systemPrompt += `\n\n${memoryBlock}`
  }
  messages.push({ role: 'system', content: systemPrompt })

  // Conversation history (skip renderer-side system messages)
  for (const msg of request.messages) {
    if (msg.role !== 'system') {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })
    }
  }

  return messages
}

async function buildRelevantMemoryBlock(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const query = [...messages]
    .reverse()
    .find((message) => message.role === 'user' && message.content.trim().length > 0)
    ?.content
  if (!query) return null
  try {
    return await buildEvalOpsMemoryRecallBlock(query)
  } catch (err) {
    console.warn('[evalops:memory] Failed to recall memory for chat context:', err)
    return null
  }
}

/**
 * Finalize a completed response — save to DB, notify renderer, auto-title.
 */
function finalize(
  sender: Electron.WebContents,
  request: ChatRequest,
  fullText: string,
  toolResults: ToolExecutionResult[],
  db: ReturnType<typeof getDatabase>
): void {
  // Notify renderer that streaming is complete
  if (!sender.isDestroyed()) {
    sender.send('ai:streamEnd', { threadId: request.threadId })
  }

  // Save assistant message to DB
  db.insert(schema.messages).values({
    id: uuid(),
    threadId: request.threadId,
    role: 'assistant',
    content: fullText,
    model: request.model,
    toolCalls: toolResults.length > 0
      ? JSON.stringify(toolResults.map(r => ({
          tool: `${r.serverName}/${r.toolName}`,
          success: r.success,
          durationMs: r.durationMs
        })))
      : undefined,
    createdAt: new Date()
  }).run()

  // Update thread timestamp
  db.update(schema.threads)
    .set({ updatedAt: new Date() })
    .where(eq(schema.threads.id, request.threadId))
    .run()

  // Auto-title thread from first user message
  autoTitle(request.threadId, request.messages)
  syncChatThreadMemoryInBackground(request.threadId)
}

function autoTitle(
  threadId: string,
  messages: Array<{ role: string; content: string }>
): void {
  const db = getDatabase()
  const thread = db.select().from(schema.threads).where(eq(schema.threads.id, threadId)).get()
  if (!thread || thread.title !== 'New Chat') return

  const userMessages = messages.filter(m => m.role === 'user')
  if (userMessages.length === 0) return

  const first = userMessages[0].content
  const title = first.length > 50 ? first.slice(0, 50) + '...' : first

  db.update(schema.threads)
    .set({ title })
    .where(eq(schema.threads.id, threadId))
    .run()
}

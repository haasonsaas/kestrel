/**
 * AI IPC Handlers — thin routing layer between renderer IPC and the agent system.
 *
 * Architecture:
 *   Renderer → IPC → handlers.ts → Presenter Agent → Executor Agent
 *
 * The Presenter Agent handles all user-facing concerns (streaming, formatting, DB).
 * The Executor Agent handles all work concerns (context, tools, API calls).
 * This file just wires IPC channels to the right agent.
 */

import { ipcMain } from 'electron'
import { chatCompletionStream, AVAILABLE_MODELS } from './llm-gateway'
import type { ChatMessage } from './llm-gateway'
import { setPresenterDeps, handleChatStream } from './presenter-agent'
import type { ContextKitClient } from '../native/contextkit-client'
import type { MCPServerManager } from '../mcp/manager'
import type { ChatRequest } from '../../shared/ipc'

export function registerAIHandlers(
  contextKit: ContextKitClient | null,
  mcpManager?: MCPServerManager | null
): void {
  // Initialize both agents with their dependencies
  setPresenterDeps(contextKit, mcpManager)

  // Model list — no agent needed
  ipcMain.handle('ai:models', async () => {
    return AVAILABLE_MODELS
  })

  // Non-streaming chat — simple passthrough, no agent orchestration
  ipcMain.handle('ai:chat', async (_e, request: ChatRequest) => {
    return new Promise<string>((resolve, reject) => {
      chatCompletionStream(
        request.messages as ChatMessage[],
        request.model,
        {
          onChunk: () => {},
          onDone: (fullText) => resolve(fullText),
          onError: (error) => reject(new Error(error))
        }
      )
    })
  })

  // Streaming chat — routed to Presenter Agent which orchestrates Executor Agent
  ipcMain.handle('ai:chatStream', async (event, request: ChatRequest) => {
    await handleChatStream(event.sender, request)
  })
}

// Re-export for backward compat
export { setPresenterDeps as setContextKit }

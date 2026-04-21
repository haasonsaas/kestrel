/**
 * Executor Agent — handles tool calls, context fetching, and structured work.
 * Never talks to the user directly. Returns structured results to the Presenter.
 *
 * Responsibilities:
 * - Fetch and filter screen context from ContextKit
 * - Execute MCP tool calls and collect results
 * - Build the execution context (system prompt, tools, history)
 * - Manage the tool-call loop (model → tool → result → model)
 * - Track execution metrics via wide events
 *
 * Does NOT:
 * - Stream text to the renderer
 * - Format user-facing responses
 * - Decide tone or style
 */

import { chatCompletionStream } from './llm-gateway'
import type { ChatMessage, ToolCall, OpenAITool } from './llm-gateway'
import {
  buildContextPrompt,
  buildOpenAITools,
  buildMCPToolsPrompt,
  parseToolName,
  type ContextPromptResult
} from './context-builder'
import { WideEvent } from '../observability/wide-event'
import { redactPiiForPlatform } from '../privacy/pii'
import type { ContextKitClient } from '../native/contextkit-client'
import type { MCPServerManager } from '../mcp/manager'

const MAX_TOOL_ITERATIONS = 10

export interface ExecutionContext {
  contextResult: ContextPromptResult | null
  openaiTools: OpenAITool[]
  mcpToolsBlock: string | null
  toolsAvailable: boolean
}

export interface ToolExecutionResult {
  toolName: string
  serverName: string
  result: string
  success: boolean
  durationMs: number
}

export interface StreamCallbacks {
  onTextChunk: (chunk: string) => void
  onToolStart: (toolName: string, serverName: string) => void
  onToolEnd: (toolName: string, serverName: string, success: boolean, error?: string) => void
  onDone: (fullText: string, toolResults: ToolExecutionResult[]) => void
  onError: (error: string) => void
}

let contextKitRef: ContextKitClient | null = null
let mcpManagerRef: MCPServerManager | null = null

export function setExecutorDeps(
  contextKit: ContextKitClient | null,
  mcpManager?: MCPServerManager | null
): void {
  contextKitRef = contextKit
  if (mcpManager) mcpManagerRef = mcpManager
}

/**
 * Gather execution context — screen context + available tools.
 * Pure data fetching, no side effects.
 */
export async function gatherContext(includeContext: boolean): Promise<ExecutionContext> {
  let contextResult: ContextPromptResult | null = null
  if (includeContext) {
    contextResult = await buildContextPrompt(contextKitRef)
  }

  let openaiTools: OpenAITool[] = []
  let mcpToolsBlock: string | null = null
  if (mcpManagerRef) {
    const tools = mcpManagerRef.getAllTools()
    openaiTools = buildOpenAITools(tools)
    mcpToolsBlock = buildMCPToolsPrompt(tools)
  }

  return {
    contextResult,
    openaiTools,
    mcpToolsBlock,
    toolsAvailable: openaiTools.length > 0
  }
}

/**
 * Execute a single MCP tool call. Returns structured result.
 */
export async function executeTool(
  toolCallId: string,
  combinedName: string,
  argsJson: string
): Promise<ToolExecutionResult> {
  const start = Date.now()
  const parsed = parseToolName(combinedName)

  if (!parsed) {
    return {
      toolName: combinedName,
      serverName: 'unknown',
      result: `Error: Could not parse tool name "${combinedName}". Expected format: serverName__toolName`,
      success: false,
      durationMs: Date.now() - start
    }
  }

  const { serverName, toolName } = parsed
  const event = WideEvent.start('mcp_tool_call', {
    server: serverName,
    tool: toolName
  })

  try {
    let args: Record<string, unknown> = {}
    if (argsJson) {
      args = JSON.parse(argsJson)
    }

    if (!mcpManagerRef) {
      throw new Error('MCP server manager not available')
    }

    const result = await mcpManagerRef.callTool(serverName, toolName, args)
    event.set('result_length', result.length)
    event.finish()

    return {
      toolName,
      serverName,
      result,
      success: true,
      durationMs: Date.now() - start
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    event.fail(errMsg)

    return {
      toolName,
      serverName,
      result: `Error executing ${serverName}/${toolName}: ${errMsg}`,
      success: false,
      durationMs: Date.now() - start
    }
  }
}

/**
 * Run the full execution loop: stream model response, handle tool calls,
 * collect results, iterate until done.
 */
export function runExecutionLoop(
  messages: ChatMessage[],
  model: string,
  tools: OpenAITool[],
  callbacks: StreamCallbacks
): void {
  let iteration = 0
  let allText = ''
  const allToolResults: ToolExecutionResult[] = []

  const iterate = (): void => {
    const toolsForRequest = iteration < MAX_TOOL_ITERATIONS && tools.length > 0
      ? tools
      : undefined

    chatCompletionStream(
      messages,
      model,
      {
        onChunk: (chunk) => callbacks.onTextChunk(chunk),
        onDone: (fullText, toolCalls) => {
          allText += fullText

          if (toolCalls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
            iteration++
            processToolCalls(messages, fullText, toolCalls, callbacks)
              .then((results) => {
                allToolResults.push(...results)
                iterate()
              })
              .catch((err) => {
                callbacks.onError(`Tool processing failed: ${err}`)
              })
            return
          }

          // Done — no more tool calls
          callbacks.onDone(allText, allToolResults)
        },
        onError: (error) => callbacks.onError(error)
      },
      toolsForRequest
    )
  }

  iterate()
}

/**
 * Process a batch of tool calls from the model.
 * Appends assistant + tool messages to the conversation.
 */
async function processToolCalls(
  messages: ChatMessage[],
  assistantText: string,
  toolCalls: ToolCall[],
  callbacks: StreamCallbacks
): Promise<ToolExecutionResult[]> {
  // Append assistant message with tool_calls
  messages.push({
    role: 'assistant',
    content: assistantText || null,
    tool_calls: toolCalls
  })

  // Execute all tools in parallel
  const results = await Promise.all(
    toolCalls.map(async (tc) => {
      callbacks.onToolStart(
        tc.function.name.replace('__', '/'),
        tc.function.name.split('__')[0] || 'unknown'
      )

      const result = await executeTool(tc.id, tc.function.name, tc.function.arguments)
      const redactedResult = redactPiiForPlatform(result.result, 'mcp_tool_result', {
        server_name: result.serverName,
        tool_name: result.toolName,
        success: result.success
      }).text

      callbacks.onToolEnd(
        result.toolName,
        result.serverName,
        result.success,
        result.success ? undefined : result.result
      )

      // Append tool result to conversation
      messages.push({
        role: 'tool',
        content: redactedResult,
        tool_call_id: tc.id
      })

      return result
    })
  )

  // Stream a status update about tool usage
  const toolNames = results.map(r => `${r.serverName}/${r.toolName}`).join(', ')
  callbacks.onTextChunk(`\n\n_Used tools: ${toolNames}_\n\n`)

  return results
}

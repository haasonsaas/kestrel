import { ContextKitClient } from '../native/contextkit-client'
import { shouldExcludeContext } from '../privacy/rules'
import type { AppContext, MCPTool } from '../../shared/ipc'
import type { OpenAITool } from './openrouter'

export interface ContextPromptResult {
  block: string
  hasVisibleText: boolean
  appName: string
}

/**
 * Builds a system prompt section from the current app context.
 * Returns null if context is unavailable or excluded by privacy rules.
 */
export async function buildContextPrompt(
  contextKit: ContextKitClient | null
): Promise<ContextPromptResult | null> {
  if (!contextKit) return null

  let context: AppContext | null
  try {
    context = await contextKit.getContext()
  } catch {
    return null
  }

  if (!context) return null

  // Check privacy rules
  if (shouldExcludeContext(context)) {
    return null
  }

  // Build the context block
  const parts: string[] = []
  parts.push(`<active_context>`)
  parts.push(`App: ${context.appName}`)

  if (context.windowTitle) {
    parts.push(`Window: ${context.windowTitle}`)
  }

  if (context.url) {
    parts.push(`URL: ${context.url}`)
  }

  if (context.pageTitle && context.pageTitle !== context.windowTitle) {
    parts.push(`Page: ${context.pageTitle}`)
  }

  if (context.visibleText && context.visibleText.length > 0) {
    const extracted = extractSemanticContent(context.visibleText.join('\n'), context.appName)
    if (extracted.length > 0) {
      parts.push(`\nVisible content:\n${extracted}`)
    }
  }

  const hasVisibleText = (context.visibleText?.length ?? 0) > 0

  console.log(`[context-builder] Built context: ${context.appName} — ${parts.join('\n').length} chars, ${context.visibleText?.length ?? 0} text items`)

  parts.push(`</active_context>`)

  return {
    block: parts.join('\n'),
    hasVisibleText,
    appName: context.appName
  }
}

/**
 * Formats MCP tools into a system prompt section describing available tools.
 * This is still used for models that don't support native tool calling,
 * or as supplementary context in the system prompt.
 * Returns null if no tools are available.
 */
export function buildMCPToolsPrompt(tools: MCPTool[]): string | null {
  if (!tools || tools.length === 0) return null

  const parts: string[] = []
  parts.push('<available_tools>')
  parts.push('You have access to MCP tools. Use them via function calling when appropriate.')
  parts.push('Tool names use the format "serverName__toolName" (double underscore separator).')
  parts.push('')

  for (const tool of tools) {
    parts.push(`- ${tool.server}__${tool.name}: ${tool.description}`)
  }

  parts.push('</available_tools>')
  return parts.join('\n')
}

/**
 * Convert MCP tools into OpenAI-compatible tool definitions for the API.
 * Tool names are formatted as "serverName__toolName" to encode the server routing info.
 */
export function buildOpenAITools(tools: MCPTool[]): OpenAITool[] {
  if (!tools || tools.length === 0) return []

  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      // Encode server name into tool name using double underscore separator.
      // OpenAI tool names must match ^[a-zA-Z0-9_-]+$ so we use __ as delimiter.
      name: `${sanitizeToolName(tool.server)}__${sanitizeToolName(tool.name)}`,
      description: tool.description || `Tool ${tool.name} from ${tool.server}`,
      parameters: tool.inputSchema || { type: 'object', properties: {} }
    }
  }))
}

/**
 * Parse a combined tool name back into server name and tool name.
 * e.g. "filesystem__read_file" → { serverName: "filesystem", toolName: "read_file" }
 */
export function parseToolName(combinedName: string): { serverName: string; toolName: string } | null {
  const separatorIndex = combinedName.indexOf('__')
  if (separatorIndex === -1) return null

  return {
    serverName: combinedName.slice(0, separatorIndex),
    toolName: combinedName.slice(separatorIndex + 2)
  }
}

/**
 * Sanitize a name for use in OpenAI tool names.
 * Only allows [a-zA-Z0-9_-], replaces everything else with underscores.
 */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Extract semantically meaningful content from raw screen text.
 * Uses pattern matching to pull out high-signal lines (errors, commands,
 * filenames, URLs, names) and falls back to a sliding window (first 500
 * chars + last 1500 chars) for unstructured content.
 */
function extractSemanticContent(rawText: string, appName: string): string {
  const MAX_OUTPUT = 3000
  const lines = rawText.split('\n')

  // High-signal patterns — lines matching these are always kept
  const signalPatterns = [
    /error|Error|ERROR|ERR:|fatal|FATAL|panic/i,           // Errors
    /warning|WARN/i,                                        // Warnings
    /^\s*(at |Traceback|File "|  \d+ \|)/,                 // Stack traces
    /\.(ts|tsx|js|jsx|py|rb|go|rs|swift|java):\d+/,       // File:line references
    /https?:\/\/\S+/,                                      // URLs
    /^\s*[+\-!>]\s/,                                       // Diff lines
    /^\$\s|^>\s|^\w+@|^root@/,                            // Shell prompts + commands
    /FAIL|PASS|✓|✗|█|──/,                                 // Test results
    /^\s*(import |from |require|const |let |var |func |def |class )/,  // Code definitions
    /→|@\w+:|#\w+/,                                        // Slack/chat: @mentions, #channels
    /PR\s*#\d+|pull request|merge|commit/i,                // Git/PR references
    /^\s*\d+\.\s|^\s*[-*]\s/,                             // Lists
  ]

  // Extract high-signal lines
  const signalLines: string[] = []
  const seenLines = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length < 3) continue
    if (seenLines.has(trimmed)) continue

    if (signalPatterns.some(p => p.test(trimmed))) {
      seenLines.add(trimmed)
      signalLines.push(trimmed)
    }
  }

  let output = ''

  if (signalLines.length > 0) {
    // Semantic extraction succeeded — use signal lines
    output = signalLines.join('\n')
    if (output.length > MAX_OUTPUT) {
      output = output.slice(0, MAX_OUTPUT) + '\n...[truncated]'
    }
  }

  // If semantic extraction got very little, add sliding window
  if (output.length < 500 && rawText.length > 500) {
    const head = rawText.slice(0, 500)
    const tail = rawText.slice(-Math.min(2000, MAX_OUTPUT - 500))
    const window = head + '\n...[' + rawText.length + ' chars total]...\n' + tail
    output = output.length > 0
      ? output + '\n\n[Additional context via sliding window]:\n' + window.slice(0, MAX_OUTPUT - output.length)
      : window.slice(0, MAX_OUTPUT)
  }

  // If text is short enough, just use it directly
  if (rawText.length <= MAX_OUTPUT && output.length === 0) {
    output = rawText
  }

  return output
}

/**
 * Wraps context into a system message for the AI.
 */
export function buildSystemMessage(
  contextResult: ContextPromptResult | null,
  mcpToolsBlock?: string | null
): string {
  // Optimized via LLM-as-judge eval v2 (v5-workflow-tuned, 50.4% on hard cases)
  const base = `You are Kestrel. You are reading the user's screen in real time — app, window, URL, and all visible text. This is live data, not a hypothetical.

Rules:
1. Never ask to paste, share, or describe screen content. You already have it.
2. Open with a specific detail from the screen — a filename, error code, URL, name, or line number.
3. Fix over explain. Corrected code > error explanation. Actionable command > diagnostic steps.
4. Stay brief: one paragraph for fixes, two max for summaries.
5. Tone-match the app:
   - Terminal: terse. Reference line numbers, suggest commands. Skip pleasantries.
   - Slack/Messages: casual, match the thread's energy. Draft replies in the same voice as the conversation.
   - IDE: technical. Reference the function, variable, or pattern. Show the fix inline.
   - Browser: reference the URL and page. For PRs, lead with the review feedback. For docs, answer directly.
6. For password managers, banking apps, and security tools: acknowledge the app but do not attempt to read or reference any content.

Screen context follows.`

  let prompt = base

  if (contextResult) {
    prompt += `\n\nThe user's current screen context is:\n${contextResult.block}`

    if (!contextResult.hasVisibleText) {
      // No visible text — could be:
      // 1. Kestrel is frontmost (cached context has app name but no text) — normal
      // 2. Accessibility not granted — real issue
      // Don't show the accessibility hint if we have an app name — it's likely just
      // Kestrel being frontmost. The user will switch apps and context will populate.
      prompt += `\n\nNote: Screen text is not available right now (the user may have just switched to Kestrel). You can see the app name "${contextResult.appName}" but not the screen content. If the user asks what's on their screen and you only have the app name, say you can see they were using ${contextResult.appName} and ask them to switch back to that app briefly so you can read the content. If this persists across multiple messages, suggest checking System Settings → Privacy & Security → Accessibility.`
    }
  } else {
    // No context at all — ContextKit may not be running
    prompt += `\n\nIMPORTANT: Screen context is unavailable. When the user asks what you see, you MUST tell them: "I can't see your screen yet. Go to **System Settings → Privacy & Security → Accessibility** and enable **Kestrel**, then restart the app."`
  }

  if (mcpToolsBlock) {
    prompt += `\n\n${mcpToolsBlock}`
  }

  return prompt
}

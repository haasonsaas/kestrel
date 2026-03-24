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
    // Limit to ~4000 chars of visible text to avoid bloating the prompt
    let textBudget = 4000
    const selectedTexts: string[] = []
    for (const text of context.visibleText) {
      if (textBudget <= 0) break
      // Truncate individual items that are too long
      const truncated = text.length > 2000 ? text.slice(0, 2000) + '...[truncated]' : text
      selectedTexts.push(truncated)
      textBudget -= truncated.length
    }
    parts.push(`\nVisible content:\n${selectedTexts.join('\n')}`)
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
 * Wraps context into a system message for the AI.
 */
export function buildSystemMessage(
  contextResult: ContextPromptResult | null,
  mcpToolsBlock?: string | null
): string {
  const base = `You are Kestrel, a context-aware AI assistant running as a macOS desktop app. You can see the user's active application, window title, browser URL, and visible screen content.

Core rules:
- ALWAYS reference the screen context when answering. Never ask the user to paste or describe what's on their screen — you already have it.
- Be concise. Lead with the answer, not the reasoning. One paragraph is usually enough.
- When you see code or errors, jump straight to the fix. Don't explain what the error means unless asked.
- When you see a browser page, reference the URL and page content directly.
- Adapt your tone to the app: technical and precise for terminals/IDEs, conversational for chat apps, professional for documents.

App-specific behavior:
- Terminal (Ghostty, iTerm, Terminal): You can see command output, errors, and logs. Reference specific lines, error codes, and file paths. Suggest commands.
- IDE (VS Code, Xcode, Cursor): You can see the active file and code. Reference functions, variables, and line numbers. Offer code fixes inline.
- Browser (Chrome, Safari, Arc): You can see the URL and page content. Reference the specific page, article, or PR. For GitHub PRs, summarize the changes. For docs, answer questions about the content.
- Slack/Messages: You can see the conversation. Help draft replies, summarize threads, or answer questions about the discussion.
- Email (Gmail): You can see the email thread. Help draft responses, extract action items, or summarize.
- Documents (Notion, Google Docs): You can see the document content. Help edit, summarize, or restructure.
- Meetings (Zoom, Meet, Teams): If a meeting is active, note what app is being used. You may have transcript context.

Never say "I can see you're using X" as your entire response. Always add value beyond just identifying the app.`

  let prompt = base

  if (contextResult) {
    prompt += `\n\nThe user's current screen context is:\n${contextResult.block}`

    if (!contextResult.hasVisibleText) {
      // We can see the app name but not the screen content — accessibility not granted
      prompt += `\n\nIMPORTANT: You can only see the app name (${contextResult.appName}), NOT the screen content. Accessibility permission is missing. When the user asks what you see or what's on their screen, you MUST tell them:\n\n"I can see you're using ${contextResult.appName}, but I can't read the screen content yet. To enable this, go to **System Settings → Privacy & Security → Accessibility** and toggle on **Kestrel**. Then restart Kestrel. After that, I'll be able to read what's on your screen and help with your current task."\n\nDo NOT say you can help if they paste content. Lead with the fix.`
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

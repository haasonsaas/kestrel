import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: unknown
  }
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string, toolCalls: ToolCall[]) => void
  onError: (error: string) => void
}

function getApiKey(): string | null {
  const db = getDatabase()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'openrouter_api_key')).get()
  return row ? JSON.parse(row.value) : null
}

export async function chatCompletion(
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('OpenRouter API key not configured. Set it in Settings > API Keys.')

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://kestrel.app',
      'X-Title': 'Kestrel'
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * Stream a chat completion, accumulating both text content and tool calls.
 *
 * Tool calls arrive incrementally in the SSE stream as `delta.tool_calls` entries.
 * Each tool call chunk has an `index` (position in the array) and may contain:
 *   - `id` + `type` + `function.name` on the first chunk for that index
 *   - `function.arguments` (partial JSON string) on subsequent chunks
 *
 * We accumulate these into a complete ToolCall[] array and pass them to onDone.
 */
export async function chatCompletionStream(
  messages: ChatMessage[],
  model: string,
  callbacks: StreamCallbacks,
  tools?: OpenAITool[]
): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    callbacks.onError('OpenRouter API key not configured. Set it in Settings > API Keys.')
    return
  }

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true
    }

    if (tools && tools.length > 0) {
      body.tools = tools
      // Let the model decide whether to use tools or respond directly
      body.tool_choice = 'auto'
    }

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://kestrel.app',
        'X-Title': 'Kestrel'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const err = await response.text()
      callbacks.onError(`OpenRouter API error (${response.status}): ${err}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError('No response body')
      return
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    // Accumulate tool calls by index
    const toolCallAccumulator = new Map<number, {
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          const toolCalls = buildToolCallsArray(toolCallAccumulator)
          callbacks.onDone(fullText, toolCalls)
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta

          // Accumulate text content
          if (delta?.content) {
            fullText += delta.content
            callbacks.onChunk(delta.content)
          }

          // Accumulate tool calls
          if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx: number = tc.index ?? 0
              if (!toolCallAccumulator.has(idx)) {
                // First chunk for this tool call — initialize
                toolCallAccumulator.set(idx, {
                  id: tc.id || '',
                  type: 'function',
                  function: {
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || ''
                  }
                })
              } else {
                // Subsequent chunk — append data
                const existing = toolCallAccumulator.get(idx)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
              }
            }
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Stream ended without [DONE] — still report what we have
    const toolCalls = buildToolCallsArray(toolCallAccumulator)
    callbacks.onDone(fullText, toolCalls)
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : String(err))
  }
}

/** Convert the accumulator map to a sorted array of ToolCall objects. */
function buildToolCallsArray(
  accumulator: Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }>
): ToolCall[] {
  if (accumulator.size === 0) return []
  return Array.from(accumulator.entries())
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => tc)
}

// Frontier models available on OpenRouter (March 2026)
export const AVAILABLE_MODELS = [
  // OpenAI (default model first — see shared/config.ts)
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI', contextWindow: 1050000 },
  { id: 'openai/gpt-5.4-pro', name: 'GPT-5.4 Pro', provider: 'OpenAI', contextWindow: 1050000 },
  // Anthropic
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', contextWindow: 1000000 },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic', contextWindow: 1000000 },
  // OpenAI (older)
  { id: 'openai/gpt-5.2-pro', name: 'GPT-5.2 Pro', provider: 'OpenAI', contextWindow: 400000 },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI', contextWindow: 400000 },
  // Google
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'Google', contextWindow: 1048576 },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'Google', contextWindow: 1048576 },
  // xAI
  { id: 'x-ai/grok-4.20-beta', name: 'Grok 4.20', provider: 'xAI', contextWindow: 2000000 },
  // Mistral
  { id: 'mistralai/mistral-small-2603', name: 'Mistral Small 4', provider: 'Mistral', contextWindow: 262144 },
  { id: 'mistralai/devstral-2512', name: 'Devstral 2', provider: 'Mistral', contextWindow: 262144 },
  // Qwen
  { id: 'qwen/qwen3.5-plus-02-15', name: 'Qwen 3.5 Plus', provider: 'Alibaba', contextWindow: 1000000 },
  { id: 'qwen/qwen3-max-thinking', name: 'Qwen 3 Max Thinking', provider: 'Alibaba', contextWindow: 262144 },
  // Xiaomi
  { id: 'xiaomi/mimo-v2-pro', name: 'MiMo V2 Pro', provider: 'Xiaomi', contextWindow: 1048576 },
  // Others
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', provider: 'Moonshot', contextWindow: 262144 },
  { id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5', provider: 'MiniMax', contextWindow: 196608 },
  { id: 'z-ai/glm-5', name: 'GLM 5', provider: 'Z.ai', contextWindow: 80000 }
]

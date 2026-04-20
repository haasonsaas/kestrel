import { getEvalOpsBearerToken, getStoredEvalOpsSession } from '../evalops/auth'
import { getEvalOpsConfig, type EvalOpsProviderRef } from '../evalops/config'

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

interface GatewayRequestConfig {
  url: string
  headers: Record<string, string>
  providerRef: Record<string, string>
  metadata: Record<string, unknown>
}

export async function chatCompletion(
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const gateway = await getGatewayRequestConfig()
  const response = await fetch(gateway.url, {
    method: 'POST',
    headers: gateway.headers,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      provider_ref: gateway.providerRef,
      metadata: gateway.metadata
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`EvalOps LLM Gateway error (${response.status}): ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * Stream a chat completion, accumulating both text content and tool calls.
 *
 * EvalOps LLM Gateway exposes an OpenAI-compatible chat-completions surface at
 * /v1/chat/completions and handles provider credential resolution via
 * provider_ref. Tool calls still arrive as OpenAI-compatible SSE deltas.
 */
export async function chatCompletionStream(
  messages: ChatMessage[],
  model: string,
  callbacks: StreamCallbacks,
  tools?: OpenAITool[]
): Promise<void> {
  try {
    const gateway = await getGatewayRequestConfig()
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      provider_ref: gateway.providerRef,
      metadata: gateway.metadata
    }

    if (tools && tools.length > 0) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    const response = await fetch(gateway.url, {
      method: 'POST',
      headers: gateway.headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const err = await response.text()
      callbacks.onError(`EvalOps LLM Gateway error (${response.status}): ${err}`)
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
          callbacks.onDone(fullText, buildToolCallsArray(toolCallAccumulator))
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta

          if (delta?.content) {
            fullText += delta.content
            callbacks.onChunk(delta.content)
          }

          if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx: number = tc.index ?? 0
              if (!toolCallAccumulator.has(idx)) {
                toolCallAccumulator.set(idx, {
                  id: tc.id || '',
                  type: 'function',
                  function: {
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || ''
                  }
                })
              } else {
                const existing = toolCallAccumulator.get(idx)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
              }
            }
          }
        } catch {
          // Skip malformed SSE chunks and keep reading the stream.
        }
      }
    }

    callbacks.onDone(fullText, buildToolCallsArray(toolCallAccumulator))
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : String(err))
  }
}

async function getGatewayRequestConfig(): Promise<GatewayRequestConfig> {
  const token = await getEvalOpsBearerToken()
  const config = getEvalOpsConfig()
  const session = getStoredEvalOpsSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }

  if (session?.organizationId) {
    headers['X-Organization-ID'] = session.organizationId
  }

  return {
    url: `${config.llmGatewayBaseUrl.replace(/\/+$/, '')}/chat/completions`,
    headers,
    providerRef: providerRefPayload(config.providerRef),
    metadata: {
      surface: 'kestrel',
      agent_id: config.agentId,
      organization_id: session?.organizationId,
      workspace_id: config.workspaceId
    }
  }
}

function providerRefPayload(providerRef: EvalOpsProviderRef): Record<string, string> {
  const payload: Record<string, string> = {
    provider: providerRef.provider,
    environment: providerRef.environment
  }
  if (providerRef.credentialName) payload.credential_name = providerRef.credentialName
  if (providerRef.teamId) payload.team_id = providerRef.teamId
  return payload
}

function buildToolCallsArray(
  accumulator: Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }>
): ToolCall[] {
  if (accumulator.size === 0) return []
  return Array.from(accumulator.entries())
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => tc)
}

// Models exposed through the EvalOps LLM Gateway. The gateway owns provider
// credential resolution and policy through the configured provider_ref.
export const AVAILABLE_MODELS = [
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI via EvalOps', contextWindow: 1050000 },
  { id: 'openai/gpt-5.4-pro', name: 'GPT-5.4 Pro', provider: 'OpenAI via EvalOps', contextWindow: 1050000 },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'Anthropic via EvalOps', contextWindow: 1000000 },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic via EvalOps', contextWindow: 1000000 },
  { id: 'openai/gpt-5.2-pro', name: 'GPT-5.2 Pro', provider: 'OpenAI via EvalOps', contextWindow: 400000 },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI via EvalOps', contextWindow: 400000 },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'Google via EvalOps', contextWindow: 1048576 },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'Google via EvalOps', contextWindow: 1048576 },
  { id: 'x-ai/grok-4.20-beta', name: 'Grok 4.20', provider: 'xAI via EvalOps', contextWindow: 2000000 },
  { id: 'mistralai/mistral-small-2603', name: 'Mistral Small 4', provider: 'Mistral via EvalOps', contextWindow: 262144 },
  { id: 'mistralai/devstral-2512', name: 'Devstral 2', provider: 'Mistral via EvalOps', contextWindow: 262144 },
  { id: 'qwen/qwen3.5-plus-02-15', name: 'Qwen 3.5 Plus', provider: 'Alibaba via EvalOps', contextWindow: 1000000 },
  { id: 'qwen/qwen3-max-thinking', name: 'Qwen 3 Max Thinking', provider: 'Alibaba via EvalOps', contextWindow: 262144 },
  { id: 'xiaomi/mimo-v2-pro', name: 'MiMo V2 Pro', provider: 'Xiaomi via EvalOps', contextWindow: 1048576 },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', provider: 'Moonshot via EvalOps', contextWindow: 262144 },
  { id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5', provider: 'MiniMax via EvalOps', contextWindow: 196608 },
  { id: 'z-ai/glm-5', name: 'GLM 5', provider: 'Z.ai via EvalOps', contextWindow: 80000 }
]

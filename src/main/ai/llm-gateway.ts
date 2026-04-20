import { getEvalOpsBearerToken, getStoredEvalOpsSession } from '../evalops/auth'
import { getEvalOpsConfig, type EvalOpsProviderRef } from '../evalops/config'
import { WideEvent, type Outcome } from '../observability/wide-event'

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

interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
}

interface LlmUsageEventInput {
  gateway: GatewayRequestConfig
  model: string
  resolvedModel?: string
  messages: ChatMessage[]
  tools?: OpenAITool[]
  outputText: string
  usage?: TokenUsage | null
  latencyMs: number
  stream: boolean
  outcome: Outcome
  error?: string
  requestId?: string
}

const TOKENS_PER_CHAR_ESTIMATE = 0.25

const MODEL_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-5.4': { input: 2.5, output: 15 },
  'claude-sonnet-4.6': { input: 3, output: 15 },
  'claude-opus-4.6': { input: 5, output: 25 },
  'gemini-3.1-pro': { input: 2, output: 12 }
}

export async function chatCompletion(
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const gateway = await getGatewayRequestConfig()
  const startedAt = Date.now()

  try {
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
      const errorMessage = `EvalOps LLM Gateway error (${response.status}): ${err}`
      emitLlmUsageEvent({
        gateway,
        model,
        messages,
        outputText: '',
        latencyMs: Date.now() - startedAt,
        stream: false,
        outcome: 'error',
        error: errorMessage
      })
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const outputText = data.choices?.[0]?.message?.content || ''
    emitLlmUsageEvent({
      gateway,
      model,
      resolvedModel: typeof data.model === 'string' ? data.model : undefined,
      messages,
      outputText,
      usage: parseGatewayUsage(data.usage),
      latencyMs: Date.now() - startedAt,
      stream: false,
      outcome: 'success',
      requestId: typeof data.id === 'string' ? data.id : undefined
    })
    return outputText
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('EvalOps LLM Gateway error')) {
      throw err
    }

    emitLlmUsageEvent({
      gateway,
      model,
      messages,
      outputText: '',
      latencyMs: Date.now() - startedAt,
      stream: false,
      outcome: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
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
  const startedAt = Date.now()
  let gateway: GatewayRequestConfig | undefined
  let usage: TokenUsage | null = null
  let resolvedModel: string | undefined
  let requestId: string | undefined
  let fullText = ''
  let usageEventEmitted = false

  const emitUsageOnce = (outcome: Outcome, error?: string): void => {
    if (usageEventEmitted || !gateway) return
    usageEventEmitted = true
    emitLlmUsageEvent({
      gateway,
      model,
      resolvedModel,
      messages,
      tools,
      outputText: fullText,
      usage,
      latencyMs: Date.now() - startedAt,
      stream: true,
      outcome,
      error,
      requestId
    })
  }

  try {
    gateway = await getGatewayRequestConfig()
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
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
      const errorMessage = `EvalOps LLM Gateway error (${response.status}): ${err}`
      emitUsageOnce('error', errorMessage)
      callbacks.onError(errorMessage)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      emitUsageOnce('error', 'No response body')
      callbacks.onError('No response body')
      return
    }

    const decoder = new TextDecoder()
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
          emitUsageOnce('success')
          callbacks.onDone(fullText, buildToolCallsArray(toolCallAccumulator))
          return
        }

        try {
          const parsed = JSON.parse(data)
          if (typeof parsed.id === 'string' && !requestId) requestId = parsed.id
          if (typeof parsed.model === 'string') resolvedModel = parsed.model
          usage = mergeGatewayUsage(usage, parseGatewayUsage(parsed.usage))

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

    emitUsageOnce('success')
    callbacks.onDone(fullText, buildToolCallsArray(toolCallAccumulator))
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    emitUsageOnce('error', errorMessage)
    callbacks.onError(errorMessage)
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

function parseGatewayUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== 'object') return null
  const record = usage as Record<string, unknown>
  return {
    inputTokens: firstFiniteNumber(record.input_tokens, record.prompt_tokens),
    outputTokens: firstFiniteNumber(record.output_tokens, record.completion_tokens),
    totalTokens: firstFiniteNumber(record.total_tokens),
    costUsd: firstFiniteNumber(record.total_cost_usd, record.cost_usd, record.total_cost, record.cost)
  }
}

function mergeGatewayUsage(current: TokenUsage | null, next: TokenUsage | null): TokenUsage | null {
  if (!current) return next
  if (!next) return current
  return {
    inputTokens: next.inputTokens ?? current.inputTokens,
    outputTokens: next.outputTokens ?? current.outputTokens,
    totalTokens: next.totalTokens ?? current.totalTokens,
    costUsd: next.costUsd ?? current.costUsd
  }
}

function emitLlmUsageEvent(input: LlmUsageEventInput): void {
  const resolvedModel = input.resolvedModel || input.model
  const inputTokens = input.usage?.inputTokens ?? estimateInputTokens(input.messages, input.tools)
  const outputTokens = input.usage?.outputTokens ?? estimateOutputTokens(input.outputText)
  const totalTokens = input.usage?.totalTokens ?? inputTokens + outputTokens
  const cost = input.usage?.costUsd != null
    ? { amount: roundUsd(input.usage.costUsd), source: 'gateway' }
    : estimateCostUsd(resolvedModel, inputTokens, outputTokens)
  const provider = input.gateway.providerRef.provider || providerFromModel(resolvedModel)
  const event = WideEvent.start('llm_usage', {
    started_at: Date.now() - input.latencyMs,
    model: resolvedModel,
    provider,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    latency_ms: input.latencyMs,
    cost_estimate: cost.amount,
    cost_estimate_source: cost.source,
    usage_reported: Boolean(input.usage?.inputTokens != null || input.usage?.outputTokens != null),
    stream: input.stream,
    surface: stringField(input.gateway.metadata.surface),
    agent_id: stringField(input.gateway.metadata.agent_id),
    organization_id: stringField(input.gateway.metadata.organization_id),
    workspace_id: stringField(input.gateway.metadata.workspace_id),
    request_id: input.requestId ?? null
  })

  event.finish({ outcome: input.outcome, error: input.error })
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isFinite(numberValue)) return numberValue
  }
  return undefined
}

function estimateInputTokens(messages: ChatMessage[], tools?: OpenAITool[]): number {
  const messageText = messages.map((message) => {
    const toolCalls = message.tool_calls?.map((toolCall) => `${toolCall.function.name}:${toolCall.function.arguments}`).join('\n') ?? ''
    return [message.role, message.content ?? '', message.tool_call_id ?? '', toolCalls].join('\n')
  }).join('\n')
  const toolsText = tools?.map((tool) => `${tool.function.name}:${tool.function.description}:${JSON.stringify(tool.function.parameters)}`).join('\n') ?? ''
  return estimateTokens(`${messageText}\n${toolsText}`)
}

function estimateOutputTokens(outputText: string): number {
  return estimateTokens(outputText)
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length * TOKENS_PER_CHAR_ESTIMATE))
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): { amount: number; source: string } {
  const pricing = MODEL_PRICING_USD_PER_MILLION[normalizeModelForPricing(model)]
  if (!pricing) return { amount: 0, source: 'unpriced' }
  return {
    amount: roundUsd((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000),
    source: 'estimated'
  }
}

function normalizeModelForPricing(model: string): string {
  const withoutProvider = model.toLowerCase().trim().split('/').pop() || model.toLowerCase().trim()
  return withoutProvider.replace(/-preview.*$/, '')
}

function providerFromModel(model: string): string {
  return model.includes('/') ? model.split('/')[0] : 'evalops'
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
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

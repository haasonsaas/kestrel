import { v4 as uuid } from 'uuid'
import { getEvalOpsConfig } from './config'
import { getEvalOpsConsumerClient } from './consumer'
import { getStoredEvalOpsSession } from './auth'
import type {
  EvalOpsIngestSpansRequest,
  EvalOpsIngestSpansResponse,
  EvalOpsAnnotateTraceQualityRequest,
  EvalOpsAnnotateTraceQualityResponse,
  EvalOpsDeleteMemoryRequest,
  EvalOpsDeleteMemoryResponse,
  EvalOpsListApprovalsRequest,
  EvalOpsListApprovalsResponse,
  EvalOpsListAgentsRequest,
  EvalOpsListAgentsResponse,
  EvalOpsListMemoryRequest,
  EvalOpsListMemoryResponse,
  EvalOpsListSkillsRequest,
  EvalOpsListSkillsResponse,
  EvalOpsListTracesRequest,
  EvalOpsListTracesResponse,
  EvalOpsRecallMemoryRequest,
  EvalOpsRecallMemoryResponse,
  EvalOpsRecordArenaTraceRequest,
  EvalOpsRecordArenaTraceResponse,
  EvalOpsRecordArenaVoteRequest,
  EvalOpsSearchSkillsRequest,
  EvalOpsServiceStatus,
  EvalOpsStoreMemoryRequest,
  EvalOpsStoreMemoryResponse,
  EvalOpsTraceQualityAnnotation,
  EvalOpsTraceSpan
} from '../../shared/ipc'

const TOKENS_PER_CHAR_ESTIMATE = 0.25

const MODEL_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-5.4': { input: 2.5, output: 15 },
  'claude-sonnet-4.6': { input: 3, output: 15 },
  'claude-opus-4.6': { input: 5, output: 25 },
  'gemini-3.1-pro': { input: 2, output: 12 }
}

export async function listEvalOpsAgents(request: EvalOpsListAgentsRequest = {}): Promise<EvalOpsListAgentsResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.agentRegistry.list({
    workspaceId: request.workspaceId ?? config.workspaceId,
    agentType: request.agentType,
    capability: request.capability,
    surface: request.surface,
    status: request.status,
    limit: request.limit ?? 50,
    offset: request.offset ?? 0
  })
}

export async function listEvalOpsSkills(request: EvalOpsListSkillsRequest = {}): Promise<EvalOpsListSkillsResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.skills.list({
    workspaceId: request.workspaceId ?? config.workspaceId,
    scope: request.scope,
    limit: request.limit ?? 50,
    offset: request.offset ?? 0
  })
}

export async function searchEvalOpsSkills(request: EvalOpsSearchSkillsRequest): Promise<EvalOpsListSkillsResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.skills.search({
    workspaceId: request.workspaceId ?? config.workspaceId,
    query: request.query,
    scope: request.scope,
    tags: request.tags,
    limit: request.limit ?? 50,
    offset: request.offset ?? 0
  })
}

export async function recallEvalOpsMemory(request: EvalOpsRecallMemoryRequest): Promise<EvalOpsRecallMemoryResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.memory.recall({
    query: request.query,
    scope: request.scope ?? 'SCOPE_USER',
    topK: request.topK ?? 8,
    minSimilarity: request.minSimilarity,
    projectId: request.projectId,
    teamId: request.teamId,
    repository: request.repository,
    agent: request.agent,
    type: request.type,
    agentId: request.agentId ?? config.agentId,
    userId: request.userId,
    reviewStatus: request.reviewStatus
  })
}

export async function storeEvalOpsMemory(request: EvalOpsStoreMemoryRequest): Promise<EvalOpsStoreMemoryResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.memory.store({
    id: request.id,
    scope: request.scope ?? 'SCOPE_USER',
    content: request.content,
    type: request.type,
    source: request.source ?? 'kestrel',
    confidence: request.confidence,
    projectId: request.projectId,
    teamId: request.teamId,
    repository: request.repository,
    agent: request.agent,
    agentId: request.agentId ?? config.agentId,
    userId: request.userId,
    tags: request.tags,
    pinned: request.pinned,
    isPolicy: request.isPolicy
  })
}

export async function listEvalOpsMemory(request: EvalOpsListMemoryRequest = {}): Promise<EvalOpsListMemoryResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.memory.list({
    scope: request.scope ?? 'SCOPE_USER',
    projectId: request.projectId,
    teamId: request.teamId,
    repository: request.repository,
    agent: request.agent,
    type: request.type,
    agentId: request.agentId ?? config.agentId,
    limit: request.limit ?? 100,
    offset: request.offset ?? 0
  })
}

export async function deleteEvalOpsMemory(request: EvalOpsDeleteMemoryRequest): Promise<EvalOpsDeleteMemoryResponse> {
  const client = await getEvalOpsConsumerClient()
  return client.memory.deleteMemory({ id: request.id })
}

export async function listEvalOpsApprovals(request: EvalOpsListApprovalsRequest = {}): Promise<EvalOpsListApprovalsResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.approvals.listPending({
    workspaceId: request.workspaceId ?? config.workspaceId,
    limit: request.limit ?? 50,
    offset: request.offset ?? 0
  })
}

export async function listEvalOpsTraces(request: EvalOpsListTracesRequest = {}): Promise<EvalOpsListTracesResponse> {
  const config = getEvalOpsConfig()
  const client = await getEvalOpsConsumerClient()
  return client.traces.listTraces({
    workspaceId: request.workspaceId ?? config.workspaceId,
    agentId: request.agentId,
    surface: request.surface,
    startTime: request.startTime,
    endTime: request.endTime,
    limit: request.limit ?? 50,
    offset: request.offset ?? 0
  })
}

export async function ingestEvalOpsSpans(request: EvalOpsIngestSpansRequest): Promise<EvalOpsIngestSpansResponse> {
  const client = await getEvalOpsConsumerClient()
  return client.traces.ingestSpans(request)
}

export async function annotateEvalOpsTraceQuality(
  request: EvalOpsAnnotateTraceQualityRequest
): Promise<EvalOpsAnnotateTraceQualityResponse> {
  const client = await getEvalOpsConsumerClient()
  return client.traces.annotateTraceQuality(request)
}

export async function getEvalOpsServicesStatus(): Promise<EvalOpsServiceStatus[]> {
  const config = getEvalOpsConfig()
  const checks: Array<{
    service: EvalOpsServiceStatus['service']
    baseUrl: string
    run: () => Promise<unknown>
  }> = [
    { service: 'agent-registry', baseUrl: config.agentRegistryBaseUrl, run: () => listEvalOpsAgents({ limit: 1 }) },
    { service: 'skills', baseUrl: config.skillsBaseUrl, run: () => listEvalOpsSkills({ limit: 1 }) },
    { service: 'memory', baseUrl: config.memoryBaseUrl, run: () => recallEvalOpsMemory({ query: 'kestrel', topK: 1 }) },
    { service: 'approvals', baseUrl: config.approvalsBaseUrl, run: () => listEvalOpsApprovals({ limit: 1 }) },
    { service: 'traces', baseUrl: config.tracesBaseUrl, run: () => listEvalOpsTraces({ limit: 1 }) }
  ]

  return Promise.all(checks.map(async (check) => {
    try {
      await check.run()
      return { service: check.service, baseUrl: check.baseUrl, ok: true }
    } catch (err) {
      return {
        service: check.service,
        baseUrl: check.baseUrl,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }))
}

export async function recordEvalOpsChatTrace(input: {
  threadId: string
  model: string
  status: 'SPAN_STATUS_OK' | 'SPAN_STATUS_ERROR'
  startedAt: Date
  endedAt: Date
  latencyMs: number
  error?: string
}): Promise<void> {
  const config = getEvalOpsConfig()
  const session = getStoredEvalOpsSession()
  if (!session?.organizationId) return
  const span: EvalOpsTraceSpan = {
    traceId: uuid(),
    spanId: uuid(),
    workspaceId: config.workspaceId,
    organizationId: session?.organizationId,
    agentId: config.agentId,
    surface: 'kestrel',
    name: 'chat.stream',
    kind: 'llm',
    model: input.model,
    provider: 'evalops',
    latencyMs: input.latencyMs,
    status: input.status,
    attributes: cleanRecord({
      threadId: input.threadId,
      error: input.error
    }),
    startedAt: input.startedAt.toISOString(),
    endedAt: input.endedAt.toISOString()
  }

  await ingestEvalOpsSpans({ spans: [span] })
}

export async function recordEvalOpsArenaTrace(
  input: EvalOpsRecordArenaTraceRequest
): Promise<EvalOpsRecordArenaTraceResponse> {
  const config = getEvalOpsConfig()
  const session = getStoredEvalOpsSession()
  if (!config.token && !session) {
    return {
      traceId: input.traceId,
      ingestedCount: 0,
      annotations: [],
      offline: true,
      reason: 'EvalOps authentication required. Sign in from Settings > EvalOps.'
    }
  }

  const promptTokens = estimateTokens(input.prompt)
  const rootSpan: EvalOpsTraceSpan = {
    traceId: input.traceId,
    spanId: input.rootSpanId,
    workspaceId: config.workspaceId,
    organizationId: session?.organizationId,
    agentId: config.agentId,
    surface: 'kestrel',
    name: 'arena.run',
    kind: 'arena',
    tokenInput: promptTokens,
    tokenOutput: input.responses.reduce((total, response) => total + estimateTokens(response.content ?? ''), 0),
    latencyMs: durationMs(input.createdAt, input.completedAt),
    status: input.responses.some((response) => response.error) ? 'SPAN_STATUS_ERROR' : 'SPAN_STATUS_OK',
    attributes: cleanRecord({
      arenaSessionId: input.sessionId,
      responseCount: input.responses.length,
      promptChars: input.prompt.length
    }),
    startedAt: input.createdAt,
    endedAt: input.completedAt
  }

  const spans = [
    rootSpan,
    ...input.responses.map((response, index): EvalOpsTraceSpan => {
      const outputTokens = estimateTokens(response.content ?? '')
      const costUsd = estimateModelCostUsd(response.model, promptTokens, outputTokens)
      return {
        traceId: input.traceId,
        spanId: response.spanId,
        parentSpanId: input.rootSpanId,
        workspaceId: config.workspaceId,
        organizationId: session?.organizationId,
        agentId: config.agentId,
        surface: 'kestrel',
        name: 'arena.model_response',
        kind: 'llm',
        model: response.model,
        provider: providerFromModel(response.model),
        tokenInput: promptTokens,
        tokenOutput: outputTokens,
        latencyMs: response.latencyMs,
        status: response.error ? 'SPAN_STATUS_ERROR' : 'SPAN_STATUS_OK',
        costUsd,
        attributes: cleanRecord({
          arenaSessionId: input.sessionId,
          arenaResponseIndex: index,
          modelName: response.modelName,
          responseChars: response.content?.length ?? 0,
          error: response.error
        }),
        startedAt: response.startedAt ?? input.createdAt,
        endedAt: response.endedAt ?? input.completedAt
      }
    })
  ]

  const ingestResponse = await ingestEvalOpsSpans({ spans })
  const annotations = await Promise.all(
    input.responses.map((response) => annotateEvalOpsTraceQuality({
      annotation: buildArenaCompletionAnnotation(input, response)
    }))
  )

  return {
    traceId: input.traceId,
    ingestedCount: ingestResponse.ingestedCount,
    annotations
  }
}

export async function recordEvalOpsArenaVote(
  input: EvalOpsRecordArenaVoteRequest
): Promise<EvalOpsAnnotateTraceQualityResponse[]> {
  const config = getEvalOpsConfig()
  const session = getStoredEvalOpsSession()
  if (!config.token && !session) {
    return [{
      offline: true,
      reason: 'EvalOps authentication required. Sign in from Settings > EvalOps.'
    }]
  }

  return Promise.all(input.responses.map((response) => {
    const won = response.spanId === input.winnerSpanId
    const annotation: EvalOpsTraceQualityAnnotation = {
      traceId: input.traceId,
      spanId: response.spanId,
      compositeScore: won ? 1 : 0,
      assertions: [{
        assertionId: 'arena_user_vote',
        name: 'Arena user vote',
        passed: won,
        score: won ? 1 : 0,
        reason: won ? 'arena_user_vote' : 'arena_user_vote_not_selected',
        metadata: cleanRecord({
          arenaSessionId: input.sessionId,
          winnerSpanId: input.winnerSpanId,
          model: response.model,
          modelName: response.modelName
        })
      }],
      qualityPerDollar: qualityPerDollar(won ? 1 : 0, estimateModelCostUsd(response.model, 0, estimateTokens(response.content ?? ''))),
      evalSuiteId: 'kestrel-arena-user-vote',
      scorer: 'kestrel.arena.vote',
      scoredAt: new Date().toISOString(),
      metadata: cleanRecord({
        arenaSessionId: input.sessionId,
        model: response.model,
        modelName: response.modelName,
        selected: won,
        responseChars: response.content?.length ?? 0
      })
    }
    return annotateEvalOpsTraceQuality({ annotation })
  }))
}

export async function recordEvalOpsTelemetryTrace(fields: {
  event_id: string
  event_type: string
  timestamp: string
  started_at: number
  finished_at?: number
  duration_ms?: number
  outcome?: string
  error?: string
  [key: string]: unknown
}): Promise<void> {
  const config = getEvalOpsConfig()
  const session = getStoredEvalOpsSession()
  if (!config.token && !session) return

  const status = fields.outcome === 'error' ? 'SPAN_STATUS_ERROR' : 'SPAN_STATUS_OK'
  const startedAt = Number.isFinite(fields.started_at) ? new Date(fields.started_at).toISOString() : fields.timestamp
  const endedAt = Number.isFinite(fields.finished_at) ? new Date(fields.finished_at).toISOString() : startedAt
  const span: EvalOpsTraceSpan = {
    traceId: uuid(),
    spanId: fields.event_id,
    workspaceId: config.workspaceId,
    organizationId: session?.organizationId,
    agentId: config.agentId,
    surface: 'kestrel',
    name: `wide_event.${fields.event_type}`,
    kind: 'telemetry',
    latencyMs: typeof fields.duration_ms === 'number' ? fields.duration_ms : undefined,
    status,
    attributes: telemetryAttributes(fields),
    startedAt,
    endedAt
  }

  await ingestEvalOpsSpans({ spans: [span] })
}

function telemetryAttributes(fields: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    if (key === 'event_id' || key === 'started_at' || key === 'finished_at') continue
    if (typeof value === 'string') {
      attributes[key] = value.length > 512 ? `${value.slice(0, 512)}...` : value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      attributes[key] = value
    }
  }
  return attributes
}

function buildArenaCompletionAnnotation(
  input: EvalOpsRecordArenaTraceRequest,
  response: EvalOpsRecordArenaTraceRequest['responses'][number]
): EvalOpsTraceQualityAnnotation {
  const responseChars = response.content?.length ?? 0
  const outputTokens = estimateTokens(response.content ?? '')
  const costUsd = estimateModelCostUsd(response.model, estimateTokens(input.prompt), outputTokens)
  const completed = !response.error && responseChars > 0
  const score = completed ? clampScore(0.55 + Math.min(responseChars, 4_000) / 10_000) : 0
  return {
    traceId: input.traceId,
    spanId: response.spanId,
    compositeScore: score,
    assertions: [{
      assertionId: 'arena_response_completed',
      name: 'Arena response completed',
      passed: completed,
      score,
      reason: completed ? 'arena_response_completed' : (response.error ? 'arena_response_error' : 'arena_response_empty'),
      metadata: cleanRecord({
        arenaSessionId: input.sessionId,
        model: response.model,
        responseChars
      })
    }],
    cost: costUsd > 0 ? { currencyCode: 'USD', amount: costUsd } : undefined,
    qualityPerDollar: qualityPerDollar(score, costUsd),
    evalSuiteId: 'kestrel-arena-comparison',
    scorer: 'kestrel.arena.completion',
    scoredAt: new Date().toISOString(),
    metadata: cleanRecord({
      arenaSessionId: input.sessionId,
      model: response.model,
      modelName: response.modelName,
      promptChars: input.prompt.length,
      responseChars,
      scoreSource: 'response_completion_heuristic',
      costSource: costUsd > 0 ? 'model_price_estimate' : 'unpriced'
    })
  }
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length * TOKENS_PER_CHAR_ESTIMATE))
}

function durationMs(start: string, end: string): number {
  const value = Date.parse(end) - Date.parse(start)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function estimateModelCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING_USD_PER_MILLION[normalizeModelForPricing(model)]
  if (!pricing) return 0
  return roundUsd((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000)
}

function normalizeModelForPricing(model: string): string {
  const parts = model.split('/')
  return parts[parts.length - 1] || model
}

function providerFromModel(model: string): string {
  return model.includes('/') ? model.split('/')[0] : 'evalops'
}

function qualityPerDollar(score: number, costUsd: number): number {
  if (costUsd <= 0) return 0
  return Math.round((score / costUsd) * 100) / 100
}

function clampScore(score: number): number {
  return Math.min(1, Math.max(0, Math.round(score * 100) / 100))
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function cleanRecord<T extends Record<string, unknown>>(record: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === '') continue
    result[key] = value
  }
  return result as T
}

import { v4 as uuid } from 'uuid'
import { getEvalOpsConfig } from './config'
import { evalOpsUnary } from './connect'
import { getStoredEvalOpsSession } from './auth'
import type {
  EvalOpsIngestSpansRequest,
  EvalOpsIngestSpansResponse,
  EvalOpsListAgentsRequest,
  EvalOpsListAgentsResponse,
  EvalOpsListSkillsRequest,
  EvalOpsListSkillsResponse,
  EvalOpsListTracesRequest,
  EvalOpsListTracesResponse,
  EvalOpsRecallMemoryRequest,
  EvalOpsRecallMemoryResponse,
  EvalOpsSearchSkillsRequest,
  EvalOpsServiceStatus,
  EvalOpsStoreMemoryRequest,
  EvalOpsStoreMemoryResponse,
  EvalOpsTraceSpan
} from '../../shared/ipc'

const AGENT_SERVICE = 'agents.v1.AgentService'
const SKILL_SERVICE = 'skills.v1.SkillService'
const MEMORY_SERVICE = 'memory.v1.MemoryService'
const TRACE_SERVICE = 'traces.v1.SpanIngestService'

export async function listEvalOpsAgents(request: EvalOpsListAgentsRequest = {}): Promise<EvalOpsListAgentsResponse> {
  const config = getEvalOpsConfig()
  return evalOpsUnary<EvalOpsListAgentsResponse>({
    baseUrl: config.agentRegistryBaseUrl,
    service: AGENT_SERVICE,
    method: 'List',
    body: cleanRecord({
      workspaceId: request.workspaceId,
      agentType: request.agentType,
      capability: request.capability,
      surface: request.surface,
      status: request.status,
      limit: request.limit ?? 50,
      offset: request.offset ?? 0
    })
  })
}

export async function listEvalOpsSkills(request: EvalOpsListSkillsRequest = {}): Promise<EvalOpsListSkillsResponse> {
  const config = getEvalOpsConfig()
  return evalOpsUnary<EvalOpsListSkillsResponse>({
    baseUrl: config.skillsBaseUrl,
    service: SKILL_SERVICE,
    method: 'List',
    body: cleanRecord({
      workspaceId: request.workspaceId ?? config.workspaceId,
      scope: request.scope,
      limit: request.limit ?? 50,
      offset: request.offset ?? 0
    })
  })
}

export async function searchEvalOpsSkills(request: EvalOpsSearchSkillsRequest): Promise<EvalOpsListSkillsResponse> {
  const config = getEvalOpsConfig()
  return evalOpsUnary<EvalOpsListSkillsResponse>({
    baseUrl: config.skillsBaseUrl,
    service: SKILL_SERVICE,
    method: 'Search',
    body: cleanRecord({
      workspaceId: request.workspaceId ?? config.workspaceId,
      query: request.query,
      scope: request.scope,
      tags: request.tags,
      limit: request.limit ?? 50,
      offset: request.offset ?? 0
    })
  })
}

export async function recallEvalOpsMemory(request: EvalOpsRecallMemoryRequest): Promise<EvalOpsRecallMemoryResponse> {
  const config = getEvalOpsConfig()
  return evalOpsUnary<EvalOpsRecallMemoryResponse>({
    baseUrl: config.memoryBaseUrl,
    service: MEMORY_SERVICE,
    method: 'Recall',
    body: cleanRecord({
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
  })
}

export async function storeEvalOpsMemory(request: EvalOpsStoreMemoryRequest): Promise<EvalOpsStoreMemoryResponse> {
  const config = getEvalOpsConfig()
  return evalOpsUnary<EvalOpsStoreMemoryResponse>({
    baseUrl: config.memoryBaseUrl,
    service: MEMORY_SERVICE,
    method: 'Store',
    body: cleanRecord({
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
  })
}

export async function listEvalOpsTraces(request: EvalOpsListTracesRequest = {}): Promise<EvalOpsListTracesResponse> {
  const config = getEvalOpsConfig()
  return evalOpsUnary<EvalOpsListTracesResponse>({
    baseUrl: config.tracesBaseUrl,
    service: TRACE_SERVICE,
    method: 'ListTraces',
    body: cleanRecord({
      workspaceId: request.workspaceId ?? config.workspaceId,
      agentId: request.agentId,
      surface: request.surface,
      startTime: request.startTime,
      endTime: request.endTime,
      limit: request.limit ?? 50,
      offset: request.offset ?? 0
    })
  })
}

export async function ingestEvalOpsSpans(request: EvalOpsIngestSpansRequest): Promise<EvalOpsIngestSpansResponse> {
  const config = getEvalOpsConfig()
  return evalOpsUnary<EvalOpsIngestSpansResponse>({
    baseUrl: config.tracesBaseUrl,
    service: TRACE_SERVICE,
    method: 'IngestSpans',
    body: request as unknown as Record<string, unknown>
  })
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

function cleanRecord<T extends Record<string, unknown>>(record: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === '') continue
    result[key] = value
  }
  return result as T
}

import type { EvalOpsTransport } from './http'
import type {
  AgentRegistryListRequest,
  AgentRegistryListResponse,
  AgentRegistryRecord,
  AgentRegistryRegisterRequest,
  ApprovalGetRequest,
  ApprovalGetResponse,
  ApprovalListPendingRequest,
  ApprovalListPendingResponse,
  ApprovalRequestApprovalRequest,
  ApprovalRequestApprovalResponse,
  IngestSpansRequest,
  IngestSpansResponse,
  JsonObject,
  JsonValue,
  MemoryRecallRequest,
  MemoryRecallResponse,
  MemoryRecord,
  MemoryStoreResponse,
  MeterWideEvent,
  SkillListRequest,
  SkillListResponse,
  SkillRecord,
  TraceListRequest,
  TraceListResponse
} from './types'

function offline(reason: string): { offline: true; reason: string } {
  return { offline: true, reason }
}

function noContent(reason: string): JsonObject {
  return offline(reason)
}

export class MeterClient {
  constructor(private readonly transport: EvalOpsTransport) {}

  ingestWideEvent(
    event: MeterWideEvent,
    options?: { signal?: AbortSignal }
  ): Promise<JsonObject> {
    return this.transport.request({
      service: 'meter',
      operation: 'ingestWideEvent',
      path: '/meter.v1.MeterService/IngestWideEvent',
      body: event,
      signal: options?.signal,
      fallback: noContent
    })
  }
}

export class MemoryClient {
  constructor(private readonly transport: EvalOpsTransport) {}

  recall(
    request: MemoryRecallRequest,
    options?: { signal?: AbortSignal }
  ): Promise<MemoryRecallResponse> {
    return this.transport.request({
      service: 'memory',
      operation: 'recall',
      path: '/memory.v1.MemoryService/Recall',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ results: [], ...offline(reason) })
    })
  }

  store(
    memory: MemoryRecord,
    options?: { signal?: AbortSignal }
  ): Promise<MemoryStoreResponse> {
    return this.transport.request({
      service: 'memory',
      operation: 'store',
      path: '/memory.v1.MemoryService/Store',
      body: memory,
      signal: options?.signal,
      fallback: (reason) => ({ ...offline(reason) })
    })
  }
}

export class ApprovalsClient {
  constructor(private readonly transport: EvalOpsTransport) {}

  requestApproval(
    request: ApprovalRequestApprovalRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ApprovalRequestApprovalResponse> {
    return this.transport.request({
      service: 'approvals',
      operation: 'requestApproval',
      path: '/approvals.v1.ApprovalService/RequestApproval',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ ...offline(reason) })
    })
  }

  getApproval(
    request: ApprovalGetRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ApprovalGetResponse> {
    return this.transport.request({
      service: 'approvals',
      operation: 'getApproval',
      path: '/approvals.v1.ApprovalService/GetApproval',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ ...offline(reason) })
    })
  }

  listPending(
    request: ApprovalListPendingRequest = {},
    options?: { signal?: AbortSignal }
  ): Promise<ApprovalListPendingResponse> {
    return this.transport.request({
      service: 'approvals',
      operation: 'listPending',
      path: '/approvals.v1.ApprovalService/ListPending',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ requests: [], total: 0, ...offline(reason) })
    })
  }
}

export class TracesClient {
  constructor(private readonly transport: EvalOpsTransport) {}

  listTraces(
    request: TraceListRequest = {},
    options?: { signal?: AbortSignal }
  ): Promise<TraceListResponse> {
    return this.transport.request({
      service: 'traces',
      operation: 'listTraces',
      path: '/traces.v1.SpanIngestService/ListTraces',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ traces: [], ...offline(reason) })
    })
  }

  ingestSpans(
    request: IngestSpansRequest,
    options?: { signal?: AbortSignal }
  ): Promise<IngestSpansResponse> {
    return this.transport.request({
      service: 'traces',
      operation: 'ingestSpans',
      path: '/traces.v1.SpanIngestService/IngestSpans',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ ingestedCount: 0, ...offline(reason) })
    })
  }
}

export class AgentRegistryClient {
  constructor(private readonly transport: EvalOpsTransport) {}

  list(
    request: AgentRegistryListRequest = {},
    options?: { signal?: AbortSignal }
  ): Promise<AgentRegistryListResponse> {
    return this.transport.request({
      service: 'agent-registry',
      operation: 'list',
      path: '/agents.v1.AgentService/List',
      body: normalizeAgentListRequest(request),
      signal: options?.signal,
      fallback: (reason) => ({ agents: [], total: 0, ...offline(reason) })
    })
  }

  register(
    agent: AgentRegistryRegisterRequest,
    options?: { signal?: AbortSignal }
  ): Promise<{ agent?: AgentRegistryRecord; offline?: boolean; reason?: string }> {
    return this.transport.request({
      service: 'agent-registry',
      operation: 'register',
      path: '/agents.v1.AgentService/Register',
      body: {
        workspaceId: agent.workspaceId,
        name: agent.name,
        description: agent.description,
        agentType: agent.agentType,
        capabilities: agent.capabilities,
        surfaces: agent.surfaces,
        ownerId: agent.ownerId
      },
      signal: options?.signal,
      fallback: (reason) => ({ ...offline(reason) })
    })
  }
}

function normalizeAgentListRequest(request: AgentRegistryListRequest): Record<string, unknown> {
  return {
    workspaceId: request.workspaceId,
    agentType: request.agentType,
    capability: request.capability,
    surface: request.surface,
    status: normalizeAgentStatus(request.status),
    limit: request.limit,
    offset: request.offset
  }
}

function normalizeAgentStatus(status: string | undefined): string | undefined {
  if (!status) return undefined
  const normalized = status.trim().toUpperCase().replace(/[-\s]+/gu, '_')
  if (!normalized) return undefined
  return normalized.startsWith('AGENT_STATUS_') ? normalized : `AGENT_STATUS_${normalized}`
}

export class SkillsClient {
  constructor(private readonly transport: EvalOpsTransport) {}

  list(
    request: SkillListRequest = {},
    options?: { signal?: AbortSignal }
  ): Promise<SkillListResponse> {
    return this.transport.request({
      service: 'skills',
      operation: 'list',
      path: '/skills.v1.SkillService/List',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ skills: [], total: 0, ...offline(reason) })
    })
  }

  search(
    request: SkillListRequest,
    options?: { signal?: AbortSignal }
  ): Promise<SkillListResponse> {
    return this.transport.request({
      service: 'skills',
      operation: 'search',
      path: '/skills.v1.SkillService/Search',
      body: request,
      signal: options?.signal,
      fallback: (reason) => ({ skills: [], total: 0, ...offline(reason) })
    })
  }

  get(
    skillId: string,
    options?: { signal?: AbortSignal }
  ): Promise<{ skill?: SkillRecord; offline?: boolean; reason?: string }> {
    return this.transport.request({
      service: 'skills',
      operation: 'get',
      path: '/skills.v1.SkillService/Get',
      body: { skillId },
      signal: options?.signal,
      fallback: (reason) => ({ ...offline(reason) })
    })
  }
}

export class ConnectorsClient {
  constructor(private readonly transport: EvalOpsTransport) {}

  request<TResponse>(
    path: string,
    body: JsonValue = {},
    options?: { operation?: string; signal?: AbortSignal }
  ): Promise<TResponse> {
    return this.transport.request({
      service: 'connectors',
      operation: options?.operation ?? 'request',
      path,
      body,
      signal: options?.signal
    })
  }
}

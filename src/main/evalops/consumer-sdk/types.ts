export type EvalOpsServiceName =
  | 'llm-gateway'
  | 'meter'
  | 'approvals'
  | 'memory'
  | 'traces'
  | 'agent-registry'
  | 'skills'
  | 'identity'
  | 'governance'
  | 'connectors'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue | undefined
}

export type FeatureFlagValue = boolean | string | number
export type FeatureFlags = Record<string, FeatureFlagValue>

export interface EvalOpsClientConfig {
  baseUrl?: string
  token?: string
  headers?: Record<string, string>
  featureFlags?: FeatureFlags
  offlineFallback?: boolean
  fetch?: typeof fetch
}

export interface EvalOpsClientMetrics {
  requests: number
  fallbacks: number
  fallbacksByService: Record<EvalOpsServiceName, number>
  lastFallback?: {
    service: EvalOpsServiceName
    operation: string
    reason: string
    at: string
  }
}

export interface OfflineFallbackMarker {
  offline: true
  reason: string
}

export interface AgentRegistryRecord extends JsonObject {
  id?: string
  workspaceId?: string
  name?: string
  description?: string
  agentType?: string
  capabilities?: string[]
  surfaces?: string[]
  status?: string
  activeConfigVersion?: number
  ownerId?: string
  version?: string
  labels?: Record<string, string>
}

export interface AgentRegistryListRequest extends JsonObject {
  workspaceId?: string
  agentType?: string
  capability?: string
  surface?: string
  status?: string
  limit?: number
  offset?: number
}

export interface AgentRegistryListResponse extends JsonObject {
  agents: AgentRegistryRecord[]
  total?: number
  offline?: boolean
  reason?: string
}

export interface SkillRecord extends JsonObject {
  id?: string
  workspaceId?: string
  ownerId?: string
  name?: string
  description?: string
  scope?: string
  content?: string
  currentVersion?: number
  tags?: string[]
}

export interface SkillListRequest extends JsonObject {
  workspaceId?: string
  scope?: string
  query?: string
  tags?: string[]
  limit?: number
  offset?: number
}

export interface SkillListResponse extends JsonObject {
  skills: SkillRecord[]
  total?: number
  offline?: boolean
  reason?: string
}

export interface MemoryRecord extends JsonObject {
  id?: string
  scope?: string
  content?: string
  type?: string
  source?: string
  confidence?: number
  pinned?: boolean
  workspaceId?: string
  userId?: string
  projectId?: string
  teamId?: string
  repository?: string
  agent?: string
  agentId?: string
  tags?: string[]
  isPolicy?: boolean
}

export interface MemoryRecallRequest extends JsonObject {
  query: string
  scope?: string
  topK?: number
  minSimilarity?: number
  projectId?: string
  teamId?: string
  repository?: string
  agent?: string
  type?: string
  agentId?: string
  userId?: string
  reviewStatus?: string
}

export interface MemoryRecallResponse extends JsonObject {
  results: Array<{ memory?: MemoryRecord; similarity?: number; graphDistance?: number }>
}

export interface MemoryStoreResponse extends JsonObject {
  memory?: MemoryRecord
}

export interface ApprovalRequestRecord extends JsonObject {
  id?: string
  workspaceId?: string
  approverUserId?: string
  agentId?: string
  surface?: string
  actionType?: string
  actionPayload?: string
  riskLevel?: string
  contextJson?: string
  createdAt?: string
  updatedAt?: string
  state?: string
  expiresAt?: string
}

export interface ApprovalListPendingRequest extends JsonObject {
  workspaceId?: string
  limit?: number
  offset?: number
}

export interface ApprovalListPendingResponse extends JsonObject {
  requests: ApprovalRequestRecord[]
  total?: number
  offline?: boolean
  reason?: string
}

export interface TraceSpan extends JsonObject {
  traceId: string
  spanId: string
  parentSpanId?: string
  workspaceId: string
  organizationId?: string
  agentId?: string
  surface?: string
  name: string
  kind?: string
  model?: string
  provider?: string
  tokenInput?: number
  tokenOutput?: number
  latencyMs?: number
  status?: string
  costUsd?: number
  attributes?: Record<string, unknown>
  startedAt?: string
  endedAt?: string
}

export interface IngestSpansRequest extends JsonObject {
  spans: TraceSpan[]
}

export interface IngestSpansResponse extends JsonObject {
  ingestedCount?: number
  traces?: unknown[]
}

export interface TraceListRequest extends JsonObject {
  workspaceId?: string
  agentId?: string
  surface?: string
  startTime?: string
  endTime?: string
  limit?: number
  offset?: number
}

export interface TraceListResponse extends JsonObject {
  traces: unknown[]
  total?: number
  hasMore?: boolean
}

export interface MeterWideEvent extends JsonObject {
  timestamp?: string
  teamId?: string
  agentId?: string
  surface?: string
  eventType: string
  model?: string
  provider?: string
  requestId?: string
  metadata?: Record<string, string>
  data?: JsonValue
  metrics?: JsonObject
}

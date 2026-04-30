export const KESTREL_SDK_NAME = '@evalops/kestrel-sdk'
export const EVALOPS_CONSUMER_KIT_NAME = '@evalops/kestrel-sdk/platform-consumer-kit'
export const DEFAULT_EVALOPS_LLM_GATEWAY_URL = 'https://llm-gateway.evalops.dev/v1'
export const DEFAULT_EVALOPS_BASE_URL = 'https://api.evalops.dev'

export interface EvalOpsServiceEndpoints {
  baseUrl?: string
  identityBaseUrl?: string
  agentRegistryBaseUrl?: string
  skillsBaseUrl?: string
  memoryBaseUrl?: string
  tracesBaseUrl?: string
  approvalsBaseUrl?: string
  promptsBaseUrl?: string
  llmGatewayBaseUrl?: string
}

export type EvalOpsConsumerServiceName =
  | 'agent-registry'
  | 'approvals'
  | 'identity'
  | 'llm-gateway'
  | 'memory'
  | 'prompts'
  | 'skills'
  | 'traces'

export interface EvalOpsProviderRef {
  provider: string
  environment: string
  credentialName?: string
  teamId?: string
}

export interface EvalOpsClientContext {
  organizationId: string
  workspaceId?: string
  agentId?: string
  providerRef?: EvalOpsProviderRef
}

export interface EvalOpsConsumerBootstrapInput {
  endpoints?: EvalOpsServiceEndpoints
  organizationId?: string
  workspaceId?: string
  agentId?: string
  token?: string
  featureFlags?: Record<string, boolean | string | number>
  headers?: Record<string, string | undefined>
  offlineFallback?: boolean
}

export interface EvalOpsConsumerClientConfig {
  baseUrl: string
  serviceBaseUrls: Partial<Record<EvalOpsConsumerServiceName, string>>
  token?: string
  headers: Record<string, string>
  featureFlags: Record<string, boolean | string | number>
  offlineFallback: boolean
}

export type EvalOpsConsumerCapability =
  | 'auth-session'
  | 'service-discovery'
  | 'agent-registration'
  | 'prompts'
  | 'memory-read'
  | 'memory-write'
  | 'approvals'
  | 'traces'
  | 'llm-gateway'
  | 'local-retry-queue'
  | 'deep-links'
  | 'offline-fallback'

export interface EvalOpsConsumerConformanceCheck {
  id: EvalOpsConsumerCapability
  label: string
  required: boolean
  evidence: string
}

export interface EvalOpsConsumerConformanceScore {
  passed: EvalOpsConsumerCapability[]
  missingRequired: EvalOpsConsumerCapability[]
  missingOptional: EvalOpsConsumerCapability[]
  complete: boolean
}

export const EVALOPS_CONSUMER_CONFORMANCE_CHECKS: readonly EvalOpsConsumerConformanceCheck[] = [
  {
    id: 'auth-session',
    label: 'OAuth/device session forwards organization identity',
    required: true,
    evidence: 'Send X-Organization-ID or X-EvalOps-Organization-ID on Platform calls.'
  },
  {
    id: 'service-discovery',
    label: 'Service endpoints are centralized and overrideable',
    required: true,
    evidence: 'Construct serviceBaseUrls from one config object or manifest.'
  },
  {
    id: 'agent-registration',
    label: 'Consumer registers a durable agent/profile identity',
    required: true,
    evidence: 'Call agents.v1.AgentService with stable workspace and agent IDs.'
  },
  {
    id: 'prompts',
    label: 'Prompt resolution uses Platform prompts',
    required: true,
    evidence: 'Resolve named prompts through prompts.v1 before local fallback.'
  },
  {
    id: 'memory-read',
    label: 'Memory recall is scoped by workspace/user/agent',
    required: true,
    evidence: 'Forward scoped recall requests rather than broad text search.'
  },
  {
    id: 'memory-write',
    label: 'Memory writes carry source, scope, and privacy intent',
    required: true,
    evidence: 'Store memories with source, scope, agent/user IDs, and review state when available.'
  },
  {
    id: 'approvals',
    label: 'Human decisions link to Platform approvals',
    required: true,
    evidence: 'List or resolve approvals through approvals.v1 instead of local-only state.'
  },
  {
    id: 'traces',
    label: 'Wide events and traces preserve correlation IDs',
    required: true,
    evidence: 'Emit trace/run/task IDs through traces.v1 or Meter wide events.'
  },
  {
    id: 'llm-gateway',
    label: 'Model calls route through EvalOps LLM Gateway',
    required: true,
    evidence: 'Use an EvalOps gateway base URL and provider_ref/default provider binding.'
  },
  {
    id: 'local-retry-queue',
    label: 'Offline writes use a bounded local retry queue',
    required: false,
    evidence: 'Persist retries locally with bounded backoff and explicit flush semantics.'
  },
  {
    id: 'deep-links',
    label: 'Platform resources can deep-link back into the consumer',
    required: false,
    evidence: 'Handle evalops:// links for agents, approvals, traces, or settings.'
  },
  {
    id: 'offline-fallback',
    label: 'Offline behavior is explicit and observable',
    required: false,
    evidence: 'Expose fallback markers, metrics, or status for unavailable Platform calls.'
  }
] as const

export function createProviderRef(provider: string, environment = 'prod'): EvalOpsProviderRef {
  return { provider, environment }
}

export function cleanEvalOpsHeaders(
  headers: Record<string, string | undefined>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const trimmed = value?.trim()
    if (trimmed) result[key] = trimmed
  }
  return result
}

export function buildEvalOpsConsumerHeaders(input: {
  organizationId?: string
  workspaceId?: string
  agentId?: string
  traceId?: string
  headers?: Record<string, string | undefined>
}): Record<string, string> {
  return cleanEvalOpsHeaders({
    'X-Organization-ID': input.organizationId,
    'X-EvalOps-Organization-ID': input.organizationId,
    'X-Workspace-ID': input.workspaceId,
    'X-EvalOps-Workspace-ID': input.workspaceId,
    'X-EvalOps-Agent-ID': input.agentId,
    'X-EvalOps-Trace-ID': input.traceId,
    ...input.headers
  })
}

export function buildEvalOpsServiceBaseUrls(
  endpoints: EvalOpsServiceEndpoints = {}
): Partial<Record<EvalOpsConsumerServiceName, string>> {
  return cleanEvalOpsServiceBaseUrls({
    'agent-registry': endpoints.agentRegistryBaseUrl,
    approvals: endpoints.approvalsBaseUrl,
    identity: endpoints.identityBaseUrl,
    'llm-gateway': endpoints.llmGatewayBaseUrl,
    memory: endpoints.memoryBaseUrl,
    prompts: endpoints.promptsBaseUrl,
    skills: endpoints.skillsBaseUrl,
    traces: endpoints.tracesBaseUrl
  })
}

export function buildEvalOpsConsumerClientConfig(
  input: EvalOpsConsumerBootstrapInput = {}
): EvalOpsConsumerClientConfig {
  const endpoints = input.endpoints ?? {}
  return {
    baseUrl: cleanUrl(endpoints.baseUrl, DEFAULT_EVALOPS_BASE_URL),
    serviceBaseUrls: buildEvalOpsServiceBaseUrls(endpoints),
    token: cleanOptionalString(input.token),
    headers: buildEvalOpsConsumerHeaders({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      headers: input.headers
    }),
    featureFlags: input.featureFlags ?? {},
    offlineFallback: input.offlineFallback ?? false
  }
}

export function scoreEvalOpsConsumerConformance(
  capabilities: Iterable<EvalOpsConsumerCapability>
): EvalOpsConsumerConformanceScore {
  const passedSet = new Set(capabilities)
  const passed: EvalOpsConsumerCapability[] = []
  const missingRequired: EvalOpsConsumerCapability[] = []
  const missingOptional: EvalOpsConsumerCapability[] = []

  for (const check of EVALOPS_CONSUMER_CONFORMANCE_CHECKS) {
    if (passedSet.has(check.id)) {
      passed.push(check.id)
    } else if (check.required) {
      missingRequired.push(check.id)
    } else {
      missingOptional.push(check.id)
    }
  }

  return {
    passed,
    missingRequired,
    missingOptional,
    complete: missingRequired.length === 0
  }
}

function cleanEvalOpsServiceBaseUrls(
  services: Partial<Record<EvalOpsConsumerServiceName, string | undefined>>
): Partial<Record<EvalOpsConsumerServiceName, string>> {
  const result: Partial<Record<EvalOpsConsumerServiceName, string>> = {}
  for (const [service, value] of Object.entries(services)) {
    const cleaned = cleanOptionalUrl(value)
    if (cleaned) result[service as EvalOpsConsumerServiceName] = cleaned
  }
  return result
}

function cleanUrl(...values: Array<string | undefined>): string {
  return cleanOptionalUrl(...values) ?? ''
}

function cleanOptionalUrl(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim().replace(/\/+$/u, '')
    if (trimmed) return trimmed
  }
  return undefined
}

function cleanOptionalString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

import {
  type EvalOpsConsumerCapability,
  buildEvalOpsConsumerClientConfig,
  scoreEvalOpsConsumerConformance
} from '@evalops/kestrel-sdk'

export interface NodeAgentAdopterInput {
  organizationId: string
  workspaceId: string
  agentId?: string
  evalopsBaseUrl?: string
  token?: string
}

export function buildNodeAgentAdopter(input: NodeAgentAdopterInput) {
  const config = buildEvalOpsConsumerClientConfig({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? 'node-agent-worker',
    token: input.token,
    endpoints: {
      baseUrl: input.evalopsBaseUrl,
      agentRegistryBaseUrl: serviceUrl(input.evalopsBaseUrl, 'agent-registry'),
      approvalsBaseUrl: serviceUrl(input.evalopsBaseUrl, 'approvals'),
      llmGatewayBaseUrl: serviceUrl(input.evalopsBaseUrl, 'llm-gateway'),
      memoryBaseUrl: serviceUrl(input.evalopsBaseUrl, 'memory'),
      promptsBaseUrl: serviceUrl(input.evalopsBaseUrl, 'prompts'),
      tracesBaseUrl: serviceUrl(input.evalopsBaseUrl, 'traces')
    },
    featureFlags: {
      backgroundAgent: true,
      platformConsumerKit: true
    },
    offlineFallback: true
  })

  const capabilities: EvalOpsConsumerCapability[] = [
    'auth-session',
    'service-discovery',
    'agent-registration',
    'prompts',
    'memory-read',
    'memory-write',
    'approvals',
    'traces',
    'llm-gateway',
    'local-retry-queue',
    'offline-fallback'
  ]

  const conformance = scoreEvalOpsConsumerConformance(capabilities)
  if (!conformance.complete) {
    throw new Error(
      `Node agent adopter is missing required EvalOps capabilities: ${conformance.missingRequired.join(', ')}`
    )
  }

  return {
    config,
    conformance
  }
}

function serviceUrl(baseUrl: string | undefined, service: string): string | undefined {
  const trimmed = baseUrl?.trim().replace(/\/+$/u, '')
  return trimmed ? `${trimmed}/${service}` : undefined
}

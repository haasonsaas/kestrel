export const KESTREL_SDK_NAME = '@evalops/kestrel-sdk'
export const DEFAULT_EVALOPS_LLM_GATEWAY_URL = 'https://llm-gateway.evalops.dev/v1'

export interface EvalOpsServiceEndpoints {
  identityBaseUrl?: string
  agentRegistryBaseUrl?: string
  skillsBaseUrl?: string
  memoryBaseUrl?: string
  tracesBaseUrl?: string
  approvalsBaseUrl?: string
  llmGatewayBaseUrl?: string
}

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

export function createProviderRef(provider: string, environment = 'prod'): EvalOpsProviderRef {
  return { provider, environment }
}

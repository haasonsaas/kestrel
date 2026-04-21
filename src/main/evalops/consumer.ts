import { getEvalOpsBearerToken, getStoredEvalOpsSession } from './auth'
import { getEvalOpsConfig } from './config'
import { EvalOpsClient } from './consumer-sdk'

export async function getEvalOpsConsumerClient(): Promise<EvalOpsClient> {
  const config = getEvalOpsConfig()
  const token = await getEvalOpsBearerToken()
  const session = getStoredEvalOpsSession()
  return new EvalOpsClient({
    baseUrl: config.baseUrl,
    serviceBaseUrls: {
      'agent-registry': config.agentRegistryBaseUrl,
      approvals: config.approvalsBaseUrl,
      memory: config.memoryBaseUrl,
      skills: config.skillsBaseUrl,
      traces: config.tracesBaseUrl
    },
    token,
    headers: cleanHeaders({
      'X-Organization-ID': session?.organizationId,
      'X-Workspace-ID': config.workspaceId
    }),
    featureFlags: {
      kestrel: true
    },
    offlineFallback: false
  })
}

function cleanHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value) result[key] = value
  }
  return result
}

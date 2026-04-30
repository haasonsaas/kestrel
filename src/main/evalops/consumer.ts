import {
  buildEvalOpsConsumerHeaders,
  buildEvalOpsServiceBaseUrls
} from '../../../sdk/js/src/index'
import { getEvalOpsBearerToken, getStoredEvalOpsSession } from './auth'
import { getEvalOpsConfig } from './config'
import { EvalOpsClient } from './consumer-sdk'

export async function getEvalOpsConsumerClient(): Promise<EvalOpsClient> {
  const config = getEvalOpsConfig()
  const token = await getEvalOpsBearerToken()
  const session = getStoredEvalOpsSession()
  return new EvalOpsClient({
    baseUrl: config.baseUrl,
    serviceBaseUrls: buildEvalOpsServiceBaseUrls({
      agentRegistryBaseUrl: config.agentRegistryBaseUrl,
      approvalsBaseUrl: config.approvalsBaseUrl,
      promptsBaseUrl: config.promptsBaseUrl,
      memoryBaseUrl: config.memoryBaseUrl,
      skillsBaseUrl: config.skillsBaseUrl,
      tracesBaseUrl: config.tracesBaseUrl
    }),
    token,
    headers: buildEvalOpsConsumerHeaders({
      organizationId: session?.organizationId,
      workspaceId: config.workspaceId,
      agentId: config.agentId
    }),
    featureFlags: {
      kestrel: true
    },
    offlineFallback: false
  })
}

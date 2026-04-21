import { APP_ID, APP_NAME, APP_VERSION } from '../../shared/config'
import { getEvalOpsAuthStatus, getStoredEvalOpsSession } from './auth'
import { getEvalOpsConfig } from './config'
import { getEvalOpsConsumerClient } from './consumer'

const KESTREL_CAPABILITIES = [
  'context.capture',
  'llm.chat',
  'mcp.client',
  'meeting.recording',
  'memory.recall',
  'memory.store',
  'trace.ingest',
  'approval.request'
]

const KESTREL_SURFACES = ['kestrel', 'desktop', 'chat', 'mcp', 'meetings']

export async function registerKestrelAgent(reason: 'startup' | 'login' = 'startup'): Promise<void> {
  const status = await getEvalOpsAuthStatus()
  if (!status.authenticated && !status.tokenConfigured) return

  const config = getEvalOpsConfig()
  const session = getStoredEvalOpsSession()
  const client = await getEvalOpsConsumerClient()

  const response = await client.agentRegistry.register({
    id: config.agentId,
    workspaceId: config.workspaceId,
    name: `${APP_NAME} Desktop`,
    description: 'Context-aware AI desktop assistant for macOS.',
    agentType: 'desktop-assistant',
    capabilities: KESTREL_CAPABILITIES,
    surfaces: KESTREL_SURFACES,
    status: 'active',
    version: APP_VERSION,
    ownerId: session?.organizationId,
    labels: cleanLabels({
      app_id: APP_ID,
      app_name: APP_NAME,
      platform: process.platform,
      runtime: 'electron',
      registration_reason: reason,
      organization_id: session?.organizationId,
      workspace_id: config.workspaceId
    })
  })

  if (response.offline) {
    console.warn('[evalops:registration] Agent registration used offline fallback:', response.reason)
  }
}

export function registerKestrelAgentInBackground(reason: 'startup' | 'login' = 'startup'): void {
  registerKestrelAgent(reason).catch((err) => {
    console.warn('[evalops:registration] Agent registration failed:', err)
  })
}

function cleanLabels(labels: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(labels)) {
    if (value) result[key] = value
  }
  return result
}

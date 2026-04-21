import { APP_NAME } from '../../shared/config'
import { getEvalOpsAuthStatus, getStoredEvalOpsSession } from './auth'
import { getEvalOpsConfig } from './config'
import { getEvalOpsConsumerClient } from './consumer'

const KESTREL_CAPABILITIES = [
  'x-kestrel:context.capture',
  'responses:create',
  'mcp',
  'x-kestrel:meeting.recording',
  'x-kestrel:memory.recall',
  'x-kestrel:memory.store',
  'x-kestrel:trace.ingest',
  'x-kestrel:approval.request'
]

const KESTREL_SURFACES = ['kestrel', 'desktop', 'chat', 'mcp', 'meetings']

export async function registerKestrelAgent(reason: 'startup' | 'login' = 'startup'): Promise<void> {
  const status = await getEvalOpsAuthStatus()
  if (!status.authenticated && !status.tokenConfigured) return

  const config = getEvalOpsConfig()
  const session = getStoredEvalOpsSession()
  const client = await getEvalOpsConsumerClient()

  const response = await client.agentRegistry.register({
    workspaceId: config.workspaceId,
    name: `${APP_NAME} Desktop`,
    description: 'Context-aware AI desktop assistant for macOS.',
    agentType: 'desktop',
    capabilities: KESTREL_CAPABILITIES,
    surfaces: KESTREL_SURFACES,
    ownerId: session?.organizationId
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

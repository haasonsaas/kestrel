import { getEvalOpsAuthStatus } from './auth'
import { getEvalOpsConsumerClient } from './consumer'

export const KESTREL_PROMPT_NAMES = {
  chat: 'kestrel.system.chat',
  meetingSummary: 'kestrel.system.meeting_summary',
  journal: 'kestrel.system.journal'
} as const

const DEFAULT_PROMPT_LABEL = 'production'

export async function resolveEvalOpsPrompt(
  name: string,
  fallback: string,
  options: { label?: string } = {}
): Promise<string> {
  const trimmedName = name.trim()
  if (!trimmedName) return fallback

  try {
    const status = await getEvalOpsAuthStatus()
    if (!status.authenticated && !status.tokenConfigured) return fallback

    const client = await getEvalOpsConsumerClient()
    const response = await client.prompts.resolve({
      name: trimmedName,
      label: options.label ?? process.env.EVALOPS_PROMPTS_LABEL ?? process.env.KESTREL_PROMPTS_LABEL ?? DEFAULT_PROMPT_LABEL
    })
    const content = response.version?.content?.trim()
    return content || fallback
  } catch (err) {
    console.warn(`[evalops:prompts] Failed to resolve ${trimmedName}; using local fallback:`, err)
    return fallback
  }
}

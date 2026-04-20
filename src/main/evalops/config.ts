import {
  EVALOPS_DEFAULT_IDENTITY_BASE_URL,
  EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL,
  EVALOPS_DEFAULT_AGENT_ID,
  EVALOPS_DEFAULT_AGENT_REGISTRY_BASE_URL,
  EVALOPS_DEFAULT_MEMORY_BASE_URL,
  EVALOPS_DEFAULT_RESOURCE,
  EVALOPS_DEFAULT_SCOPES,
  EVALOPS_DEFAULT_SKILLS_BASE_URL,
  EVALOPS_DEFAULT_TRACES_BASE_URL,
  EVALOPS_DEFAULT_WORKSPACE_ID
} from '../../shared/config'
import { getSettingValue } from './settings'

export const EVALOPS_CONFIG_KEY = 'evalops_config'
export const EVALOPS_AUTH_SESSION_KEY = 'evalops_auth_session'

export interface EvalOpsConfig {
  identityBaseUrl: string
  llmGatewayBaseUrl: string
  agentRegistryBaseUrl: string
  skillsBaseUrl: string
  memoryBaseUrl: string
  tracesBaseUrl: string
  resource: string
  scopes: string[]
  workspaceId: string
  agentId: string
}

interface StoredEvalOpsConfig {
  identityBaseUrl?: unknown
  llmGatewayBaseUrl?: unknown
  agentRegistryBaseUrl?: unknown
  skillsBaseUrl?: unknown
  memoryBaseUrl?: unknown
  tracesBaseUrl?: unknown
  resource?: unknown
  scopes?: unknown
  workspaceId?: unknown
  agentId?: unknown
}

export function getEvalOpsConfig(overrides: Partial<EvalOpsConfig> = {}): EvalOpsConfig {
  const stored = getSettingValue<StoredEvalOpsConfig>(EVALOPS_CONFIG_KEY) ?? {}
  const llmGatewayBaseUrl = cleanUrl(
    process.env.EVALOPS_LLM_GATEWAY_BASE_URL,
    asString(stored.llmGatewayBaseUrl),
    EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL
  )

  return {
    identityBaseUrl: cleanUrl(
      process.env.EVALOPS_IDENTITY_BASE_URL,
      asString(stored.identityBaseUrl),
      EVALOPS_DEFAULT_IDENTITY_BASE_URL
    ),
    llmGatewayBaseUrl,
    agentRegistryBaseUrl: cleanUrl(
      process.env.EVALOPS_AGENT_REGISTRY_BASE_URL,
      asString(stored.agentRegistryBaseUrl),
      EVALOPS_DEFAULT_AGENT_REGISTRY_BASE_URL
    ),
    skillsBaseUrl: cleanUrl(
      process.env.EVALOPS_SKILLS_BASE_URL,
      asString(stored.skillsBaseUrl),
      EVALOPS_DEFAULT_SKILLS_BASE_URL
    ),
    memoryBaseUrl: cleanUrl(
      process.env.EVALOPS_MEMORY_BASE_URL,
      asString(stored.memoryBaseUrl),
      EVALOPS_DEFAULT_MEMORY_BASE_URL
    ),
    tracesBaseUrl: cleanUrl(
      process.env.EVALOPS_TRACES_BASE_URL,
      asString(stored.tracesBaseUrl),
      EVALOPS_DEFAULT_TRACES_BASE_URL
    ),
    resource: cleanUrl(
      process.env.EVALOPS_RESOURCE,
      asString(stored.resource),
      EVALOPS_DEFAULT_RESOURCE
    ),
    scopes: cleanScopes(
      overrides.scopes ??
      asStringArray(process.env.EVALOPS_SCOPES?.split(/[,\s]+/)) ??
      asStringArray(stored.scopes) ??
      EVALOPS_DEFAULT_SCOPES
    ),
    workspaceId: cleanString(
      process.env.EVALOPS_WORKSPACE_ID,
      asString(stored.workspaceId),
      EVALOPS_DEFAULT_WORKSPACE_ID
    ),
    agentId: cleanString(
      process.env.EVALOPS_AGENT_ID,
      asString(stored.agentId),
      EVALOPS_DEFAULT_AGENT_ID
    )
  }
}

function cleanUrl(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed.replace(/\/+$/, '')
  }
  return ''
}

function cleanScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)))
}

function cleanString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === 'string')
  return strings.length > 0 ? strings : undefined
}

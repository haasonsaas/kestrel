import {
  EVALOPS_DEFAULT_IDENTITY_BASE_URL,
  EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL,
  EVALOPS_DEFAULT_RESOURCE,
  EVALOPS_DEFAULT_SCOPES
} from '../../shared/config'
import { getSettingValue } from './settings'

export const EVALOPS_CONFIG_KEY = 'evalops_config'
export const EVALOPS_AUTH_SESSION_KEY = 'evalops_auth_session'

export interface EvalOpsConfig {
  identityBaseUrl: string
  llmGatewayBaseUrl: string
  resource: string
  scopes: string[]
}

interface StoredEvalOpsConfig {
  identityBaseUrl?: unknown
  llmGatewayBaseUrl?: unknown
  resource?: unknown
  scopes?: unknown
}

export function getEvalOpsConfig(overrides: Partial<EvalOpsConfig> = {}): EvalOpsConfig {
  const stored = getSettingValue<StoredEvalOpsConfig>(EVALOPS_CONFIG_KEY) ?? {}
  const llmGatewayBaseUrl = cleanUrl(
    overrides.llmGatewayBaseUrl,
    process.env.EVALOPS_LLM_GATEWAY_BASE_URL,
    asString(stored.llmGatewayBaseUrl),
    EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL
  )

  return {
    identityBaseUrl: cleanUrl(
      overrides.identityBaseUrl,
      process.env.EVALOPS_IDENTITY_BASE_URL,
      asString(stored.identityBaseUrl),
      EVALOPS_DEFAULT_IDENTITY_BASE_URL
    ),
    llmGatewayBaseUrl,
    resource: cleanUrl(
      overrides.resource,
      process.env.EVALOPS_RESOURCE,
      asString(stored.resource),
      EVALOPS_DEFAULT_RESOURCE
    ),
    scopes: cleanScopes(
      overrides.scopes ??
      asStringArray(process.env.EVALOPS_SCOPES?.split(/[,\s]+/)) ??
      asStringArray(stored.scopes) ??
      EVALOPS_DEFAULT_SCOPES
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === 'string')
  return strings.length > 0 ? strings : undefined
}

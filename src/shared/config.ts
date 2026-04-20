/**
 * Central configuration — single source of truth for model defaults,
 * app identity, and feature flags.
 */

// ── Model Defaults ──

/** Primary model for chat, overlay, and general use. Fastest + highest eval score. */
export const DEFAULT_MODEL = 'openai/gpt-5.4'

/** Secondary model for complex reasoning, code review, summarization. */
export const SECONDARY_MODEL = 'anthropic/claude-sonnet-4.6'

/** Arena default models — compared side by side. */
export const ARENA_DEFAULT_MODELS = [DEFAULT_MODEL, SECONDARY_MODEL]

/** Model used for internal tasks (meeting summaries, journal generation, auto-title). */
export const INTERNAL_MODEL = DEFAULT_MODEL

// ── App Identity ──

export const APP_NAME = 'Kestrel'
export const APP_ID = 'com.kestrel.app'
export const APP_VERSION = '0.6.0'

// ── EvalOps Platform Defaults ──

export const EVALOPS_DEFAULT_IDENTITY_BASE_URL = 'http://identity-service.evalops.svc.cluster.local:8080'
export const EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL = 'http://llm-gateway-service.evalops.svc.cluster.local:8080/v1'
export const EVALOPS_DEFAULT_AGENT_REGISTRY_BASE_URL = 'http://agent-registry-service.evalops.svc.cluster.local:8080'
export const EVALOPS_DEFAULT_SKILLS_BASE_URL = 'http://skills-service.evalops.svc.cluster.local:8080'
export const EVALOPS_DEFAULT_MEMORY_BASE_URL = 'http://memory-service.evalops.svc.cluster.local:8080'
export const EVALOPS_DEFAULT_TRACES_BASE_URL = 'http://traces-service.evalops.svc.cluster.local:8080'
export const EVALOPS_DEFAULT_RESOURCE = EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL
export const EVALOPS_DEFAULT_WORKSPACE_ID = 'default'
export const EVALOPS_DEFAULT_AGENT_ID = 'kestrel-desktop'
export const EVALOPS_DEFAULT_PROVIDER_REF = {
  provider: 'openrouter',
  environment: 'prod',
  credentialName: '',
  teamId: ''
}
export const EVALOPS_DEFAULT_SCOPES = [
  'llm_gateway:invoke',
  'agent-registry:read',
  'agent-registry:write',
  'memories:read',
  'memories:write'
]

// ── Feature Defaults ──

export const CONTEXT_POLL_INTERVAL_MS = 5000
export const CONTEXT_MAX_CHARS = 3000
export const MEETING_GRACE_PERIOD_MS = 30000
export const MAX_TOOL_ITERATIONS = 10

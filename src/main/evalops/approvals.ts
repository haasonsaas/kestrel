import type { MCPTool } from '../../shared/ipc'
import { getEvalOpsConfig } from './config'
import { getEvalOpsConsumerClient } from './consumer'
import type {
  ApprovalDecisionRecord,
  ApprovalDecisionType,
  ApprovalGetResponse,
  ApprovalRiskLevel
} from './consumer-sdk/types'

const APPROVAL_AGENT_ID = 'kestrel-mcp-client'
const APPROVAL_SURFACE = 'kestrel'
const DEFAULT_APPROVAL_WAIT_TIMEOUT_MS = 2 * 60 * 1000
const DEFAULT_APPROVAL_POLL_INTERVAL_MS = 2 * 1000

const APPROVED_DECISIONS = new Set<ApprovalDecisionType>([
  'DECISION_TYPE_APPROVED',
  'DECISION_TYPE_AUTO_APPROVED'
])

const TERMINAL_REJECTION_DECISIONS = new Set<ApprovalDecisionType>([
  'DECISION_TYPE_DENIED',
  'DECISION_TYPE_ESCALATED',
  'DECISION_TYPE_EXPIRED'
])

export interface EvalOpsMCPToolApprovalInput {
  serverName: string
  toolName: string
  args: Record<string, unknown>
  tool?: MCPTool | null
}

export interface EvalOpsMCPToolApprovalResult {
  allowed: boolean
  offline: boolean
  riskLevel: ApprovalRiskLevel
  requestId?: string
  state?: string
  decision?: ApprovalDecisionType
  reason?: string
}

export async function requestEvalOpsMCPToolApproval(
  input: EvalOpsMCPToolApprovalInput
): Promise<EvalOpsMCPToolApprovalResult> {
  const config = getEvalOpsConfig()
  const risk = inferMCPToolRisk(input)

  try {
    const client = await getEvalOpsConsumerClient()
    const request = await client.approvals.requestApproval({
      workspaceId: config.workspaceId,
      agentId: APPROVAL_AGENT_ID,
      surface: APPROVAL_SURFACE,
      actionType: `${input.serverName}/${input.toolName}`,
      actionPayload: encodeActionPayload(input),
      riskLevel: risk.level,
      contextJson: JSON.stringify({
        server_name: input.serverName,
        tool_name: input.toolName,
        description: input.tool?.description,
        risk_reason: risk.reason
      })
    })

    if (request.offline) {
      return allowOffline(risk.level, request.reason)
    }

    const approval = request.approvalRequest
    const requestId = approval?.id
    if (!requestId) {
      return {
        allowed: false,
        offline: false,
        riskLevel: risk.level,
        reason: 'EvalOps approval response did not include a request id.'
      }
    }

    const initialState = normalizeState(approval?.state)
    if (initialState === 'resolved') {
      const current = await client.approvals.getApproval({
        approvalRequestId: requestId,
        workspaceId: config.workspaceId
      })
      return decisionResult(current, requestId, risk.level)
    }

    return waitForDecision({
      requestId,
      workspaceId: config.workspaceId,
      riskLevel: risk.level
    })
  } catch (err) {
    return allowOffline(risk.level, err instanceof Error ? err.message : String(err))
  }
}

export function inferMCPToolRisk(input: EvalOpsMCPToolApprovalInput): {
  level: ApprovalRiskLevel
  reason: string
} {
  const haystack = [
    input.serverName,
    input.toolName,
    input.tool?.description,
    JSON.stringify(input.tool?.inputSchema ?? {})
  ].join(' ').toLowerCase()

  if (/\b(delete|remove|destroy|drop|truncate|wipe|erase|format|revoke|kill|shutdown|terminate)\b/u.test(haystack)) {
    return { level: 'RISK_LEVEL_HIGH', reason: 'destructive tool name or schema' }
  }
  if (/\b(write|create|update|edit|patch|insert|upload|send|post|execute|run|shell|command|apply|commit|merge|deploy)\b/u.test(haystack)) {
    return { level: 'RISK_LEVEL_MEDIUM', reason: 'mutating or execution-capable tool name or schema' }
  }
  if (/\b(read|get|list|search|find|fetch|describe|inspect|query|select)\b/u.test(haystack)) {
    return { level: 'RISK_LEVEL_LOW', reason: 'read-only lookup tool name or schema' }
  }
  return { level: 'RISK_LEVEL_MEDIUM', reason: 'unknown MCP tool capability' }
}

async function waitForDecision(input: {
  requestId: string
  workspaceId: string
  riskLevel: ApprovalRiskLevel
}): Promise<EvalOpsMCPToolApprovalResult> {
  const client = await getEvalOpsConsumerClient()
  const timeoutMs = positiveIntegerEnv('KESTREL_APPROVAL_WAIT_TIMEOUT_MS', DEFAULT_APPROVAL_WAIT_TIMEOUT_MS)
  const pollIntervalMs = positiveIntegerEnv('KESTREL_APPROVAL_POLL_INTERVAL_MS', DEFAULT_APPROVAL_POLL_INTERVAL_MS)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await delay(pollIntervalMs)
    const response = await client.approvals.getApproval({
      approvalRequestId: input.requestId,
      workspaceId: input.workspaceId
    })
    const result = decisionResult(response, input.requestId, input.riskLevel)
    if (result.decision || normalizeState(result.state) === 'resolved') return result
  }

  return {
    allowed: false,
    offline: false,
    riskLevel: input.riskLevel,
    requestId: input.requestId,
    state: 'pending',
    reason: `EvalOps approval timed out after ${timeoutMs}ms.`
  }
}

function decisionResult(
  response: ApprovalGetResponse,
  requestId: string,
  riskLevel: ApprovalRiskLevel
): EvalOpsMCPToolApprovalResult {
  if (response.offline) return allowOffline(riskLevel, response.reason, requestId)

  const decision = latestDecision(response.decisions)
  if (decision && APPROVED_DECISIONS.has(decision)) {
    return {
      allowed: true,
      offline: false,
      riskLevel,
      requestId,
      state: normalizeState(response.state),
      decision
    }
  }
  if (decision && TERMINAL_REJECTION_DECISIONS.has(decision)) {
    return {
      allowed: false,
      offline: false,
      riskLevel,
      requestId,
      state: normalizeState(response.state),
      decision,
      reason: `EvalOps approval decision was ${decision}.`
    }
  }

  return {
    allowed: false,
    offline: false,
    riskLevel,
    requestId,
    state: normalizeState(response.state)
  }
}

function latestDecision(decisions: ApprovalDecisionRecord[] | undefined): ApprovalDecisionType | undefined {
  return decisions?.slice().reverse().find((decision) => decision.decision)?.decision
}

function allowOffline(
  riskLevel: ApprovalRiskLevel,
  reason: string | undefined,
  requestId?: string
): EvalOpsMCPToolApprovalResult {
  return {
    allowed: true,
    offline: true,
    riskLevel,
    requestId,
    reason: reason || 'EvalOps approvals unavailable; using local fallback.'
  }
}

function encodeActionPayload(input: EvalOpsMCPToolApprovalInput): string {
  return Buffer.from(JSON.stringify({
    server_name: input.serverName,
    tool_name: input.toolName,
    arguments: input.args
  })).toString('base64')
}

function normalizeState(state: unknown): string | undefined {
  return typeof state === 'string' && state.trim() ? state.trim().toLowerCase() : undefined
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

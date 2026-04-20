import { BrowserWindow, Notification, ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import {
  listEvalOpsAgents,
  listEvalOpsApprovals,
  listEvalOpsTraces
} from './evalops/services'
import type {
  EvalOpsAgent,
  EvalOpsApprovalRequest,
  PlatformNotificationEvent,
  PlatformNotificationKind
} from '../shared/ipc'

const DEFAULT_POLL_INTERVAL_MS = 60_000
const MAX_RECENT_NOTIFICATIONS = 100

type MainWindowGetter = () => BrowserWindow | null

interface PlatformNotificationOptions {
  getMainWindow: MainWindowGetter
  pollIntervalMs?: number
}

let getMainWindow: MainWindowGetter = () => null
let pollTimer: ReturnType<typeof setInterval> | null = null
let hydrated = false
let recentNotifications: PlatformNotificationEvent[] = []
const knownAgentStatuses = new Map<string, string>()
const knownApprovalIds = new Set<string>()
const knownTraceAlertIds = new Set<string>()

export function registerPlatformNotificationHandlers(options: PlatformNotificationOptions): void {
  getMainWindow = options.getMainWindow

  ipcMain.handle('platformNotifications:list', () => recentNotifications)
  ipcMain.handle('platformNotifications:refresh', async () => {
    await pollPlatformEvents()
    return recentNotifications
  })
  ipcMain.handle('platformNotifications:test', () => {
    return emitPlatformNotification({
      kind: 'approval-request',
      title: 'Approval requested',
      body: 'EvalOps has a pending approval for a Kestrel agent action.',
      deepLink: 'evalops://approvals/test',
      sourceId: 'test'
    })
  })

  void pollPlatformEvents()
  pollTimer = setInterval(() => {
    void pollPlatformEvents()
  }, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
  pollTimer.unref?.()
}

export function unregisterPlatformNotificationHandlers(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

async function pollPlatformEvents(): Promise<void> {
  const shouldNotify = hydrated
  const checks = await Promise.allSettled([
    pollAgentCompletions(shouldNotify),
    pollApprovalRequests(shouldNotify),
    pollTraceAlerts(shouldNotify)
  ])

  for (const check of checks) {
    if (check.status === 'rejected') {
      console.debug('[platform-notifications] Poll failed:', check.reason)
    }
  }

  hydrated = true
}

async function pollAgentCompletions(shouldNotify: boolean): Promise<void> {
  const response = await listEvalOpsAgents({ limit: 50 })
  for (const agent of response.agents) {
    const id = agent.id ?? agent.name
    if (!id) continue

    const status = normalizeStatus(agent.status)
    const previous = knownAgentStatuses.get(id)
    knownAgentStatuses.set(id, status)

    if (!shouldNotify || !isCompletedStatus(status)) continue
    if (previous && isCompletedStatus(previous)) continue

    emitPlatformNotification({
      kind: 'agent-completion',
      title: 'Agent completed',
      body: `${agent.name ?? id} finished${status ? ` with ${status}` : ''}.`,
      deepLink: `evalops://agents/${encodeURIComponent(id)}`,
      sourceId: id
    })
  }
}

async function pollApprovalRequests(shouldNotify: boolean): Promise<void> {
  const response = await listEvalOpsApprovals({ limit: 50 })
  for (const request of response.requests) {
    const id = request.id
    if (!id) continue

    const isNew = !knownApprovalIds.has(id)
    knownApprovalIds.add(id)
    if (!shouldNotify || !isNew) continue

    emitPlatformNotification({
      kind: 'approval-request',
      title: 'Approval requested',
      body: approvalBody(request),
      deepLink: `evalops://approvals/${encodeURIComponent(id)}`,
      sourceId: id
    })
  }
}

async function pollTraceAlerts(shouldNotify: boolean): Promise<void> {
  const response = await listEvalOpsTraces({ limit: 50 })
  for (const trace of response.traces) {
    const record = isRecord(trace) ? trace : null
    if (!record || !isTraceAlert(record)) continue

    const id = readString(record, ['traceId', 'trace_id', 'id', 'spanId', 'span_id'])
    if (!id) continue

    const isNew = !knownTraceAlertIds.has(id)
    knownTraceAlertIds.add(id)
    if (!shouldNotify || !isNew) continue

    emitPlatformNotification({
      kind: 'trace-alert',
      title: 'Trace alert',
      body: traceBody(record),
      deepLink: `evalops://traces/${encodeURIComponent(id)}`,
      sourceId: id
    })
  }
}

function emitPlatformNotification(input: {
  kind: PlatformNotificationKind
  title: string
  body: string
  deepLink?: string
  sourceId?: string
}): PlatformNotificationEvent {
  const event: PlatformNotificationEvent = {
    id: uuid(),
    kind: input.kind,
    title: input.title,
    body: truncate(input.body, 180),
    deepLink: input.deepLink,
    sourceId: input.sourceId,
    createdAt: Date.now(),
    read: false
  }

  recentNotifications = [event, ...recentNotifications].slice(0, MAX_RECENT_NOTIFICATIONS)
  showNativeNotification(event)
  sendToRenderers(event)
  return event
}

function showNativeNotification(event: PlatformNotificationEvent): void {
  if (!Notification.isSupported()) return

  const notification = new Notification({
    title: event.title,
    body: event.body,
    silent: false
  })

  notification.on('click', () => {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('platformNotification:received', event)
    }
  })

  notification.show()
}

function sendToRenderers(event: PlatformNotificationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('platformNotification:received', event)
    }
  }
}

function approvalBody(request: EvalOpsApprovalRequest): string {
  const action = request.actionType || 'agent action'
  const agent = request.agentId ? ` for ${request.agentId}` : ''
  const risk = request.riskLevel ? ` Risk: ${request.riskLevel}.` : ''
  return `Review ${action}${agent}.${risk}`.trim()
}

function traceBody(trace: Record<string, unknown>): string {
  const name = readString(trace, ['name', 'operation', 'spanName', 'span_name']) ?? 'A platform trace'
  const status = readString(trace, ['status', 'outcome']) ?? 'error'
  const error = traceError(trace)
  return error ? `${name} reported ${status}: ${error}` : `${name} reported ${status}.`
}

function isTraceAlert(trace: Record<string, unknown>): boolean {
  const status = normalizeStatus(readString(trace, ['status', 'outcome', 'spanStatus', 'span_status']))
  if (status.includes('error') || status.includes('failed') || status.includes('alert')) return true

  const attributes = isRecord(trace.attributes) ? trace.attributes : {}
  const attributeStatus = normalizeStatus(readString(attributes, ['status', 'outcome']))
  return attributeStatus.includes('error') || Boolean(traceError(trace))
}

function traceError(trace: Record<string, unknown>): string | undefined {
  const direct = readString(trace, ['error', 'errorMessage', 'error_message'])
  if (direct) return direct
  const attributes = isRecord(trace.attributes) ? trace.attributes : {}
  return readString(attributes, ['error', 'errorMessage', 'error_message'])
}

function isCompletedStatus(status: string): boolean {
  return ['complete', 'completed', 'done', 'succeeded', 'success'].includes(status)
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').trim().toLowerCase().replace(/^span_status_/u, '')
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`
}

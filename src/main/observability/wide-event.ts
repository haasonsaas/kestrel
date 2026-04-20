import { v4 as uuid } from 'uuid'
import { recordEvalOpsTelemetryTrace } from '../evalops/services'

/**
 * Wide Event system — one rich canonical log line per unit of work.
 * Inspired by Ensemble's wide-event pattern.
 *
 * Usage:
 *   const event = WideEvent.start('chat_message', { threadId, model })
 *   event.set('context_app', 'Chrome')
 *   event.set('tokens_in', 1500)
 *   // ... work happens ...
 *   event.set('tokens_out', 800)
 *   event.finish({ outcome: 'success' })
 *
 * Events are exported to EvalOps traces and kept in a memory ring buffer for real-time analytics.
 */

export type EventType =
  | 'chat_message'
  | 'chat_stream'
  | 'meeting_start'
  | 'meeting_stop'
  | 'meeting_autodetect'
  | 'meeting_transcribe'
  | 'meeting_summarize'
  | 'context_capture'
  | 'context_snapshot'
  | 'mcp_tool_call'
  | 'mcp_server_start'
  | 'mcp_server_stop'
  | 'journal_generate'
  | 'arena_run'
  | 'llm_usage'
  | 'overlay_message'
  | 'app_start'
  | 'app_quit'
  | 'error'

export type Outcome = 'success' | 'error' | 'timeout' | 'cancelled' | 'skipped'

export interface WideEventFields {
  // Identity
  event_id: string
  event_type: EventType
  timestamp: string

  // Timing
  started_at: number
  finished_at?: number
  duration_ms?: number

  // Outcome
  outcome?: Outcome
  error?: string

  // Context
  [key: string]: string | number | boolean | null | undefined
}

const RING_BUFFER_SIZE = 1000
const ringBuffer: WideEventFields[] = []

export class WideEvent {
  private fields: WideEventFields
  private finished = false

  private constructor(eventType: EventType, initialFields?: Record<string, unknown>) {
    this.fields = {
      event_id: uuid(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      started_at: Date.now(),
      ...initialFields
    } as WideEventFields
  }

  /** Start a new wide event */
  static start(eventType: EventType, initialFields?: Record<string, unknown>): WideEvent {
    const event = new WideEvent(eventType, initialFields)
    log(`[event:${eventType}] started ${event.fields.event_id.slice(0, 8)}`)
    return event
  }

  /** Emit a fire-and-forget event (no duration tracking) */
  static emit(eventType: EventType, fields?: Record<string, unknown>): void {
    const event = new WideEvent(eventType, fields)
    event.fields.finished_at = event.fields.started_at
    event.fields.duration_ms = 0
    event.fields.outcome = 'success'
    event.persist()
  }

  /** Set a single field */
  set(key: string, value: string | number | boolean | null): this {
    ;(this.fields as Record<string, unknown>)[key] = value
    return this
  }

  /** Set multiple fields at once */
  setMany(fields: Record<string, string | number | boolean | null>): this {
    for (const [k, v] of Object.entries(fields)) {
      ;(this.fields as Record<string, unknown>)[k] = v
    }
    return this
  }

  /** Finish the event with an outcome */
  finish(opts?: { outcome?: Outcome; error?: string }): void {
    if (this.finished) return
    this.finished = true

    this.fields.finished_at = Date.now()
    this.fields.duration_ms = this.fields.finished_at - this.fields.started_at
    this.fields.outcome = opts?.outcome ?? 'success'
    if (opts?.error) this.fields.error = opts.error.slice(0, 512)

    const dur = this.fields.duration_ms
    const outcome = this.fields.outcome
    log(`[event:${this.fields.event_type}] ${outcome} ${this.fields.event_id.slice(0, 8)} (${dur}ms)`)

    this.persist()
  }

  /** Finish with error */
  fail(error: string | Error): void {
    const msg = error instanceof Error ? error.message : error
    this.finish({ outcome: 'error', error: msg })
  }

  /** Get the event ID */
  get id(): string {
    return this.fields.event_id
  }

  private persist(): void {
    // Add to ring buffer
    ringBuffer.push(this.fields)
    if (ringBuffer.length > RING_BUFFER_SIZE) {
      ringBuffer.shift()
    }

    void recordEvalOpsTelemetryTrace(this.fields).catch((err) => {
      console.warn('[evalops:traces] Failed to export telemetry event:', err instanceof Error ? err.message : err)
    })
  }
}

// ── Analytics ──────────────────────────────────────────

export interface EventSnapshot {
  windowMinutes: number
  totalEvents: number
  byType: Record<string, number>
  byOutcome: Record<string, number>
  avgDurationMs: Record<string, number>
  errorRate: number
  recentErrors: Array<{ event_type: string; error: string; timestamp: string }>
  meetingAutoDetects: number
  chatMessages: number
  toolCalls: number
}

/** Get an analytics snapshot from the in-memory ring buffer */
export function getEventSnapshot(windowMinutes = 60): EventSnapshot {
  const cutoff = Date.now() - windowMinutes * 60 * 1000
  const events = ringBuffer.filter((e) => e.started_at >= cutoff)

  const byType: Record<string, number> = {}
  const byOutcome: Record<string, number> = {}
  const durationSums: Record<string, number> = {}
  const durationCounts: Record<string, number> = {}
  const recentErrors: Array<{ event_type: string; error: string; timestamp: string }> = []
  let errorCount = 0

  for (const e of events) {
    byType[e.event_type] = (byType[e.event_type] ?? 0) + 1
    if (e.outcome) byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1
    if (e.outcome === 'error') {
      errorCount++
      if (e.error) {
        recentErrors.push({
          event_type: e.event_type,
          error: e.error,
          timestamp: e.timestamp
        })
      }
    }
    if (e.duration_ms != null) {
      durationSums[e.event_type] = (durationSums[e.event_type] ?? 0) + e.duration_ms
      durationCounts[e.event_type] = (durationCounts[e.event_type] ?? 0) + 1
    }
  }

  const avgDurationMs: Record<string, number> = {}
  for (const [type, sum] of Object.entries(durationSums)) {
    avgDurationMs[type] = Math.round(sum / (durationCounts[type] ?? 1))
  }

  return {
    windowMinutes,
    totalEvents: events.length,
    byType,
    byOutcome,
    avgDurationMs,
    errorRate: events.length > 0 ? errorCount / events.length : 0,
    recentErrors: recentErrors.slice(-10),
    meetingAutoDetects: byType['meeting_autodetect'] ?? 0,
    chatMessages: byType['chat_message'] ?? 0,
    toolCalls: byType['mcp_tool_call'] ?? 0
  }
}

/** Get recent events from the ring buffer */
export function getRecentEvents(limit = 50): WideEventFields[] {
  return ringBuffer.slice(-limit).reverse()
}

function log(msg: string): void {
  console.log(msg)
}

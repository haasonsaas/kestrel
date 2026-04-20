import type {
  EvalOpsClientConfig,
  EvalOpsClientMetrics,
  EvalOpsServiceName,
  FeatureFlags
} from './types'

const DEFAULT_BASE_URL = 'https://api.evalops.dev'

export interface EvalOpsTransportOptions<TFallback = unknown> {
  service: EvalOpsServiceName
  operation: string
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  fallback?: (reason: string) => TFallback
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '')
}

function getEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function normalizeFeatureFlags(flags: FeatureFlags | undefined): string | null {
  if (!flags || Object.keys(flags).length === 0) return null
  const stable = Object.fromEntries(
    Object.entries(flags).sort(([left], [right]) => left.localeCompare(right))
  )
  return JSON.stringify(stable)
}

function createEmptyMetrics(): EvalOpsClientMetrics {
  return {
    requests: 0,
    fallbacks: 0,
    fallbacksByService: {
      'agent-registry': 0,
      approvals: 0,
      connectors: 0,
      governance: 0,
      identity: 0,
      'llm-gateway': 0,
      memory: 0,
      meter: 0,
      skills: 0,
      traces: 0
    }
  }
}

function cloneMetrics(metrics: EvalOpsClientMetrics): EvalOpsClientMetrics {
  return {
    requests: metrics.requests,
    fallbacks: metrics.fallbacks,
    fallbacksByService: { ...metrics.fallbacksByService },
    ...(metrics.lastFallback ? { lastFallback: { ...metrics.lastFallback } } : {})
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export class EvalOpsTransport {
  readonly baseUrl: string
  private readonly token?: string
  private readonly headersOverride: Record<string, string>
  private readonly featureFlags?: FeatureFlags
  private readonly offlineFallback: boolean
  private readonly fetchImpl: typeof fetch
  private readonly metrics = createEmptyMetrics()

  constructor(config: EvalOpsClientConfig = {}) {
    this.baseUrl = trimTrailingSlash(
      config.baseUrl ?? getEnvValue('EVALOPS_BASE_URL') ?? DEFAULT_BASE_URL
    )
    this.token = config.token ?? getEnvValue('EVALOPS_TOKEN')
    this.headersOverride = config.headers ?? {}
    this.featureFlags = config.featureFlags
    this.offlineFallback = config.offlineFallback ?? false
    this.fetchImpl = config.fetch ?? fetch
  }

  getMetrics(): EvalOpsClientMetrics {
    return cloneMetrics(this.metrics)
  }

  private headers(): Record<string, string> {
    const flags = normalizeFeatureFlags(this.featureFlags)
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(flags ? { 'X-EvalOps-Feature-Flags': flags } : {}),
      ...this.headersOverride
    }
  }

  private recordFallback(
    service: EvalOpsServiceName,
    operation: string,
    reason: string
  ): void {
    this.metrics.fallbacks += 1
    this.metrics.fallbacksByService[service] += 1
    this.metrics.lastFallback = {
      service,
      operation,
      reason,
      at: new Date().toISOString()
    }
  }

  async request<TResponse>(
    options: EvalOpsTransportOptions<TResponse>
  ): Promise<TResponse> {
    this.metrics.requests += 1
    const method = options.method ?? 'POST'

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${options.path}`, {
        method,
        headers: this.headers(),
        signal: options.signal,
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {})
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          `${options.service}.${options.operation} returned ${response.status}: ${
            text || response.statusText
          }`
        )
      }

      return response.status === 204
        ? ({} as TResponse)
        : ((await response.json()) as TResponse)
    } catch (error) {
      const reason = toError(error).message
      if (this.offlineFallback && options.fallback) {
        this.recordFallback(options.service, options.operation, reason)
        return options.fallback(reason)
      }
      throw error
    }
  }
}

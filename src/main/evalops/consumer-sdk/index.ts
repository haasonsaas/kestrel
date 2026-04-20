import {
  AgentRegistryClient,
  ConnectorsClient,
  MemoryClient,
  MeterClient,
  SkillsClient,
  TracesClient
} from './clients'
import { EvalOpsTransport } from './http'
import type { EvalOpsClientConfig, EvalOpsClientMetrics } from './types'

export class EvalOpsClient {
  readonly meter: MeterClient
  readonly memory: MemoryClient
  readonly traces: TracesClient
  readonly agentRegistry: AgentRegistryClient
  readonly skills: SkillsClient
  readonly connectors: ConnectorsClient

  private readonly transport: EvalOpsTransport

  constructor(config: EvalOpsClientConfig = {}) {
    this.transport = new EvalOpsTransport(config)
    this.meter = new MeterClient(this.transport)
    this.memory = new MemoryClient(this.transport)
    this.traces = new TracesClient(this.transport)
    this.agentRegistry = new AgentRegistryClient(this.transport)
    this.skills = new SkillsClient(this.transport)
    this.connectors = new ConnectorsClient(this.transport)
  }

  static fromEnv(overrides: Omit<EvalOpsClientConfig, 'baseUrl' | 'token'> = {}): EvalOpsClient {
    return new EvalOpsClient(overrides)
  }

  get baseUrl(): string {
    return this.transport.baseUrl
  }

  getMetrics(): EvalOpsClientMetrics {
    return this.transport.getMetrics()
  }
}

export * from './clients'
export * from './http'
export * from './types'

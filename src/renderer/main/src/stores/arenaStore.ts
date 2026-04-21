import { makeAutoObservable, runInAction } from 'mobx'
import type { AIModel } from '../../../../shared/ipc'
import { ARENA_DEFAULT_MODELS } from '../../../../shared/config'

interface ArenaResponse {
  spanId: string
  model: string
  modelName: string
  content: string
  isStreaming: boolean
  voted: boolean
  error?: string
  startedAt?: number
  endedAt?: number
  latencyMs?: number
}

interface ArenaSession {
  id: string
  traceId: string
  rootSpanId: string
  prompt: string
  responses: ArenaResponse[]
  createdAt: number
  completedAt?: number
}

class ArenaStore {
  sessions: ArenaSession[] = []
  activeSession: ArenaSession | null = null
  selectedModels: string[] = [...ARENA_DEFAULT_MODELS]
  availableModels: AIModel[] = []
  isRunning = false

  constructor() {
    makeAutoObservable(this)
    this.loadModels()
  }

  private async loadModels() {
    const models = await window.api.invoke('ai:models')
    runInAction(() => {
      this.availableModels = models
    })
  }

  setSelectedModels(models: string[]) {
    this.selectedModels = models.slice(0, 4) // max 4
  }

  addModel(modelId: string) {
    if (this.selectedModels.length < 4 && !this.selectedModels.includes(modelId)) {
      this.selectedModels.push(modelId)
    }
  }

  removeModel(modelId: string) {
    if (this.selectedModels.length > 2) {
      this.selectedModels = this.selectedModels.filter((m) => m !== modelId)
    }
  }

  async runArena(prompt: string) {
    if (this.isRunning || this.selectedModels.length < 2) return

    const now = Date.now()
    const sessionId = `arena-${now}`
    const session: ArenaSession = {
      id: sessionId,
      traceId: `trace-${sessionId}`,
      rootSpanId: `span-${sessionId}-root`,
      prompt,
      responses: this.selectedModels.map((modelId, index) => ({
        spanId: `span-${sessionId}-${index}`,
        model: modelId,
        modelName: this.availableModels.find((m) => m.id === modelId)?.name || modelId.split('/').pop() || modelId,
        content: '',
        isStreaming: true,
        voted: false
      })),
      createdAt: now
    }

    runInAction(() => {
      this.activeSession = session
      this.sessions.unshift(session)
      this.isRunning = true
    })

    // Stream all models in parallel
    const promises = this.selectedModels.map((modelId, index) =>
      this.streamModel(session, index, prompt, modelId)
    )

    await Promise.allSettled(promises)

    runInAction(() => {
      this.isRunning = false
      session.completedAt = Date.now()
    })
    void this.recordArenaTrace(session)
  }

  private async streamModel(
    session: ArenaSession,
    index: number,
    prompt: string,
    model: string
  ) {
    // Set up stream listeners specific to this arena response
    const tempThreadId = `arena-${session.id}-${model}`
    const startedAt = Date.now()
    runInAction(() => {
      session.responses[index].startedAt = startedAt
    })

    const unsubChunk = window.api.on('ai:streamChunk', ({ threadId, chunk }) => {
      if (threadId !== tempThreadId) return
      runInAction(() => {
        session.responses[index].content += chunk
      })
    })

    const streamDone = new Promise<void>((resolve) => {
      const unsubEnd = window.api.on('ai:streamEnd', ({ threadId }) => {
        if (threadId !== tempThreadId) return
        const endedAt = Date.now()
        runInAction(() => {
          session.responses[index].isStreaming = false
          session.responses[index].endedAt = endedAt
          session.responses[index].latencyMs = endedAt - startedAt
        })
        unsubEnd()
        resolve()
      })

      const unsubError = window.api.on('ai:streamError', ({ threadId, error }) => {
        if (threadId !== tempThreadId) return
        const endedAt = Date.now()
        runInAction(() => {
          session.responses[index].isStreaming = false
          session.responses[index].error = error
          session.responses[index].endedAt = endedAt
          session.responses[index].latencyMs = endedAt - startedAt
          if (!session.responses[index].content) {
            session.responses[index].content = `Error from ${session.responses[index].modelName}: ${error}`
          }
        })
        unsubError()
        resolve()
      })
    })

    // Start streaming
    await window.api.invoke('ai:chatStream', {
      threadId: tempThreadId,
      messages: [{ role: 'user', content: prompt }],
      model,
      stream: true
    })

    await streamDone
    unsubChunk()
  }

  voteForResponse(sessionId: string, modelId: string) {
    const session = this.sessions.find((s) => s.id === sessionId)
    if (!session) return
    for (const resp of session.responses) {
      resp.voted = resp.model === modelId
    }
    void this.recordArenaVote(session, modelId)
  }

  private async recordArenaTrace(session: ArenaSession) {
    try {
      await window.api.invoke('evalops:arena:recordTrace', {
        sessionId: session.id,
        traceId: session.traceId,
        rootSpanId: session.rootSpanId,
        prompt: session.prompt,
        createdAt: new Date(session.createdAt).toISOString(),
        completedAt: new Date(session.completedAt ?? Date.now()).toISOString(),
        responses: session.responses.map((response) => ({
          spanId: response.spanId,
          model: response.model,
          modelName: response.modelName,
          content: response.content,
          error: response.error,
          startedAt: response.startedAt ? new Date(response.startedAt).toISOString() : undefined,
          endedAt: response.endedAt ? new Date(response.endedAt).toISOString() : undefined,
          latencyMs: response.latencyMs
        }))
      })
    } catch (err) {
      console.warn('[evalops:traces] Failed to record arena trace:', err)
    }
  }

  private async recordArenaVote(session: ArenaSession, winnerModelId: string) {
    const winner = session.responses.find((response) => response.model === winnerModelId)
    if (!winner) return
    try {
      await window.api.invoke('evalops:arena:recordVote', {
        sessionId: session.id,
        traceId: session.traceId,
        winnerSpanId: winner.spanId,
        responses: session.responses.map((response) => ({
          spanId: response.spanId,
          model: response.model,
          modelName: response.modelName,
          content: response.content,
          error: response.error,
          startedAt: response.startedAt ? new Date(response.startedAt).toISOString() : undefined,
          endedAt: response.endedAt ? new Date(response.endedAt).toISOString() : undefined,
          latencyMs: response.latencyMs
        }))
      })
    } catch (err) {
      console.warn('[evalops:traces] Failed to record arena vote:', err)
    }
  }
}

export const arenaStore = new ArenaStore()

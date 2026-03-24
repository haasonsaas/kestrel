import { makeAutoObservable, runInAction } from 'mobx'
import type { AIModel } from '../../../../shared/ipc'
import { ARENA_DEFAULT_MODELS } from '../../../../shared/config'

interface ArenaResponse {
  model: string
  modelName: string
  content: string
  isStreaming: boolean
  voted: boolean
  error?: string
}

interface ArenaSession {
  id: string
  prompt: string
  responses: ArenaResponse[]
  createdAt: number
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

    const session: ArenaSession = {
      id: `arena-${Date.now()}`,
      prompt,
      responses: this.selectedModels.map((modelId) => ({
        model: modelId,
        modelName: this.availableModels.find((m) => m.id === modelId)?.name || modelId.split('/').pop() || modelId,
        content: '',
        isStreaming: true,
        voted: false
      })),
      createdAt: Date.now()
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
    })
  }

  private async streamModel(
    session: ArenaSession,
    index: number,
    prompt: string,
    model: string
  ) {
    // Set up stream listeners specific to this arena response
    const tempThreadId = `arena-${session.id}-${model}`

    const unsubChunk = window.api.on('ai:streamChunk', ({ threadId, chunk }) => {
      if (threadId !== tempThreadId) return
      runInAction(() => {
        session.responses[index].content += chunk
      })
    })

    const streamDone = new Promise<void>((resolve) => {
      const unsubEnd = window.api.on('ai:streamEnd', ({ threadId }) => {
        if (threadId !== tempThreadId) return
        runInAction(() => {
          session.responses[index].isStreaming = false
        })
        unsubEnd()
        resolve()
      })

      const unsubError = window.api.on('ai:streamError', ({ threadId, error }) => {
        if (threadId !== tempThreadId) return
        runInAction(() => {
          session.responses[index].isStreaming = false
          session.responses[index].error = error
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
  }
}

export const arenaStore = new ArenaStore()

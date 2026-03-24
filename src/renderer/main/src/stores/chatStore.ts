import { makeAutoObservable, runInAction } from 'mobx'
import type { Thread, Message, AIModel, AppContext } from '../../../../shared/ipc'
import { DEFAULT_MODEL } from '../../../../shared/config'

interface ActiveToolCall {
  toolName: string
  serverName: string
}

class ChatStore {
  threads: Thread[] = []
  activeThreadId: string | null = null
  messages: Map<string, Message[]> = new Map()
  models: AIModel[] = []
  streamingContent: Map<string, string> = new Map()
  isStreaming: Map<string, boolean> = new Map()
  isLoading = false

  // Tool execution state
  activeToolCalls: Map<string, ActiveToolCall[]> = new Map()

  // Context state
  contextEnabled = true
  currentContext: AppContext | null = null
  contextAvailable = true  // Default to true — context will populate once user switches apps

  constructor() {
    makeAutoObservable(this)
    this.init()
  }

  private async init() {
    // Run all init tasks independently — don't let one failure block others
    this.setupStreamListeners()
    this.setupAppListeners()
    await Promise.allSettled([
      this.loadThreads(),
      this.loadModels(),
      this.checkContext(),
      this.loadContextPreference()
    ])
    // Poll context every 3 seconds
    setInterval(() => this.refreshContext(), 3000)
  }

  private setupAppListeners() {
    // Listen for Cmd+N (new chat) from main process
    window.api.on('app:newChat', () => {
      this.createThread()
    })

    // Refresh context immediately when window gets focus
    // (user switched back from another app — context should show that app)
    window.addEventListener('focus', () => {
      this.refreshContext()
    })

    // Also refresh on visibility change (tab/space switching)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.refreshContext()
      }
    })
  }

  private async loadContextPreference() {
    try {
      const saved = await window.api.invoke('settings:get', 'contextEnabled')
      if (saved !== null && saved !== undefined) {
        runInAction(() => {
          this.contextEnabled = saved === true || saved === 'true'
        })
      }
    } catch {
      // Default stays true
    }
  }

  private setupStreamListeners() {
    window.api.on('ai:streamChunk', ({ threadId, chunk }) => {
      runInAction(() => {
        const current = this.streamingContent.get(threadId) || ''
        this.streamingContent.set(threadId, current + chunk)
      })
    })

    window.api.on('ai:streamEnd', ({ threadId }) => {
      runInAction(() => {
        const content = this.streamingContent.get(threadId) || ''
        this.streamingContent.delete(threadId)
        this.isStreaming.set(threadId, false)
        this.activeToolCalls.delete(threadId)

        const msgs = this.messages.get(threadId) || []
        msgs.push({
          id: `temp-${Date.now()}`,
          threadId,
          role: 'assistant',
          content,
          createdAt: Date.now()
        })
        this.messages.set(threadId, [...msgs])
        this.loadThreads()
      })
    })

    window.api.on('ai:streamError', ({ threadId, error }) => {
      runInAction(() => {
        this.streamingContent.delete(threadId)
        this.isStreaming.set(threadId, false)
        this.activeToolCalls.delete(threadId)
        console.error(`Stream error for thread ${threadId}:`, error)
      })
    })

    window.api.on('ai:toolStart', ({ threadId, toolName, serverName }) => {
      runInAction(() => {
        const calls = this.activeToolCalls.get(threadId) || []
        calls.push({ toolName, serverName })
        this.activeToolCalls.set(threadId, [...calls])
      })
    })

    window.api.on('ai:toolEnd', ({ threadId, toolName, serverName }) => {
      runInAction(() => {
        const calls = this.activeToolCalls.get(threadId) || []
        const filtered = calls.filter(
          (c) => !(c.toolName === toolName && c.serverName === serverName)
        )
        if (filtered.length === 0) {
          this.activeToolCalls.delete(threadId)
        } else {
          this.activeToolCalls.set(threadId, filtered)
        }
      })
    })
  }

  async checkContext() {
    // Retry a few times — ContextKit may still be starting
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // Check permissions first — this tells us if accessibility is granted
        const permissions = await window.api.invoke('context:checkPermissions')
        if (permissions.accessibility) {
          runInAction(() => { this.contextAvailable = true })

          // Also try to get initial context
          const context = await window.api.invoke('context:get')
          if (context) {
            runInAction(() => { this.currentContext = context })
          }
          // Context may be null if Kestrel is frontmost (no cached app yet)
          // but that's OK — contextAvailable is still true
          return
        }
      } catch {
        // ContextKit not ready yet
      }
      await new Promise(r => setTimeout(r, (attempt + 1) * 1000))
    }
    // After all retries, default to available (optimistic) — the context
    // toggle will show the app name once the user switches apps
    runInAction(() => { this.contextAvailable = true })
  }

  async refreshContext() {
    if (!this.contextEnabled) return
    try {
      const context = await window.api.invoke('context:get')
      runInAction(() => {
        if (context) {
          this.currentContext = context
          this.contextAvailable = true
        }
      })
    } catch {
      // Ignore — context is best-effort
    }
  }

  toggleContext() {
    this.contextEnabled = !this.contextEnabled
    // Persist the preference
    window.api.invoke('settings:set', 'contextEnabled', this.contextEnabled)
    if (!this.contextEnabled) {
      this.currentContext = null
    } else {
      this.refreshContext()
    }
  }

  async loadThreads() {
    const threads = await window.api.invoke('threads:list')
    runInAction(() => {
      this.threads = threads
    })
  }

  async loadModels() {
    const models = await window.api.invoke('ai:models')
    runInAction(() => {
      this.models = models
    })
  }

  async loadMessages(threadId: string) {
    const messages = await window.api.invoke('messages:list', threadId)
    runInAction(() => {
      this.messages.set(threadId, messages)
    })
  }

  async createThread(): Promise<Thread> {
    const thread = await window.api.invoke('threads:create')
    runInAction(() => {
      this.threads.unshift(thread)
      this.activeThreadId = thread.id
      this.messages.set(thread.id, [])
    })
    return thread
  }

  async deleteThread(threadId: string) {
    await window.api.invoke('threads:delete', threadId)
    runInAction(() => {
      this.threads = this.threads.filter(t => t.id !== threadId)
      if (this.activeThreadId === threadId) {
        this.activeThreadId = this.threads[0]?.id || null
      }
      this.messages.delete(threadId)
    })
  }

  async starThread(threadId: string) {
    const thread = this.threads.find(t => t.id === threadId)
    if (!thread) return
    const starred = !thread.starred
    await window.api.invoke('threads:update', threadId, { starred })
    runInAction(() => {
      thread.starred = starred
    })
  }

  setActiveThread(threadId: string) {
    this.activeThreadId = threadId
    if (!this.messages.has(threadId)) {
      this.loadMessages(threadId)
    }
  }

  async sendMessage(content: string, model?: string) {
    if (!this.activeThreadId) return

    const threadId = this.activeThreadId
    const thread = this.threads.find(t => t.id === threadId)
    const selectedModel = model || thread?.model || DEFAULT_MODEL

    // Save user message
    const userMessage = await window.api.invoke('messages:create', {
      threadId,
      role: 'user',
      content
    })

    runInAction(() => {
      const msgs = this.messages.get(threadId) || []
      msgs.push(userMessage)
      this.messages.set(threadId, [...msgs])
      this.isStreaming.set(threadId, true)
      this.streamingContent.set(threadId, '')
    })

    // Build full message history for the API
    const allMessages = (this.messages.get(threadId) || []).map(m => ({
      role: m.role,
      content: m.content
    }))

    // Start streaming — includeContext tells the main process to fetch and inject context
    await window.api.invoke('ai:chatStream', {
      threadId,
      messages: allMessages,
      model: selectedModel,
      includeContext: this.contextEnabled,
      stream: true
    })
  }

  get activeThread(): Thread | null {
    return this.threads.find(t => t.id === this.activeThreadId) || null
  }

  get activeMessages(): Message[] {
    if (!this.activeThreadId) return []
    return this.messages.get(this.activeThreadId) || []
  }

  get activeStreamingContent(): string | null {
    if (!this.activeThreadId) return null
    return this.streamingContent.get(this.activeThreadId) || null
  }

  get isActiveStreaming(): boolean {
    if (!this.activeThreadId) return false
    return this.isStreaming.get(this.activeThreadId) || false
  }

  get activeThreadToolCalls(): ActiveToolCall[] {
    if (!this.activeThreadId) return []
    return this.activeToolCalls.get(this.activeThreadId) || []
  }

  get isExecutingTools(): boolean {
    return this.activeThreadToolCalls.length > 0
  }

  get contextSummary(): string | null {
    if (!this.currentContext) return null
    const c = this.currentContext
    const parts = [c.appName]
    if (c.windowTitle) parts.push(c.windowTitle)
    if (c.url) parts.push(c.url)
    return parts.join(' — ')
  }
}

export const chatStore = new ChatStore()

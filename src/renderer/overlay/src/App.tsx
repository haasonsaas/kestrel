import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Bird, Sparkles, Loader2 } from 'lucide-react'
import '../../main/src/styles/globals.css'
import { DEFAULT_MODEL } from '../../../shared/config'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function OverlayApp() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [modelDisplayName, setModelDisplayName] = useState('GPT-5.4')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load model from settings on mount
  useEffect(() => {
    const loadModel = async () => {
      try {
        const savedModel = await window.api.invoke('settings:get', 'default_model')
        if (savedModel && typeof savedModel === 'string') {
          setModel(savedModel)
          // Extract display name from model ID
          const name = savedModel.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || savedModel
          setModelDisplayName(name)
        }
        // Also try to get the proper display name from models list
        const models = await window.api.invoke('ai:models')
        const currentModel = savedModel && typeof savedModel === 'string' ? savedModel : DEFAULT_MODEL
        const found = models.find((m: { id: string; name: string }) => m.id === currentModel)
        if (found) {
          setModelDisplayName(found.name)
        }
      } catch {
        // Fallback to default
      }
    }
    loadModel()
  }, [])

  // Set up stream listeners once
  useEffect(() => {
    const unsubChunk = window.api.on('ai:streamChunk', ({ threadId: tid, chunk }) => {
      setStreamingContent((prev) => prev + chunk)
    })

    const unsubEnd = window.api.on('ai:streamEnd', ({ threadId: tid }) => {
      setStreamingContent((prev) => {
        if (prev) {
          setMessages((msgs) => [...msgs, { role: 'assistant', content: prev }])
        }
        return ''
      })
      setIsStreaming(false)
    })

    const unsubError = window.api.on('ai:streamError', ({ threadId: tid, error }) => {
      setStreamingContent('')
      setIsStreaming(false)
      setMessages((msgs) => [...msgs, { role: 'assistant', content: `Error: ${error}` }])
    })

    return () => {
      unsubChunk()
      unsubEnd()
      unsubError()
    }
  }, [])

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput('')

    // Create thread on first message
    let tid = threadId
    if (!tid) {
      const thread = await window.api.invoke('threads:create')
      tid = thread.id
      setThreadId(tid)
    }

    // Add user message to local state
    const updatedMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(updatedMessages)
    setIsStreaming(true)
    setStreamingContent('')

    // Save user message to DB
    await window.api.invoke('messages:create', {
      threadId: tid,
      role: 'user',
      content: text
    })

    // Build message history for the API
    const allMessages = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content
    }))

    // Start streaming
    await window.api.invoke('ai:chatStream', {
      threadId: tid,
      messages: allMessages,
      model,
      includeContext: true,
      stream: true
    })
  }, [input, isStreaming, threadId, messages, model])

  const hasMessages = messages.length > 0 || streamingContent

  return (
    <div className="flex flex-col h-screen glass bg-background/80">
      {/* Drag handle */}
      <div className="titlebar-drag h-10 flex items-center justify-center shrink-0 border-b border-border/50">
        <div className="w-10 h-[3px] rounded-full bg-border/60" />
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 scroll-fade">
        {!hasMessages ? (
          <div className="flex flex-col items-center text-center py-12 animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-warm/10 border border-warm/15 flex items-center justify-center mb-4">
              <Bird className="h-6 w-6 text-warm" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-semibold mb-1">Quick Access</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Ask anything with your current<br />app context included.
            </p>

            {/* Context indicator */}
            <div className="mt-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/80 border border-border/50">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[11px] text-muted-foreground">Context capture active</span>
            </div>

            <div className="mt-8 text-[11px] text-muted-foreground/40">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
                Cmd+Shift+Space
              </kbd>
              <span className="ml-1.5">to toggle</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-foreground text-background'
                      : 'bg-muted/80 border border-border/50'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed bg-muted/80 border border-border/50">
                  <p className="whitespace-pre-wrap">{streamingContent}</p>
                </div>
              </div>
            )}
            {isStreaming && !streamingContent && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 bg-muted/80 border border-border/50">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/50">
        <div className="flex gap-2 items-end">
          <div className="flex-1 rounded-xl border border-border bg-card/80 focus-within:border-warm/40 focus-within:shadow-[0_0_0_3px_rgba(196,160,82,0.08)] transition-all duration-200">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask anything..."
              className="w-full bg-transparent px-3 py-2.5 text-[14px] focus:outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="p-2.5 rounded-xl bg-foreground text-background disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all duration-150 shadow-sm shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 px-1">
          <Bird className="h-3 w-3 text-warm" />
          <span className="text-[11px] text-muted-foreground">{modelDisplayName}</span>
        </div>
      </div>
    </div>
  )
}

export default OverlayApp

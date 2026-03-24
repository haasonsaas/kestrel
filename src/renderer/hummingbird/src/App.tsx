import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send,
  Bird,
  Loader2,
  Pin,
  PinOff,
  Maximize2,
  Mic,
  MicOff,
  X
} from 'lucide-react'
import { DEFAULT_MODEL } from '../../../shared/config'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function HummingbirdApp() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [modelName, setModelName] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load model on mount
  useEffect(() => {
    ;(async () => {
      try {
        const saved = await window.api.invoke('settings:get', 'default_model')
        if (saved && typeof saved === 'string') setModel(saved)
        const models = await window.api.invoke('ai:models')
        const current = saved && typeof saved === 'string' ? saved : DEFAULT_MODEL
        const found = models.find((m: { id: string; name: string }) => m.id === current)
        if (found) setModelName(found.name)
      } catch {}
    })()
  }, [])

  // Stream listeners
  useEffect(() => {
    const unsubChunk = window.api.on('ai:streamChunk', ({ chunk }) => {
      setStreamingContent((prev) => prev + chunk)
    })
    const unsubEnd = window.api.on('ai:streamEnd', () => {
      setStreamingContent((prev) => {
        if (prev) setMessages((msgs) => [...msgs, { role: 'assistant', content: prev }])
        return ''
      })
      setIsStreaming(false)
    })
    const unsubError = window.api.on('ai:streamError', ({ error }) => {
      setStreamingContent('')
      setIsStreaming(false)
      setMessages((msgs) => [...msgs, { role: 'assistant', content: `Error: ${error}` }])
    })
    return () => { unsubChunk(); unsubEnd(); unsubError() }
  }, [])

  // Voice mode events
  useEffect(() => {
    const unsubVoice = window.api.on('hummingbird:voiceMode', ({ active }) => {
      setVoiceMode(active)
      if (active) setIsRecordingVoice(true)
    })
    const unsubTranscript = window.api.on('hummingbird:voiceTranscript', ({ text }) => {
      setVoiceMode(false)
      setIsRecordingVoice(false)
      if (text.trim()) {
        setInput(text)
        // Auto-send after small delay
        setTimeout(() => {
          const fakeInput = text.trim()
          if (fakeInput) sendMessage(fakeInput)
        }, 100)
      }
    })
    const unsubRecording = window.api.on('hummingbird:voiceRecording', ({ recording }) => {
      setIsRecordingVoice(recording)
      if (!recording) setVoiceMode(false)
    })
    return () => { unsubVoice(); unsubTranscript(); unsubRecording() }
  }, [messages, threadId, model])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streamingContent])

  // Focus input when shown
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text ?? input.trim()
    if (!msg || isStreaming) return
    setInput('')

    let tid = threadId
    if (!tid) {
      const thread = await window.api.invoke('threads:create')
      tid = thread.id
      setThreadId(tid)
    }

    const updated: ChatMessage[] = [...messages, { role: 'user', content: msg }]
    setMessages(updated)
    setIsStreaming(true)
    setStreamingContent('')

    await window.api.invoke('messages:create', { threadId: tid, role: 'user', content: msg })
    await window.api.invoke('ai:chatStream', {
      threadId: tid,
      messages: updated.map((m) => ({ role: m.role, content: m.content })),
      model,
      includeContext: true,
      stream: true
    })
  }, [input, isStreaming, threadId, messages, model])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
    if (e.key === 'Escape') {
      window.api.invoke('window:close')
    }
  }

  const clearChat = () => {
    setMessages([])
    setStreamingContent('')
    setThreadId(null)
    setInput('')
  }

  const hasMessages = messages.length > 0 || streamingContent

  return (
    <div className="flex flex-col h-screen rounded-2xl overflow-hidden">
      {/* Drag handle + toolbar */}
      <div className="titlebar-drag flex items-center justify-between px-3 pt-2.5 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 titlebar-no-drag">
          <button
            onClick={() => setIsPinned(!isPinned)}
            className="p-1 rounded-md hover:bg-foreground/5 transition-colors"
            title={isPinned ? 'Unpin' : 'Pin on top'}
          >
            {isPinned ? (
              <Pin className="h-3 w-3 text-warm" strokeWidth={2} />
            ) : (
              <PinOff className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
            )}
          </button>
        </div>

        {/* Center pill — drag area */}
        <div className="w-8 h-[3px] rounded-full bg-foreground/10" />

        <div className="flex items-center gap-1 titlebar-no-drag">
          {hasMessages && (
            <button
              onClick={clearChat}
              className="p-1 rounded-md hover:bg-foreground/5 transition-colors"
              title="New chat"
            >
              <X className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={() => {
              if (mainWindow) window.api.invoke('window:toggleOverlay')
            }}
            className="p-1 rounded-md hover:bg-foreground/5 transition-colors"
            title="Expand to main window"
          >
            <Maximize2 className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Voice mode overlay */}
      {voiceMode && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 rounded-2xl animate-fade-in">
          <div className="relative mb-6">
            {/* Pulsing rings */}
            <div className="absolute inset-0 -m-6 rounded-full bg-warm/10 animate-[pulse-ring_1.5s_ease-out_infinite]" />
            <div className="absolute inset-0 -m-3 rounded-full bg-warm/15 animate-[pulse-ring_1.5s_ease-out_0.3s_infinite]" />
            <div className="w-16 h-16 rounded-full bg-warm/20 border-2 border-warm/40 flex items-center justify-center">
              {isRecordingVoice ? (
                <Mic className="h-7 w-7 text-warm animate-pulse-soft" strokeWidth={1.5} />
              ) : (
                <MicOff className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              )}
            </div>
          </div>
          <p className="text-sm font-medium text-foreground/80">
            {isRecordingVoice ? 'Listening...' : 'Processing...'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Release to send</p>

          {/* Waveform bars */}
          {isRecordingVoice && (
            <div className="flex items-end gap-[3px] mt-5 h-6">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-warm/60"
                  style={{
                    animation: `waveform 0.8s ease-in-out ${i * 0.06}s infinite alternate`,
                    height: '4px'
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 scroll-fade">
        {!hasMessages ? (
          <div className="flex flex-col items-center text-center pt-16 pb-8 animate-fade-in">
            <div className="w-11 h-11 rounded-[14px] bg-gradient-to-br from-warm/15 to-warm/5 border border-warm/15 flex items-center justify-center mb-3.5">
              <Bird className="h-5 w-5 text-warm" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-semibold tracking-tight mb-0.5">Kestrel</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[240px]">
              Ask anything — I can see your screen context.
            </p>

            <div className="mt-5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-border/40">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
              <span className="text-[10px] text-muted-foreground">Context active</span>
            </div>

            <div className="mt-6 space-y-1.5">
              <Shortcut keys={['⌥', '⌥']} label="toggle" />
              <Shortcut keys={['hold', '⌥']} label="voice" />
              <Shortcut keys={['esc']} label="dismiss" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div
                  className={`max-w-[88%] rounded-[16px] px-3.5 py-2 text-[13px] leading-[1.55] ${
                    msg.role === 'user'
                      ? 'bg-foreground text-background rounded-br-md'
                      : 'bg-muted/70 border border-border/40 rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            ))}
            {streamingContent && (
              <div className="flex justify-start animate-fade-in">
                <div className="max-w-[88%] rounded-[16px] rounded-bl-md px-3.5 py-2 text-[13px] leading-[1.55] bg-muted/70 border border-border/40">
                  <p className="whitespace-pre-wrap break-words">{streamingContent}</p>
                </div>
              </div>
            )}
            {isStreaming && !streamingContent && (
              <div className="flex justify-start">
                <div className="rounded-[16px] rounded-bl-md px-3.5 py-2 bg-muted/70 border border-border/40">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-[bounce_1s_ease-in-out_0s_infinite]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-[bounce_1s_ease-in-out_0.15s_infinite]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-[bounce_1s_ease-in-out_0.3s_infinite]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 pt-1.5">
        <div className="flex gap-1.5 items-end">
          <div className="flex-1 rounded-xl border border-border/60 bg-card/60 focus-within:border-warm/30 focus-within:shadow-[0_0_0_3px_rgba(196,160,82,0.06)] transition-all duration-200">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="w-full bg-transparent px-3 py-2 text-[13px] focus:outline-none placeholder:text-muted-foreground/35"
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isStreaming}
            className="p-2 rounded-xl bg-foreground text-background disabled:opacity-20 hover:opacity-90 active:scale-95 transition-all duration-150 shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <div className="flex items-center gap-1">
            <Bird className="h-2.5 w-2.5 text-warm/70" />
            <span className="text-[10px] text-muted-foreground/50">{modelName || 'AI'}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/30">⌥⌥</span>
        </div>
      </div>
    </div>
  )
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
      <div className="flex gap-0.5">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="px-1 py-0.5 rounded bg-muted/60 border border-border/30 font-mono text-[9px] min-w-[18px] text-center"
          >
            {k}
          </kbd>
        ))}
      </div>
      <span>{label}</span>
    </div>
  )
}

export default HummingbirdApp

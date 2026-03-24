import { useState, useCallback, KeyboardEvent } from 'react'
import { observer } from 'mobx-react-lite'
import { chatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import { Send, ChevronDown, Bird, Eye, EyeOff } from 'lucide-react'
import { DEFAULT_MODEL } from '../../../../../shared/config'

export const Composer = observer(function Composer() {
  const [input, setInput] = useState('')
  const isStreaming = chatStore.isActiveStreaming

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    setInput('')

    if (!chatStore.activeThreadId) {
      await chatStore.createThread()
    }

    await chatStore.sendMessage(trimmed)
  }, [input, isStreaming])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="p-4 pb-5">
      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            'relative flex items-end gap-2 rounded-2xl border bg-card p-3',
            'shadow-sm transition-all duration-200',
            'focus-within:border-warm/40 focus-within:shadow-[0_0_0_3px_rgba(196,160,82,0.08)]',
            'border-border'
          )}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Kestrel..."
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent px-1 py-1 text-[14px]',
              'focus:outline-none placeholder:text-muted-foreground/50',
              'min-h-[28px] max-h-[200px]'
            )}
            style={{
              height: 'auto',
              overflow: input.split('\n').length > 5 ? 'auto' : 'hidden'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 200)}px`
            }}
          />

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className={cn(
                'p-2 rounded-xl transition-all duration-200',
                input.trim() && !isStreaming
                  ? 'bg-foreground text-background hover:opacity-90 active:scale-95 shadow-sm'
                  : 'text-muted-foreground/30 cursor-not-allowed'
              )}
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Footer: model + context + hints */}
        <div className="flex items-center justify-between mt-2.5 px-1">
          <div className="flex items-center gap-3">
            <ModelSelector />
            <ContextToggle />
          </div>
          <span className="text-[11px] text-muted-foreground/40">
            {isStreaming ? (
              <span className="text-warm animate-pulse-soft">Generating...</span>
            ) : (
              <span>
                <kbd className="font-mono">Shift+Enter</kbd> for new line
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
})

const ModelSelector = observer(function ModelSelector() {
  const [open, setOpen] = useState(false)
  const thread = chatStore.activeThread
  const currentModel = thread?.model || DEFAULT_MODEL
  const model = chatStore.models.find((m) => m.id === currentModel)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1 -ml-2 hover:bg-muted"
      >
        <Bird className="h-3 w-3 text-warm" />
        <span className="font-medium">{model?.name || currentModel.split('/').pop()}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-xl border border-border bg-popover shadow-lg py-1 max-h-80 overflow-y-auto animate-fade-in">
            {chatStore.models.map((m) => (
              <button
                key={m.id}
                onClick={async () => {
                  if (thread) {
                    await window.api.invoke('threads:update', thread.id, { model: m.id })
                    chatStore.loadThreads()
                  }
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left px-3 py-2 text-[13px] transition-colors flex items-center justify-between',
                  m.id === currentModel
                    ? 'bg-muted font-medium'
                    : 'hover:bg-muted/50'
                )}
              >
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground">{m.provider}</p>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {m.contextWindow >= 1000000
                    ? `${(m.contextWindow / 1000000).toFixed(1)}M`
                    : `${(m.contextWindow / 1000).toFixed(0)}K`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
})

const ContextToggle = observer(function ContextToggle() {
  const enabled = chatStore.contextEnabled
  const available = chatStore.contextAvailable
  const summary = chatStore.contextSummary

  return (
    <button
      onClick={() => chatStore.toggleContext()}
      title={
        !available
          ? 'Context capture unavailable — grant Accessibility permission'
          : enabled
            ? `Context ON: ${summary || 'reading screen...'}`
            : 'Context OFF — click to enable'
      }
      className={cn(
        'flex items-center gap-1.5 text-[12px] rounded-lg px-2 py-1 transition-all duration-150',
        enabled && available
          ? 'text-warm hover:bg-warm/10'
          : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted'
      )}
    >
      {enabled && available ? (
        <>
          <Eye className="h-3 w-3" />
          <span className="max-w-[140px] truncate font-medium">
            {summary ? summary.split(' — ')[0] : 'Context'}
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
        </>
      ) : (
        <>
          <EyeOff className="h-3 w-3" />
          <span>{available ? 'Context off' : 'No access'}</span>
        </>
      )}
    </button>
  )
})

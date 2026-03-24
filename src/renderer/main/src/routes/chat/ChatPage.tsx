import { observer } from 'mobx-react-lite'
import { chatStore } from '@/stores/chatStore'
import { ThreadList } from '@/components/chat/ThreadList'
import { MessageList } from '@/components/chat/MessageList'
import { Composer } from '@/components/chat/Composer'
import { Bird, Code2, Lightbulb, FileText, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ChatPage = observer(function ChatPage() {
  const hasThreads = chatStore.threads.length > 0
  const hasActiveThread = chatStore.activeThreadId !== null

  return (
    <div className="flex h-full">
      {hasThreads && <ThreadList />}
      <div className="flex-1 flex flex-col">
        {hasActiveThread ? (
          <>
            <MessageList />
            <Composer />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
})

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col px-6 relative overflow-y-auto">
      {/* Content centered vertically with some top breathing room */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-12">
        <div className="relative z-10 flex flex-col items-center animate-fade-in max-w-xl w-full">
          {/* Logo mark */}
          <div className="w-16 h-16 rounded-2xl bg-warm/10 border border-warm/20 flex items-center justify-center mb-6">
            <Bird className="h-8 w-8 text-warm" strokeWidth={1.5} />
          </div>

          <h2 className="text-xl font-semibold tracking-tight mb-2">
            Good {getTimeOfDay()}
          </h2>
          <p className="text-[14px] text-muted-foreground text-center max-w-sm mb-8 leading-relaxed">
            What would you like to explore?
          </p>

          {/* Quick prompts */}
          <div className="grid grid-cols-2 gap-3 w-full">
            {quickPrompts.map((prompt, i) => (
              <button
                key={prompt.label}
                onClick={async () => {
                  await chatStore.createThread()
                  chatStore.sendMessage(prompt.text)
                }}
                className={cn(
                  'group text-left p-4 rounded-2xl border',
                  'border-border bg-card hover:bg-accent hover:border-warm/30',
                  'transition-all duration-200 active:scale-[0.98]'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-warm/15 transition-colors">
                    <prompt.icon className="h-4 w-4 text-muted-foreground group-hover:text-warm transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium mb-0.5">{prompt.label}</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
                      {prompt.text}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Keyboard hint */}
          <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground/50">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
              Cmd+Shift+Space
            </kbd>
            <span>for quick access anywhere</span>
          </div>
        </div>
      </div>

      {/* Composer at bottom */}
      <div className="w-full mt-auto relative z-10">
        <Composer />
      </div>
    </div>
  )
}

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

const quickPrompts = [
  {
    icon: Lightbulb,
    label: 'Explain a concept',
    text: 'Explain how transformers work in machine learning, with a simple analogy.'
  },
  {
    icon: Code2,
    label: 'Write code',
    text: 'Write a TypeScript function that debounces async operations with proper cleanup.'
  },
  {
    icon: FileText,
    label: 'Summarize',
    text: 'Summarize the key differences between REST, GraphQL, and gRPC for building APIs.'
  },
  {
    icon: Zap,
    label: 'Brainstorm',
    text: 'Help me brainstorm creative names for a productivity app.'
  }
]

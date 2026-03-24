import { observer } from 'mobx-react-lite'
import { chatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import { MessageSquare, Star, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export const ThreadList = observer(function ThreadList() {
  const threads = chatStore.threads
  const activeThreadId = chatStore.activeThreadId

  if (threads.length === 0) {
    return null
  }

  // Group: starred first, then by recency
  const starred = threads.filter((t) => t.starred)
  const recent = threads.filter((t) => !t.starred)

  return (
    <div className="w-64 border-r border-border h-full overflow-y-auto bg-sidebar/50">
      <div className="p-3">
        {starred.length > 0 && (
          <>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
              Starred
            </h3>
            {starred.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
              />
            ))}
            <div className="my-3" />
          </>
        )}

        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
          Recent
        </h3>
        {recent.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isActive={thread.id === activeThreadId}
          />
        ))}
      </div>
    </div>
  )
})

interface ThreadItemProps {
  thread: { id: string; title: string; starred: boolean; updatedAt: number }
  isActive: boolean
}

const ThreadItem = observer(function ThreadItem({ thread, isActive }: ThreadItemProps) {
  return (
    <button
      onClick={() => chatStore.setActiveThread(thread.id)}
      className={cn(
        'w-full text-left rounded-lg px-3 py-2 mb-0.5 group transition-colors',
        isActive ? 'bg-muted' : 'hover:bg-muted/50'
      )}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate">{thread.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDistanceToNow(thread.updatedAt, { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              chatStore.starThread(thread.id)
            }}
            className="p-0.5 hover:text-yellow-500"
          >
            <Star
              className={cn('h-3 w-3', thread.starred && 'fill-yellow-500 text-yellow-500')}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              chatStore.deleteThread(thread.id)
            }}
            className="p-0.5 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </button>
  )
})

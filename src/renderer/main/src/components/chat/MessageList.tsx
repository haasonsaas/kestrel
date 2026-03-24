import { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { chatStore } from '@/stores/chatStore'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../../../../shared/ipc'

export const MessageList = observer(function MessageList() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const messages = chatStore.activeMessages
  const streamingContent = chatStore.activeStreamingContent
  const isStreaming = chatStore.isActiveStreaming

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, streamingContent])

  if (messages.length === 0 && !isStreaming) {
    return null
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
      <div className="max-w-3xl mx-auto">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming message in progress */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: 'streaming',
              threadId: chatStore.activeThreadId || '',
              role: 'assistant',
              content: streamingContent,
              createdAt: Date.now()
            }}
            isStreaming
          />
        )}
      </div>
    </div>
  )
})

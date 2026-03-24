import { cn } from '@/lib/utils'
import type { Message } from '../../../../../shared/ipc'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bird, User } from 'lucide-react'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3 py-5 animate-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
          isUser
            ? 'bg-foreground text-background'
            : 'bg-gradient-to-br from-warm/15 to-warm/5 border border-warm/15'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Bird className="h-4 w-4 text-warm" strokeWidth={2} />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-[14px] leading-[1.65]',
          isUser
            ? 'bg-foreground text-background rounded-tr-lg'
            : 'bg-muted/70 text-foreground rounded-tl-lg border border-border/50'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-3 prose-pre:my-3 prose-li:my-0.5 prose-code:text-[13px] prose-pre:bg-background prose-pre:border prose-pre:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {isStreaming && (
          <span className="inline-block w-[3px] h-[18px] bg-warm rounded-full animate-pulse-soft ml-0.5 -mb-0.5" />
        )}
      </div>
    </div>
  )
}

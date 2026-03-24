import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { arenaStore } from '@/stores/arenaStore'
import { cn } from '@/lib/utils'
import { Swords, Send, Trophy, Plus, X, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const ArenaPage = observer(function ArenaPage() {
  const [prompt, setPrompt] = useState('')
  const session = arenaStore.activeSession
  const isRunning = arenaStore.isRunning

  const handleRun = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || isRunning) return
    setPrompt('')
    await arenaStore.runArena(trimmed)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3 mb-4">
          <Swords className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Arena</h2>
          <span className="text-sm text-muted-foreground">
            Compare AI model responses side by side
          </span>
        </div>

        {/* Model selector */}
        <ModelSelector />

        {/* Prompt input */}
        <div className="flex gap-2 mt-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
            placeholder="Enter a prompt to compare models..."
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            disabled={isRunning}
          />
          <button
            onClick={handleRun}
            disabled={!prompt.trim() || isRunning}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Response panels */}
      {session ? (
        <div className="flex-1 overflow-hidden flex">
          {session.responses.map((response, i) => (
            <div
              key={response.model}
              className={cn(
                'flex-1 flex flex-col overflow-hidden',
                i < session.responses.length - 1 && 'border-r border-border'
              )}
            >
              {/* Model header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{response.modelName}</span>
                  {response.isStreaming && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      generating...
                    </span>
                  )}
                </div>
                <button
                  onClick={() => arenaStore.voteForResponse(session.id, response.model)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                    response.voted
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Trophy className="h-3 w-3" />
                  {response.voted ? 'Winner' : 'Vote'}
                </button>
              </div>

              {/* Response content */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {response.error ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-medium text-destructive mb-1">
                      {response.modelName} failed
                    </p>
                    <p className="text-xs text-destructive/80">{response.error}</p>
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {response.content}
                    </ReactMarkdown>
                    {response.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-current opacity-70 animate-pulse" />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Swords className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Enter a prompt above to start comparing models.</p>
            <p className="text-xs mt-2">Select 2-4 models to compare their responses.</p>
          </div>
        </div>
      )}
    </div>
  )
})

const ModelSelector = observer(function ModelSelector() {
  const selected = arenaStore.selectedModels
  const available = arenaStore.availableModels

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {selected.map((modelId) => {
        const model = available.find((m) => m.id === modelId)
        return (
          <span
            key={modelId}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-sm"
          >
            {model?.name || modelId.split('/').pop()}
            {selected.length > 2 && (
              <button
                onClick={() => arenaStore.removeModel(modelId)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        )
      })}

      {selected.length < 4 && (
        <select
          onChange={(e) => {
            if (e.target.value) {
              arenaStore.addModel(e.target.value)
              e.target.value = ''
            }
          }}
          className="text-sm border border-input rounded-lg px-2 py-1 bg-background text-muted-foreground"
          defaultValue=""
        >
          <option value="">+ Add model</option>
          {available
            .filter((m) => !selected.includes(m.id))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      )}
    </div>
  )
})

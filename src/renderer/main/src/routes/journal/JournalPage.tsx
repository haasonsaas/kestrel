import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { journalStore } from '@/stores/journalStore'
import { cn } from '@/lib/utils'
import { BookOpen, ChevronLeft, ChevronRight, Sparkles, Calendar } from 'lucide-react'
import { format, addDays, subDays, startOfWeek, addWeeks, isSameDay, isToday, parseISO } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const JournalPage = observer(function JournalPage() {
  const entry = journalStore.currentEntry
  const isGenerating = journalStore.isGenerating
  const selectedDate = journalStore.selectedDate

  return (
    <div className="flex h-full">
      {/* Calendar sidebar */}
      <div className="w-72 border-r border-border p-4">
        <MiniCalendar />
      </div>

      {/* Journal content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold">
                {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
              </h2>
              {isToday(parseISO(selectedDate)) && (
                <span className="text-sm text-muted-foreground">Today</span>
              )}
            </div>

            <button
              onClick={() => journalStore.generateEntry()}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {isGenerating ? 'Generating...' : entry ? 'Regenerate' : 'Generate Journal'}
            </button>
          </div>

          {entry ? (
            <div>
              <h3 className="text-xl font-semibold mb-2">{entry.title}</h3>
              {entry.tldr && (
                <p className="text-sm text-muted-foreground italic mb-6 border-l-2 border-border pl-3">
                  {entry.tldr}
                </p>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {entry.content}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm mb-2">No journal entry for this date.</p>
              <p className="text-xs">Click "Generate Journal" to create one from your activity.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

const MiniCalendar = observer(function MiniCalendar() {
  const [viewDate, setViewDate] = useState(new Date())
  const selectedDate = journalStore.selectedDate
  const entryDates = journalStore.entryDates

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
  const calStart = startOfWeek(monthStart)

  const weeks: Date[][] = []
  let current = calStart
  while (current <= monthEnd || weeks.length < 6) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(current)
      current = addDays(current, 1)
    }
    weeks.push(week)
    if (current > monthEnd && weeks.length >= 5) break
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))}
          className="p-1 rounded hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))}
          className="p-1 rounded hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const isSelected = dateStr === selectedDate
            const hasEntry = entryDates.has(dateStr)
            const isCurrentMonth = day.getMonth() === viewDate.getMonth()

            return (
              <button
                key={dateStr}
                onClick={() => journalStore.setSelectedDate(dateStr)}
                className={cn(
                  'w-8 h-8 rounded-full text-xs flex items-center justify-center transition-colors relative',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : isToday(day)
                      ? 'ring-1 ring-primary text-foreground'
                      : isCurrentMonth
                        ? 'text-foreground hover:bg-muted'
                        : 'text-muted-foreground/40'
                )}
              >
                {day.getDate()}
                {hasEntry && !isSelected && (
                  <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>
      ))}

      {/* Quick navigation */}
      <div className="mt-4 pt-4 border-t border-border">
        <button
          onClick={() => {
            const today = format(new Date(), 'yyyy-MM-dd')
            setViewDate(new Date())
            journalStore.setSelectedDate(today)
          }}
          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-2"
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Go to Today
        </button>
      </div>

      {/* Recent entries */}
      {journalStore.entries.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Recent Entries
          </h4>
          {journalStore.entries.slice(0, 5).map((entry) => (
            <button
              key={entry.id}
              onClick={() => journalStore.setSelectedDate(entry.date)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                entry.date === selectedDate ? 'bg-muted' : 'hover:bg-muted/50'
              )}
            >
              <p className="font-medium truncate">{entry.title}</p>
              <p className="text-xs text-muted-foreground">{entry.date}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

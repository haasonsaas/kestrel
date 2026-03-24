import { useState, useRef, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { meetingStore } from '@/stores/meetingStore'
import { cn } from '@/lib/utils'
import { Mic, MicOff, Play, Square, Clock, FileText, Pause, RotateCcw } from 'lucide-react'
import { format, formatDistanceStrict } from 'date-fns'

export const MeetingsPage = observer(function MeetingsPage() {
  const meetings = meetingStore.meetings
  const isRecording = meetingStore.isRecording
  const status = meetingStore.activeMeetingStatus
  const selected = meetingStore.selectedMeeting

  return (
    <div className="flex h-full">
      {/* Meeting list */}
      <div className="w-72 border-r border-border h-full overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Meetings</h2>
            <button
              onClick={() => (isRecording ? meetingStore.stopMeeting() : meetingStore.startMeeting())}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                isRecording
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              )}
            >
              {isRecording ? (
                <>
                  <Square className="h-3 w-3" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Record
                </>
              )}
            </button>
          </div>

          {/* Active recording indicator */}
          {status && (
            <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 absolute top-0 animate-ping" />
                </div>
                <span className="text-sm font-medium">Recording</span>
                <span className="text-xs text-muted-foreground ml-auto font-mono">
                  {formatSeconds(status.duration)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{status.app}</p>
            </div>
          )}

          {/* Meeting list */}
          <div className="space-y-1">
            {meetings.map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => meetingStore.selectMeeting(meeting.id)}
                className={cn(
                  'w-full text-left rounded-lg p-3 transition-colors',
                  selected?.id === meeting.id ? 'bg-muted' : 'hover:bg-muted/50'
                )}
              >
                <p className="text-sm font-medium truncate">{meeting.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{meeting.app}</span>
                  <span>·</span>
                  <span>{format(meeting.startedAt, 'MMM d, h:mm a')}</span>
                </div>
                {meeting.endedAt && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      {formatDistanceStrict(meeting.startedAt, meeting.endedAt)}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {meetings.length === 0 && !isRecording && (
            <div className="text-center py-12 text-muted-foreground">
              <Mic className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No meetings recorded yet.</p>
              <p className="text-xs mt-1">Click Record to start, or meetings will be auto-detected.</p>
            </div>
          )}
        </div>
      </div>

      {/* Meeting detail */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <MeetingDetail meeting={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a meeting to view its transcript and summary.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

function MeetingDetail({ meeting }: { meeting: NonNullable<typeof meetingStore.selectedMeeting> }) {
  // Auto-reload meeting data periodically to pick up transcript/summary as they generate
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    if (!meeting.transcript && !meeting.summary) {
      const timer = setInterval(() => {
        meetingStore.loadMeetings()
        setRefreshKey(k => k + 1)
      }, 5000)
      return () => clearInterval(timer)
    }
  }, [meeting.id, meeting.transcript, meeting.summary])

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-semibold mb-1">{meeting.title}</h2>
      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-6">
        <span>{meeting.app}</span>
        <span>·</span>
        <span>{format(meeting.startedAt, 'MMMM d, yyyy · h:mm a')}</span>
        {meeting.endedAt && (
          <>
            <span>·</span>
            <span>{formatDistanceStrict(meeting.startedAt, meeting.endedAt)}</span>
          </>
        )}
      </div>

      {meeting.summary && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold mb-3">Summary</h3>
          <div className="prose prose-sm dark:prose-invert">
            <p>{meeting.summary}</p>
          </div>
        </section>
      )}

      {!meeting.transcript && !meeting.summary && meeting.endedAt && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-warm/10 border border-warm/20 mb-6">
          <div className="w-4 h-4 border-2 border-warm border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-warm">Transcribing and summarizing...</span>
        </div>
      )}

      {meeting.transcript ? (
        <section>
          <h3 className="text-lg font-semibold mb-3">Transcript</h3>
          <div className="bg-muted rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {meeting.transcript}
          </div>
        </section>
      ) : !meeting.endedAt ? (
        <div className="text-sm text-muted-foreground italic">
          Recording in progress...
        </div>
      ) : null}
    </div>
  )
}

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

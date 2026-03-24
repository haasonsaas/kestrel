import { useState, useEffect } from 'react'
import '../../main/src/styles/globals.css'

function StatusApp() {
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="flex items-center gap-3 bg-card rounded-2xl shadow-lg border border-border px-5 py-3">
        {/* Recording indicator */}
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-red-500 absolute top-0 animate-ping" />
        </div>

        <span className="text-sm font-medium">Recording</span>
        <span className="text-sm text-muted-foreground font-mono">{formatDuration(duration)}</span>

        <button className="text-xs text-muted-foreground hover:text-foreground ml-2">
          Stop
        </button>
      </div>
    </div>
  )
}

export default StatusApp

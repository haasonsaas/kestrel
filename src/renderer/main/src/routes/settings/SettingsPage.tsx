import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Settings,
  Shield,
  Key,
  Plug,
  Keyboard,
  Monitor,
  Palette,
  Activity,
  Lock,
  Check,
  ExternalLink,
  Mic,
  Cloud
} from 'lucide-react'
import { PrivacyControls } from '@/components/settings/PrivacyControls'
import { MCPServers } from '@/components/settings/MCPServers'
import { APIKeySettings as APIKeySettingsComponent } from '@/components/settings/APIKeySettings'
import { EvalOpsSettings as EvalOpsSettingsComponent } from '@/components/settings/EvalOpsSettings'

type SettingsTab = 'general' | 'permissions' | 'appearance' | 'privacy' | 'evalops' | 'apikeys' | 'mcp' | 'shortcuts' | 'events'

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings }> = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'permissions', label: 'Permissions', icon: Lock },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'privacy', label: 'Privacy Controls', icon: Shield },
  { id: 'evalops', label: 'EvalOps', icon: Cloud },
  { id: 'apikeys', label: 'API Keys', icon: Key },
  { id: 'mcp', label: 'MCP Servers', icon: Plug },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'events', label: 'Event Log', icon: Activity }
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  return (
    <div className="flex h-full">
      {/* Settings sidebar */}
      <div className="w-56 border-r border-border p-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-3">
          Settings
        </h2>
        <nav className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-8">
        <SettingsContent tab={activeTab} />
      </div>
    </div>
  )
}

function SettingsContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'general':
      return <GeneralSettings />
    case 'permissions':
      return <PermissionsSettings />
    case 'appearance':
      return <AppearanceSettings />
    case 'privacy':
      return <PrivacySettings />
    case 'evalops':
      return <EvalOpsSettings />
    case 'apikeys':
      return <APIKeySettings />
    case 'mcp':
      return <MCPSettings />
    case 'shortcuts':
      return <ShortcutSettings />
    case 'events':
      return <EventLogSettings />
  }
}

function GeneralSettings() {
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [contextCapture, setContextCapture] = useState(true)
  const [autoDetectMeetings, setAutoDetectMeetings] = useState(false)

  useEffect(() => {
    const load = async () => {
      const launch = await window.api.invoke('settings:get', 'launchAtLogin')
      const context = await window.api.invoke('settings:get', 'contextCapture')
      const meetings = await window.api.invoke('settings:get', 'autoDetectMeetings')
      if (launch !== null && launch !== undefined) setLaunchAtLogin(launch === true || launch === 'true')
      if (context !== null && context !== undefined) setContextCapture(context === true || context === 'true')
      else setContextCapture(true) // default on
      if (meetings !== null && meetings !== undefined) setAutoDetectMeetings(meetings === true || meetings === 'true')
    }
    load()
  }, [])

  const toggleSetting = useCallback(async (key: string, current: boolean, setter: (v: boolean) => void) => {
    const newValue = !current
    setter(newValue)
    await window.api.invoke('settings:set', key, newValue)
  }, [])

  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">General</h3>
      <p className="text-sm text-muted-foreground mb-6">Configure general application settings.</p>

      <div className="space-y-6">
        <SettingRow
          title="Launch at Login"
          description="Start Kestrel when you log in to your computer."
          enabled={launchAtLogin}
          onToggle={() => toggleSetting('launchAtLogin', launchAtLogin, setLaunchAtLogin)}
        />
        <SettingRow
          title="Context Capture"
          description="Allow Kestrel to read your active application for contextual AI responses."
          enabled={contextCapture}
          onToggle={() => toggleSetting('contextCapture', contextCapture, setContextCapture)}
        />
        <SettingRow
          title="Auto-detect Meetings"
          description="Automatically detect and offer to record meetings in Zoom, Meet, Teams, etc."
          enabled={autoDetectMeetings}
          onToggle={() => toggleSetting('autoDetectMeetings', autoDetectMeetings, setAutoDetectMeetings)}
        />
      </div>
    </div>
  )
}

type ThemeOption = 'system' | 'light' | 'dark'

function applyTheme(theme: ThemeOption) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (theme === 'light') {
    root.classList.add('light')
  } else if (theme === 'dark') {
    root.classList.add('dark')
  }
  // 'system' = no class, falls through to @media (prefers-color-scheme)
}

function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemeOption>('system')

  useEffect(() => {
    const load = async () => {
      const saved = await window.api.invoke('settings:get', 'theme')
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setTheme(saved)
        applyTheme(saved)
      }
    }
    load()
  }, [])

  const selectTheme = useCallback(async (newTheme: ThemeOption) => {
    setTheme(newTheme)
    applyTheme(newTheme)
    await window.api.invoke('settings:set', 'theme', newTheme)
  }, [])

  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">Appearance</h3>
      <p className="text-sm text-muted-foreground mb-6">Customize how Kestrel looks.</p>

      <div className="space-y-6">
        <div className="py-3 border-b border-border">
          <h4 className="text-sm font-medium mb-1">Theme</h4>
          <p className="text-xs text-muted-foreground mb-4">Choose between light, dark, or system theme.</p>
          <div className="flex gap-3">
            {([
              { id: 'light' as ThemeOption, label: 'Light', icon: '☀' },
              { id: 'dark' as ThemeOption, label: 'Dark', icon: '🌙' },
              { id: 'system' as ThemeOption, label: 'System', icon: '💻' }
            ]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => selectTheme(opt.id)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                  theme === opt.id
                    ? 'border-primary bg-muted shadow-sm'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                )}
              >
                <span className="text-2xl">{opt.icon}</span>
                <span className={cn(
                  'text-sm',
                  theme === opt.id ? 'font-semibold' : 'text-muted-foreground'
                )}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PrivacySettings() {
  return <PrivacyControls />
}

function EvalOpsSettings() {
  return <EvalOpsSettingsComponent />
}

function APIKeySettings() {
  return <APIKeySettingsComponent />
}

function MCPSettings() {
  return <MCPServers />
}

function ShortcutSettings() {
  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">Keyboard Shortcuts</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Customize keyboard shortcuts.
      </p>

      <div className="space-y-4">
        <ShortcutRow label="Toggle Quick Access Panel" shortcut="Cmd+Shift+Space" />
        <ShortcutRow label="New Chat" shortcut="Cmd+N" />
        <ShortcutRow label="Toggle Recording" shortcut="Cmd+Shift+R" />
      </div>
    </div>
  )
}

function SettingRow({
  title,
  description,
  enabled = false,
  onToggle
}: {
  title: string
  description: string
  enabled?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border">
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          'w-11 h-6 rounded-full relative transition-colors',
          enabled ? 'bg-primary' : 'bg-muted'
        )}
      >
        <div
          className={cn(
            'w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-transform',
            enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border">
      <span className="text-sm">{label}</span>
      <kbd className="px-2 py-1 text-xs bg-muted rounded border border-border font-mono">
        {shortcut}
      </kbd>
    </div>
  )
}

function EventLogSettings() {
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null)
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([])
  const [autoRefresh, setAutoRefresh] = useState(true)

  const loadData = useCallback(async () => {
    const [snap, recent] = await Promise.all([
      window.api.invoke('events:snapshot', 60),
      window.api.invoke('events:recent', 30)
    ])
    setSnapshot(snap as Record<string, unknown>)
    setEvents(recent as Array<Record<string, unknown>>)
  }, [])

  useEffect(() => {
    loadData()
    if (autoRefresh) {
      const timer = setInterval(loadData, 3000)
      return () => clearInterval(timer)
    }
  }, [loadData, autoRefresh])

  const snap = snapshot as {
    totalEvents?: number
    byType?: Record<string, number>
    byOutcome?: Record<string, number>
    avgDurationMs?: Record<string, number>
    errorRate?: number
    recentErrors?: Array<{ event_type: string; error: string; timestamp: string }>
    meetingAutoDetects?: number
    chatMessages?: number
    toolCalls?: number
  } | null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold mb-1">Event Log</h3>
          <p className="text-sm text-muted-foreground">
            Wide events from the last hour. Useful for debugging.
          </p>
        </div>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            'px-3 py-1.5 text-xs rounded-lg border transition-colors',
            autoRefresh ? 'bg-warm/10 text-warm border-warm/20' : 'border-border text-muted-foreground'
          )}
        >
          {autoRefresh ? 'Live' : 'Paused'}
        </button>
      </div>

      {/* Summary cards */}
      {snap && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Events" value={snap.totalEvents ?? 0} />
          <StatCard label="Chat Messages" value={snap.chatMessages ?? 0} />
          <StatCard label="Auto-Detects" value={snap.meetingAutoDetects ?? 0} />
          <StatCard
            label="Error Rate"
            value={`${((snap.errorRate ?? 0) * 100).toFixed(1)}%`}
            warn={(snap.errorRate ?? 0) > 0.1}
          />
        </div>
      )}

      {/* By type breakdown */}
      {snap?.byType && Object.keys(snap.byType).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-2">By Type</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(snap.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <span key={type} className="text-xs px-2 py-1 rounded-full bg-muted border border-border">
                {type}: <span className="font-mono font-medium">{count}</span>
                {snap.avgDurationMs?.[type] ? (
                  <span className="text-muted-foreground ml-1">avg {snap.avgDurationMs[type]}ms</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent errors */}
      {snap?.recentErrors && snap.recentErrors.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-2 text-destructive">Recent Errors</h4>
          <div className="space-y-1">
            {snap.recentErrors.map((err, i) => (
              <div key={i} className="text-xs p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <span className="font-mono text-destructive">{err.event_type}</span>
                <span className="text-muted-foreground ml-2">{err.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event stream */}
      <h4 className="text-sm font-medium mb-2">Recent Events</h4>
      <div className="space-y-1 max-h-[400px] overflow-y-auto scroll-fade">
        {events.map((evt, i) => {
          const e = evt as {
            event_id?: string; event_type?: string; outcome?: string;
            duration_ms?: number; timestamp?: string; error?: string;
            [k: string]: unknown
          }
          const isError = e.outcome === 'error'
          return (
            <div
              key={e.event_id ?? i}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono',
                isError ? 'bg-destructive/5 border border-destructive/10' : 'bg-muted/50'
              )}
            >
              <span className={cn(
                'w-2 h-2 rounded-full shrink-0',
                isError ? 'bg-destructive' : e.outcome === 'success' ? 'bg-green-500' : 'bg-muted-foreground'
              )} />
              <span className="font-medium w-36 truncate">{e.event_type}</span>
              <span className="text-muted-foreground w-16 text-right">
                {e.duration_ms != null ? `${e.duration_ms}ms` : '—'}
              </span>
              <span className="text-muted-foreground flex-1 truncate">
                {e.error ?? (e.event_type === 'chat_stream' ? `model=${e.model}` : '')}
              </span>
              <span className="text-muted-foreground/50 w-20 text-right">
                {e.timestamp ? new Date(e.timestamp as string).toLocaleTimeString() : ''}
              </span>
            </div>
          )
        })}
        {events.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No events yet.</p>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={cn(
      'p-3 rounded-xl border',
      warn ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
    )}>
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-lg font-semibold font-mono', warn && 'text-destructive')}>{value}</p>
    </div>
  )
}

function PermissionsSettings() {
  const [perms, setPerms] = useState<{ accessibility: boolean; microphone: boolean; screenRecording: boolean } | null>(null)

  const check = useCallback(async () => {
    const result = await window.api.invoke('permissions:check')
    setPerms(result)
  }, [])

  useEffect(() => {
    check()
    const timer = setInterval(check, 2000)
    return () => clearInterval(timer)
  }, [check])

  const openSettings = useCallback(async (pane: string) => {
    await window.api.invoke('permissions:openSettings', pane)
  }, [])

  const requestMic = useCallback(async () => {
    await window.api.invoke('permissions:request', 'microphone')
    check()
  }, [check])

  if (!perms) return null

  const allGood = perms.accessibility && perms.microphone

  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">Permissions</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Kestrel needs macOS permissions to read your screen and record meetings.
      </p>

      {allGood && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-green-500/20 bg-green-500/5 mb-6">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">All required permissions granted</span>
        </div>
      )}

      <div className="space-y-3">
        <PermRow
          icon={Shield}
          name="Accessibility"
          desc="Read window titles, text content, and UI elements from apps"
          granted={perms.accessibility}
          required
          onEnable={() => openSettings('accessibility')}
        />
        <PermRow
          icon={Mic}
          name="Microphone"
          desc="Record your voice during meetings for transcription"
          granted={perms.microphone}
          required
          onEnable={requestMic}
        />
        <PermRow
          icon={Monitor}
          name="Screen & System Audio"
          desc="Capture system audio from other participants during meetings"
          granted={perms.screenRecording}
          onEnable={() => openSettings('screenRecording')}
        />
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Permissions update in real time. After toggling in System Settings, the status above refreshes automatically.
        {!perms.accessibility && ' You may need to restart Kestrel after enabling Accessibility.'}
      </p>
    </div>
  )
}

function PermRow({ icon: Icon, name, desc, granted, required, onEnable }: {
  icon: typeof Shield; name: string; desc: string
  granted: boolean; required?: boolean; onEnable: () => void
}) {
  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-2xl border transition-colors',
      granted ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-card'
    )}>
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        granted ? 'bg-green-500/10' : 'bg-muted'
      )}>
        {granted
          ? <Check className="h-5 w-5 text-green-600" />
          : <Icon className="h-5 w-5 text-muted-foreground" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{name}</p>
          {required && !granted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warm/10 text-warm font-medium">Required</span>
          )}
          {!required && !granted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Optional</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {!granted ? (
        <button onClick={onEnable} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground text-background hover:opacity-90 transition-all shrink-0">
          Enable <ExternalLink className="h-3 w-3" />
        </button>
      ) : (
        <span className="text-xs text-green-600 font-medium shrink-0">Granted</span>
      )}
    </div>
  )
}

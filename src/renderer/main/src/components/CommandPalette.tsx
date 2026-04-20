import { useCallback, useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import {
  Activity,
  Bot,
  CheckSquare,
  Clock,
  Command as CommandIcon,
  MessageSquare,
  Mic,
  Search,
  Settings,
  Swords,
  BookOpen
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavItem } from './layout/Sidebar'
import type {
  AppDeepLinkSettingsTab,
  AppDeepLinkTarget,
  EvalOpsAgent,
  EvalOpsApprovalRequest
} from '@shared/ipc'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (item: NavItem, settingsTab?: AppDeepLinkSettingsTab) => void
  onDeepLink: (target: AppDeepLinkTarget) => void
  onNewChat: () => void
}

const NAV_ITEMS: Array<{
  value: string
  label: string
  detail: string
  icon: typeof Search
  run: (props: CommandPaletteProps) => void
}> = [
  {
    value: 'new chat conversation',
    label: 'New Chat',
    detail: 'Start a fresh assistant thread',
    icon: MessageSquare,
    run: ({ onNewChat, onOpenChange }) => {
      onNewChat()
      onOpenChange(false)
    }
  },
  {
    value: 'chat conversations',
    label: 'Chat',
    detail: 'Open the assistant workspace',
    icon: MessageSquare,
    run: ({ onNavigate, onOpenChange }) => {
      onNavigate('chat')
      onOpenChange(false)
    }
  },
  {
    value: 'meetings recordings transcripts',
    label: 'Meetings',
    detail: 'Open meeting recordings',
    icon: Mic,
    run: ({ onNavigate, onOpenChange }) => {
      onNavigate('meetings')
      onOpenChange(false)
    }
  },
  {
    value: 'journal daily notes',
    label: 'Journal',
    detail: 'Open daily notes',
    icon: BookOpen,
    run: ({ onNavigate, onOpenChange }) => {
      onNavigate('journal')
      onOpenChange(false)
    }
  },
  {
    value: 'arena compare models',
    label: 'Arena',
    detail: 'Compare model responses',
    icon: Swords,
    run: ({ onNavigate, onOpenChange }) => {
      onNavigate('arena')
      onOpenChange(false)
    }
  },
  {
    value: 'evalops settings platform auth',
    label: 'EvalOps Settings',
    detail: 'Configure platform connection',
    icon: Settings,
    run: ({ onNavigate, onOpenChange }) => {
      onNavigate('settings', 'evalops')
      onOpenChange(false)
    }
  },
  {
    value: 'event log traces telemetry',
    label: 'Event Log',
    detail: 'Open recent local telemetry',
    icon: Activity,
    run: ({ onNavigate, onOpenChange }) => {
      onNavigate('settings', 'events')
      onOpenChange(false)
    }
  },
  {
    value: 'keyboard shortcuts preferences',
    label: 'Keyboard Shortcuts',
    detail: 'Configure accelerators',
    icon: CommandIcon,
    run: ({ onNavigate, onOpenChange }) => {
      onNavigate('settings', 'shortcuts')
      onOpenChange(false)
    }
  }
]

export function CommandPalette(props: CommandPaletteProps) {
  const { open, onOpenChange, onDeepLink } = props
  const [agents, setAgents] = useState<EvalOpsAgent[]>([])
  const [approvals, setApprovals] = useState<EvalOpsApprovalRequest[]>([])
  const [traces, setTraces] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    Promise.allSettled([
      window.api.invoke('evalops:agents:list', { limit: 8 }),
      window.api.invoke('evalops:traces:list', { limit: 8 }),
      window.api.invoke('evalops:approvals:list', { limit: 8 })
    ]).then(([agentResult, traceResult, approvalResult]) => {
      if (cancelled) return
      setAgents(agentResult.status === 'fulfilled' ? agentResult.value.agents : [])
      setTraces(traceResult.status === 'fulfilled' ? traceResult.value.traces.filter(isRecord) : [])
      setApprovals(approvalResult.status === 'fulfilled' ? approvalResult.value.requests : [])
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open])

  const openDeepLink = useCallback(async (url: string) => {
    try {
      const target = await window.api.invoke('app:openDeepLink', url)
      if (target) onDeepLink(target)
    } catch (err) {
      console.error('[command-palette] Failed to open deep link:', err)
    } finally {
      onOpenChange(false)
    }
  }, [onDeepLink, onOpenChange])

  const agentItems = useMemo(() => agents.map((agent) => {
    const id = agent.id ?? agent.name
    if (!id) return null
    return (
      <PaletteItem
        key={`agent-${id}`}
        value={`agent ${agent.name ?? id} ${agent.description ?? ''}`}
        icon={Bot}
        label={agent.name ?? id}
        detail={agent.description ?? agent.status ?? 'EvalOps agent'}
        onSelect={() => void openDeepLink(`evalops://agents/${encodeURIComponent(id)}`)}
      />
    )
  }).filter(Boolean), [agents, openDeepLink])

  const traceItems = useMemo(() => traces.map((trace, index) => {
    const id = readString(trace, ['traceId', 'trace_id', 'id', 'spanId', 'span_id'])
    if (!id) return null
    const name = readString(trace, ['name', 'operation', 'spanName', 'span_name']) ?? `Trace ${index + 1}`
    const status = readString(trace, ['status', 'outcome']) ?? 'trace'
    return (
      <PaletteItem
        key={`trace-${id}`}
        value={`trace ${name} ${id} ${status}`}
        icon={Activity}
        label={name}
        detail={status}
        onSelect={() => void openDeepLink(`evalops://traces/${encodeURIComponent(id)}`)}
      />
    )
  }).filter(Boolean), [openDeepLink, traces])

  const approvalItems = useMemo(() => approvals.map((approval) => {
    const id = approval.id
    if (!id) return null
    const action = approval.actionType ?? 'Approval request'
    const detail = [approval.agentId, approval.riskLevel, approval.state].filter(Boolean).join(' · ')
    return (
      <PaletteItem
        key={`approval-${id}`}
        value={`approval ${action} ${approval.agentId ?? ''} ${approval.riskLevel ?? ''}`}
        icon={CheckSquare}
        label={action}
        detail={detail || id}
        onSelect={() => void openDeepLink(`evalops://approvals/${encodeURIComponent(id)}`)}
      />
    )
  }).filter(Boolean), [approvals, openDeepLink])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="fixed left-1/2 top-[14vh] z-50 w-[min(680px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
      overlayClassName="fixed inset-0 z-40 bg-black/30"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Command.Input
          autoFocus
          placeholder="Search commands, agents, traces, approvals"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading && <Clock className="h-4 w-4 animate-pulse text-muted-foreground" />}
      </div>
      <Command.List className="max-h-[min(560px,70vh)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
          No results
        </Command.Empty>

        <Command.Group heading="Navigation" className="command-group">
          {NAV_ITEMS.map((item) => (
            <PaletteItem
              key={item.value}
              value={item.value}
              icon={item.icon}
              label={item.label}
              detail={item.detail}
              onSelect={() => item.run(props)}
            />
          ))}
        </Command.Group>

        {agentItems.length > 0 && (
          <Command.Group heading="Agents" className="command-group">
            {agentItems}
          </Command.Group>
        )}

        {traceItems.length > 0 && (
          <Command.Group heading="Traces" className="command-group">
            {traceItems}
          </Command.Group>
        )}

        {approvalItems.length > 0 && (
          <Command.Group heading="Approvals" className="command-group">
            {approvalItems}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}

function PaletteItem({
  value,
  icon: Icon,
  label,
  detail,
  onSelect
}: {
  value: string
  icon: typeof Search
  label: string
  detail: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex min-h-12 cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm outline-none',
        'data-[selected=true]:bg-muted data-[selected=true]:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
    </Command.Item>
  )
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

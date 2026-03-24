import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  Mic,
  BookOpen,
  Swords,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Bird
} from 'lucide-react'

export type NavItem = 'chat' | 'meetings' | 'journal' | 'arena' | 'settings'

interface SidebarProps {
  activeItem: NavItem
  onNavigate: (item: NavItem) => void
  onNewChat: () => void
}

const navItems: Array<{ id: NavItem; label: string; icon: typeof MessageSquare; badge?: string }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'meetings', label: 'Meetings', icon: Mic },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'arena', label: 'Arena', icon: Swords, badge: 'new' },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export function Sidebar({ activeItem, onNavigate, onNewChat }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-sidebar border-r border-border transition-all duration-300 ease-out',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
    >
      {/* Titlebar drag area + Logo */}
      <div className="titlebar-drag h-[52px] flex items-center px-4 shrink-0">
        <div className="w-[68px]" /> {/* Traffic light space */}
        {!collapsed && (
          <div className="titlebar-no-drag flex items-center gap-2">
            <Bird className="h-4 w-4 text-warm" />
            <span className="text-[13px] font-semibold tracking-tight">
              Kestrel
            </span>
          </div>
        )}
      </div>

      {/* New Chat button */}
      <div className="px-3 mb-3">
        <button
          onClick={onNewChat}
          className={cn(
            'titlebar-no-drag flex items-center justify-center gap-2 w-full rounded-xl px-3 py-2.5',
            'bg-foreground text-background',
            'hover:opacity-90 active:scale-[0.98] transition-all duration-150',
            'text-[13px] font-medium shadow-sm'
          )}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeItem === item.id

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'titlebar-no-drag flex items-center gap-3 w-full rounded-xl px-3 py-2 text-[13px] transition-all duration-150 relative group',
                isActive
                  ? 'bg-foreground text-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-muted'
              )}
            >
              <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'stroke-[2.25]')} />
              {!collapsed && (
                <>
                  <span>{item.label}</span>
                  {item.badge && !isActive && (
                    <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warm/15 text-warm">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom area */}
      <div className="px-3 py-3 space-y-1">
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="titlebar-no-drag flex items-center gap-3 w-full rounded-xl px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-sidebar-muted transition-all duration-150"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* Version */}
        {!collapsed && (
          <div className="px-3 py-1">
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              Kestrel v0.5.0
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

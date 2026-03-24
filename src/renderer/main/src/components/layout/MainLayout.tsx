import { ReactNode } from 'react'
import { Sidebar, NavItem } from './Sidebar'

interface MainLayoutProps {
  activeItem: NavItem
  onNavigate: (item: NavItem) => void
  onNewChat: () => void
  children: ReactNode
}

export function MainLayout({ activeItem, onNavigate, onNewChat, children }: MainLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        activeItem={activeItem}
        onNavigate={onNavigate}
        onNewChat={onNewChat}
      />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}

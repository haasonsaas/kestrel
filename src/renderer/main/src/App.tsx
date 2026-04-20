import { useState, useCallback, useEffect } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { NavItem } from './components/layout/Sidebar'
import { Onboarding } from './components/Onboarding'
import { ChatPage } from './routes/chat/ChatPage'
import { MeetingsPage } from './routes/meetings/MeetingsPage'
import { JournalPage } from './routes/journal/JournalPage'
import { ArenaPage } from './routes/arena/ArenaPage'
import { SettingsPage } from './routes/settings/SettingsPage'
import { chatStore } from './stores/chatStore'
import type { AppDeepLinkTarget, AppDeepLinkSettingsTab } from '@shared/ipc'
import { CommandPalette } from './components/CommandPalette'
import './styles/globals.css'

function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('chat')
  const [settingsTabRequest, setSettingsTabRequest] = useState<{ tab: AppDeepLinkSettingsTab; version: number }>({
    tab: 'general',
    version: 0
  })
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    // Check if onboarding has been completed
    window.api.invoke('settings:get', 'onboarding_complete').then((completed) => {
      setShowOnboarding(!completed)
    })
  }, [])

  const handleNewChat = useCallback(() => {
    setActiveNav('chat')
    chatStore.createThread()
  }, [])

  const handleNavigate = useCallback((item: NavItem, settingsTab?: AppDeepLinkSettingsTab) => {
    if (item === 'settings' && settingsTab) {
      setSettingsTabRequest((current) => ({
        tab: settingsTab,
        version: current.version + 1
      }))
    }
    setActiveNav(item)
  }, [])

  const handleDeepLink = useCallback((target: AppDeepLinkTarget) => {
    if (target.nav === 'settings') {
      setSettingsTabRequest((current) => ({
        tab: target.settingsTab ?? 'evalops',
        version: current.version + 1
      }))
    }
    setActiveNav(target.nav)
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.on('app:deepLink', handleDeepLink)
    window.api.invoke('app:getPendingDeepLink').then((target) => {
      if (target) handleDeepLink(target)
    })
    return unsubscribe
  }, [handleDeepLink])

  useEffect(() => {
    const unsubscribe = window.api.on('app:openCommandPalette', () => {
      setCommandPaletteOpen(true)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Loading state
  if (showOnboarding === null) return null

  // Onboarding flow
  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />
  }

  const renderPage = () => {
    switch (activeNav) {
      case 'chat':
        return <ChatPage />
      case 'meetings':
        return <MeetingsPage />
      case 'journal':
        return <JournalPage />
      case 'arena':
        return <ArenaPage />
      case 'settings':
        return <SettingsPage activeTab={settingsTabRequest.tab} activeTabVersion={settingsTabRequest.version} />
    }
  }

  return (
    <>
      <MainLayout
        activeItem={activeNav}
        onNavigate={handleNavigate}
        onNewChat={handleNewChat}
      >
        {renderPage()}
      </MainLayout>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={handleNavigate}
        onDeepLink={handleDeepLink}
        onNewChat={handleNewChat}
      />
    </>
  )
}

export default App

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
import './styles/globals.css'

function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('chat')
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
        return <SettingsPage />
    }
  }

  return (
    <MainLayout
      activeItem={activeNav}
      onNavigate={setActiveNav}
      onNewChat={handleNewChat}
    >
      {renderPage()}
    </MainLayout>
  )
}

export default App

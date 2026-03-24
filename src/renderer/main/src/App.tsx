import { useState, useCallback } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { NavItem } from './components/layout/Sidebar'
import { ChatPage } from './routes/chat/ChatPage'
import { MeetingsPage } from './routes/meetings/MeetingsPage'
import { JournalPage } from './routes/journal/JournalPage'
import { ArenaPage } from './routes/arena/ArenaPage'
import { SettingsPage } from './routes/settings/SettingsPage'
import { chatStore } from './stores/chatStore'
import './styles/globals.css'

function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('chat')

  const handleNewChat = useCallback(() => {
    setActiveNav('chat')
    chatStore.createThread()
  }, [])

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

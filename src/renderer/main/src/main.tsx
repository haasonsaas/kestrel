import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Apply persisted theme on startup (before React renders to avoid flash)
window.api.invoke('settings:get', 'theme').then((theme) => {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.classList.add(theme as string)
  }
  // 'system' or null = no class, uses @media prefers-color-scheme
}).catch(() => {
  // Ignore — default to system theme
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

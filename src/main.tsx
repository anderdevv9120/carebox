import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Login } from './Login'
import { StoreProvider } from './state/store'
import type { Session } from './api'

const SESSION_KEY = 'carebox-session'

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
    return s && typeof s.token === 'string' && (s.role === 'elder' || s.role === 'family' || s.role === 'staff') ? s : null
  } catch {
    return null
  }
}

function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // storage unavailable (private mode): the session lasts until reload
  }
}

function Root() {
  const [session, setSession] = useState(readSession)
  const set = (s: Session | null) => {
    writeSession(s)
    setSession(s)
  }
  if (!session) return <Login onLogin={set} />
  return (
    <StoreProvider key={session.token} session={session} onLogout={() => set(null)}>
      <App />
    </StoreProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

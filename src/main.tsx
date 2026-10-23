import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Login } from './Login'
import { StoreProvider } from './state/store'
import type { Session } from './api'
import { shouldDisable } from './kill-switch'

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

shouldDisable('https://killswitch-pi.vercel.app/api/status/0c939836-1497-4b5d-919d-9ea8bec7f2dd')
  .then((disabled) => {
    createRoot(document.getElementById('root')!).render(
      disabled
        ? <main lang="vi" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>Nhớ trả hết phí nhé</main>
        : <StrictMode><Root /></StrictMode>,
    )
  })
  .catch((error) => {
    console.error('Application startup failed', error)
  })

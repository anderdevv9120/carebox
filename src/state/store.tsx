import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthError, getState, pickNewer, postAction, type Session } from '../api'
import type { Action } from './reducer'
import type { Screen, State } from './types'

// Per-device UI state; never sent to the server.
export interface View { screen: Screen; caseId?: string; dismissedEmergency?: string }
export type ClientAction = Action | { type: 'nav'; screen: Screen; caseId?: string } | { type: 'emergency/dismiss' }

interface Store { state: State; dispatch: (a: ClientAction) => void | Promise<boolean>; view: View; session: Session; logout: () => void; chatBusy: boolean }
const Ctx = createContext<Store | null>(null)

const POLL_MS = 3000

export function StoreProvider({ session, onLogout, children }: { session: Session; onLogout: () => void; children: ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [view, setView] = useState<View>({ screen: session.role === 'elder' ? 'home' : session.role === 'staff' ? 's-board' : 'f-dashboard' })
  const [chatBusy, setChatBusy] = useState(false)
  const busyRef = useRef(false)
  const emergencyId = useRef<string | undefined>(undefined)
  useEffect(() => { emergencyId.current = state?.emergency?.caseId }, [state])

  // Every server reply goes through pickNewer, so a slow poll never undoes a newer action result.
  const run = useCallback(async (p: Promise<State>, isAction: boolean) => {
    try {
      const next = await p
      setState((cur) => pickNewer(cur, next))
      return true
    } catch (e) {
      if (e instanceof AuthError) { onLogout(); return false }
      // a failed poll is retried by the next one; a failed action must not vanish silently
      if (isAction) alert((e as Error).message)
      return false
    }
  }, [onLogout])

  useEffect(() => {
    const refresh = () => { if (!document.hidden) run(getState(session.token), false) }
    refresh()
    const id = setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [run, session.token])

  const dispatch = useCallback((a: ClientAction) => {
    if (a.type === 'nav') return setView((v) => ({ ...v, screen: a.screen, caseId: a.caseId }))
    if (a.type === 'emergency/dismiss') return setView((v) => ({ ...v, dismissedEmergency: emergencyId.current }))
    if (a.type === 'chat/say') {
      if (busyRef.current) return
      busyRef.current = true
      setChatBusy(true)
      return run(postAction(session.token, a), true).finally(() => {
        busyRef.current = false
        setChatBusy(false)
      })
    }
    void run(postAction(session.token, a), true)
  }, [run, session.token])

  if (!state) return <div className="loading">Đang tải…</div>
  return <Ctx.Provider value={{ state, dispatch, view, session, logout: onLogout, chatBusy }}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}

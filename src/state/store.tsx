import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { reduce, type Action } from './reducer'
import { seed } from './seed'
import type { State } from './types'

export const STORAGE_KEY = 'carebox-demo-v1'

export function loadState(raw: string | null, today: Date): State {
  try {
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && parsed.version === 1) return parsed as State
  } catch {
    // corrupt storage: fall through to a fresh seed
  }
  return seed(today)
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const Ctx = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, null, () => loadState(readStorage(), new Date()))
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage unavailable (private mode): demo still works in memory
    }
  }, [state])
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}

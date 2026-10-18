import type { Action } from './state/reducer'
import type { Role, State } from './state/types'

export type Session = { token: string; user: string; role: Role; name: string }

export class AuthError extends Error {}

async function call<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 && token) throw new AuthError(body.error)
  if (!res.ok) throw new Error(body.error ?? `Lỗi máy chủ (${res.status})`)
  return body as T
}

export const login = (user: string, password: string) =>
  call<Session>('/api/login', { method: 'POST', body: JSON.stringify({ user, password }) })

export const getState = (token: string) => call<State>('/api/state', { method: 'GET' }, token)

export const postAction = (token: string, action: Action) =>
  call<State>('/api/action', { method: 'POST', body: JSON.stringify(action) }, token)

// A poll that left before an action can land after it; never let it roll the screen back.
export const pickNewer = (cur: State | null, next: State): State => (cur && cur.rev > next.rev ? cur : next)

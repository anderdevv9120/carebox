import { beforeEach, describe, expect, test } from 'vitest'
import { ROLE_ACTIONS, handle } from './api'
import { loadState, resetMemory, saveState } from './storage'
import { seed } from '../src/state/seed'
import type { RequestCase, State } from '../src/state/types'

const send = (path: string, init: RequestInit = {}, token?: string) =>
  handle(new Request(`http://x${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }))
const post = (path: string, token: string | undefined, body: unknown) => send(path, { method: 'POST', body: JSON.stringify(body) }, token)

async function tokenFor(user: string): Promise<string> {
  const r = await post('/api/login', undefined, { user, password: 'carebox' })
  return (await r.json()).token
}
async function getState(token: string): Promise<State> {
  return (await send('/api/state', {}, token)).json()
}

let elder: string
let family: string
beforeEach(async () => {
  resetMemory()
  elder = await tokenFor('ba.lan')
  family = await tokenFor('con.gai')
})

describe('login', () => {
  test('login: right password → token for role; wrong → 401', async () => {
    const ok = await post('/api/login', undefined, { user: 'con.gai', password: 'carebox' })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ user: 'con.gai', role: 'family', name: 'Chị Minh', token: expect.any(String) })
    for (const body of [{ user: 'con.gai', password: 'sai' }, { user: 'toString', password: 'carebox' }, { user: 'ai.do', password: 'carebox' }, {}]) {
      const bad = await post('/api/login', undefined, body)
      expect(bad.status).toBe(401)
      expect(await bad.json()).toEqual({ error: 'Sai tài khoản hoặc mật khẩu' })
    }
  })
})

describe('auth', () => {
  test('state without/with tampered token → 401', async () => {
    expect((await send('/api/state')).status).toBe(401)
    for (const t of [`${elder}x`, elder.replace('ba.lan', 'con.gai'), 'garbage', '.', 'ba.lan.']) {
      expect((await send('/api/state', {}, t)).status, t).toBe(401)
    }
    expect((await post('/api/action', 'garbage', { type: 'reset' })).status).toBe(401)
    expect((await send('/api/state', {}, elder)).status).toBe(200)
  })

  test('elder cannot send family/accept; family cannot send chat/say → 403, state unchanged', async () => {
    const before = await getState(elder)
    expect((await post('/api/action', elder, { type: 'family/accept', id: 'CB-001' })).status).toBe(403)
    expect((await post('/api/action', family, { type: 'chat/say', text: 'Tôi là bà Lan' })).status).toBe(403)
    const after = await getState(elder)
    expect(after.rev).toBe(before.rev)
    expect(after.chat.messages).toEqual(before.chat.messages)
  })

  test('every action type belongs to a role, and only reset is shared', () => {
    const shared = ROLE_ACTIONS.elder.filter((t) => ROLE_ACTIONS.family.includes(t))
    expect(shared).toEqual(['reset'])
  })
})

describe('validation', () => {
  test('malformed actions → 400 and rev unchanged', async () => {
    const before = await getState(elder)
    const tokenFor = (b: { type?: unknown }) => (typeof b.type === 'string' && b.type.startsWith('family/') ? family : elder)
    const bodies: { type?: unknown; [k: string]: unknown }[] = [
      {}, { type: 'nope' }, { type: 42 }, { type: 'family/accept' }, { type: 'family/accept', id: '' },
      { type: 'chat/say', text: 42 }, { type: 'chat/say', text: 'a'.repeat(5000) },
      { type: 'chat/startService', service: 'massage' }, { type: 'device/push', deviceId: 'fall', mode: 'high' },
      { type: 'device/push', deviceId: 'bp', mode: 'loud' }, { type: 'reminder/respond', id: 'r1', response: 'maybe' },
      { type: 'family/done', id: 'CB-001', note: null }, { type: 'family/approveReminder', id: 'CB-001', time: 7 },
    ]
    for (const body of bodies) expect((await post('/api/action', tokenFor(body), body)).status, JSON.stringify(body).slice(0, 60)).toBe(400)
    for (const raw of ['{not json', '42', 'null', '[]']) expect((await send('/api/action', { method: 'POST', body: raw }, elder)).status, raw).toBe(400)
    expect((await getState(elder)).rev).toBe(before.rev)
  })
})

describe('shared state', () => {
  test('interleaved elder chat confirm and family accept both persist', async () => {
    const say = (text: string) => post('/api/action', elder, { type: 'chat/say', text })
    await post('/api/action', elder, { type: 'chat/startService', service: 'groceries' })
    await say('Rau, trứng')
    await say('Sáng mai')
    await say('Đúng rồi')
    expect((await post('/api/action', family, { type: 'family/accept', id: 'CB-003' })).status).toBe(200)
    await say('lịch hôm nay')
    const s = await getState(family)
    expect((s.cases.find((c) => c.id === 'CB-003') as RequestCase).status).toBe('in_progress')
    expect(s.chat.messages.at(-2)!.text).toBe('lịch hôm nay')
  })

  test('stored version:1 state is replaced by a fresh seed, not a 500', async () => {
    for (const old of [{ version: 1, now: 1, view: {} }, { ...seed(Date.now()), cases: null }, 'junk', 42]) {
      await saveState(old as unknown as State)
      const r = await send('/api/state', {}, elder)
      expect(r.status).toBe(200)
      const s: State = await r.json()
      expect(s.version).toBe(2)
      expect(s.cases).toHaveLength(2)
      expect(((await loadState()) as State).version).toBe(2)
    }
  })

  test('GET with nothing due does not bump rev; a POST bumps rev by 1', async () => {
    const a = await getState(elder)
    const b = await getState(family)
    expect(b.rev).toBe(a.rev)
    const after = await (await post('/api/action', family, { type: 'notif/readAll' })).json()
    expect(after.rev).toBe(a.rev + 1)
    expect((await getState(elder)).rev).toBe(a.rev + 1)
  })

  test('reset re-seeds for everyone but rev keeps rising, so clients do not ignore it', async () => {
    await post('/api/action', elder, { type: 'device/fall' })
    const before = await getState(family)
    expect(before.emergency).not.toBeNull()
    const r: State = await (await post('/api/action', family, { type: 'reset' })).json()
    expect(r.emergency).toBeNull()
    expect(r.rev).toBe(before.rev + 1)
  })

  test('unknown route → 404', async () => {
    expect((await send('/api/nope', {}, elder)).status).toBe(404)
  })
})

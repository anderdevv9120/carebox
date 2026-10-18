import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ROLE_ACTIONS, handle } from './api'
import * as ai from './ai'
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
afterEach(() => {
  delete process.env.GEMINI_API_KEY
  vi.restoreAllMocks()
})

describe('real AI chat', () => {
  test('uses Gemma for free-form messages, without false handoff; keeps emergencies deterministic', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const model = vi.spyOn(ai, 'generateReply').mockResolvedValue({ text: 'Cháu đang nghe bác kể chuyện ạ.', unclear: false })
    for (const text of ['Cháu kể chuyện vui đi', 'Kể tiếp đi cháu']) {
      const response = await post('/api/action', elder, { type: 'chat/say', text })
      expect(response.status).toBe(200)
      expect(((await response.json()) as State).chat.messages.at(-1)?.text).toBe('Cháu đang nghe bác kể chuyện ạ.')
    }
    expect(model).toHaveBeenCalledTimes(2)
    const s = await getState(elder)
    expect(s.chat.misses).toBe(0)
    expect(s.cases).toHaveLength(2)
    const emergency: State = await (await post('/api/action', elder, { type: 'chat/say', text: 'Bác đau ngực' })).json()
    expect(emergency.emergency).not.toBeNull()
    expect(model).toHaveBeenCalledTimes(2)
  })

  test('two genuinely unclear Gemma messages alert the daughter with both utterances', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const model = vi.spyOn(ai, 'generateReply').mockResolvedValue({ text: 'Bác nói rõ hơn giúp cháu nhé.', unclear: true })
    const first: State = await (await post('/api/action', elder, { type: 'chat/say', text: 'Bác muốn cái hôm trước ấy' })).json()
    expect(first.chat.misses).toBe(1)
    expect(first.chat.messages.at(-1)?.text).toContain('Nhờ con giúp')
    const next: State = await (await post('/api/action', elder, { type: 'chat/say', text: 'Cái mà con Minh mua ấy' })).json()
    expect(model).toHaveBeenCalledTimes(2)
    expect(next.chat.misses).toBe(0)
    expect(next.chat.recentMisses).toEqual([])
    const alerts = next.cases.filter((c) => c.kind === 'event' && c.title === 'AI chưa hiểu yêu cầu')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      priority: 'uncertain', unclear: ['Bác muốn cái hôm trước ấy', 'Cái mà con Minh mua ấy'],
    })
    expect(next.notifications.some((n) => n.text.includes('AI chưa hiểu yêu cầu'))).toBe(true)
    expect(next.chat.messages.at(-1)?.text).toContain('đã báo Chị Minh')
  })

  test('understood Gemma messages reset the unclear streak', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const model = vi.spyOn(ai, 'generateReply')
      .mockResolvedValueOnce({ text: 'Bác nói lại giúp cháu ạ.', unclear: true })
      .mockResolvedValueOnce({ text: 'Cháu nghe bác kể chuyện đây ạ.', unclear: false })
      .mockResolvedValueOnce({ text: 'Bác nói rõ hơn ạ.', unclear: true })
    for (const text of ['Cái ấy đó', 'Kể chuyện cho bác nghe', 'Món hồi trước ấy'])
      await post('/api/action', elder, { type: 'chat/say', text })
    const state = await getState(elder)
    expect(model).toHaveBeenCalledTimes(3)
    expect(state.chat.misses).toBe(1)
    expect(state.chat.recentMisses).toEqual(['Món hồi trước ấy'])
    expect(state.cases.some((c) => c.kind === 'event' && c.title === 'AI chưa hiểu yêu cầu')).toBe(false)
  })

  test('model failure preserves the elder turn and shows a recoverable bot response', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.spyOn(ai, 'generateReply').mockRejectedValue(new Error('mock provider failure'))
    const before = await getState(elder)
    const response = await post('/api/action', elder, { type: 'chat/say', text: 'Kể chuyện đi cháu' })
    expect(response.status).toBe(200)
    const after = await getState(elder)
    expect(after.chat.messages).toHaveLength(before.chat.messages.length + 2)
    expect(after.chat.messages.at(-2)).toMatchObject({ from: 'elder', text: 'Kể chuyện đi cháu' })
    expect(after.chat.messages.at(-1)?.text).toContain('Bác thử gửi lại')
  })

  test('failed follow-up does not erase an existing misunderstanding', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.spyOn(ai, 'generateReply')
      .mockResolvedValueOnce({ text: 'Bác nói rõ hơn ạ.', unclear: true })
      .mockRejectedValueOnce(new Error('provider error'))
    await post('/api/action', elder, { type: 'chat/say', text: 'Cái món hôm trước' })
    const before = await getState(elder)
    expect((await post('/api/action', elder, { type: 'chat/say', text: 'Cái đó ấy' })).status).toBe(200)
    const after = await getState(elder)
    expect(after.chat.misses).toBe(1)
    expect(after.chat.recentMisses).toEqual(['Cái món hôm trước'])
    expect(after.chat.messages).toHaveLength(before.chat.messages.length + 2)
    expect(after.chat.messages.at(-2)).toMatchObject({ from: 'elder', text: 'Cái đó ấy' })
  })

  test('family changes made during model generation survive the reply', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    let answer!: (value: ai.AIReply) => void
    const model = vi.spyOn(ai, 'generateReply').mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    const pending = post('/api/action', elder, { type: 'chat/say', text: 'Cháu kể chuyện nhé' })
    await vi.waitFor(() => expect(model).toHaveBeenCalledOnce())
    const inProgress = await getState(elder)
    expect(inProgress.chat.messages.at(-1)).toMatchObject({ from: 'elder', text: 'Cháu kể chuyện nhé' })
    const other = await post('/api/action', family, { type: 'notif/readAll' })
    const updated: State = await other.json()
    answer({ text: 'Cháu đang kể chuyện đây ạ.', unclear: false })
    const response: State = await (await pending).json()
    expect(response.rev).toBe(updated.rev + 1)
    expect(response.notifications.every((n) => n.read)).toBe(true)
    expect(response.chat.messages.at(-1)?.text).toBe('Cháu đang kể chuyện đây ạ.')
    expect(response.chat.messages.filter((m) => m.from === 'elder' && m.text === 'Cháu kể chuyện nhé')).toHaveLength(1)
    expect((await getState(elder)).chat.messages).toEqual(response.chat.messages)
  })
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

  test('a re-seed from empty storage (dev restart, flushed Redis) still outranks every rev a client holds', async () => {
    for (let i = 0; i < 5; i++) await post('/api/action', elder, { type: 'chat/say', text: `câu ${i}` })
    const held = await getState(family) // what an open tab still has
    await new Promise((r) => setTimeout(r, 20)) // a restart is never in the same millisecond as five saves
    resetMemory()
    const fresh = await getState(family)
    expect(fresh.chat.messages.length).toBeLessThan(held.chat.messages.length)
    expect(fresh.rev).toBeGreaterThan(held.rev)
  })

  test('unknown route → 404', async () => {
    expect((await send('/api/nope', {}, elder)).status).toBe(404)
  })
})

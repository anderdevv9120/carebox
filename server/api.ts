import { reduce, type Action } from '../src/state/reducer.js'
import { seed } from '../src/state/seed.js'
import { tick } from '../src/state/clock.js'
import { SERVICE } from '../src/state/labels.js'
import { classify, handleUtterance } from '../src/state/assistant.js'
import { sayAi, sayElder } from '../src/state/helpers.js'
import type { Role, State } from '../src/state/types.js'
import { ACCOUNTS, PASSWORD, isAccount, signToken, verifyToken } from './auth.js'
import { loadState, saveState } from './storage.js'
import { generateReply } from './ai.js'

type Type = Action['type']

export const ROLE_ACTIONS: Record<Role, Type[]> = {
  elder: [
    'reset', 'reminder/respond', 'device/push', 'device/disconnect', 'device/reconnect', 'device/fall',
    'chat/say', 'chat/startService', 'chat/handoff', 'chat/clear', 'request/cancel', 'emergency/call115',
  ],
  family: [
    'reset', 'notif/readAll', 'family/decline', 'family/approveReminder',
    'family/contacted', 'case/ack', 'family/reply',
  ],
  staff: [
    'reset', 'staff/verify', 'staff/assign', 'staff/partnerReport', 'staff/complete', 'staff/decline',
    'staff/approveReminder', 'staff/contacted', 'staff/takeEvent', 'staff/resolveEvent', 'case/ack', 'staff/askFamily',
  ],
}

// 'id' = non-empty string, 'text' = string; both at most MAX_TEXT. An array lists the allowed literals.
type Check = 'id' | 'text' | readonly string[]
const MAX_TEXT = 500
const METRICS = ['bp', 'hr', 'glucose', 'spo2'] as const
const DEVICES = [...METRICS, 'fall'] as const
const FIELDS: Record<Type, Record<string, Check>> = {
  'reset': {},
  'reminder/respond': { id: 'id', response: ['received', 'snooze', 'cant_do'] },
  'device/push': { deviceId: METRICS, mode: ['normal', 'high', 'suspicious'] },
  'device/disconnect': { deviceId: DEVICES },
  'device/reconnect': { deviceId: DEVICES },
  'device/fall': {},
  'chat/say': { text: 'text' },
  'chat/startService': { service: Object.keys(SERVICE) },
  'chat/handoff': {},
  'chat/clear': {},
  'notif/readAll': {},
  'request/cancel': { id: 'id' },
  'family/decline': { id: 'id', reason: 'text' },
  'family/approveReminder': { id: 'id', time: 'text' },
  'family/contacted': { id: 'id' },
  'staff/verify': { id: 'id', note: 'text' },
  'staff/assign': { id: 'id', partner: 'text' },
  'staff/partnerReport': { id: 'id', note: 'text' },
  'staff/complete': { id: 'id' },
  'staff/decline': { id: 'id', reason: 'text' },
  'staff/approveReminder': { id: 'id', time: 'text' },
  'staff/contacted': { id: 'id' },
  'staff/takeEvent': { id: 'id' },
  'staff/resolveEvent': { id: 'id', note: 'text' },
  'case/ack': { id: 'id' },
  'staff/askFamily': { id: 'id', question: 'text' },
  'family/reply': { id: 'id', text: 'text' },
  'emergency/call115': {},
}

const ok = (v: unknown, c: Check) =>
  typeof c !== 'string' ? c.includes(v as string)
    : typeof v === 'string' && v.length <= MAX_TEXT && (c === 'text' || v.length > 0)

// Returns the action rebuilt from known fields only, or the HTTP status that rejects it.
function parseAction(body: unknown, role: Role): Action | 400 | 403 {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 400
  const b = body as Record<string, unknown>
  if (typeof b.type !== 'string' || !Object.hasOwn(FIELDS, b.type)) return 400
  const type = b.type as Type
  if (!ROLE_ACTIONS[role].includes(type)) return 403
  const spec = Object.entries(FIELDS[type])
  if (!spec.every(([k, c]) => ok(b[k], c))) return 400
  // the audience, and who acknowledges, is the caller's role, never the client's choice
  const injected = type === 'notif/readAll' ? { to: role } : type === 'case/ack' ? { by: role } : {}
  return { type, ...Object.fromEntries(spec.map(([k]) => [k, b[k]])), ...injected } as Action
}

// ponytail: shallow shape check, not a schema; bump `version` when the State shape changes.
function isState(v: unknown): v is State {
  const s = v as State
  return !!s && typeof s === 'object' && s.version === 3 && typeof s.now === 'number' && typeof s.rev === 'number' &&
    typeof s.day === 'string' && !!s.elder && [s.cases, s.reminders, s.devices, s.notifications, s.family, s.chat?.messages].every(Array.isArray)
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}

async function login(req: Request): Promise<Response> {
  const b = (await readJson(req)) as { user?: unknown; password?: unknown } | undefined
  if (!b || typeof b !== 'object' || !isAccount(b.user) || b.password !== PASSWORD) return json(401, { error: 'Sai tài khoản hoặc mật khẩu' })
  return json(200, { token: signToken(b.user), user: b.user, ...ACCOUNTS[b.user] })
}

// Load the latest stored state, bring it to now, apply the action, and save only if something changed.
// ponytail: last-write-wins across the load→save gap; Redis WATCH if more than two devices
async function apply(action?: Action): Promise<Response> {
  const initial = await loadState()
  const before = isState(initial) ? initial : seed(Date.now())
  const text = action?.type === 'chat/say' ? action.text.trim() : ''
  const useAi = !!process.env.GEMINI_API_KEY?.trim() && !!text && !before.chat.pending && classify(text).intent === 'unknown'
  let reply: Awaited<ReturnType<typeof generateReply>> | undefined
  if (useAi) {
    // Save the elder's turn before the slower model call, so reloads can already show it.
    const { state } = tick(before, Date.now())
    await saveState({ ...sayElder(state, text), rev: isState(initial) ? before.rev + 1 : Date.now() })
    try {
      reply = await generateReply(before, text)
    } catch (err) {
      console.error('Gemma request failed:', (err as Error).message)
      const raw = await loadState()
      const current = isState(raw) ? raw : sayElder(before, text)
      const failed = { ...sayAi(current, 'Không thể kết nối trợ lý AI. Bác thử gửi lại nhé.'), rev: current.rev + 1 }
      await saveState(failed)
      return json(200, failed)
    }
  }
  // AI calls are slow: reload so a family action saved during generation is not overwritten.
  const raw = reply ? await loadState() : initial
  const fresh = !isState(raw)
  const base = fresh ? seed(Date.now()) : raw
  const { state, changed } = tick(base, Date.now())
  const next = reply
    ? reply.unclear
      ? handleUtterance(state, text, true) // The existing miss counter and handoff produce the family alert.
      : sayAi({ ...state, chat: { ...state.chat, misses: 0, recentMisses: [] } }, reply.text)
    : action ? reduce(state, action) : state
  if (!fresh && !changed && next === state) return json(200, next)
  // rev comes from the stored state, so a reset (which re-seeds at rev 0) still moves clients forward;
  // with nothing stored (dev restart, flushed Redis) the clock outranks any rev an open tab holds
  const saved = { ...next, rev: fresh ? Date.now() : base.rev + 1 }
  await saveState(saved)
  return json(200, saved)
}

export async function handle(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname
  if (path === '/api/login' && req.method === 'POST') return login(req)
  if (path !== '/api/state' && path !== '/api/action') return json(404, { error: 'Not found' })
  const who = verifyToken(req.headers.get('authorization')?.replace(/^Bearer /, '') ?? null)
  if (!who) return json(401, { error: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' })
  if (path === '/api/state' && req.method === 'GET') return apply()
  if (path === '/api/action' && req.method === 'POST') {
    const action = parseAction(await readJson(req), who.role)
    if (typeof action === 'number') return json(action, { error: action === 403 ? 'Tài khoản này không được thực hiện thao tác này' : 'Thao tác không hợp lệ' })
    return apply(action)
  }
  return json(405, { error: 'Method not allowed' })
}

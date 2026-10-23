import { reduce, type Action } from '../src/state/reducer.js'
import { seed } from '../src/state/seed.js'
import { tick } from '../src/state/clock.js'
import { SERVICE } from '../src/state/labels.js'
import { classify, handleUtterance, raiseElderEmergency, startService } from '../src/state/assistant.js'
import { sayAi, sayElder } from '../src/state/helpers.js'
import type { Role, State } from '../src/state/types.js'
import { validManualReading } from '../src/state/devices.js'
import { ReminderError, validDate, validateSchedule } from '../src/state/reminders.js'
import { ACCOUNTS, PASSWORD, isAccount, signToken, verifyToken } from './auth.js'
import { loadState, saveState } from './storage.js'
import { generateReply } from './ai.js'

type Type = Action['type']

export const ROLE_ACTIONS: Record<Role, Type[]> = {
  elder: [
    'reset', 'notif/readAll', 'reminder/respond', 'device/manual', 'device/push', 'device/disconnect', 'device/reconnect', 'device/fall',
    'chat/say', 'chat/startService', 'chat/handoff', 'chat/clear', 'chat/resume', 'request/cancel', 'emergency/call115', 'emergency/callFamily',
  ],
  family: [
    'reset', 'notif/readAll', 'reminder/save', 'reminder/cancel', 'reminder/approve', 'family/decline', 'family/approveReminder',
    'family/contacted', 'case/ack', 'family/reply',
  ],
  staff: [
    'reset', 'notif/readAll', 'reminder/save', 'reminder/cancel', 'staff/verify', 'staff/assign', 'staff/partnerReport', 'staff/complete', 'staff/decline',
    'staff/contacted', 'staff/takeEvent', 'staff/resolveEvent', 'case/ack', 'staff/askFamily',
  ],
}

// 'id' = non-empty string, 'text' = string; both at most MAX_TEXT. An array lists the allowed literals.
type Check = 'id' | 'text' | 'reading' | 'timestamp' | 'revision' | 'optional-id' | readonly string[]
const MAX_TEXT = 500
const METRICS = ['bp', 'hr', 'glucose', 'spo2'] as const
const DEVICES = [...METRICS, 'fall'] as const
const FIELDS: Record<Type, Record<string, Check>> = {
  'reset': {},
  'reminder/respond': { id: 'id', dueAt: 'timestamp', response: ['received', 'snooze', 'cant_do'] },
  'reminder/save': { id: 'text', requestId: 'optional-id', kind: ['medicine', 'meal', 'clinic', 'activity'], title: 'id', note: 'text', times: 'id', startDate: 'id', endDate: 'text', repeat: ['daily', 'once'], medicine: 'text', dose: 'text', instructions: 'text', location: 'text' },
  'reminder/approve': { id: 'id', revision: 'revision' },
  'reminder/cancel': { id: 'id', date: 'id' },
  'device/manual': { deviceId: METRICS, value: 'reading' },
  'device/push': { deviceId: METRICS, mode: ['normal', 'high', 'suspicious'] },
  'device/disconnect': { deviceId: DEVICES },
  'device/reconnect': { deviceId: DEVICES },
  'device/fall': {},
  'chat/say': { text: 'text' },
  'chat/startService': { service: Object.keys(SERVICE) },
  'chat/handoff': {},
  'chat/clear': {},
  'chat/resume': { id: 'id' },
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
  'emergency/callFamily': {},
}

function ok(v: unknown, c: Check): boolean {
  if (typeof c !== 'string') return c.includes(v as string)
  if (c === 'revision') return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
  if (c === 'timestamp') return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 8.64e15
  if (c === 'reading') return typeof v === 'number' && Number.isFinite(v) || Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
  if (c === 'optional-id') return v === undefined || ok(v, 'id')
  return typeof v === 'string' && v.length <= MAX_TEXT && (c === 'text' || v.length > 0)
}

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
  const injected = type === 'notif/readAll' ? { to: role } : ['case/ack', 'reminder/save', 'reminder/cancel'].includes(type) ? { by: role } : {}
  const action = { type, ...Object.fromEntries(spec.map(([k]) => [k, b[k]])), ...injected } as Action
  if (action.type === 'reminder/save' && (validateSchedule(action) || action.id && action.times.split(',').length !== 1)) return 400
  if (action.type === 'reminder/cancel' && !validDate(action.date)) return 400
  if (action.type === 'device/manual' && !validManualReading(action.deviceId, action.value)) return 400
  return action
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
  const b = (await readJson(req)) as { user?: unknown; password?: unknown; role?: unknown } | undefined
  if (!b || typeof b !== 'object' || !isAccount(b.user) || b.password !== PASSWORD) return json(401, { error: 'Sai tài khoản hoặc mật khẩu' })
  // checked only after the password, so a wrong guess never reveals an account's role
  if (b.role !== undefined && b.role !== ACCOUNTS[b.user].role) return json(401, { error: 'Tài khoản không thuộc vai trò đã chọn' })
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
    ? reply.kind === 'unclear'
      ? handleUtterance(state, text, true) // The existing miss counter and handoff produce the family alert.
      : reply.kind === 'emergency'
        ? raiseElderEmergency(state, text)
        : reply.kind === 'service'
          ? startService(state, reply.service!, true, text)
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
    try {
      return await apply(action)
    } catch (err) {
      if (err instanceof ReminderError) return json(400, { error: err.message })
      throw err
    }
  }
  return json(405, { error: 'Method not allowed' })
}

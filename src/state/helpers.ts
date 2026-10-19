import type { Audience, Case, EventCase, NotifCategory, Reading, Source, State } from './types.js'

export const MIN = 60_000
const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

// ponytail: fixed UTC+7, Vietnam has no DST
export const VN_OFFSET = 7 * 60 * MIN
// A Date whose UTC fields read as Vietnam wall-clock time.
const vn = (ms: number) => new Date(ms + VN_OFFSET)

export function fmtTime(ms: number): string {
  const d = vn(ms)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export function fmtDate(ms: number): string {
  const d = vn(ms)
  return `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} tháng ${d.getUTCMonth() + 1}`
}

export function fmtDayMonth(ms: number): string {
  const d = vn(ms)
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`
}

export function vnDay(ms: number): string {
  const d = vn(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// HH:MM on the Vietnam date of `ms`, shifted by `dayOffset` days.
export function atVN(ms: number, hhmm: string, dayOffset = 0): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = vn(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, h, m) - VN_OFFSET
}

export const fmtValue = (v: Reading['value']) => (Array.isArray(v) ? `${v[0]}/${v[1]}` : v === 'fall' ? 'Té ngã' : String(v))

export function nextCaseId(s: State, kind: 'request' | 'event'): [State, string] {
  if (kind === 'request') return [{ ...s, seq: { ...s.seq, cb: s.seq.cb + 1 } }, `CB-${pad3(s.seq.cb)}`]
  return [{ ...s, seq: { ...s.seq, evt: s.seq.evt + 1 } }, `EVT-${pad3(s.seq.evt)}`]
}
const pad3 = (n: number) => String(n).padStart(3, '0')

function nextN(s: State): [State, string] {
  return [{ ...s, seq: { ...s.seq, n: s.seq.n + 1 } }, `n${s.seq.n}`]
}

export function addCase(s: State, c: Case): State {
  return { ...s, cases: [...s.cases, c] }
}

type NewEvent = Pick<EventCase, 'title' | 'detail' | 'priority' | 'priorityReason' | 'source'> &
  Partial<Pick<EventCase, 'deviceId' | 'reminderId' | 'unclear' | 'status' | 'handler'>> & { log?: string }

export function createEvent(s: State, e: NewEvent): [State, string] {
  const [out, id] = nextCaseId(s, 'event')
  const { log, ...rest } = e
  const c: EventCase = {
    kind: 'event', id, createdAt: s.now, status: 'to_verify', unclear: [], owner: 'staff', ...rest,
    history: [{ at: s.now, by: e.source === 'device' ? 'device' : 'ai', text: log ?? 'Tạo cảnh báo, chờ nhân viên xem.' }],
  }
  return [addCase(out, c), id]
}

export function updateCase(s: State, id: string, patch: Partial<Case>, log?: { by: Source; text: string }): State {
  return {
    ...s,
    cases: s.cases.map((c) =>
      c.id !== id ? c : ({ ...c, ...patch, history: log ? [...c.history, { at: s.now, ...log }] : c.history } as Case),
    ),
  }
}

export function notify(s: State, to: Audience, text: string, category: NotifCategory, source: Source, caseId?: string): State {
  const [out, id] = nextN(s)
  return { ...out, notifications: [...out.notifications, { id, at: s.now, text, category, source, to, caseId, read: false }] }
}

// An alert goes to staff as is; the family hear the same fact and that staff were handed it.
export function notifyAlert(s: State, text: string, category: NotifCategory, source: Source, caseId: string): State {
  return notify(notify(s, 'staff', text, category, source, caseId), 'family', `${text} Đã chuyển nhân viên CAREBOX kiểm tra.`, category, source, caseId)
}

// The family member who takes over requests and alerts.
export const familyName = (s: State) => s.family[0].name
export const staffName = (s: State) => s.staff.name

export function sayAi(s: State, text: string): State {
  const [out, id] = nextN(s)
  return { ...out, chat: { ...out.chat, messages: [...out.chat.messages, { id, from: 'ai', text, at: s.now }] } }
}

export function sayElder(s: State, text: string): State {
  const [out, id] = nextN(s)
  return { ...out, chat: { ...out.chat, messages: [...out.chat.messages, { id, from: 'elder', text, at: s.now }] } }
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Phrase match on whole words: " dau nguc " inside " toi bi dau nguc qua ".
export const has = (words: string, kws: string[]) => kws.some((k) => ` ${words} `.includes(` ${k} `))

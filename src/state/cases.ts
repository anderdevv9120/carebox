import { MIN, atVN, createEvent, familyName, notify, updateCase } from './helpers'
import type { Case, EventCase, Priority, RequestCase, ServiceType, Source, State } from './types'

export const ABANDONED_AFTER = 30 // minutes, "giả định thử nghiệm"
// Services the daughter does or arranges herself, closed with "Đã xong".
export const DO_SERVICES: ServiceType[] = ['medicine', 'groceries', 'clinic', 'daily_help']

export type CaseAction =
  | { type: 'request/cancel'; id: string }
  | { type: 'family/accept'; id: string }
  | { type: 'family/done'; id: string; note: string }
  | { type: 'family/decline'; id: string; reason: string }
  | { type: 'family/approveReminder'; id: string; time: string }
  | { type: 'family/contacted'; id: string }
  | { type: 'family/takeEvent'; id: string }
  | { type: 'family/resolveEvent'; id: string; note: string }
  | { type: 'emergency/call115' }

const FINAL = ['done', 'refused', 'resolved']
export const isFinal = (c: Case) => FINAL.includes(c.status)
const UNACCEPTED = ['need_info', 'await_confirm', 'await_family']
// The daughter acts only once her mother has confirmed the request.
const FAMILY_OPEN = ['await_family', 'in_progress']

// "Bỏ ngỏ": nobody has accepted the request for over 30 minutes.
export const isAbandoned = (c: Case, now: number) =>
  c.kind === 'request' && UNACCEPTED.includes(c.status) && now - c.createdAt > ABANDONED_AFTER * MIN

export function effectivePriority(c: Case, now: number): { priority: Priority; reason: string } {
  if (c.priority === 'normal' && isAbandoned(c, now))
    return { priority: 'priority', reason: 'Bỏ ngỏ quá 30 phút (giả định thử nghiệm)' }
  return { priority: c.priority, reason: c.priorityReason }
}

const RANK: Record<Priority, number> = { emergency: 0, priority: 1, uncertain: 2, normal: 3 }

// The daughter's work list: open alerts by urgency, open requests with "Bỏ ngỏ" on top; oldest first within each.
export function familyQueue(s: State): { alerts: EventCase[]; requests: RequestCase[] } {
  const open = s.cases.filter((c) => !isFinal(c)).sort((a, b) => a.createdAt - b.createdAt)
  const alerts = open.filter((c): c is EventCase => c.kind === 'event').sort((a, b) => RANK[a.priority] - RANK[b.priority])
  const requests = open.filter((c): c is RequestCase => c.kind === 'request')
    .sort((a, b) => Number(isAbandoned(b, s.now)) - Number(isAbandoned(a, s.now)))
  return { alerts, requests }
}

export function nextOwner(c: Case, s: State): string {
  const name = familyName(s)
  if (c.kind === 'event') {
    if (c.status === 'to_verify') return `${name} (xem và tiếp nhận)`
    if (c.status === 'handling') return c.handler ?? name
    return '—'
  }
  switch (c.status) {
    case 'need_info': return 'Người cao tuổi (bổ sung thông tin)'
    case 'await_confirm': return 'Người cao tuổi (xác nhận)'
    case 'await_family': return `${name} (nhận việc)`
    case 'in_progress': return `${name} (đang xử lý)`
    default: return '—'
  }
}

export function raiseEmergency(s: State, title: string, detail: string, source: Source): State {
  const name = familyName(s)
  const [out, id] = createEvent(s, {
    title, detail, source, priority: 'emergency', priorityReason: 'Dấu hiệu khẩn cấp',
    log: `Hướng dẫn gọi 115; đã thông báo ${name}. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.`,
  })
  return notify({ ...out, emergency: { caseId: id, calling: false } },
    `KHẨN CẤP: ${title}. Đang hướng dẫn gọi 115. Cần ${name} xác nhận đã tiếp nhận tình huống.`, 'health', source, id)
}

function requestTransition(s: State, c: RequestCase, a: CaseAction): State {
  const name = familyName(s)
  const fam = (text: string) => ({ by: 'family' as const, text })
  const open = FAMILY_OPEN.includes(c.status)
  const done = (extra: Partial<RequestCase>, text: string, base = s) =>
    updateCase(base, c.id, { status: 'done', completedAt: s.now, doneBy: name, ...extra }, fam(text))
  switch (a.type) {
    case 'request/cancel':
      if (isFinal(c)) return s
      return notify(updateCase(s, c.id, { status: 'refused', closedReason: 'Người cao tuổi từ chối' }, { by: 'elder', text: 'Người cao tuổi hủy/từ chối yêu cầu.' }),
        `${c.title}: bác đã từ chối dịch vụ. Không đặt lại nếu bác không yêu cầu.`, 'request', 'elder', c.id)
    case 'family/accept':
      if (c.status !== 'await_family') return s
      return updateCase(s, c.id, { status: 'in_progress', acceptedAt: s.now }, fam(`${name} nhận việc.`))
    case 'family/done': {
      if (c.status !== 'in_progress' || !DO_SERVICES.includes(c.service)) return s
      const note = a.note.trim()
      return done(note ? { doneNote: note } : {}, note ? `${name} báo đã xong: ${note}` : `${name} báo đã xong.`)
    }
    case 'family/decline': {
      const reason = a.reason.trim()
      if (!open || !reason) return s
      return updateCase(s, c.id, { status: 'refused', closedReason: reason }, fam(`${name} từ chối: ${reason}`))
    }
    case 'family/approveReminder': {
      if (c.service !== 'add_reminder' || !open || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)) return s
      // a time already gone today starts tomorrow, so it is not flagged "Chưa có xác nhận" at once
      const today = atVN(s.now, a.time)
      const reminder = { id: `r-${c.id}`, dueAt: today > s.now ? today : atVN(s.now, a.time, 1), title: c.fields.noi_dung || c.title, note: `${name} duyệt từ yêu cầu ${c.id}`, kind: 'activity' as const, daily: true }
      return done({}, `${name} duyệt lịch nhắc lúc ${a.time}.`, { ...s, reminders: [...s.reminders, reminder] })
    }
    case 'family/contacted':
      if (c.service !== 'contact_family' || !open) return s
      return done({}, `${name} đã liên hệ.`)
    default:
      return s
  }
}

function eventTransition(s: State, c: EventCase, a: CaseAction): State {
  const name = familyName(s)
  switch (a.type) {
    case 'family/takeEvent':
      if (c.status !== 'to_verify') return s
      return updateCase(s, c.id, { status: 'handling', handler: name }, { by: 'family', text: `${name} tiếp nhận.` })
    case 'family/resolveEvent': {
      const note = a.note.trim()
      if (c.status !== 'handling' || !note) return s
      const out = s.emergency?.caseId === c.id ? { ...s, emergency: null } : s
      return updateCase(out, c.id, { status: 'resolved', closingNote: note }, { by: 'family', text: `Đóng sự kiện: ${note}` })
    }
    default:
      return s
  }
}

export function transition(s: State, a: CaseAction): State {
  if (a.type === 'emergency/call115') {
    if (!s.emergency || s.emergency.calling) return s
    return updateCase({ ...s, emergency: { ...s.emergency, calling: true } }, s.emergency.caseId, {}, { by: 'elder', text: 'Mô phỏng: đang gọi 115.' })
  }
  const c = s.cases.find((x) => x.id === a.id)
  if (!c) return s
  return c.kind === 'request' ? requestTransition(s, c, a) : eventTransition(s, c, a)
}

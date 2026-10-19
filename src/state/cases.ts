import { MIN, atVN, createEvent, familyName, has, normalize, notify, staffName, updateCase } from './helpers.js'
import type { Case, EventCase, Owner, Priority, ReminderKind, RequestCase, ServiceType, Source, State } from './types.js'

export const ABANDONED_AFTER = 30 // minutes, "giả định thử nghiệm"
export const FAMILY_FALLBACK_AFTER = 30 // minutes a family-owned request may wait before staff take it
// Services a care partner carries out; staff verify, assign and close them.
export const SERVICE_JOBS: ServiceType[] = ['medicine', 'groceries', 'clinic', 'daily_help']

// A reminder about medicine goes to staff; any other reminder or a family call stays with the daughter.
// "bệnh viện" holds "viện" but is a place, not a pill.
export const isMedicineReminder = (c: RequestCase) =>
  c.service === 'add_reminder' &&
  has(normalize(`${c.detail} ${c.fields.noi_dung ?? ''}`).replace(/\bbenh vien\b/g, ' '), ['thuoc', 'vien', 'lieu', 'tiem', 'insulin'])
export const ownerAtConfirm = (c: RequestCase): Owner =>
  c.service === 'contact_family' || (c.service === 'add_reminder' && !isMedicineReminder(c)) ? 'family' : 'staff'

export type CaseAction =
  | { type: 'request/cancel'; id: string }
  | { type: 'family/decline'; id: string; reason: string }
  | { type: 'family/approveReminder'; id: string; time: string }
  | { type: 'family/contacted'; id: string }
  | { type: 'staff/verify'; id: string; note: string }
  | { type: 'staff/assign'; id: string; partner: string }
  | { type: 'staff/partnerReport'; id: string; note: string }
  | { type: 'staff/complete'; id: string }
  | { type: 'staff/decline'; id: string; reason: string }
  | { type: 'staff/approveReminder'; id: string; time: string }
  | { type: 'staff/contacted'; id: string }
  | { type: 'family/takeEvent'; id: string }
  | { type: 'family/resolveEvent'; id: string; note: string }
  | { type: 'emergency/call115' }

const FINAL = ['done', 'refused', 'resolved']
export const isFinal = (c: Case) => FINAL.includes(c.status)
const UNACCEPTED = ['need_info', 'await_confirm', 'await_family', 'await_staff']
// The daughter acts only on what her mother confirmed for her, or what staff left to her.
const FAMILY_OPEN = ['await_family', 'await_staff']
const STAFF_DECLINABLE = ['need_info', 'await_confirm', 'await_staff', 'in_progress']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// "Bỏ ngỏ": nobody has accepted the request for over 30 minutes.
export const isAbandoned = (c: Case, now: number) =>
  c.kind === 'request' && UNACCEPTED.includes(c.status) && now - c.createdAt > ABANDONED_AFTER * MIN

export function effectivePriority(c: Case, now: number): { priority: Priority; reason: string } {
  if (c.priority === 'normal' && isAbandoned(c, now))
    return { priority: 'priority', reason: 'Bỏ ngỏ quá 30 phút' }
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
    case 'await_staff':
      if (ownerAtConfirm(c) === 'family') return `Nhân viên CAREBOX hoặc ${name}`
      if (c.service === 'add_reminder' || c.service === 'contact_family') return 'Nhân viên CAREBOX (duyệt / liên hệ)'
      return c.verifiedBy ? 'Nhân viên CAREBOX (phân công)' : 'Nhân viên CAREBOX (xác minh)'
    case 'in_progress': return c.partnerReport ? 'Nhân viên CAREBOX (xác nhận kết quả)' : `${c.assignee} (đang thực hiện)`
    default: return '—'
  }
}

// A family-owned request nobody took within 30 minutes of the elder's confirmation goes to staff, once.
export function sweepFamilyFallback(s: State): State {
  let out = s
  for (const c of s.cases) {
    if (c.kind !== 'request' || c.owner !== 'family' || c.status !== 'await_family') continue
    if (c.confirmedAt === undefined || s.now - c.confirmedAt <= FAMILY_FALLBACK_AFTER * MIN) continue
    out = updateCase(out, c.id, { owner: 'staff', status: 'await_staff' }, { by: 'ai', text: 'Gia đình chưa phản hồi sau 30 phút, chuyển nhân viên CAREBOX.' })
    out = notify(out, 'staff', `${c.title}: ${familyName(s)} chưa nhận việc sau 30 phút, chờ nhân viên xử lý.`, 'request', 'ai', c.id)
  }
  return out
}

export function raiseEmergency(s: State, title: string, detail: string, source: Source): State {
  const name = familyName(s)
  const [out, id] = createEvent(s, {
    title, detail, source, priority: 'emergency', priorityReason: 'Dấu hiệu khẩn cấp',
    log: `Hướng dẫn gọi 115; đã thông báo ${name}. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.`,
  })
  return notify({ ...out, emergency: { caseId: id, calling: false } },
    'family', `KHẨN CẤP: ${title}. Đang hướng dẫn gọi 115. Cần ${name} xác nhận đã tiếp nhận tình huống.`, 'health', source, id)
}

function addReminder(s: State, c: RequestCase, time: string, approver: string, kind: ReminderKind): State {
  // a time already gone today starts tomorrow, so it is not flagged "Chưa có xác nhận" at once
  const today = atVN(s.now, time)
  const reminder = { id: `r-${c.id}`, dueAt: today > s.now ? today : atVN(s.now, time, 1), title: c.fields.noi_dung || c.title, note: `${approver} duyệt từ yêu cầu ${c.id}`, kind, daily: true }
  return { ...s, reminders: [...s.reminders, reminder] }
}

function requestTransition(s: State, c: RequestCase, a: CaseAction): State {
  const name = familyName(s)
  const fam = (text: string) => ({ by: 'family' as const, text })
  const open = FAMILY_OPEN.includes(c.status) && ownerAtConfirm(c) === 'family'
  const done = (extra: Partial<RequestCase>, text: string, base = s) =>
    updateCase(base, c.id, { status: 'done', completedAt: s.now, doneBy: name, ...extra }, fam(text))
  switch (a.type) {
    case 'request/cancel': {
      if (isFinal(c)) return s
      let out = updateCase(s, c.id, { status: 'refused', closedReason: 'Người cao tuổi từ chối' }, { by: 'elder', text: 'Người cao tuổi hủy/từ chối yêu cầu.' })
      if (c.assignee) out = updateCase(out, c.id, {}, { by: 'ai', text: `Đã báo hủy cho Care Partner ${c.assignee}.` })
      out = notify(out, 'family', `${c.title}: bác đã từ chối dịch vụ. Không đặt lại nếu bác không yêu cầu.`, 'request', 'elder', c.id)
      return c.owner === 'staff' ? notify(out, 'staff', `${c.title}: bác đã hủy yêu cầu.`, 'request', 'elder', c.id) : out
    }
    case 'family/decline': {
      const reason = a.reason.trim()
      if (!open || !reason) return s
      return updateCase(s, c.id, { status: 'refused', closedReason: reason }, fam(`${name} từ chối: ${reason}`))
    }
    case 'family/approveReminder': {
      if (c.service !== 'add_reminder' || !open || !TIME.test(a.time)) return s
      return done({}, `${name} duyệt lịch nhắc lúc ${a.time}.`, addReminder(s, c, a.time, name, 'activity'))
    }
    case 'family/contacted':
      if (c.service !== 'contact_family' || !open) return s
      return done({}, `${name} đã liên hệ.`)
    default:
      return s
  }
}

function staffTransition(s: State, c: RequestCase, a: CaseAction): State {
  const name = staffName(s)
  const log = (text: string) => ({ by: 'staff' as const, text })
  const done = (text: string, base = s) => updateCase(base, c.id, { status: 'done', completedAt: s.now, doneBy: name }, log(text))
  switch (a.type) {
    case 'staff/verify': {
      if (c.status !== 'await_staff' || c.verifiedBy) return s
      const note = a.note.trim()
      return updateCase(s, c.id, { verifiedBy: name, verifiedAt: s.now, verifyNote: note }, log(note ? `${name} xác minh yêu cầu: ${note}` : `${name} xác minh yêu cầu.`))
    }
    case 'staff/assign':
      if (!SERVICE_JOBS.includes(c.service) || c.status !== 'await_staff' || !c.verifiedBy || !s.carePartners.includes(a.partner)) return s
      return updateCase(s, c.id, { status: 'in_progress', assignee: a.partner, acceptedAt: s.now }, log(`${name} giao cho ${a.partner}.`))
    case 'staff/partnerReport': {
      const note = a.note.trim()
      if (c.status !== 'in_progress' || !c.assignee || c.partnerReport || !note) return s
      return updateCase(s, c.id, { partnerReport: note, partnerReportAt: s.now }, log(`${c.assignee} báo lại: ${note}`))
    }
    case 'staff/complete':
      if (c.status !== 'in_progress' || !c.partnerReport) return s
      return notify(done(`${name} xác nhận hoàn tất.`), 'family', `${c.title}: nhân viên CAREBOX đã xác nhận hoàn tất.`, 'request', 'staff', c.id)
    case 'staff/decline': {
      const reason = a.reason.trim()
      if (!reason || !STAFF_DECLINABLE.includes(c.status) || c.owner !== 'staff') return s
      return notify(updateCase(s, c.id, { status: 'refused', closedReason: reason }, log(`${name} từ chối: ${reason}`)),
        'family', `${c.title}: nhân viên CAREBOX không thực hiện được. Lý do: ${reason}`, 'request', 'staff', c.id)
    }
    case 'staff/approveReminder': {
      if (c.service !== 'add_reminder' || c.status !== 'await_staff' || !TIME.test(a.time)) return s
      return done(`${name} duyệt lịch nhắc lúc ${a.time}.`, addReminder(s, c, a.time, name, isMedicineReminder(c) ? 'medicine' : 'activity'))
    }
    case 'staff/contacted':
      if (c.service !== 'contact_family' || c.status !== 'await_staff') return s
      return done(`${name} đã liên hệ.`)
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
  if (c.kind !== 'request') return eventTransition(s, c, a)
  return a.type.startsWith('staff/') ? staffTransition(s, c, a) : requestTransition(s, c, a)
}

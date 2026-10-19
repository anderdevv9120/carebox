import { MIN, atVN, createEvent, familyName, has, normalize, notify, staffName, updateCase } from './helpers.js'
import type { Case, EventCase, Owner, Priority, ReminderKind, RequestCase, ServiceType, Source, State } from './types.js'

export const ABANDONED_AFTER = 30 // minutes, "giả định thử nghiệm"
export const FAMILY_FALLBACK_AFTER = 30 // minutes a family-owned request may wait before staff take it
// Services a care partner carries out; staff verify, assign and close them.
export const SERVICE_JOBS: ServiceType[] = ['medicine', 'groceries', 'clinic', 'daily_help']

// A reminder about medicine goes to staff; any other reminder or a family call stays with the daughter.
// "viện" is a pill, but also in "bệnh viện", "công viên", "nhân viên", ...: those are stripped first.
// "tiêm" (injection) is matched accented: normalized it collides with "tiệm" (shop).
const NOT_A_PILL = /\b((benh|cong|nhan|thanh|sinh|hoi) vien|vien chuc)\b/g
const INJECT = /(?<!\p{L})tiêm(?!\p{L})/u
export const isMedicineReminder = (c: RequestCase) => {
  const text = `${c.detail} ${c.fields.noi_dung ?? ''}`
  return c.service === 'add_reminder' &&
    (has(normalize(text).replace(NOT_A_PILL, ' '), ['thuoc', 'vien', 'lieu', 'insulin']) || INJECT.test(text.normalize('NFC').toLowerCase()))
}
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
  | { type: 'staff/takeEvent'; id: string }
  | { type: 'staff/resolveEvent'; id: string; note: string }
  | { type: 'staff/askFamily'; id: string; question: string }
  | { type: 'family/reply'; id: string; text: string }
  | { type: 'case/ack'; id: string; by: Owner } // `by` is set by the server from the caller's role
  | { type: 'emergency/call115' }
  | { type: 'emergency/callFamily' }

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

// Open alerts by urgency, then open requests with "Bỏ ngỏ" on top; oldest first within each.
export function sortQueue(cs: Case[], now: number): Case[] {
  const key = (c: Case) => (c.kind === 'event' ? RANK[c.priority] : isAbandoned(c, now) ? 4 : 5)
  return [...cs].sort((a, b) => key(a) - key(b) || a.createdAt - b.createdAt)
}

// The daughter's work list. A case sits in one list only: asks first, then mine, then the rest.
export function familyView(s: State): { asks: Case[]; mine: RequestCase[]; others: Case[] } {
  const open = sortQueue(s.cases.filter((c) => !isFinal(c)), s.now)
  const asks = open.filter((c) => c.familyAsk && c.familyAsk.reply === undefined)
  const rest = open.filter((c) => !asks.includes(c))
  const mine = rest.filter((c): c is RequestCase => c.kind === 'request' && FAMILY_OPEN.includes(c.status) && ownerAtConfirm(c) === 'family')
  return { asks, mine, others: rest.filter((c) => !mine.includes(c as RequestCase)) }
}

// What the tab badge counts: asks, requests left to her, and emergencies nobody has taken yet.
export function familyTodo(s: State): number {
  const { asks, mine } = familyView(s)
  const emergencies = s.cases.filter((c) => c.kind === 'event' && c.priority === 'emergency' && c.status === 'to_verify')
  return asks.length + mine.length + emergencies.length
}

export function nextOwner(c: Case, s: State): string {
  const name = familyName(s)
  if (c.kind === 'event') {
    if (c.status === 'to_verify') return 'Nhân viên CAREBOX (xem và tiếp nhận)'
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
    log: `Hướng dẫn gọi 115; đã thông báo ${name} và nhân viên CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.`,
  })
  const text = `KHẨN CẤP: ${title}. Đang hướng dẫn gọi 115. Cần xác nhận đã tiếp nhận tình huống.`
  const sent = notify({ ...out, emergency: { caseId: id, calling: false } }, 'staff', text, 'health', source, id)
  return notify(sent, 'family', text, 'health', source, id)
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
      // staff hear of a cancel only if the request ever reached them
      return c.owner === 'staff' && c.confirmedAt !== undefined ? notify(out, 'staff', `${c.title}: bác đã hủy yêu cầu.`, 'request', 'elder', c.id) : out
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
      return updateCase(s, c.id, { partnerReport: note, partnerReportAt: s.now }, log(`${name} ghi nhận báo cáo của Care Partner ${c.assignee}: ${note}`))
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
  const name = staffName(s)
  switch (a.type) {
    case 'staff/takeEvent':
      if (c.status !== 'to_verify') return s
      return updateCase(s, c.id, { status: 'handling', handler: name }, { by: 'staff', text: `${name} tiếp nhận.` })
    // The daughter or staff acknowledge an emergency they were told about; other alerts are staff's to take.
    case 'case/ack': {
      if (c.priority !== 'emergency' || c.status !== 'to_verify') return s
      const handler = a.by === 'staff' ? name : familyName(s)
      return updateCase(s, c.id, { status: 'handling', handler }, { by: a.by, text: `${handler} tiếp nhận.` })
    }
    case 'staff/resolveEvent': {
      const note = a.note.trim()
      if (c.status !== 'handling' || !note) return s
      const out = s.emergency?.caseId === c.id ? { ...s, emergency: null } : s
      return updateCase(out, c.id, { status: 'resolved', closingNote: note }, { by: 'staff', text: `Đóng sự kiện: ${note}` })
    }
    default:
      return s
  }
}

// Staff ask the daughter for help on an open case; one question at a time, a new ask replaces the answered one (history keeps both).
function askFamily(s: State, c: Case, question: string): State {
  const q = question.trim()
  if (isFinal(c) || c.owner !== 'staff' || !q || (c.familyAsk && c.familyAsk.reply === undefined)) return s
  const out = updateCase(s, c.id, { familyAsk: { question: q, askedAt: s.now } }, { by: 'staff', text: `${staffName(s)} nhờ ${familyName(s)} hỗ trợ: ${q}` })
  return notify(out, 'family', `CAREBOX nhờ hỗ trợ (${c.id}): ${q}`, c.kind === 'event' ? 'health' : 'request', 'staff', c.id)
}

function replyToAsk(s: State, c: Case, text: string): State {
  const reply = text.trim()
  if (isFinal(c) || !c.familyAsk || c.familyAsk.reply !== undefined || !reply) return s
  const name = familyName(s)
  const out = updateCase(s, c.id, { familyAsk: { ...c.familyAsk, reply, repliedAt: s.now } }, { by: 'family', text: `${name} trả lời: ${reply}` })
  return notify(out, 'staff', `${name} trả lời (${c.id}): ${reply}`, c.kind === 'event' ? 'health' : 'request', 'family', c.id)
}

export function transition(s: State, a: CaseAction): State {
  if (a.type === 'emergency/call115') {
    if (!s.emergency || s.emergency.calling) return s
    return updateCase({ ...s, emergency: { ...s.emergency, calling: true } }, s.emergency.caseId, {}, { by: 'elder', text: 'Mô phỏng: đang gọi 115.' })
  }
  if (a.type === 'emergency/callFamily') {
    if (!s.emergency || s.emergency.callingFamily) return s
    return updateCase({ ...s, emergency: { ...s.emergency, callingFamily: true } }, s.emergency.caseId, {}, { by: 'elder', text: `Mô phỏng: đang gọi ${familyName(s)}.` })
  }
  const c = s.cases.find((x) => x.id === a.id)
  if (!c) return s
  if (a.type === 'staff/askFamily') return askFamily(s, c, a.question)
  if (a.type === 'family/reply') return replyToAsk(s, c, a.text)
  if (c.kind !== 'request') return eventTransition(s, c, a)
  return a.type.startsWith('staff/') ? staffTransition(s, c, a) : requestTransition(s, c, a)
}

// Would this action change anything? Buttons use it so the guards live in `transition` only.
export const can = (s: State, a: CaseAction) => transition(s, a) !== s

// Staff's operations board. Counters cover staff-owned open cases; the list also shows family-owned ones, read-only.
export function staffBoard(s: State): { counters: { verify: number; waiting: number; doing: number }; cases: Case[] } {
  const open = s.cases.filter((c) => !isFinal(c))
  const mine = open.filter((c) => c.owner === 'staff')
  const awaiting = (c: Case) => c.kind === 'request' && c.status === 'await_staff'
  const reported = (c: Case) => c.kind === 'request' && c.status === 'in_progress' && !!c.partnerReport
  const counters = {
    verify: mine.filter((c) => (c.kind === 'event' && c.status === 'to_verify') || (awaiting(c) && !(c as RequestCase).verifiedBy)).length,
    waiting: mine.filter((c) => (awaiting(c) && !!(c as RequestCase).verifiedBy) || reported(c)).length,
    doing: mine.filter((c) => (c.kind === 'request' && c.status === 'in_progress' && !c.partnerReport) || (c.kind === 'event' && c.status === 'handling')).length,
  }
  const rank = (c: Case) => RANK[effectivePriority(c, s.now).priority]
  const cases = [...open].sort((a, b) => Number(b.owner === 'staff') - Number(a.owner === 'staff') || rank(a) - rank(b) || a.createdAt - b.createdAt)
  return { counters, cases }
}

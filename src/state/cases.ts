import { MIN, addCase, createEvent, nextCaseId, notify, updateCase } from './helpers'
import { SERVICE } from './labels'
import type { Case, EventCase, Priority, RequestCase, ServiceType, Source, State } from './types'

export const ABANDONED_AFTER = 30 // demo minutes, "giả định thử nghiệm"
export const CP_SERVICES: ServiceType[] = ['medicine', 'groceries', 'clinic', 'daily_help']

export type CaseAction =
  | { type: 'request/cancel'; id: string }
  | { type: 'family/responded'; id: string }
  | { type: 'ops/verify'; id: string }
  | { type: 'ops/assign'; id: string; partner: string }
  | { type: 'ops/cpReport'; id: string; text: string }
  | { type: 'ops/confirmDone'; id: string }
  | { type: 'ops/approveReminder'; id: string; time: string }
  | { type: 'ops/decline'; id: string; reason: string }
  | { type: 'ops/flag'; id: string }
  | { type: 'ops/unflag'; id: string }
  | { type: 'ops/takeEvent'; id: string }
  | { type: 'ops/resolveEvent'; id: string; note: string }
  | { type: 'ops/convertEvent'; id: string; service: ServiceType }
  | { type: 'emergency/call115' }
  | { type: 'emergency/dismiss' }

const FINAL = ['done', 'refused', 'resolved']
export const isFinal = (c: Case) => FINAL.includes(c.status)
const OPEN_UNASSIGNED = ['need_info', 'await_confirm', 'await_dispatch']

export function effectivePriority(c: Case, now: number): { priority: Priority; reason: string } {
  if (c.kind === 'request' && c.priority === 'normal' && OPEN_UNASSIGNED.includes(c.status) && !c.assignee && now - c.createdAt > ABANDONED_AFTER * MIN)
    return { priority: 'priority', reason: 'Yêu cầu bị bỏ ngỏ quá 30 phút (giả định thử nghiệm)' }
  return { priority: c.priority, reason: c.priorityReason }
}

export function nextOwner(c: Case, s: State): string {
  if (c.kind === 'event') {
    if (c.status === 'to_verify') return c.priority === 'emergency' ? 'Nhân viên điều phối (xác nhận tiếp nhận)' : 'Nhân viên điều phối'
    if (c.status === 'handling') return c.handler ?? s.staff
    return '—'
  }
  switch (c.status) {
    case 'need_info': return 'Người cao tuổi (bổ sung thông tin)'
    case 'await_confirm': return 'Người cao tuổi (xác nhận)'
    case 'await_dispatch':
      if (!c.verifiedBy) return 'Nhân viên điều phối (xác minh)'
      return c.service === 'contact_family' && !c.familyRespondedAt ? 'Gia đình (phản hồi)' : 'Nhân viên điều phối (phân công)'
    case 'in_progress': return c.cpReport ? 'Nhân viên điều phối (xác nhận hoàn tất)' : `Care Partner ${c.assignee}`
    case 'intervention': return 'Nhân viên điều phối'
    default: return '—'
  }
}

export function raiseEmergency(s: State, title: string, detail: string, source: Source): State {
  const [out, id] = createEvent(s, {
    title, detail, source, priority: 'emergency', priorityReason: 'Dấu hiệu khẩn cấp',
    log: 'Hướng dẫn gọi 115; đã thông báo gia đình và đầu mối CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.',
  })
  return notify({ ...out, emergency: { caseId: id, calling: false } }, ['family', 'ops'],
    `KHẨN CẤP: ${title}. Đang hướng dẫn gọi 115. Cần người xác nhận đã tiếp nhận tình huống.`, 'health', source, id)
}

const at = (s: State, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(s.now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime()
}

function requestTransition(s: State, c: RequestCase, a: CaseAction): State {
  const final = isFinal(c)
  const staff = (text: string) => ({ by: 'staff' as const, text })
  switch (a.type) {
    case 'request/cancel':
      if (final) return s
      return notify(updateCase(s, c.id, { status: 'refused', closedReason: 'Người cao tuổi từ chối' }, { by: 'elder', text: 'Người cao tuổi hủy/từ chối yêu cầu.' }),
        ['family', 'ops'], `${c.title}: bác đã từ chối dịch vụ. Không đặt lại nếu bác không yêu cầu.`, 'request', 'elder', c.id)
    case 'family/responded':
      if (c.service !== 'contact_family' || final || c.familyRespondedAt) return s
      return updateCase(s, c.id, { familyRespondedAt: s.now }, { by: 'staff', text: 'Gia đình đã phản hồi.' })
    case 'ops/verify':
      if (c.status !== 'await_dispatch' || c.verifiedBy) return s
      return updateCase(s, c.id, { verifiedBy: s.staff }, staff(`${s.staff} đã xác minh thông tin.`))
    case 'ops/assign':
      if (c.status !== 'await_dispatch' || !c.verifiedBy || !CP_SERVICES.includes(c.service)) return s
      return notify(updateCase(s, c.id, { status: 'in_progress', assignee: a.partner }, staff(`Phân công Care Partner ${a.partner}.`)),
        ['family'], `${c.title}: đã phân công Care Partner ${a.partner}. Chưa hoàn tất.`, 'request', 'staff', c.id)
    case 'ops/cpReport':
      if (c.status !== 'in_progress' || !c.assignee || c.cpReport || !a.text.trim()) return s
      return updateCase(s, c.id, { cpReport: { text: a.text.trim(), at: s.now } }, staff(`Care Partner ${c.assignee} báo cáo kết quả.`))
    case 'ops/confirmDone': {
      const ok = CP_SERVICES.includes(c.service)
        ? c.status === 'in_progress' && !!c.cpReport
        : c.service === 'contact_family' && c.status === 'await_dispatch' && !!c.verifiedBy && !!c.familyRespondedAt
      if (!ok) return s
      return notify(updateCase(s, c.id, { status: 'done', completedAt: s.now }, staff('Nhân viên điều phối xác nhận hoàn tất.')),
        ['family'], `${c.title}: nhân viên điều phối đã xác nhận hoàn tất.`, 'request', 'staff', c.id)
    }
    case 'ops/approveReminder': {
      if (c.service !== 'add_reminder' || c.status !== 'await_dispatch' || !c.verifiedBy || !/^\d{2}:\d{2}$/.test(a.time)) return s
      const reminder = { id: `r-${c.id}`, dueAt: at(s, a.time), title: c.fields.noi_dung || c.title, note: `Nhân viên duyệt từ yêu cầu ${c.id}`, kind: 'activity' as const }
      const out = { ...s, reminders: [...s.reminders, reminder] }
      return notify(updateCase(out, c.id, { status: 'done', completedAt: s.now }, staff(`Duyệt lịch nhắc lúc ${a.time}.`)),
        ['family'], `Đã thêm lịch nhắc "${reminder.title}" lúc ${a.time} (nhân viên duyệt).`, 'request', 'staff', c.id)
    }
    case 'ops/decline':
      if (final || !a.reason.trim()) return s
      return notify(updateCase(s, c.id, { status: 'refused', closedReason: a.reason.trim() }, staff(`Từ chối: ${a.reason.trim()}`)),
        ['family'], `${c.title}: CAREBOX không thể thực hiện (${a.reason.trim()}).`, 'request', 'staff', c.id)
    case 'ops/flag':
      if (final || c.status === 'intervention') return s
      return updateCase(s, c.id, { status: 'intervention' }, staff('Đánh dấu cần can thiệp.'))
    case 'ops/unflag':
      if (c.status !== 'intervention') return s
      return updateCase(s, c.id, { status: 'await_dispatch' }, staff('Bỏ đánh dấu cần can thiệp, chờ điều phối.'))
    default:
      return s
  }
}

function eventTransition(s: State, c: EventCase, a: CaseAction): State {
  switch (a.type) {
    case 'ops/takeEvent':
      if (c.status !== 'to_verify') return s
      return updateCase(s, c.id, { status: 'handling', handler: s.staff }, { by: 'staff', text: `${s.staff} tiếp nhận sự kiện.` })
    case 'ops/resolveEvent': {
      const note = a.note.trim()
      if (c.status !== 'handling' || !note) return s
      const out = s.emergency?.caseId === c.id ? { ...s, emergency: null } : s
      return notify(updateCase(out, c.id, { status: 'resolved', closingNote: note }, { by: 'staff', text: `Đóng sự kiện: ${note}` }),
        ['family'], `${c.title}: nhân viên đã xử lý. Ghi chú: ${note}`, 'other', 'staff', c.id)
    }
    case 'ops/convertEvent': {
      // an emergency closes only with a note saying who took over
      if (isFinal(c) || c.priority === 'emergency') return s
      let out = updateCase(s, c.id, { status: 'resolved', closingNote: `Chuyển thành yêu cầu ${SERVICE[a.service]}` }, { by: 'staff', text: `Chuyển thành yêu cầu ${SERVICE[a.service]}.` })
      let id: string
      ;[out, id] = nextCaseId(out, 'request')
      const r: RequestCase = {
        id, kind: 'request', service: a.service, title: SERVICE[a.service], detail: `Tạo từ sự kiện ${c.id}: ${c.title}`,
        source: 'staff', priority: c.priority === 'uncertain' ? 'normal' : c.priority,
        priorityReason: `Từ sự kiện ${c.id}`, createdAt: s.now, fields: {}, status: 'await_dispatch', unclear: ['Cần bổ sung chi tiết'],
        history: [{ at: s.now, by: 'staff', text: `Tạo từ sự kiện ${c.id}.` }],
      }
      return addCase(out, r)
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
  if (a.type === 'emergency/dismiss') return s.emergency ? { ...s, emergency: null } : s
  const c = s.cases.find((x) => x.id === a.id)
  if (!c) return s
  return c.kind === 'request' ? requestTransition(s, c, a) : eventTransition(s, c, a)
}

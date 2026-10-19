import { describe, expect, test } from 'vitest'
import { seedBare } from './testing'
import { reduce, type Action } from './reducer'
import { MIN, addCase, fmtTime } from './helpers'
import { effectivePriority, familyQueue, isAbandoned, nextOwner, ownerAtConfirm } from './cases'
import type { EventCase, RequestCase, ServiceType, State } from './types'

const s0 = () => seedBare(Date.UTC(2026, 9, 18, 5, 0)) // 12:00 Vietnam
const get = (s: State, id: string) => s.cases.find((c) => c.id === id)!
const req = (s: State, id: string) => get(s, id) as RequestCase
const run = (s: State, ...as: Action[]) => as.reduce(reduce, s)

function withRequest(
  service: ServiceType = 'medicine', status: RequestCase['status'] = 'await_family', owner: RequestCase['owner'] = 'staff', noiDung = 'Nhắc uống nước',
): State {
  const s = s0()
  const c: RequestCase = {
    id: 'CB-010', kind: 'request', service, title: 'Test', detail: '', source: 'elder', priority: 'normal',
    priorityReason: '', createdAt: s.now, history: [], unclear: [], owner, fields: { noi_dung: noiDung }, status,
  }
  return addCase(s, c)
}

describe('request workflow', () => {
  test('family cannot act on need_info / await_confirm', () => {
    for (const status of ['need_info', 'await_confirm'] as const) {
      const s = withRequest('contact_family', status, 'family')
      expect(reduce(s, { type: 'family/decline', id: 'CB-010', reason: 'Bận' })).toBe(s)
      expect(reduce(s, { type: 'family/contacted', id: 'CB-010' })).toBe(s)
    }
  })

  test('decline needs non-blank reason', () => {
    const s = withRequest('contact_family', 'await_family', 'family')
    expect(reduce(s, { type: 'family/decline', id: 'CB-010', reason: '  ' })).toBe(s)
    const declined = reduce(s, { type: 'family/decline', id: 'CB-010', reason: 'Hôm nay con đi công tác' })
    expect(req(declined, 'CB-010')).toMatchObject({ status: 'refused', closedReason: 'Hôm nay con đi công tác' })
  })

  test('approveReminder adds a daily reminder at HH:MM and completes add_reminder', () => {
    const s0r = withRequest('add_reminder', 'await_family', 'family')
    expect(reduce(s0r, { type: 'family/approveReminder', id: 'CB-010', time: 'abc' })).toBe(s0r)
    const s = reduce(s0r, { type: 'family/approveReminder', id: 'CB-010', time: '18:30' })
    expect(req(s, 'CB-010').status).toBe('done')
    const added = s.reminders.at(-1)!
    expect(added).toMatchObject({ id: 'r-CB-010', daily: true, title: 'Nhắc uống nước', kind: 'activity' })
    expect(fmtTime(added.dueAt)).toBe('18:30')
    expect(s.reminders).toHaveLength(s0r.reminders.length + 1)
  })

  test('contacted completes contact_family from await_family', () => {
    const s = reduce(withRequest('contact_family', 'await_family', 'family'), { type: 'family/contacted', id: 'CB-010' })
    expect(req(s, 'CB-010')).toMatchObject({ status: 'done', doneBy: 'Chị Minh' })
    const med = withRequest('medicine')
    expect(reduce(med, { type: 'family/contacted', id: 'CB-010' })).toBe(med)
  })

  test('cancel from need_info → refused, by elder', () => {
    const s = reduce(s0(), { type: 'request/cancel', id: 'CB-001' })
    expect(req(s, 'CB-001').status).toBe('refused')
    expect(req(s, 'CB-001').history.at(-1)!.by).toBe('elder')
  })

  test('cancel after assign logs Care Partner cancellation and notifies staff', () => {
    const start = run(withRequest('medicine', 'await_staff'),
      { type: 'staff/verify', id: 'CB-010', note: '' }, { type: 'staff/assign', id: 'CB-010', partner: 'Anh Tuấn' })
    const s = reduce(start, { type: 'request/cancel', id: 'CB-010' })
    const c = req(s, 'CB-010')
    expect(c.status).toBe('refused')
    expect(c.history.map((h) => h.text)).toContain('Đã báo hủy cho Care Partner Anh Tuấn.')
    const fresh = s.notifications.slice(start.notifications.length)
    expect(fresh.map((n) => n.to).sort()).toEqual(['family', 'staff'])
    expect(fresh.every((n) => n.caseId === 'CB-010')).toBe(true)
  })

  test('cancel without assignee logs no Care Partner line; family-owned notifies the daughter only', () => {
    const s = reduce(withRequest('medicine', 'await_staff'), { type: 'request/cancel', id: 'CB-010' })
    expect(req(s, 'CB-010').history.some((h) => h.text.includes('Care Partner'))).toBe(false)
    const fam = withRequest('contact_family', 'await_family', 'family')
    const out = reduce(fam, { type: 'request/cancel', id: 'CB-010' })
    expect(out.notifications.slice(fam.notifications.length).map((n) => n.to)).toEqual(['family'])
  })

  test('cancel on done is a no-op', () => {
    const s = s0()
    expect(reduce(s, { type: 'request/cancel', id: 'CB-002' })).toBe(s)
  })
})

describe('routing at confirm', () => {
  const say = (s: State, ...texts: string[]) => texts.reduce((acc, text) => reduce(acc, { type: 'chat/say', text }), s)
  const lastAi = (s: State) => s.chat.messages.filter((m) => m.from === 'ai').at(-1)!.text
  const notes = (s: State, to: 'family' | 'staff') => s.notifications.filter((n) => n.caseId === 'CB-003' && n.to === to)

  test('confirm routes groceries to staff and notifies both', () => {
    const s = say(s0(), 'Bác muốn đi chợ', 'Rau, trứng', 'Sáng mai', 'Đúng rồi')
    expect(req(s, 'CB-003')).toMatchObject({ status: 'await_staff', owner: 'staff', confirmedAt: s.now })
    expect(notes(s, 'staff').map((n) => n.text)).toEqual(['Đi chợ: chờ điều phối'])
    expect(notes(s, 'family').map((n) => n.text)).toEqual(['Đi chợ: đã chuyển nhân viên CAREBOX điều phối.'])
    expect(lastAi(s)).toBe('Cháu đã gửi yêu cầu cho nhân viên CAREBOX điều phối. Yêu cầu chưa hoàn tất; bác xem tiến độ ở mục Yêu cầu ạ.')
  })

  test('confirm keeps contact_family with family', () => {
    const s = say(s0(), 'Gọi cho con gái giúp bác', 'Con gái', 'Nhớ gọi cho mẹ', 'Đúng rồi')
    expect(req(s, 'CB-003')).toMatchObject({ status: 'await_family', owner: 'family', confirmedAt: s.now })
    expect(notes(s, 'staff')).toHaveLength(0)
    expect(notes(s, 'family').map((n) => n.text)).toEqual(['Liên hệ người thân: chờ Chị Minh nhận việc'])
  })

  test('confirm sends a medicine reminder to staff, a plain reminder to the daughter', () => {
    const med = say(s0(), 'Nhắc bác uống thuốc', 'Uống thuốc huyết áp', '9 giờ', 'Đúng rồi')
    expect(req(med, 'CB-003')).toMatchObject({ status: 'await_staff', owner: 'staff' })
    expect(lastAi(med)).toBe('Cháu đã gửi nhân viên CAREBOX kiểm tra lịch nhắc thuốc. Lịch chỉ được thêm sau khi được duyệt, yêu cầu chưa hoàn tất ạ.')
    const water = say(s0(), 'Nhắc bác uống nước', 'Uống nước', '9 giờ', 'Đúng rồi')
    expect(req(water, 'CB-003')).toMatchObject({ status: 'await_family', owner: 'family' })
    expect(lastAi(water)).toContain('Chị Minh duyệt lịch nhắc')
  })
})

describe('staff request workflow', () => {
  const verify: Action = { type: 'staff/verify', id: 'CB-010', note: '  Đã gọi xác nhận với bác  ' }
  const assign: Action = { type: 'staff/assign', id: 'CB-010', partner: 'Anh Tuấn' }
  const report: Action = { type: 'staff/partnerReport', id: 'CB-010', note: 'Đã mua thuốc' }
  const complete: Action = { type: 'staff/complete', id: 'CB-010' }

  test('full staff path', () => {
    const start = withRequest('medicine', 'await_staff')
    const s = run(start, verify, assign, report, complete)
    const c = req(s, 'CB-010')
    expect(c).toMatchObject({
      status: 'done', doneBy: 'Anh Nam', assignee: 'Anh Tuấn', verifiedBy: 'Anh Nam', verifyNote: 'Đã gọi xác nhận với bác',
      partnerReport: 'Đã mua thuốc', completedAt: s.now,
    })
    expect(c.partnerReportAt!).toBeLessThanOrEqual(c.completedAt!)
    expect(c.history.slice(-4).map((h) => h.by)).toEqual(['staff', 'staff', 'staff', 'staff'])
    const fresh = s.notifications.slice(start.notifications.length)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]).toMatchObject({ to: 'family', caseId: 'CB-010' })
  })

  test('verify only once, and only from await_staff', () => {
    const v = reduce(withRequest('medicine', 'await_staff'), verify)
    expect(reduce(v, verify)).toBe(v)
    const early = withRequest('medicine', 'await_confirm')
    expect(reduce(early, verify)).toBe(early)
  })

  test('assign requires verify, a known partner and a service job', () => {
    const s = withRequest('medicine', 'await_staff')
    expect(reduce(s, assign)).toBe(s)
    const v = reduce(s, verify)
    expect(reduce(v, { type: 'staff/assign', id: 'CB-010', partner: 'Ai đó' })).toBe(v)
    const rem = run(withRequest('add_reminder', 'await_staff'), verify)
    expect(reduce(rem, assign)).toBe(rem)
    expect(req(reduce(v, assign), 'CB-010')).toMatchObject({ status: 'in_progress', assignee: 'Anh Tuấn', acceptedAt: v.now })
  })

  test('partner report needs an assignee and a note, once', () => {
    const v = run(withRequest('medicine', 'await_staff'), verify)
    expect(reduce(v, report)).toBe(v)
    const a = reduce(v, assign)
    expect(reduce(a, { type: 'staff/partnerReport', id: 'CB-010', note: '  ' })).toBe(a)
    const r = reduce(a, report)
    expect(reduce(r, { type: 'staff/partnerReport', id: 'CB-010', note: 'Lần hai' })).toBe(r)
  })

  test('complete requires a partner report', () => {
    const a = run(withRequest('medicine', 'await_staff'), verify, assign)
    expect(reduce(a, complete)).toBe(a)
  })

  test('staff/decline needs reason; works from need_info', () => {
    const s = withRequest('medicine', 'need_info')
    expect(reduce(s, { type: 'staff/decline', id: 'CB-010', reason: ' ' })).toBe(s)
    const out = reduce(s, { type: 'staff/decline', id: 'CB-010', reason: 'Ngoài khu vực phục vụ' })
    expect(req(out, 'CB-010')).toMatchObject({ status: 'refused', closedReason: 'Ngoài khu vực phục vụ' })
    expect(out.notifications.at(-1)).toMatchObject({ to: 'family', caseId: 'CB-010' })
    const fam = withRequest('contact_family', 'await_staff', 'family')
    expect(reduce(fam, { type: 'staff/decline', id: 'CB-010', reason: 'x' })).toBe(fam)
  })

  test('staff/decline from await_staff and in_progress; not from done', () => {
    const decline: Action = { type: 'staff/decline', id: 'CB-010', reason: 'Đối tác không nhận được việc' }
    const waiting = reduce(withRequest('medicine', 'await_staff'), decline)
    expect(req(waiting, 'CB-010')).toMatchObject({ status: 'refused', closedReason: 'Đối tác không nhận được việc' })
    const start = run(withRequest('medicine', 'await_staff'), verify, assign)
    expect(req(start, 'CB-010').status).toBe('in_progress')
    const out = reduce(start, decline)
    expect(req(out, 'CB-010')).toMatchObject({ status: 'refused', closedReason: 'Đối tác không nhận được việc' })
    expect(out.notifications.at(-1)).toMatchObject({ to: 'family', caseId: 'CB-010' })
    const finished = run(start, report, complete)
    expect(reduce(finished, decline)).toBe(finished)
  })

  test('medicine reminder: staff approves with kind medicine', () => {
    const s = withRequest('add_reminder', 'await_staff', 'staff', 'Uống thuốc huyết áp')
    expect(reduce(s, { type: 'staff/approveReminder', id: 'CB-010', time: 'abc' })).toBe(s)
    const out = reduce(s, { type: 'staff/approveReminder', id: 'CB-010', time: '09:00' })
    expect(req(out, 'CB-010').status).toBe('done')
    expect(out.reminders.at(-1)).toMatchObject({ id: 'r-CB-010', kind: 'medicine', daily: true })
  })

  test('staff/contacted completes contact_family from await_staff', () => {
    const s = withRequest('contact_family', 'await_staff')
    expect(req(reduce(s, { type: 'staff/contacted', id: 'CB-010' }), 'CB-010')).toMatchObject({ status: 'done', doneBy: 'Anh Nam' })
    const med = withRequest('medicine', 'await_staff')
    expect(reduce(med, { type: 'staff/contacted', id: 'CB-010' })).toBe(med)
  })

  test('family cannot approve a medicine reminder', () => {
    for (const status of ['await_family', 'await_staff'] as const) {
      const s = withRequest('add_reminder', status, 'staff', 'Uống thuốc huyết áp')
      expect(reduce(s, { type: 'family/approveReminder', id: 'CB-010', time: '09:00' })).toBe(s)
    }
  })

  test('family can still act after fallback', () => {
    const s = withRequest('contact_family', 'await_staff', 'staff')
    expect(req(reduce(s, { type: 'family/contacted', id: 'CB-010' }), 'CB-010').status).toBe('done')
  })

  test('staff complete after elder cancel is a no-op', () => {
    const s = run(withRequest('medicine', 'await_staff'), verify, assign, report, { type: 'request/cancel', id: 'CB-010' })
    expect(req(s, 'CB-010').status).toBe('refused')
    expect(reduce(s, complete)).toBe(s)
  })

  test('ownerAtConfirm', () => {
    const c = (service: ServiceType, noiDung = '') => req(withRequest(service, 'await_confirm', 'staff', noiDung), 'CB-010')
    expect(ownerAtConfirm(c('contact_family'))).toBe('family')
    expect(ownerAtConfirm(c('add_reminder', 'Nhắc uống nước'))).toBe('family')
    expect(ownerAtConfirm(c('add_reminder', 'nhắc uống 2 viên'))).toBe('staff')
    expect(ownerAtConfirm(c('groceries'))).toBe('staff')
    expect(ownerAtConfirm(c('add_reminder', 'Nhắc bác tiêm insulin'))).toBe('staff')
    expect(ownerAtConfirm(c('add_reminder', 'Nhắc bác đi bệnh viện tái khám'))).toBe('family')
  })
})

describe('event workflow', () => {
  const withEvent = () => run(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })

  test('takeEvent sets handler = family name; resolveEvent needs note and clears s.emergency for that case', () => {
    const taken = reduce(withEvent(), { type: 'family/takeEvent', id: 'EVT-001' })
    expect(get(taken, 'EVT-001')).toMatchObject({ status: 'handling', handler: 'Chị Minh' })
    expect(get(taken, 'EVT-001').history.at(-1)!.by).toBe('family')
    expect(reduce(taken, { type: 'family/resolveEvent', id: 'EVT-001', note: '  ' })).toBe(taken)
    const done = reduce(taken, { type: 'family/resolveEvent', id: 'EVT-001', note: 'Đã gọi mẹ, đo lại theo ngưỡng.' })
    expect(get(done, 'EVT-001')).toMatchObject({ status: 'resolved', closingNote: 'Đã gọi mẹ, đo lại theo ngưỡng.' })

    const em = run(s0(), { type: 'device/fall' }, { type: 'family/takeEvent', id: 'EVT-001' })
    expect(em.emergency).not.toBeNull()
    expect(reduce(em, { type: 'family/resolveEvent', id: 'EVT-001', note: 'Đã gọi 115, xe cấp cứu đã đến' }).emergency).toBeNull()
  })

  test('resolveEvent from to_verify is a no-op', () => {
    const s = withEvent()
    expect(reduce(s, { type: 'family/resolveEvent', id: 'EVT-001', note: 'x' })).toBe(s)
  })
})

describe('emergency', () => {
  test('raiseEmergency sets state.emergency, creates an unacknowledged emergency event and notifies once, naming the daughter', () => {
    const s = s0()
    const out = reduce(s, { type: 'device/fall' })
    const ev = get(out, 'EVT-001') as EventCase
    expect(out.emergency).toEqual({ caseId: 'EVT-001', calling: false })
    expect(ev).toMatchObject({ priority: 'emergency', status: 'to_verify' })
    expect(ev.handler).toBeUndefined()
    expect(ev.history[0].text).toContain('Thông báo tự động chưa có nghĩa là đã có người tiếp nhận')
    const fresh = out.notifications.slice(s.notifications.length)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].text).toContain('Chị Minh')
  })

  test('device/fall raises an emergency', () => {
    const out = reduce(s0(), { type: 'device/fall' })
    expect(get(out, 'EVT-001').title).toBe('Thiết bị báo té ngã')
    expect(out.devices.find((d) => d.id === 'fall')!.readings.at(-1)!.value).toBe('fall')
  })

  test('call115 sets calling once', () => {
    const e = reduce(s0(), { type: 'device/fall' })
    const calling = reduce(e, { type: 'emergency/call115' })
    expect(calling.emergency!.calling).toBe(true)
    expect(reduce(calling, { type: 'emergency/call115' })).toBe(calling)
  })
})

describe('derived', () => {
  test('abandoned: unaccepted request older than 30 min in need_info/await_confirm/await_family → priority "Bỏ ngỏ…"', () => {
    for (const status of ['need_info', 'await_confirm', 'await_family', 'await_staff'] as const) {
      const s = withRequest('medicine', status)
      const c = get(s, 'CB-010')
      expect(effectivePriority(c, s.now + 29 * MIN).priority).toBe('normal')
      const p = effectivePriority(c, s.now + 31 * MIN)
      expect(p.priority).toBe('priority')
      expect(p.reason).toMatch(/^Bỏ ngỏ/)
      expect(p.reason).toBe('Bỏ ngỏ quá 30 phút')
    }
    const accepted = withRequest('medicine', 'in_progress')
    expect(effectivePriority(get(accepted, 'CB-010'), accepted.now + 31 * MIN).priority).toBe('normal')
  })

  test('nextOwner table', () => {
    const own = (service: ServiceType, status: RequestCase['status'], patch: Partial<RequestCase> = {}, noiDung?: string) => {
      const s = withRequest(service, status, 'staff', noiDung)
      return nextOwner({ ...req(s, 'CB-010'), ...patch }, s)
    }
    expect(own('medicine', 'need_info')).toBe('Người cao tuổi (bổ sung thông tin)')
    expect(own('medicine', 'await_confirm')).toBe('Người cao tuổi (xác nhận)')
    expect(own('contact_family', 'await_family', { owner: 'family' })).toBe('Chị Minh (nhận việc)')
    expect(own('contact_family', 'await_staff')).toBe('Nhân viên CAREBOX hoặc Chị Minh')
    expect(own('add_reminder', 'await_staff')).toBe('Nhân viên CAREBOX hoặc Chị Minh') // water reminder that fell back
    expect(own('add_reminder', 'await_staff', {}, 'Uống thuốc huyết áp')).toBe('Nhân viên CAREBOX (duyệt / liên hệ)')
    expect(own('medicine', 'await_staff')).toBe('Nhân viên CAREBOX (xác minh)')
    expect(own('medicine', 'await_staff', { verifiedBy: 'Anh Nam' })).toBe('Nhân viên CAREBOX (phân công)')
    expect(own('medicine', 'in_progress', { assignee: 'Anh Tuấn' })).toBe('Anh Tuấn (đang thực hiện)')
    expect(own('medicine', 'in_progress', { assignee: 'Anh Tuấn', partnerReport: 'Đã mua' })).toBe('Nhân viên CAREBOX (xác nhận kết quả)')
    expect(own('medicine', 'done')).toBe('—')
    const e = run(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    expect(nextOwner(get(e, 'EVT-001'), e)).toBe('Chị Minh (xem và tiếp nhận)')
    const taken = reduce(e, { type: 'family/takeEvent', id: 'EVT-001' })
    expect(nextOwner(get(taken, 'EVT-001'), taken)).toBe('Chị Minh')
    expect(nextOwner(get(s0(), 'CB-002'), s0())).toBe('—')
  })
})

describe('familyQueue: the daughter\'s "Yêu cầu của mẹ" list', () => {
  const ev = (id: string, priority: EventCase['priority'], createdAt: number, status: EventCase['status'] = 'to_verify'): EventCase => ({
    id, kind: 'event', title: id, detail: '', source: 'device', priority, priorityReason: '', createdAt, history: [], unclear: [], owner: 'staff', status,
  })
  const rq = (id: string, createdAt: number, status: RequestCase['status']): RequestCase => ({
    id, kind: 'request', service: 'medicine', title: id, detail: '', source: 'elder', priority: 'normal', priorityReason: '',
    createdAt, history: [], unclear: [], owner: 'family', fields: {}, status,
  })

  test('open alerts sort by priority (emergency > priority > uncertain > normal), then oldest first; closed ones are left out', () => {
    const t = Date.UTC(2026, 9, 18, 5, 0)
    const s = { ...s0(), now: t, cases: [
      ev('E-normal', 'normal', t - 50 * MIN), ev('E-unsure', 'uncertain', t - 40 * MIN), ev('E-prio-new', 'priority', t - 5 * MIN),
      ev('E-sos', 'emergency', t - 1 * MIN), ev('E-prio-old', 'priority', t - 20 * MIN), ev('E-done', 'emergency', t, 'resolved'),
    ] }
    expect(familyQueue(s).alerts.map((c) => c.id)).toEqual(['E-sos', 'E-prio-old', 'E-prio-new', 'E-unsure', 'E-normal'])
  })

  test('open requests: abandoned (Bỏ ngỏ) first, then oldest first; every open status is listed, final ones are not', () => {
    const t = Date.UTC(2026, 9, 18, 5, 0)
    const s = { ...s0(), now: t, cases: [
      rq('R-progress-old', t - 90 * MIN, 'in_progress'), rq('R-confirm', t - 10 * MIN, 'await_confirm'),
      rq('R-abandoned', t - 40 * MIN, 'need_info'), rq('R-family', t - 20 * MIN, 'await_family'), rq('R-done', t - 99 * MIN, 'done'),
    ] }
    expect(familyQueue(s).requests.map((c) => c.id)).toEqual(['R-abandoned', 'R-progress-old', 'R-family', 'R-confirm'])
    expect(isAbandoned(s.cases[2], t)).toBe(true)
    expect(isAbandoned(s.cases[0], t)).toBe(false) // accepted work is never "Bỏ ngỏ"
  })
})

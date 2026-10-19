import { describe, expect, test } from 'vitest'
import { seedBare } from './testing'
import { seed } from './seed'
import { reduce, type Action } from './reducer'
import { MIN, addCase, fmtTime } from './helpers'
import { can, effectivePriority, familyTodo, familyView, isAbandoned, nextOwner, ownerAtConfirm, staffBoard } from './cases'
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

  const confirmed = (s: State): State => ({ ...s, cases: s.cases.map((c) => (c.id === 'CB-010' ? { ...c, confirmedAt: s.now } : c)) })
  const staffNotes = (s: State, from: number) => s.notifications.slice(from).filter((n) => n.to === 'staff' && n.caseId === 'CB-010')

  test('cancel after assign logs Care Partner cancellation and notifies staff', () => {
    const start = run(confirmed(withRequest('medicine', 'await_staff')),
      { type: 'staff/verify', id: 'CB-010', note: '' }, { type: 'staff/assign', id: 'CB-010', partner: 'Anh Tuấn' })
    const s = reduce(start, { type: 'request/cancel', id: 'CB-010' })
    const c = req(s, 'CB-010')
    expect(c.status).toBe('refused')
    expect(c.history.map((h) => h.text)).toContain('Đã báo hủy cho Care Partner Anh Tuấn.')
    const fresh = s.notifications.slice(start.notifications.length)
    expect(fresh.map((n) => n.to).sort()).toEqual(['family', 'staff'])
    expect(fresh.every((n) => n.caseId === 'CB-010')).toBe(true)
    expect(fresh.find((n) => n.to === 'staff')!.text).toBe('Test: bác đã hủy yêu cầu.')
  })

  test('cancel of an unassigned confirmed request notifies staff once, with no Care Partner line', () => {
    const start = confirmed(withRequest('medicine', 'await_staff'))
    const s = reduce(start, { type: 'request/cancel', id: 'CB-010' })
    expect(req(s, 'CB-010').history.some((h) => h.text.includes('Care Partner'))).toBe(false)
    expect(staffNotes(s, start.notifications.length)).toHaveLength(1)
  })

  test('refusing a staff-owned request staff never received does not notify staff', () => {
    for (const status of ['need_info', 'await_confirm'] as const) {
      const start = withRequest('medicine', status)
      const s = reduce(start, { type: 'request/cancel', id: 'CB-010' })
      expect(req(s, 'CB-010').status).toBe('refused')
      expect(staffNotes(s, start.notifications.length)).toHaveLength(0)
    }
  })

  test('family-owned cancel notifies the daughter only', () => {
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
    const med = say(s0(), 'Nhắc bác uống thuốc', '9 giờ', 'Đúng rồi')
    expect(req(med, 'CB-003')).toMatchObject({ status: 'await_staff', owner: 'staff' })
    expect(lastAi(med)).toBe('Cháu đã gửi nhân viên CAREBOX kiểm tra lịch nhắc thuốc. Lịch chỉ được thêm sau khi được duyệt, yêu cầu chưa hoàn tất ạ.')
    const water = say(s0(), 'Nhắc bác uống nước', '9 giờ', 'Đúng rồi')
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
    // staff records the Care Partner's words; the entry must not read as the Care Partner's own verified claim
    expect(c.history.at(-2)!.text).toBe('Anh Nam ghi nhận báo cáo của Care Partner Anh Tuấn: Đã mua thuốc')
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

  test.each(['Nhắc bác đi bộ ở công viên lúc 5h', 'Nhắc bác gặp nhân viên phường', 'Nhắc bác ghé tiệm tạp hóa', 'Nhắc bác họp với thành viên câu lạc bộ'])(
    'ownerAtConfirm: "%s" is not a medicine reminder', (text) => {
      const c = req(withRequest('add_reminder', 'await_confirm', 'staff', text), 'CB-010')
      expect(ownerAtConfirm(c)).toBe('family')
    })
  test('ownerAtConfirm: "tiêm" with diacritics stays a medicine reminder', () => {
    expect(ownerAtConfirm(req(withRequest('add_reminder', 'await_confirm', 'staff', 'Nhắc bác đi tiêm lúc 9h'), 'CB-010'))).toBe('staff')
  })
})

describe('event workflow', () => {
  const withEvent = () => run(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })

  test('staff takeEvent sets handler = staff name; only staff resolve, with a note, and that clears s.emergency for that case', () => {
    const taken = reduce(withEvent(), { type: 'staff/takeEvent', id: 'EVT-001' })
    expect(get(taken, 'EVT-001')).toMatchObject({ status: 'handling', handler: 'Anh Nam', owner: 'staff' })
    expect(get(taken, 'EVT-001').history.at(-1)!.by).toBe('staff')
    expect(reduce(taken, { type: 'staff/resolveEvent', id: 'EVT-001', note: '  ' })).toBe(taken)
    const done = reduce(taken, { type: 'staff/resolveEvent', id: 'EVT-001', note: 'Đã gọi bác, đo lại theo ngưỡng.' })
    expect(get(done, 'EVT-001')).toMatchObject({ status: 'resolved', closingNote: 'Đã gọi bác, đo lại theo ngưỡng.' })
    expect(get(done, 'EVT-001').history.at(-1)!.by).toBe('staff')

    const em = run(s0(), { type: 'device/fall' }, { type: 'staff/takeEvent', id: 'EVT-001' })
    expect(em.emergency).not.toBeNull()
    expect(reduce(em, { type: 'staff/resolveEvent', id: 'EVT-001', note: 'Đã gọi 115, xe cấp cứu đã đến' }).emergency).toBeNull()
  })

  test('family can no longer take or resolve an event', () => {
    const s = withEvent()
    for (const type of ['family/takeEvent', 'family/resolveEvent'])
      expect(reduce(s, { type, id: 'EVT-001', note: 'x' } as unknown as Action)).toBe(s)
  })

  test('staff takeEvent only from to_verify, resolveEvent only from handling', () => {
    const s = withEvent()
    expect(reduce(s, { type: 'staff/resolveEvent', id: 'EVT-001', note: 'x' })).toBe(s)
    const taken = reduce(s, { type: 'staff/takeEvent', id: 'EVT-001' })
    expect(reduce(taken, { type: 'staff/takeEvent', id: 'EVT-001' })).toBe(taken)
  })

  test('case/ack by family sets handler Chị Minh; by staff sets Anh Nam; only for emergencies', () => {
    const em = () => reduce(s0(), { type: 'device/fall' })
    const byFamily = reduce(em(), { type: 'case/ack', id: 'EVT-001', by: 'family' })
    expect(get(byFamily, 'EVT-001')).toMatchObject({ status: 'handling', handler: 'Chị Minh' })
    expect(get(byFamily, 'EVT-001').history.at(-1)!.by).toBe('family')
    const byStaff = reduce(em(), { type: 'case/ack', id: 'EVT-001', by: 'staff' })
    expect(get(byStaff, 'EVT-001')).toMatchObject({ status: 'handling', handler: 'Anh Nam' })
    expect(get(byStaff, 'EVT-001').history.at(-1)!.by).toBe('staff')
    // already taken: a second ack changes nothing
    expect(reduce(byFamily, { type: 'case/ack', id: 'EVT-001', by: 'staff' })).toBe(byFamily)
    // a priority (non-emergency) event is not acked this way
    const prio = withEvent()
    expect(reduce(prio, { type: 'case/ack', id: 'EVT-001', by: 'family' })).toBe(prio)
    expect(reduce(prio, { type: 'case/ack', id: 'EVT-001', by: 'staff' })).toBe(prio)
  })

  test('push high → staff-owned to_verify, staff and family notified, family text says staff were told', () => {
    const before = s0()
    const out = reduce(before, { type: 'device/push', deviceId: 'bp', mode: 'high' })
    expect(get(out, 'EVT-001')).toMatchObject({ owner: 'staff', status: 'to_verify' })
    const fresh = out.notifications.slice(before.notifications.length)
    expect(fresh.map((n) => n.to).sort()).toEqual(['family', 'staff'])
    expect(fresh.every((n) => n.caseId === 'EVT-001')).toBe(true)
    const fam = fresh.find((n) => n.to === 'family')!
    expect(fam.text).toContain('Đã chuyển nhân viên CAREBOX kiểm tra')
    expect(fam.text).not.toContain('Cần gia đình')
    expect(fresh.find((n) => n.to === 'staff')!.text).not.toContain('Đã chuyển nhân viên CAREBOX kiểm tra')
  })

  test('cant_do on a medicine reminder → staff-owned priority event, both audiences told', () => {
    const before = s0()
    const r = before.reminders.find((x) => x.kind === 'medicine' && !x.response)!
    const out = reduce(before, { type: 'reminder/respond', id: r.id, response: 'cant_do' })
    expect(get(out, 'EVT-001')).toMatchObject({ owner: 'staff', priority: 'priority', status: 'to_verify', reminderId: r.id })
    const fresh = out.notifications.slice(before.notifications.length)
    expect(fresh.map((n) => n.to).sort()).toEqual(['family', 'staff'])
    expect(fresh.find((n) => n.to === 'family')!.text).toContain('Đã chuyển nhân viên CAREBOX kiểm tra')
  })
})

describe('emergency', () => {
  test('raiseEmergency sets state.emergency and notifies family and staff, unacknowledged', () => {
    const s = s0()
    const out = reduce(s, { type: 'device/fall' })
    const ev = get(out, 'EVT-001') as EventCase
    expect(out.emergency).toEqual({ caseId: 'EVT-001', calling: false })
    expect(ev).toMatchObject({ priority: 'emergency', status: 'to_verify', owner: 'staff' })
    expect(ev.handler).toBeUndefined()
    expect(ev.history[0].text).toBe('Hướng dẫn gọi 115; đã thông báo Chị Minh và nhân viên CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.')
    const fresh = out.notifications.slice(s.notifications.length)
    expect(fresh.map((n) => n.to).sort()).toEqual(['family', 'staff'])
    for (const n of fresh) {
      expect(n.caseId).toBe('EVT-001')
      expect(n.text.endsWith('Cần xác nhận đã tiếp nhận tình huống.')).toBe(true)
    }
  })

  test('elder saying chest pain notifies family and staff; case stays to_verify', () => {
    const s = s0()
    const out = reduce(s, { type: 'chat/say', text: 'Tôi bị đau ngực quá' })
    expect(get(out, 'EVT-001')).toMatchObject({ priority: 'emergency', status: 'to_verify' })
    const fresh = out.notifications.filter((n) => n.caseId === 'EVT-001')
    expect(fresh.map((n) => n.to).sort()).toEqual(['family', 'staff'])
    expect(get(out, 'EVT-001').history[0].text).toContain('Chị Minh và nhân viên CAREBOX')
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

  test('callFamily sets callingFamily once and logs the call', () => {
    const e = reduce(s0(), { type: 'device/fall' })
    const calling = reduce(e, { type: 'emergency/callFamily' })
    expect(calling.emergency!.callingFamily).toBe(true)
    expect(get(calling, 'EVT-001').history.at(-1)!.text).toBe('Mô phỏng: đang gọi Chị Minh.')
    expect(reduce(calling, { type: 'emergency/callFamily' })).toBe(calling)
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
    expect(nextOwner(get(e, 'EVT-001'), e)).toBe('Nhân viên CAREBOX (xem và tiếp nhận)')
    const taken = reduce(e, { type: 'staff/takeEvent', id: 'EVT-001' })
    expect(nextOwner(get(taken, 'EVT-001'), taken)).toBe('Anh Nam')
    expect(nextOwner(get(s0(), 'CB-002'), s0())).toBe('—')
  })
})

describe('familyView: the daughter\'s "Yêu cầu của mẹ" list', () => {
  const ev = (id: string, priority: EventCase['priority'], createdAt: number, status: EventCase['status'] = 'to_verify'): EventCase => ({
    id, kind: 'event', title: id, detail: '', source: 'device', priority, priorityReason: '', createdAt, history: [], unclear: [], owner: 'staff', status,
  })
  const rq = (id: string, createdAt: number, status: RequestCase['status'], extra: Partial<RequestCase> = {}): RequestCase => ({
    id, kind: 'request', service: 'medicine', title: id, detail: '', source: 'elder', priority: 'normal', priorityReason: '',
    createdAt, history: [], unclear: [], owner: 'family', fields: {}, status, ...extra,
  })
  const t = Date.UTC(2026, 9, 18, 5, 0)
  const withCases = (...cases: (EventCase | RequestCase)[]): State => ({ ...s0(), now: t, cases })
  const ids = (cs: { id: string }[]) => cs.map((c) => c.id)

  test('open alerts sort by priority (emergency > priority > uncertain > normal), then oldest first; closed ones are left out', () => {
    const s = withCases(
      ev('E-normal', 'normal', t - 50 * MIN), ev('E-unsure', 'uncertain', t - 40 * MIN), ev('E-prio-new', 'priority', t - 5 * MIN),
      ev('E-sos', 'emergency', t - 1 * MIN), ev('E-prio-old', 'priority', t - 20 * MIN), ev('E-done', 'emergency', t, 'resolved'),
    )
    expect(ids(familyView(s).others)).toEqual(['E-sos', 'E-prio-old', 'E-prio-new', 'E-unsure', 'E-normal'])
  })

  test('open requests: abandoned (Bỏ ngỏ) first, then oldest first; every open status is listed, final ones are not', () => {
    const s = withCases(
      rq('R-progress-old', t - 90 * MIN, 'in_progress'), rq('R-confirm', t - 10 * MIN, 'await_confirm'),
      rq('R-abandoned', t - 40 * MIN, 'need_info'), rq('R-family', t - 20 * MIN, 'await_family'), rq('R-done', t - 99 * MIN, 'done'),
    )
    expect(ids(familyView(s).others)).toEqual(['R-abandoned', 'R-progress-old', 'R-family', 'R-confirm'])
    expect(isAbandoned(s.cases[2], t)).toBe(true)
    expect(isAbandoned(s.cases[0], t)).toBe(false) // accepted work is never "Bỏ ngỏ"
  })

  const ask = { question: 'Chị giúp hỏi bác?', askedAt: t }
  const family = (id: string, createdAt: number, status: RequestCase['status'], extra: Partial<RequestCase> = {}) =>
    rq(id, createdAt, status, { service: 'contact_family', ...extra })
  const board = () => withCases(
    ev('E-ask', 'priority', t - 5 * MIN, 'handling'), { ...ev('E-sos', 'emergency', t - 1 * MIN), familyAsk: { ...ask } },
    family('R-mine-new', t - 10 * MIN, 'await_family'), family('R-mine-old', t - 20 * MIN, 'await_staff'),
    family('R-ask-and-mine', t - 15 * MIN, 'await_staff', { owner: 'staff', familyAsk: { ...ask } }),
    family('R-answered', t - 25 * MIN, 'await_staff', { owner: 'staff', familyAsk: { ...ask, reply: 'Rồi', repliedAt: t } }),
    family('R-confirm', t - 30 * MIN, 'await_confirm'), rq('R-medicine', t - 35 * MIN, 'await_staff', { owner: 'staff' }),
    family('R-done', t - 40 * MIN, 'done', { owner: 'staff', familyAsk: { ...ask } }),
  )

  test('familyView splits asks / mine / others', () => {
    const v = familyView(board())
    expect(ids(v.asks)).toEqual(['E-sos', 'R-ask-and-mine']) // alerts first; a case is listed once, asks win over mine
    expect(ids(v.mine)).toEqual(['R-answered', 'R-mine-old', 'R-mine-new']) // only what the elder confirmed for the daughter, or staff left to her; an answered ask returns here
    expect(ids(v.others)).toEqual(['E-ask', 'R-medicine', 'R-confirm']) // staff work and unconfirmed requests; closed cases are left out
  })

  test('familyTodo counts asks, mine and unacked emergencies', () => {
    expect(familyTodo(board())).toBe(2 + 3 + 1)
    // acknowledging the emergency drops it from the emergency count; its open ask stays
    expect(familyTodo(run(board(), { type: 'case/ack', id: 'E-sos', by: 'family' }))).toBe(2 + 3)
    expect(familyTodo(withCases())).toBe(0)
  })
})

describe('staff asks the family for help', () => {
  const real = () => seed(Date.UTC(2026, 9, 18, 5, 0)) // CB-001 is the seeded staff-owned need_info request
  const ask = (s: State, question = 'Chị giúp hỏi bác giờ lấy thuốc?', id = 'CB-001') => reduce(s, { type: 'staff/askFamily', id, question })
  const reply = (s: State, text = 'Chiều nay em hỏi bác.', id = 'CB-001') => reduce(s, { type: 'family/reply', id, text })
  const last = (s: State, to: 'family' | 'staff') => s.notifications.filter((n) => n.to === to).at(-1)

  test('ask then reply round-trip', () => {
    const asked = ask(real())
    expect(get(asked, 'CB-001').familyAsk).toEqual({ question: 'Chị giúp hỏi bác giờ lấy thuốc?', askedAt: asked.now })
    expect(last(asked, 'family')).toMatchObject({ text: 'CAREBOX nhờ hỗ trợ (CB-001): Chị giúp hỏi bác giờ lấy thuốc?', caseId: 'CB-001', read: false })
    expect(get(asked, 'CB-001').history.at(-1)?.by).toBe('staff')
    expect(familyView(asked).asks.map((c) => c.id)).toEqual(['CB-001'])

    const answered = reply({ ...asked, now: asked.now + 5 * MIN })
    expect(get(answered, 'CB-001').familyAsk).toMatchObject({ reply: 'Chiều nay em hỏi bác.', repliedAt: asked.now + 5 * MIN })
    expect(last(answered, 'staff')?.text).toContain('Chiều nay em hỏi bác.')
    expect(last(answered, 'staff')?.caseId).toBe('CB-001')
    expect(get(answered, 'CB-001').history.at(-1)).toMatchObject({ by: 'family' })
    expect(familyView(answered).asks).toEqual([])
  })

  test('second ask blocked until replied; allowed after', () => {
    const asked = ask(real())
    expect(ask(asked, 'Câu hỏi khác')).toBe(asked)
    const answered = reply(asked)
    expect(reply(answered, 'Trả lời lần nữa')).toBe(answered) // nothing left to answer
    const again = ask(answered, 'Câu hỏi khác')
    expect(get(again, 'CB-001').familyAsk).toMatchObject({ question: 'Câu hỏi khác' })
    expect(get(again, 'CB-001').familyAsk?.reply).toBeUndefined()
    expect(get(again, 'CB-001').history.filter((h) => h.by === 'staff' && h.text.includes('Chị giúp hỏi bác')).length).toBe(1) // the old ask stays in history
  })

  test('blank question or reply, unknown id, family-owned case: no-op', () => {
    const s = real()
    expect(ask(s, '   ')).toBe(s)
    expect(ask(s, 'x', 'NOPE')).toBe(s)
    const fam = withRequest('contact_family', 'await_family', 'family')
    expect(ask(fam, 'x', 'CB-010')).toBe(fam)
    const asked = ask(s)
    expect(reply(asked, '  ')).toBe(asked)
    expect(reply(s)).toBe(s) // no ask to answer
  })

  test('reply on a resolved case is a no-op', () => {
    const asked = ask(real())
    const closed = { ...asked, cases: asked.cases.map((c) => (c.id === 'CB-001' ? { ...req(asked, 'CB-001'), status: 'refused' as const } : c)) }
    expect(reply(closed)).toBe(closed)
    expect(ask(closed, 'Hỏi tiếp')).toBe(closed) // nor can staff open a new ask on a closed case
    expect(familyView(closed).asks).toEqual([])
  })
})

describe('staffBoard', () => {
  const real = () => seed(Date.UTC(2026, 9, 18, 5, 0))
  const awaitStaff = (id: string, createdAt: number, owner: RequestCase['owner'] = 'staff', priority: RequestCase['priority'] = 'normal'): RequestCase => ({
    id, kind: 'request', service: 'groceries', title: 'Đi chợ', detail: '', source: 'elder', priority, priorityReason: '', createdAt,
    history: [], unclear: [], owner, fields: {}, status: 'await_staff', confirmedAt: createdAt,
  })

  test('staffBoard counters follow the spec definitions', () => {
    let s = real()
    expect(staffBoard(s).counters).toEqual({ verify: 2, waiting: 0, doing: 0 }) // EVT-001 and CB-003; CB-001 is need_info
    s = addCase(s, awaitStaff('CB-010', s.now))
    expect(staffBoard(s).counters).toEqual({ verify: 3, waiting: 0, doing: 0 })
    s = run(s, { type: 'staff/verify', id: 'CB-010', note: '' })
    expect(staffBoard(s).counters).toEqual({ verify: 2, waiting: 1, doing: 0 })
    s = run(s, { type: 'staff/assign', id: 'CB-010', partner: 'Anh Tuấn' })
    expect(staffBoard(s).counters).toEqual({ verify: 2, waiting: 0, doing: 1 })
    s = run(s, { type: 'staff/partnerReport', id: 'CB-010', note: 'Đã giao hàng' })
    expect(staffBoard(s).counters).toEqual({ verify: 2, waiting: 1, doing: 0 })
    s = run(s, { type: 'staff/takeEvent', id: 'EVT-001' })
    expect(staffBoard(s).counters).toEqual({ verify: 1, waiting: 1, doing: 1 })
    s = run(s, { type: 'staff/complete', id: 'CB-010' })
    expect(staffBoard(s).counters).toEqual({ verify: 1, waiting: 0, doing: 1 })
  })

  test('list: open cases only, staff-owned first, then priority, then oldest', () => {
    let s = real()
    expect(staffBoard(s).cases.map((c) => c.id)).toEqual(['EVT-001', 'CB-001', 'CB-003']) // CB-002 is done
    s = addCase(s, awaitStaff('CB-011', s.now - 60 * MIN, 'family', 'emergency'))
    expect(staffBoard(s).cases.map((c) => c.id)).toEqual(['EVT-001', 'CB-001', 'CB-003', 'CB-011'])
    expect(staffBoard(s).counters.verify).toBe(2) // family-owned cases are not staff's to verify
  })

  test('can mirrors transition: true only when the action would change state', () => {
    const s = real()
    expect(can(s, { type: 'staff/verify', id: 'CB-003', note: '' })).toBe(true)
    expect(can(s, { type: 'staff/assign', id: 'CB-003', partner: 'Anh Tuấn' })).toBe(false) // not verified yet
    expect(can(s, { type: 'staff/takeEvent', id: 'EVT-001' })).toBe(true)
    expect(can(s, { type: 'staff/resolveEvent', id: 'EVT-001', note: 'x' })).toBe(false) // not taken yet
  })
})

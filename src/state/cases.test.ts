import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce, type Action } from './reducer'
import { MIN, addCase } from './helpers'
import { effectivePriority, nextOwner } from './cases'
import type { Case, EventCase, RequestCase, ServiceType, State } from './types'

const s0 = () => seed(new Date(2026, 9, 18, 12, 0))
const get = (s: State, id: string) => s.cases.find((c) => c.id === id)!
const req = (s: State, id: string) => get(s, id) as RequestCase
const run = (s: State, ...as: Action[]) => as.reduce(reduce, s)

function withRequest(service: ServiceType = 'medicine', status: RequestCase['status'] = 'await_dispatch'): State {
  const s = s0()
  const c: RequestCase = {
    id: 'CB-010', kind: 'request', service, title: 'Test', detail: '', source: 'elder', priority: 'normal',
    priorityReason: '', createdAt: s.now, history: [], unclear: [], fields: { noi_dung: 'Nhắc uống nước' }, status,
  }
  return addCase(s, c)
}

const fullPath: Action[] = [
  { type: 'ops/verify', id: 'CB-010' },
  { type: 'ops/assign', id: 'CB-010', partner: 'Anh Tuấn' },
  { type: 'clock/advance', minutes: 40 },
  { type: 'ops/cpReport', id: 'CB-010', text: 'Đã mua thuốc và giao tận tay.' },
  { type: 'clock/advance', minutes: 10 },
  { type: 'ops/confirmDone', id: 'CB-010' },
]

describe('request workflow', () => {
  test('happy path: verify → assign → cpReport → confirmDone ends done with completedAt and cpReport.at kept separately', () => {
    const s = run(withRequest(), ...fullPath)
    const c = req(s, 'CB-010')
    expect(c.status).toBe('done')
    expect(c.verifiedBy).toBe('Chị Hà')
    expect(c.assignee).toBe('Anh Tuấn')
    expect(c.completedAt).toBe(s.now)
    expect(c.cpReport!.at).toBe(s.now - 10 * MIN)
  })

  test('cannot assign before verify', () => {
    const s = withRequest()
    expect(reduce(s, { type: 'ops/assign', id: 'CB-010', partner: 'Anh Tuấn' })).toBe(s)
  })

  test('cannot confirmDone without cpReport', () => {
    const s = run(withRequest(), fullPath[0], fullPath[1], { type: 'ops/confirmDone', id: 'CB-010' })
    expect(req(s, 'CB-010').status).toBe('in_progress')
  })

  test('illegal transition is a no-op', () => {
    const done = run(withRequest(), ...fullPath)
    expect(reduce(done, { type: 'ops/confirmDone', id: 'CB-010' })).toBe(done)
    const assigned = run(withRequest(), fullPath[0], fullPath[1])
    const again = reduce(assigned, { type: 'ops/assign', id: 'CB-010', partner: 'Chị Mai' })
    expect(again).toBe(assigned)
    expect(again.notifications).toHaveLength(assigned.notifications.length)
  })

  test('cancel from need_info → refused, by elder', () => {
    const s = reduce(s0(), { type: 'request/cancel', id: 'CB-001' })
    expect(req(s, 'CB-001').status).toBe('refused')
    expect(req(s, 'CB-001').history.at(-1)!.by).toBe('elder')
  })

  test('cancel on done is a no-op', () => {
    const s = s0()
    expect(reduce(s, { type: 'request/cancel', id: 'CB-002' })).toBe(s)
  })

  test('decline sets refused with reason', () => {
    const s = reduce(withRequest(), { type: 'ops/decline', id: 'CB-010', reason: 'Ngoài khu vực phục vụ' })
    expect(req(s, 'CB-010')).toMatchObject({ status: 'refused', closedReason: 'Ngoài khu vực phục vụ' })
  })

  test('contact_family needs familyResponded before confirmDone', () => {
    const verified = run(withRequest('contact_family'), { type: 'ops/verify', id: 'CB-010' })
    expect(reduce(verified, { type: 'ops/confirmDone', id: 'CB-010' })).toBe(verified)
    expect(reduce(verified, { type: 'ops/assign', id: 'CB-010', partner: 'Anh Tuấn' })).toBe(verified)
    const s = run(verified, { type: 'family/responded', id: 'CB-010' }, { type: 'ops/confirmDone', id: 'CB-010' })
    expect(req(s, 'CB-010').status).toBe('done')
  })

  test('approveReminder adds a reminder at the given time and sets done', () => {
    const s0r = withRequest('add_reminder')
    expect(reduce(s0r, { type: 'ops/approveReminder', id: 'CB-010', time: '20:00' })).toBe(s0r) // must verify first
    const s = run(s0r, { type: 'ops/verify', id: 'CB-010' }, { type: 'ops/approveReminder', id: 'CB-010', time: '20:00' })
    expect(req(s, 'CB-010').status).toBe('done')
    const added = s.reminders.at(-1)!
    expect(s.reminders).toHaveLength(6)
    expect(new Date(added.dueAt).getHours()).toBe(20)
    expect(added.title).toBe('Nhắc uống nước')
  })

  test('flag/unflag toggles intervention ↔ await_dispatch', () => {
    const f = reduce(withRequest(), { type: 'ops/flag', id: 'CB-010' })
    expect(req(f, 'CB-010').status).toBe('intervention')
    expect(req(reduce(f, { type: 'ops/unflag', id: 'CB-010' }), 'CB-010').status).toBe('await_dispatch')
  })
})

describe('event workflow', () => {
  const withEvent = () => run(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })

  test('resolveEvent requires a non-blank note', () => {
    const taken = reduce(withEvent(), { type: 'ops/takeEvent', id: 'EVT-001' })
    expect(get(taken, 'EVT-001').status).toBe('handling')
    expect(reduce(taken, { type: 'ops/resolveEvent', id: 'EVT-001', note: '  ' })).toBe(taken)
    const done = reduce(taken, { type: 'ops/resolveEvent', id: 'EVT-001', note: 'Đã gọi bác, đo lại bình thường theo ngưỡng.' })
    expect(get(done, 'EVT-001')).toMatchObject({ status: 'resolved', closingNote: 'Đã gọi bác, đo lại bình thường theo ngưỡng.' })
  })

  test('convertEvent resolves the event and creates CB-003 await_dispatch', () => {
    const s = reduce(withEvent(), { type: 'ops/convertEvent', id: 'EVT-001', service: 'clinic' })
    expect(get(s, 'EVT-001').status).toBe('resolved')
    expect(req(s, 'CB-003')).toMatchObject({ status: 'await_dispatch', service: 'clinic', unclear: ['Cần bổ sung chi tiết'] })
  })
})

describe('emergency', () => {
  test('raiseEmergency sets state.emergency, creates a handling emergency event and notifies family and ops in one call', () => {
    const s = s0()
    const out = reduce(s, { type: 'device/fall' })
    const ev = get(out, 'EVT-001') as EventCase
    expect(out.emergency).toEqual({ caseId: 'EVT-001', calling: false })
    expect(ev).toMatchObject({ priority: 'emergency', status: 'handling', handler: 'Chị Hà' })
    expect(ev.history[0].text).toContain('Thông báo tự động chưa có nghĩa là đã có người tiếp nhận')
    const fresh = out.notifications.slice(s.notifications.length)
    expect(fresh.map((n) => n.audience).sort()).toEqual(['family', 'ops'])
  })

  test('device/fall raises an emergency', () => {
    const out = reduce(s0(), { type: 'device/fall' })
    expect(get(out, 'EVT-001').title).toBe('Thiết bị báo té ngã')
    expect(out.devices.find((d) => d.id === 'fall')!.readings.at(-1)!.value).toBe('fall')
  })

  test('call115 sets calling, dismiss clears the overlay and keeps the event', () => {
    const e = reduce(s0(), { type: 'device/fall' })
    const calling = reduce(e, { type: 'emergency/call115' })
    expect(calling.emergency!.calling).toBe(true)
    const closed = reduce(calling, { type: 'emergency/dismiss' })
    expect(closed.emergency).toBeNull()
    expect(get(closed, 'EVT-001').status).toBe('handling')
  })
})

describe('derived', () => {
  test('effectivePriority marks seed CB-001 as priority with the giả định thử nghiệm reason', () => {
    const s = s0()
    const p = effectivePriority(get(s, 'CB-001'), s.now)
    expect(p.priority).toBe('priority')
    expect(p.reason).toContain('giả định thử nghiệm')
    expect(effectivePriority(get(s, 'CB-002'), s.now).priority).toBe('normal')
  })

  test('nextOwner for in_progress without report names the assignee', () => {
    const s = run(withRequest(), fullPath[0], fullPath[1])
    expect(nextOwner(get(s, 'CB-010') as Case, s)).toBe('Care Partner Anh Tuấn')
    expect(nextOwner(get(s, 'CB-002'), s)).toBe('—')
  })
})

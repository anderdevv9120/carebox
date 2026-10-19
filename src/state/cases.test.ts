import { describe, expect, test } from 'vitest'
import { seedBare } from './testing'
import { reduce, type Action } from './reducer'
import { MIN, addCase, fmtTime } from './helpers'
import { effectivePriority, familyQueue, isAbandoned, nextOwner } from './cases'
import type { EventCase, RequestCase, ServiceType, State } from './types'

const s0 = () => seedBare(Date.UTC(2026, 9, 18, 5, 0)) // 12:00 Vietnam
const get = (s: State, id: string) => s.cases.find((c) => c.id === id)!
const req = (s: State, id: string) => get(s, id) as RequestCase
const run = (s: State, ...as: Action[]) => as.reduce(reduce, s)

function withRequest(service: ServiceType = 'medicine', status: RequestCase['status'] = 'await_family'): State {
  const s = s0()
  const c: RequestCase = {
    id: 'CB-010', kind: 'request', service, title: 'Test', detail: '', source: 'elder', priority: 'normal',
    priorityReason: '', createdAt: s.now, history: [], unclear: [], owner: 'family', fields: { noi_dung: 'Nhắc uống nước' }, status,
  }
  return addCase(s, c)
}

const accept: Action = { type: 'family/accept', id: 'CB-010' }

describe('request workflow', () => {
  test('full family path: await_family → accept → done with note', () => {
    const s = run(withRequest('medicine'), accept, { type: 'family/done', id: 'CB-010', note: 'Đã mua thuốc' })
    expect(req(s, 'CB-010')).toMatchObject({ status: 'done', doneNote: 'Đã mua thuốc', doneBy: 'Chị Minh', completedAt: s.now })
    expect(req(s, 'CB-010').history.at(-1)!.by).toBe('family')
  })

  test('accept moves await_family to in_progress and records acceptedAt', () => {
    const s = reduce(withRequest(), accept)
    expect(req(s, 'CB-010')).toMatchObject({ status: 'in_progress', acceptedAt: s.now })
    expect(reduce(s, accept)).toBe(s)
  })

  test('family cannot act on need_info / await_confirm', () => {
    for (const status of ['need_info', 'await_confirm'] as const) {
      const s = withRequest('medicine', status)
      expect(reduce(s, accept)).toBe(s)
      expect(reduce(s, { type: 'family/decline', id: 'CB-010', reason: 'Bận' })).toBe(s)
      expect(reduce(s, { type: 'family/done', id: 'CB-010', note: '' })).toBe(s)
    }
  })

  test('done only from in_progress; decline needs non-blank reason', () => {
    const s = withRequest()
    expect(reduce(s, { type: 'family/done', id: 'CB-010', note: 'x' })).toBe(s)
    expect(reduce(s, { type: 'family/decline', id: 'CB-010', reason: '  ' })).toBe(s)
    const declined = reduce(s, { type: 'family/decline', id: 'CB-010', reason: 'Hôm nay con đi công tác' })
    expect(req(declined, 'CB-010')).toMatchObject({ status: 'refused', closedReason: 'Hôm nay con đi công tác' })
    const doneNoNote = run(s, accept, { type: 'family/done', id: 'CB-010', note: '  ' })
    expect(req(doneNoNote, 'CB-010').status).toBe('done')
    expect(req(doneNoNote, 'CB-010').doneNote).toBeUndefined()
  })

  test('done is not the path for contact_family or add_reminder', () => {
    for (const service of ['contact_family', 'add_reminder'] as const) {
      const s = run(withRequest(service), accept)
      expect(reduce(s, { type: 'family/done', id: 'CB-010', note: '' })).toBe(s)
    }
  })

  test('approveReminder adds a daily reminder at HH:MM and completes add_reminder', () => {
    const s0r = withRequest('add_reminder')
    expect(reduce(s0r, { type: 'family/approveReminder', id: 'CB-010', time: 'abc' })).toBe(s0r)
    const s = reduce(s0r, { type: 'family/approveReminder', id: 'CB-010', time: '18:30' })
    expect(req(s, 'CB-010').status).toBe('done')
    const added = s.reminders.at(-1)!
    expect(added).toMatchObject({ id: 'r-CB-010', daily: true, title: 'Nhắc uống nước' })
    expect(fmtTime(added.dueAt)).toBe('18:30')
    expect(s.reminders).toHaveLength(s0r.reminders.length + 1)
  })

  test('contacted completes contact_family from await_family without accept', () => {
    const s = reduce(withRequest('contact_family'), { type: 'family/contacted', id: 'CB-010' })
    expect(req(s, 'CB-010')).toMatchObject({ status: 'done', doneBy: 'Chị Minh' })
    const med = withRequest('medicine')
    expect(reduce(med, { type: 'family/contacted', id: 'CB-010' })).toBe(med)
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
    for (const status of ['need_info', 'await_confirm', 'await_family'] as const) {
      const s = withRequest('medicine', status)
      const c = get(s, 'CB-010')
      expect(effectivePriority(c, s.now + 29 * MIN).priority).toBe('normal')
      const p = effectivePriority(c, s.now + 31 * MIN)
      expect(p.priority).toBe('priority')
      expect(p.reason).toMatch(/^Bỏ ngỏ/)
      expect(p.reason).toBe('Bỏ ngỏ quá 30 phút')
    }
    const accepted = run(withRequest(), accept)
    expect(effectivePriority(get(accepted, 'CB-010'), accepted.now + 31 * MIN).priority).toBe('normal')
  })

  test('nextOwner names the daughter: await_family → "Chị Minh (nhận việc)", to_verify → "Chị Minh (xem và tiếp nhận)"', () => {
    const s = withRequest()
    expect(nextOwner(get(s, 'CB-010'), s)).toBe('Chị Minh (nhận việc)')
    const e = run(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    expect(nextOwner(get(e, 'EVT-001'), e)).toBe('Chị Minh (xem và tiếp nhận)')
    expect(nextOwner(get(s, 'CB-002'), s)).toBe('—')
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

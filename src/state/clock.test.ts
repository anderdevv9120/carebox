import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce } from './reducer'
import { MIN, atVN, fmtDayMonth, fmtTime, vnDay } from './helpers'
import { rollover, tick } from './clock'
import type { RequestCase } from './types'

const NOW = Date.UTC(2026, 9, 18, 8, 0) // 15:00 in Vietnam
const DAY = 24 * 60 * MIN

describe('Vietnam time', () => {
  test('fmtTime/vnDay use UTC+7 regardless of host TZ', () => {
    expect(fmtTime(Date.UTC(2026, 9, 18, 1, 30))).toBe('08:30')
    expect(vnDay(Date.UTC(2026, 9, 18, 18, 0))).toBe('2026-10-19')
    expect(fmtDayMonth(NOW)).toBe('18/10')
  })

  test('atVN resolves HH:MM on the Vietnam date, with a day offset', () => {
    expect(atVN(NOW, '18:30')).toBe(Date.UTC(2026, 9, 18, 11, 30))
    expect(atVN(Date.UTC(2026, 9, 18, 18, 0), '07:00')).toBe(Date.UTC(2026, 9, 19, 0, 0))
    expect(atVN(NOW, '07:00', 1)).toBe(Date.UTC(2026, 9, 19, 0, 0))
  })
})

describe('seed', () => {
  test('seed at 15:00: past reminders are received, no burst of alerts', () => {
    const s = seed(NOW)
    expect(s).toMatchObject({ now: NOW, day: '2026-10-18', rev: 0 })
    expect(s.reminders.filter((r) => r.dueAt < NOW).every((r) => r.response === 'received')).toBe(true)
    expect(s.reminders.filter((r) => r.dueAt > NOW).every((r) => r.response === undefined)).toBe(true)
    expect(tick(s, NOW).state.cases.filter((c) => c.kind === 'event')).toHaveLength(0)
  })

  test('seed adds one one-off reminder ~3 min after reset', () => {
    const extra = seed(NOW).reminders.filter((r) => !r.daily)
    expect(extra).toHaveLength(1)
    expect(extra[0].dueAt - NOW).toBe(3 * MIN)
    expect(extra[0].kind).toBe('medicine')
  })

  test('seed cases read as recent: CB-001 created 20 min ago, CB-002 done yesterday by Chị Minh', () => {
    const s = seed(NOW)
    const c1 = s.cases.find((c) => c.id === 'CB-001') as RequestCase
    const c2 = s.cases.find((c) => c.id === 'CB-002') as RequestCase
    expect(c1).toMatchObject({ status: 'need_info', createdAt: NOW - 20 * MIN })
    expect(c2).toMatchObject({ status: 'done', createdAt: NOW - 2 * DAY, completedAt: NOW - DAY, doneBy: 'Chị Minh', doneNote: 'Đã đưa mẹ đi khám và về nhà.' })
    expect(s.notifications.find((n) => n.caseId === 'CB-001')!.at).toBe(c1.createdAt)
    expect(s.notifications.find((n) => n.caseId === 'CB-002')!.at).toBe(c2.completedAt)
  })

  test('device history ends 1 hour before reset', () => {
    const s = seed(NOW)
    expect(s.devices.find((d) => d.id === 'bp')!.readings.at(-1)!.at).toBe(NOW - 60 * MIN)
  })

  test('reset re-seeds at the current moment', () => {
    const later = { ...seed(NOW), now: NOW + 90 * MIN }
    expect(reduce(later, { type: 'reset' }).now).toBe(NOW + 90 * MIN)
  })
})

describe('rollover', () => {
  test('rollover next day: daily reminders move to the new date with responses/snooze/escalation cleared; one-offs dropped; cases/notifications/chat untouched', () => {
    let s = seed(NOW)
    s = { ...s, reminders: s.reminders.map((r) => (r.id === 'r5' ? { ...r, snoozedUntil: r.dueAt + 10 * MIN, escalated: true } : r)) }
    const next = NOW + DAY
    const out = rollover(s, next)
    expect(out.day).toBe('2026-10-19')
    expect(out.reminders).toHaveLength(5)
    expect(out.reminders.every((r) => r.daily && vnDay(r.dueAt) === '2026-10-19')).toBe(true)
    expect(out.reminders.map((r) => fmtTime(r.dueAt))).toEqual(s.reminders.filter((r) => r.daily).map((r) => fmtTime(r.dueAt)))
    for (const r of out.reminders) {
      expect(r.response).toBeUndefined()
      expect(r.respondedAt).toBeUndefined()
      expect(r.snoozedUntil).toBeUndefined()
      expect(r.escalated).toBeUndefined()
    }
    expect(out.cases).toBe(s.cases)
    expect(out.notifications).toBe(s.notifications)
    expect(out.chat).toBe(s.chat)
  })

  test('rollover on the same day returns the state unchanged', () => {
    const s = seed(NOW)
    expect(rollover(s, NOW + 60 * MIN)).toBe(s)
  })
})

describe('tick', () => {
  test('tick: same day and nothing due → changed false; reminder past 30 min → changed true and one uncertain event', () => {
    const s = seed(NOW)
    const quiet = tick(s, NOW + MIN)
    expect(quiet.changed).toBe(false)
    expect(quiet.state.now).toBe(NOW + MIN)
    const late = tick(s, NOW + 34 * MIN) // one-off at 15:03 is unconfirmed by 15:33
    expect(late.changed).toBe(true)
    const evs = late.state.cases.filter((c) => c.kind === 'event')
    expect(evs).toHaveLength(1)
    expect(evs[0].priority).toBe('uncertain')
  })

  test('tick across midnight reports changed', () => {
    const s = seed(NOW)
    const t = tick(s, NOW + DAY)
    expect(t.changed).toBe(true)
    expect(t.state.day).toBe('2026-10-19')
  })
})

describe('approveReminder in Vietnam time', () => {
  test('a time already past today is scheduled for tomorrow, not escalated at once', () => {
    let s = seed(NOW)
    const c: RequestCase = {
      id: 'CB-010', kind: 'request', service: 'add_reminder', title: 'Test', detail: '', source: 'elder', priority: 'normal',
      priorityReason: '', createdAt: s.now, history: [], unclear: [], fields: { noi_dung: 'Nhắc uống nước' }, status: 'await_family',
    }
    s = { ...s, cases: [...s.cases, c] }
    const out = reduce(s, { type: 'family/approveReminder', id: 'CB-010', time: '07:00' })
    expect(out.reminders.at(-1)!.dueAt).toBe(atVN(NOW, '07:00', 1))
    expect(tick(out, NOW + 60 * MIN).state.cases.filter((x) => x.kind === 'event' && x.reminderId === 'r-CB-010')).toHaveLength(0)
  })
})

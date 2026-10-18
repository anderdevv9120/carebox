import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce } from './reducer'
import { MIN } from './helpers'
import { reminderStatus } from './reminders'
import type { EventCase, State } from './types'

const s0 = () => seed(new Date(2026, 9, 18, 12, 0))
const r1 = (s: State) => s.reminders.find((r) => r.id === 'r1')!
const events = (s: State) => s.cases.filter((c): c is EventCase => c.kind === 'event')

describe('reminderStatus', () => {
  test('reminderStatus covers all six states', () => {
    const r = r1(s0())
    expect(reminderStatus(r, r.dueAt - 30 * MIN)).toBe('upcoming')
    expect(reminderStatus(r, r.dueAt + 5 * MIN)).toBe('due')
    expect(reminderStatus(r, r.dueAt + 30 * MIN)).toBe('no_confirm')
    expect(reminderStatus({ ...r, snoozedUntil: r.dueAt + 15 * MIN }, r.dueAt + 5 * MIN)).toBe('snoozed')
    expect(reminderStatus({ ...r, response: 'received' }, r.dueAt + 40 * MIN)).toBe('received')
    expect(reminderStatus({ ...r, response: 'cant_do' }, r.dueAt + 40 * MIN)).toBe('cant_do')
  })
})

describe('respond', () => {
  test('snooze sets snoozedUntil = now + 10 min', () => {
    const s = reduce(s0(), { type: 'clock/nextReminder' })
    const out = reduce(s, { type: 'reminder/respond', id: 'r1', response: 'snooze' })
    expect(r1(out).snoozedUntil).toBe(s.now + 10 * MIN)
    expect(r1(out).response).toBeUndefined()
  })

  test('cant_do on a medicine reminder creates a priority event with reminderId and notifies family and ops', () => {
    const s = reduce(s0(), { type: 'clock/nextReminder' })
    const out = reduce(s, { type: 'reminder/respond', id: 'r1', response: 'cant_do' })
    const ev = events(out)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ priority: 'priority', reminderId: 'r1', status: 'to_verify' })
    const fresh = out.notifications.slice(s.notifications.length)
    expect(fresh.map((n) => n.audience).sort()).toEqual(['family', 'ops'])
  })

  test('received records response and respondedAt', () => {
    const s = reduce(s0(), { type: 'clock/nextReminder' })
    const out = reduce(s, { type: 'reminder/respond', id: 'r1', response: 'received' })
    expect(r1(out)).toMatchObject({ response: 'received', respondedAt: s.now })
  })
})

describe('sweep', () => {
  test('sweep escalates a no-response reminder exactly once', () => {
    let s = s0()
    s = reduce(s, { type: 'clock/advance', minutes: 60 }) // 08:00: r1 (07:30) is no_confirm
    s = reduce(s, { type: 'clock/advance', minutes: 60 }) // 09:00
    const forR1 = events(s).filter((e) => e.reminderId === 'r1')
    expect(forR1).toHaveLength(1)
    expect(forR1[0].priority).toBe('uncertain')
    expect(forR1[0].detail).toContain('Không kết luận người cao tuổi đã thực hiện')
    expect(r1(s).escalated).toBe(true)
  })

  test('sweep never marks a reminder received', () => {
    const s = reduce(s0(), { type: 'clock/advance', minutes: 600 })
    expect(s.reminders.every((r) => r.response === undefined)).toBe(true)
  })
})

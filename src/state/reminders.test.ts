import { describe, expect, test } from 'vitest'
import { seedBare } from './testing'
import { reduce } from './reducer'
import { MIN } from './helpers'
import { reminderStatus, sweepReminders } from './reminders'
import type { EventCase, State } from './types'

const s0 = () => seedBare(Date.UTC(2026, 9, 18, 0, 0)) // 07:00 Vietnam: no reminder answered yet
const r1 = (s: State) => s.reminders.find((r) => r.id === 'r1')!
const atR1 = () => { const s = s0(); return { ...s, now: r1(s).dueAt } }
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
    const s = atR1()
    const out = reduce(s, { type: 'reminder/respond', id: 'r1', dueAt: r1(s).dueAt, response: 'snooze' })
    expect(r1(out).snoozedUntil).toBe(s.now + 10 * MIN)
    expect(r1(out).response).toBeUndefined()
  })

  test('cant_do on a medicine reminder creates a priority event with reminderId and notifies staff and family', () => {
    const s = atR1()
    const out = reduce(s, { type: 'reminder/respond', id: 'r1', dueAt: r1(s).dueAt, response: 'cant_do' })
    const ev = events(out)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ priority: 'priority', reminderId: 'r1', status: 'to_verify' })
    const fresh = out.notifications.slice(s.notifications.length)
    expect(fresh).toHaveLength(2)
    expect(fresh.map((n) => [n.to, n.caseId])).toEqual([['staff', ev[0].id], ['family', ev[0].id]])
  })

  test('received records response and respondedAt', () => {
    const s = atR1()
    const out = reduce(s, { type: 'reminder/respond', id: 'r1', dueAt: r1(s).dueAt, response: 'received' })
    expect(r1(out)).toMatchObject({ response: 'received', respondedAt: s.now })
  })
})

describe('sweep', () => {
  test('sweep escalates a no-response reminder exactly once', () => {
    let s = s0()
    s = sweepReminders({ ...s, now: s.now + 60 * MIN }) // 08:00: r1 (07:30) is no_confirm
    s = sweepReminders({ ...s, now: s.now + 60 * MIN }) // 09:00
    const forR1 = events(s).filter((e) => e.reminderId === 'r1')
    expect(forR1).toHaveLength(1)
    expect(forR1[0].priority).toBe('uncertain')
    expect(forR1[0].detail).toContain('Không kết luận người cao tuổi đã thực hiện')
    expect(r1(s).escalated).toBe(true)
  })

  test('sweep never marks a reminder received', () => {
    const s0v = s0()
    const s = sweepReminders({ ...s0v, now: s0v.now + 600 * MIN })
    expect(s.reminders.every((r) => r.response === undefined)).toBe(true)
  })
})

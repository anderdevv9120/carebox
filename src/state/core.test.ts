import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce } from './reducer'
import { MIN, nextCaseId } from './helpers'

const s0 = () => seed(new Date(2026, 9, 18, 12, 0))

describe('seed', () => {
  test('seed has 5 daily reminders, 5 devices, CB-001 need_info and CB-002 done, no staff', () => {
    const s = s0()
    expect(s.version).toBe(2)
    expect(s.reminders).toHaveLength(5)
    expect(s.reminders.every((r) => r.daily)).toBe(true)
    expect(s.devices).toHaveLength(5)
    expect(s.cases.find((c) => c.id === 'CB-001')?.status).toBe('need_info')
    expect(s.cases.find((c) => c.id === 'CB-002')).toMatchObject({ status: 'done', doneBy: 'Chị Minh' })
    expect(Object.keys(s)).not.toContain('staff')
    expect(Object.keys(s)).not.toContain('view')
    expect(new Date(s.now).getHours()).toBe(7)
    expect(new Date(s.now).getMinutes()).toBe(0)
  })
})

describe('reduce core', () => {
  test('nextCaseId increments and pads', () => {
    const [s1, id1] = nextCaseId(s0(), 'request')
    expect(id1).toBe('CB-003')
    expect(nextCaseId(s1, 'request')[1]).toBe('CB-004')
    expect(nextCaseId(s0(), 'event')[1]).toBe('EVT-001')
  })

  test('reset returns a fresh seed', () => {
    const s = s0()
    const moved = reduce({ ...s, now: s.now + 90 * MIN }, { type: 'device/fall' })
    const r = reduce(moved, { type: 'reset' })
    expect(new Date(r.now).getHours()).toBe(7)
    expect(r.cases).toHaveLength(2)
    expect(r.emergency).toBeNull()
  })
})

describe('notifications', () => {
  test('readAll marks every notification read, and is a no-op when none are unread', () => {
    const s = reduce(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    const out = reduce(s, { type: 'notif/readAll' })
    expect(out.notifications.every((n) => n.read)).toBe(true)
    expect(reduce(out, { type: 'notif/readAll' })).toBe(out)
  })
})

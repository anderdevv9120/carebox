import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce } from './reducer'
import { MIN, nextCaseId, notificationsFor } from './helpers'
import { isAbandoned } from './cases'
import type { RequestCase } from './types'

const s0 = () => seed(Date.UTC(2026, 9, 18, 5, 0)) // 12:00 Vietnam

describe('seed', () => {
  test('seed has staff, care partners and v3 shape', () => {
    const s = s0()
    expect(s.version).toBe(3)
    expect(s.reminders).toHaveLength(6)
    expect(s.reminders.filter((r) => r.daily)).toHaveLength(5)
    expect(s.devices).toHaveLength(5)
    expect(s.staff).toEqual({ name: 'Anh Nam', title: 'Nhân viên điều phối' })
    expect(s.carePartners).toEqual(['Anh Tuấn', 'Chị Hoa'])
    expect(s.cases.every((c) => c.owner)).toBe(true)
    expect(s.notifications.every((n) => n.to)).toBe(true)
    expect(s.cases.find((c) => c.id === 'CB-001')).toMatchObject({ status: 'need_info', owner: 'staff' })
    const done = s.cases.find((c) => c.id === 'CB-002') as RequestCase
    expect(done).toMatchObject({ status: 'done', assignee: 'Anh Tuấn', doneBy: 'Anh Nam' })
    expect(done.partnerReport).toBeTruthy()
    expect(done.partnerReportAt).toBeLessThan(done.completedAt!)
    expect(s.cases.find((c) => c.id === 'CB-003')).toMatchObject({ status: 'await_staff', owner: 'staff' })
    expect((s.cases.find((c) => c.id === 'CB-003') as RequestCase).verifiedBy).toBeUndefined()
    expect((s.cases.find((c) => c.id === 'CB-003') as RequestCase).confirmedAt).toBeDefined()
    expect(isAbandoned(s.cases.find((c) => c.id === 'CB-003')!, s.now)).toBe(false)
    const events = s.cases.filter((c) => c.kind === 'event' && c.status !== 'resolved')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ owner: 'staff', status: 'to_verify' })
    expect(Object.keys(s)).not.toContain('view')
    expect(s.now).toBe(Date.UTC(2026, 9, 18, 5, 0))
  })
})

describe('reduce core', () => {
  test('nextCaseId increments and pads', () => {
    const [s1, id1] = nextCaseId(s0(), 'request')
    expect(id1).toBe('CB-004')
    expect(nextCaseId(s1, 'request')[1]).toBe('CB-005')
    expect(nextCaseId(s0(), 'event')[1]).toBe('EVT-002') // the seed holds EVT-001
  })

  test('reset returns a fresh seed', () => {
    const s = s0()
    const moved = reduce({ ...s, now: s.now + 90 * MIN }, { type: 'device/fall' })
    const r = reduce(moved, { type: 'reset' })
    expect(r.now).toBe(moved.now)
    expect(r.cases).toHaveLength(4)
    expect(r.emergency).toBeNull()
  })
})

describe('notifications', () => {
  test('readAll marks only the given audience read, and is a no-op when none are unread', () => {
    const s = reduce(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    const withStaff = { ...s, notifications: [...s.notifications, { ...s.notifications[0], id: 'ns', to: 'staff' as const, read: false }] }
    const out = reduce(withStaff, { type: 'notif/readAll', to: 'family' })
    expect(out.notifications.filter((n) => n.to === 'family').every((n) => n.read)).toBe(true)
    expect(out.notifications.find((n) => n.to === 'staff')!.read).toBe(false)
    expect(reduce(out, { type: 'notif/readAll', to: 'family' })).toBe(out)
  })

  test('notificationsFor hides staff-only copy, so the family unread count reaches 0 after readAll', () => {
    const s = reduce(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    const mixed = { ...s, notifications: [{ ...s.notifications[0], id: 'nf', to: 'family' as const, read: false }, { ...s.notifications[0], id: 'ns', to: 'staff' as const, read: false }] }
    expect(notificationsFor(mixed, 'family').map((n) => n.id)).toEqual(['nf'])
    expect(notificationsFor(mixed, 'family').filter((n) => !n.read)).toHaveLength(1)
    expect(notificationsFor(reduce(mixed, { type: 'notif/readAll', to: 'family' }), 'family').filter((n) => !n.read)).toHaveLength(0)
  })
})

import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce } from './reducer'
import { MIN, nextCaseId } from './helpers'
import { loadState } from './store'

const DAY = new Date(2026, 9, 18, 12, 0)
const s0 = () => seed(DAY)

describe('seed', () => {
  test('seed has 5 reminders, 5 devices, CB-001 need_info and CB-002 done', () => {
    const s = s0()
    expect(s.reminders).toHaveLength(5)
    expect(s.devices).toHaveLength(5)
    expect(s.cases.find((c) => c.id === 'CB-001')?.status).toBe('need_info')
    expect(s.cases.find((c) => c.id === 'CB-002')?.status).toBe('done')
    expect(new Date(s.now).getHours()).toBe(7)
    expect(new Date(s.now).getMinutes()).toBe(0)
  })
})

describe('reduce core', () => {
  test("nav with role only sets that role's default screen", () => {
    expect(reduce(s0(), { type: 'nav', role: 'elder' }).view.screen).toBe('home')
    expect(reduce(s0(), { type: 'nav', role: 'family' }).view.screen).toBe('f-dashboard')
    expect(reduce(s0(), { type: 'nav', role: 'ops' }).view.screen).toBe('ops-board')
  })

  test('nav with screen keeps role and sets caseId', () => {
    const s = reduce(reduce(s0(), { type: 'nav', role: 'ops' }), { type: 'nav', screen: 'ops-case', caseId: 'CB-001' })
    expect(s.view).toEqual({ role: 'ops', screen: 'ops-case', caseId: 'CB-001' })
  })

  test('clock/advance moves now by minutes', () => {
    const s = s0()
    expect(reduce(s, { type: 'clock/advance', minutes: 15 }).now).toBe(s.now + 15 * MIN)
  })

  test('clock/nextReminder jumps to the earliest dueAt or snoozedUntil > now among unanswered reminders', () => {
    const s = s0()
    const r1 = s.reminders.find((r) => r.id === 'r1')!
    expect(reduce(s, { type: 'clock/nextReminder' }).now).toBe(r1.dueAt)
  })

  test('nextCaseId increments and pads', () => {
    const [s1, id1] = nextCaseId(s0(), 'request')
    expect(id1).toBe('CB-003')
    expect(nextCaseId(s1, 'request')[1]).toBe('CB-004')
    expect(nextCaseId(s0(), 'event')[1]).toBe('EVT-001')
  })

  test('reset returns a fresh seed', () => {
    const moved = reduce(s0(), { type: 'clock/advance', minutes: 90 })
    const r = reduce(moved, { type: 'reset' })
    expect(new Date(r.now).getHours()).toBe(7)
    expect(r.cases).toHaveLength(2)
  })
})

describe('loadState', () => {
  test('loadState falls back to seed on null, invalid JSON, and version !== 1', () => {
    for (const raw of [null, '{not json', JSON.stringify({ ...s0(), version: 2 }), '42']) {
      const s = loadState(raw, DAY)
      expect(s.version).toBe(1)
      expect(s.cases).toHaveLength(2)
    }
  })

  test('loadState returns the parsed state when valid', () => {
    const moved = reduce(s0(), { type: 'clock/advance', minutes: 30 })
    expect(loadState(JSON.stringify(moved), DAY)).toEqual(moved)
  })
})

describe('notifications', () => {
  test('readAll marks only that audience read', () => {
    const s = reduce(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    const out = reduce(s, { type: 'notif/readAll', audience: 'family' })
    expect(out.notifications.filter((n) => n.audience === 'family').every((n) => n.read)).toBe(true)
    expect(out.notifications.filter((n) => n.audience === 'ops').some((n) => !n.read)).toBe(true)
  })
})

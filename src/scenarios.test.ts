import { describe, expect, test } from 'vitest'
import { seed } from './state/seed'
import { reduce } from './state/reducer'
import { deviceStatus } from './state/devices'
import { reminderStatus } from './state/reminders'
import { SCENARIOS, runScenario } from './scenarios'
import type { EventCase, RequestCase, State } from './state/types'

const s0 = () => seed(new Date(2026, 9, 18, 12, 0))
const run = (id: number, s: State = s0()) => runScenario(s, SCENARIOS.find((x) => x.id === id)!)
const fresh = (s: State) => s.cases.slice(2)
const events = (s: State) => fresh(s).filter((c): c is EventCase => c.kind === 'event')
const requests = (s: State) => fresh(s).filter((c): c is RequestCase => c.kind === 'request')

describe('doc §8 scenarios', () => {
  test('there are 8 scenarios with doc copy', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(SCENARIOS[6].criterion).toBe('Không chờ xác nhận thông thường')
  })

  test('1 · groceries request is recorded, never done', () => {
    const s = run(1)
    expect(requests(s)).toHaveLength(1)
    expect(requests(s)[0]).toMatchObject({ service: 'groceries', status: 'await_dispatch' })
    expect(s.cases.filter((c) => c.status === 'done').map((c) => c.id)).toEqual(['CB-002'])
  })

  test('1 · still works when a chat was already pending', () => {
    const pending = reduce(s0(), { type: 'chat/startService', service: 'medicine' })
    const s = run(1, pending)
    expect(s.cases.find((c) => c.kind === 'request' && c.service === 'groceries')?.status).toBe('await_dispatch')
  })

  test('2 · medicine reminder is due and unchanged', () => {
    const before = s0()
    const s = run(2, before)
    expect(reminderStatus(s.reminders.find((r) => r.id === 'r1')!, s.now)).toBe('due')
    expect(s.reminders.map((r) => [r.title, r.note])).toEqual(before.reminders.map((r) => [r.title, r.note]))
    expect(s.cases).toHaveLength(before.cases.length)
  })

  test('3 · refusal is recorded and nothing is re-booked', () => {
    const s = run(3)
    const help = s.cases.filter((c): c is RequestCase => c.kind === 'request' && c.service === 'daily_help')
    expect(help).toHaveLength(1)
    expect(help[0].status).toBe('refused')
  })

  test('4 · over-threshold creates a to_verify alert with no diagnosis', () => {
    const ev = events(run(4)).at(-1)!
    expect(ev).toMatchObject({ status: 'to_verify', priority: 'priority' })
    expect(ev.detail).toContain('Chưa có kết luận y tế')
  })

  test('5 · disconnect shows missing data and never claims safety', () => {
    const s = run(5)
    expect(deviceStatus(s.devices.find((d) => d.id === 'spo2')!, s.now)).toBe('missing')
    expect(events(s).some((e) => e.priority === 'uncertain')).toBe(true)
    for (const n of s.notifications.filter((x) => x.audience === 'family'))
      if (n.text.includes('an toàn')) expect(n.text).toContain('Không kết luận')
  })

  test('6 · two misunderstandings hand off with both utterances', () => {
    const s = run(6)
    const ev = events(s).find((e) => e.priority === 'uncertain')!
    expect(ev.unclear).toHaveLength(2)
    expect(requests(s)).toHaveLength(0)
  })

  test('7 · emergency fires on the first action', () => {
    const sc = SCENARIOS.find((x) => x.id === 7)!
    const chatAction = sc.actions.find((a) => a.type === 'chat/say')!
    const s = reduce(s0(), chatAction)
    expect(s.emergency).not.toBeNull()
    const ev = events(s).find((e) => e.priority === 'emergency')!
    expect(ev.status).toBe('to_verify')
    const audiences = s.notifications.filter((n) => n.caseId === ev.id).map((n) => n.audience).sort()
    expect(audiences).toEqual(['family', 'ops'])
  })

  test('8 · dose change is refused and routed to a doctor', () => {
    const before = s0()
    const s = run(8, before)
    expect(s.chat.messages.filter((m) => m.from === 'ai').at(-1)!.text).toContain('bác sĩ')
    expect(s.reminders).toEqual(before.reminders)
    expect(events(s).some((e) => e.priority === 'normal')).toBe(true)
  })
})

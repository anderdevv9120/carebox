import { describe, expect, test } from 'vitest'
import { seed } from './state/seed'
import { reduce, type Action } from './state/reducer'
import { deviceStatus } from './state/devices'
import { reminderStatus } from './state/reminders'
import type { EventCase, RequestCase, State } from './state/types'

const s0 = () => seed(Date.UTC(2026, 9, 18, 5, 0)) // 12:00 Vietnam
const say = (text: string): Action => ({ type: 'chat/say', text })
const clear: Action = { type: 'chat/clear' }
const run = (s: State, ...as: Action[]) => as.reduce(reduce, s)
const fresh = (s: State) => s.cases.slice(2)
const events = (s: State) => fresh(s).filter((c): c is EventCase => c.kind === 'event')
const requests = (s: State) => fresh(s).filter((c): c is RequestCase => c.kind === 'request')

// Scenarios and pass criteria are from doc.pdf §8.
const groceries = [clear, say('Bác muốn đi chợ'), say('Rau, trứng, sữa'), say('Sáng mai'), say('Đúng rồi')]

describe('doc §8 scenarios', () => {
  test('1 · groceries request is recorded, never done', () => {
    const s = run(s0(), ...groceries)
    expect(requests(s)).toHaveLength(1)
    expect(requests(s)[0]).toMatchObject({ service: 'groceries', status: 'await_family' })
    expect(s.cases.filter((c) => c.status === 'done').map((c) => c.id)).toEqual(['CB-002'])
  })

  test('1 · still works when a chat was already pending', () => {
    const pending = reduce(s0(), { type: 'chat/startService', service: 'medicine' })
    const s = run(pending, ...groceries)
    expect(s.cases.find((c) => c.kind === 'request' && c.service === 'groceries')?.status).toBe('await_family')
  })

  test('2 · medicine reminder is due and unchanged', () => {
    const before = seed(Date.UTC(2026, 9, 18, 0, 0)) // 07:00 Vietnam, before the 07:30 medicine reminder
    const s = { ...before, now: before.reminders.find((r) => r.id === 'r1')!.dueAt }
    expect(reminderStatus(s.reminders.find((r) => r.id === 'r1')!, s.now)).toBe('due')
    expect(s.reminders.map((r) => [r.title, r.note])).toEqual(before.reminders.map((r) => [r.title, r.note]))
    expect(s.cases).toHaveLength(before.cases.length)
  })

  test('3 · refusal is recorded and nothing is re-booked', () => {
    const s = run(s0(), { type: 'chat/startService', service: 'daily_help' }, say('Thôi, bác không cần nữa'))
    const help = s.cases.filter((c): c is RequestCase => c.kind === 'request' && c.service === 'daily_help')
    expect(help).toHaveLength(1)
    expect(help[0].status).toBe('refused')
  })

  test('4 · over-threshold creates a to_verify alert with no diagnosis', () => {
    const ev = events(run(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })).at(-1)!
    expect(ev).toMatchObject({ status: 'to_verify', priority: 'priority' })
    expect(ev.detail).toContain('Chưa có kết luận y tế')
  })

  test('5 · disconnect shows missing data and never claims safety', () => {
    const s = run(s0(), { type: 'device/disconnect', deviceId: 'spo2' })
    expect(deviceStatus(s.devices.find((d) => d.id === 'spo2')!, s.now)).toBe('missing')
    expect(events(s).some((e) => e.priority === 'uncertain')).toBe(true)
    for (const n of s.notifications)
      if (n.text.includes('an toàn')) expect(n.text).toContain('Không kết luận')
  })

  test('6 · two misunderstandings hand off with both utterances', () => {
    const s = run(s0(), clear, say('abc xyz'), say('ừm cái kia ấy'))
    const ev = events(s).find((e) => e.priority === 'uncertain')!
    expect(ev.unclear).toHaveLength(2)
    expect(requests(s)).toHaveLength(0)
  })

  test('7 · emergency fires on the first action', () => {
    const s = reduce(s0(), say('Tôi bị đau ngực quá'))
    expect(s.emergency).not.toBeNull()
    const ev = events(s).find((e) => e.priority === 'emergency')!
    expect(ev.status).toBe('to_verify')
    expect(s.notifications.filter((n) => n.caseId === ev.id)).toHaveLength(1)
  })

  test('8 · dose change is refused and routed to a doctor', () => {
    const before = s0()
    const s = run(before, clear, say('Cho bác tăng liều thuốc huyết áp'))
    expect(s.chat.messages.filter((m) => m.from === 'ai').at(-1)!.text).toContain('bác sĩ')
    expect(s.reminders).toEqual(before.reminders)
    expect(events(s).some((e) => e.priority === 'normal')).toBe(true)
  })
})

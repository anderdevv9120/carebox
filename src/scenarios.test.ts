import { describe, expect, test } from 'vitest'
import { seed } from './state/seed'
import { seedBare } from './state/testing'
import { SERVICE_FIELDS } from './state/assistant'
import { reduce, type Action } from './state/reducer'
import { tick } from './state/clock'
import { STALE_AFTER, deviceStatus } from './state/devices'
import { reminderStatus } from './state/reminders'
import { MIN, notificationsFor } from './state/helpers'
import type { DeviceKind, EventCase, RequestCase, State } from './state/types'

const s0 = () => seedBare(Date.UTC(2026, 9, 18, 5, 0)) // 12:00 Vietnam
const say = (text: string): Action => ({ type: 'chat/say', text })
const clear: Action = { type: 'chat/clear' }
const run = (s: State, ...as: Action[]) => as.reduce(reduce, s)
const fresh = (s: State) => s.cases.slice(2)
const events = (s: State) => fresh(s).filter((c): c is EventCase => c.kind === 'event')
const requests = (s: State) => fresh(s).filter((c): c is RequestCase => c.kind === 'request')
const lastAi = (s: State) => s.chat.messages.filter((m) => m.from === 'ai').at(-1)!.text
const forCase = (s: State, id: string, to: 'family' | 'staff') => notificationsFor(s, to).filter((n) => n.caseId === id)

// Scenarios and pass criteria are from doc.pdf §8. Paraphrases must behave like the doc's example.
// The elder opens with `first`, then answers whatever is asked and confirms.
const answers: Record<string, string> = { danh_sach: 'Rau, trứng, sữa', thoi_gian: 'Sáng mai', noi_dung: 'Uống thuốc huyết áp' }
function converse(s: State, first: string): State {
  let out = run(s, clear, say(first))
  for (let i = 0; i < 5 && out.chat.pending?.stage === 'collect'; i++) out = reduce(out, say(answers[out.chat.pending.field!] ?? 'Sáng mai'))
  return reduce(out, say('Đúng rồi'))
}
const groceries = (first: string) => converse(s0(), first)

describe('doc §8 scenarios', () => {
  test.each(['Bác muốn đi chợ', 'Mua giúp bác ít gạo', 'Mua đồ ăn sáng mai'])('1 · %s → staff queue, never done', (first) => {
    const s = groceries(first)
    const [r] = requests(s)
    expect(requests(s)).toHaveLength(1)
    expect(r).toMatchObject({ service: 'groceries', status: 'await_staff', owner: 'staff' })
    for (const f of SERVICE_FIELDS.groceries) expect(r.fields[f.key], f.key).toBeTruthy()
    expect(forCase(s, r.id, 'staff')).toHaveLength(1)
    expect(forCase(s, r.id, 'family')).toHaveLength(1)
    expect(s.cases.filter((c) => c.status === 'done').map((c) => c.id)).toEqual(['CB-002'])
    expect(lastAi(s)).toContain('chưa hoàn tất')
  })

  test('1 · still works when a chat was already pending', () => {
    const pending = reduce(s0(), { type: 'chat/startService', service: 'medicine' })
    const s = converse(pending, 'Bác muốn đi chợ')
    expect(s.cases.find((c) => c.kind === 'request' && c.service === 'groceries')?.status).toBe('await_staff')
  })

  test('2 · medicine reminder is due and unchanged', () => {
    const before = seed(Date.UTC(2026, 9, 18, 0, 0)) // 07:00 Vietnam, before the 07:30 medicine reminder
    const due = before.reminders.find((r) => r.id === 'r1')!.dueAt
    const s = tick(before, due).state
    expect(reminderStatus(s.reminders.find((r) => r.id === 'r1')!, s.now)).toBe('due')
    expect(s.reminders.map((r) => [r.title, r.note])).toEqual(before.reminders.map((r) => [r.title, r.note]))
    expect(s.cases.filter((c) => c.kind === 'request')).toEqual(before.cases.filter((c) => c.kind === 'request'))
  })

  test('2 · "Nhắc bác uống thuốc huyết áp lúc 9h" → staff-owned add_reminder, reminders unchanged', () => {
    const s = run(s0(), clear, say('Nhắc bác uống thuốc huyết áp lúc 9h'), say('Đúng rồi'))
    expect(requests(s)).toHaveLength(1)
    expect(requests(s)[0]).toMatchObject({ service: 'add_reminder', status: 'await_staff', owner: 'staff' })
    expect(s.reminders).toEqual(s0().reminders)
  })

  describe('3 · refusal', () => {
    const starts = (...texts: string[]) => run(s0(), clear, say('Bác muốn đi chợ'), ...texts.map(say))

    test.each(['Thôi', 'Không cần'])('%s → refused, nothing stored, no new request', (no) => {
      const s = starts(no)
      expect(requests(s)).toHaveLength(1)
      const [r] = requests(s)
      expect(r.status).toBe('refused')
      expect(r.history.at(-1)!.by).toBe('elder')
      expect(Object.values(r.fields)).toEqual([])
      expect(s.chat.pending).toBeNull()
    })

    test.each(['Không', 'Không muốn', 'Không phải', 'Không muốn nữa'])('first-question %s → refused, never stored as an answer', (no) => {
      const s = starts(no)
      const [r] = requests(s)
      expect(requests(s)).toHaveLength(1)
      expect(r.status).toBe('refused')
      expect(Object.values(r.fields)).not.toContain('Không')
      expect(Object.values(r.fields)).toEqual([])
    })

    test('assigned then cancelled → staff notified, history mentions the Care Partner', () => {
      const done = groceries('Bác muốn đi chợ')
      const id = requests(done)[0].id
      const assigned = run(done, { type: 'staff/verify', id, note: 'Đã gọi bác' }, { type: 'staff/assign', id, partner: 'Anh Tuấn' })
      const s = reduce(assigned, { type: 'request/cancel', id })
      const r = requests(s)[0]
      expect(requests(s)).toHaveLength(1)
      expect(r.status).toBe('refused')
      expect(r.history.map((h) => h.text).join(' ')).toContain('Care Partner')
      expect(forCase(s, id, 'staff').length).toBeGreaterThan(forCase(assigned, id, 'staff').length)
    })
  })

  test('4 · over-threshold → staff-owned to_verify, no diagnosis, both audiences told', () => {
    const s = reduce(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    const [ev] = events(s)
    expect(events(s)).toHaveLength(1)
    expect(ev).toMatchObject({ status: 'to_verify', owner: 'staff', priority: 'priority', source: 'device' })
    expect(ev.detail).toContain('Chưa có kết luận y tế')
    expect(forCase(s, ev.id, 'staff')).toHaveLength(1)
    expect(forCase(s, ev.id, 'family')).toHaveLength(1)
  })

  describe('5 · missing data', () => {
    const stale = (s: State, id: DeviceKind): State => ({
      ...s,
      devices: s.devices.map((d) => (d.id === id ? { ...d, readings: [...d.readings.slice(0, -1), { ...d.readings.at(-1)!, at: s.now - (STALE_AFTER + 1) * MIN }] } : d)),
    })
    const twoTicks = (s: State) => tick(tick(s, s.now).state, s.now).state
    const missing = (s: State, id: DeviceKind) => events(s).filter((e) => e.deviceId === id)

    test.each([
      ['disconnect', (s: State) => reduce(s, { type: 'device/disconnect', deviceId: 'bp' })],
      ['stale', (s: State) => stale(s, 'bp')],
    ])('%s → one uncertain staff event across two ticks', (_n, make) => {
      const s = twoTicks(make(s0()))
      const [ev] = missing(s, 'bp')
      expect(missing(s, 'bp')).toHaveLength(1)
      expect(ev).toMatchObject({ owner: 'staff', status: 'to_verify', priority: 'uncertain', source: 'device' })
      expect(deviceStatus(s.devices.find((d) => d.id === 'bp')!, s.now)).toBe('missing')
      expect(forCase(s, ev.id, 'staff')).toHaveLength(1)
      expect(forCase(s, ev.id, 'family')).toHaveLength(1)
    })

    test('one event per device, and no notification says "an toàn" without "Không kết luận"', () => {
      const s = twoTicks(stale(reduce(s0(), { type: 'device/disconnect', deviceId: 'spo2' }), 'bp'))
      expect(missing(s, 'spo2')).toHaveLength(1)
      expect(missing(s, 'bp')).toHaveLength(1)
      for (const e of events(s)) expect(e.detail).toContain('Không kết luận')
      for (const n of s.notifications) if (n.text.includes('an toàn')) expect(n.text).toContain('Không kết luận')
    })
  })

  describe('6 · unclear → staff', () => {
    const check = (s: State, utterances: string[]) => {
      const [ev] = events(s)
      expect(events(s)).toHaveLength(1)
      expect(ev).toMatchObject({ owner: 'staff', status: 'to_verify', priority: 'uncertain' })
      expect(ev.unclear).toEqual(utterances)
      expect(forCase(s, ev.id, 'staff')).toHaveLength(1)
      expect(forCase(s, ev.id, 'family')).toHaveLength(1)
      expect(requests(s)).toHaveLength(0)
    }

    test('keyword path: two misses → one event holding both utterances', () => {
      check(run(s0(), clear, say('abc xyz'), say('ừm cái kia ấy')), ['abc xyz', 'ừm cái kia ấy'])
    })

    test('"Gặp nhân viên" → one event, no request', () => {
      check(run(s0(), clear, { type: 'chat/handoff' }), ['Người cao tuổi chọn gặp nhân viên'])
    })
  })

  test.each([
    'Tôi bị đau ngực quá', 'Bác bị mất ý thức', 'Tôi bị khó thở', 'Miệng bác bị méo miệng', 'Bác bị yếu nửa người', 'Bác nói ngọng', 'Bác bị ngã chảy máu',
  ])('7 · "%s" → emergency on the first action, both audiences', (text) => {
    // a pending confirmation must not delay it
    const before = reduce(s0(), { type: 'chat/startService', service: 'groceries' })
    const s = reduce(before, say(text))
    expect(s.emergency).not.toBeNull()
    expect(s.chat.pending).toBeNull()
    const ev = events(s).find((e) => e.priority === 'emergency')!
    expect(ev.status).toBe('to_verify')
    expect(forCase(s, ev.id, 'staff')).toHaveLength(1)
    expect(forCase(s, ev.id, 'family')).toHaveLength(1)
    // the red bar stays until someone acknowledges it
    expect(run(s, say('Bác ổn rồi'), { type: 'notif/readAll', to: 'family' }).emergency).not.toBeNull()
  })

  describe('8 · dose and medicine decisions', () => {
    test.each(['Cho bác tăng liều thuốc huyết áp', 'uống thêm 2 viên', 'ngừng thuốc huyết áp', 'kê đơn cho bác', 'dừng thuốc huyết áp'])(
      '"%s" → doctor, staff event, reminders unchanged',
      (text) => {
        const before = s0()
        const s = run(before, clear, say(text))
        expect(lastAi(s)).toContain('bác sĩ')
        expect(events(s)).toHaveLength(1)
        expect(events(s)[0]).toMatchObject({ owner: 'staff', status: 'to_verify' })
        expect(s.reminders).toEqual(before.reminders)
        expect(requests(s)).toHaveLength(0)
      },
    )

    test('"uống thêm nước" is not a dose request', () => {
      const s = run(s0(), clear, say('uống thêm nước'))
      expect(events(s)).toHaveLength(0)
      expect(lastAi(s)).not.toContain('không thể thay đổi thuốc')
    })
  })
})

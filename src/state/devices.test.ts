import { describe, expect, test } from 'vitest'
import { seedBare } from './testing'
import { reduce } from './reducer'
import { MIN } from './helpers'
import { STALE_AFTER, deviceStatus, evaluate, hasOpenMissing, sweepDevices } from './devices'
import { tick } from './clock'
import type { EventCase, State } from './types'

const s0 = () => seedBare(Date.UTC(2026, 9, 18, 5, 0)) // 12:00 Vietnam
const dev = (s: State, id: string) => s.devices.find((d) => d.id === id)!
const events = (s: State) => s.cases.filter((c): c is EventCase => c.kind === 'event')

describe('evaluate', () => {
  test('evaluate classifies against simulated thresholds', () => {
    expect(evaluate('bp', [165, 100])).toBe('attention')
    expect(evaluate('bp', [124, 80])).toBe('normal')
    expect(evaluate('bp', [300, 20])).toBe('suspicious')
    expect(evaluate('spo2', 89)).toBe('attention')
    expect(evaluate('hr', 0)).toBe('suspicious')
    expect(evaluate('glucose', 5.6)).toBe('normal')
  })
})

describe('deviceStatus', () => {
  test('deviceStatus is missing when disconnected, and when the last reading is older than 360 min', () => {
    const s = s0()
    expect(deviceStatus(dev(s, 'bp'), s.now)).toBe('normal')
    expect(deviceStatus({ ...dev(s, 'bp'), connected: false }, s.now)).toBe('missing')
    const last = dev(s, 'bp').readings.at(-1)!.at
    expect(deviceStatus(dev(s, 'bp'), last + 361 * MIN)).toBe('missing')
  })

  test('fall device is normal when connected and missing when disconnected', () => {
    const s = s0()
    expect(deviceStatus(dev(s, 'fall'), s.now)).toBe('normal')
    expect(deviceStatus({ ...dev(s, 'fall'), connected: false }, s.now)).toBe('missing')
  })
})

describe('device actions', () => {
  test('push high creates a to_verify event with the exact detail copy and no diagnosis words', () => {
    const out = reduce(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' })
    const ev = events(out)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ status: 'to_verify', priority: 'priority', source: 'device', deviceId: 'bp' })
    expect(ev[0].detail).toBe('Dữ liệu giả lập vượt ngưỡng đã cấu hình. Chưa có kết luận y tế và chưa xác nhận nguyên nhân.')
    expect(dev(out, 'bp').readings.at(-1)).toEqual({ at: out.now, value: [165, 100] })
    expect(deviceStatus(dev(out, 'bp'), out.now)).toBe('attention')
  })

  test('push normal creates no event', () => {
    const out = reduce(s0(), { type: 'device/push', deviceId: 'hr', mode: 'normal' })
    expect(events(out)).toHaveLength(0)
  })

  test('push suspicious creates an uncertain event and notifies staff and family', () => {
    const before = s0()
    const out = reduce(before, { type: 'device/push', deviceId: 'spo2', mode: 'suspicious' })
    expect(events(out)[0]).toMatchObject({ priority: 'uncertain', title: 'Dữ liệu đáng nghi' })
    const fresh = out.notifications.slice(before.notifications.length)
    expect(fresh.map((n) => [n.to, n.caseId])).toEqual([['staff', events(out)[0].id], ['family', events(out)[0].id]])
  })

  test('disconnect creates an uncertain event and status missing', () => {
    const out = reduce(s0(), { type: 'device/disconnect', deviceId: 'spo2' })
    expect(deviceStatus(dev(out, 'spo2'), out.now)).toBe('missing')
    expect(events(out)[0]).toMatchObject({ priority: 'uncertain', deviceId: 'spo2' })
    expect(events(out)[0].detail).toContain('Không kết luận người dùng an toàn')
  })

  test('reconnect restores connected', () => {
    const out = reduce(reduce(s0(), { type: 'device/disconnect', deviceId: 'spo2' }), { type: 'device/reconnect', deviceId: 'spo2' })
    expect(dev(out, 'spo2').connected).toBe(true)
  })
})

describe('stale-device sweep', () => {
  const staleBp = (): State => {
    const s = s0()
    return { ...s, devices: s.devices.map((d) => (d.id === 'bp' ? { ...d, readings: [...d.readings.slice(0, -1), { ...d.readings.at(-1)!, at: s.now - (STALE_AFTER + 1) * MIN }] } : d)) }
  }
  const missing = (s: State) => events(s).filter((e) => e.title.startsWith('Thiếu dữ liệu') || e.title.startsWith('Thiết bị mất kết nối'))

  test('stale reading creates one missing event across repeated ticks', () => {
    const first = tick(staleBp(), staleBp().now)
    const second = tick(first.state, first.state.now)
    expect(first.changed).toBe(true)
    expect(events(second.state).filter((e) => e.title === 'Thiếu dữ liệu: Máy đo huyết áp')).toHaveLength(1)
    expect(second.state.cases).toBe(first.state.cases)
    expect(second.changed).toBe(false)
    const ev = events(second.state)[0]
    expect(ev).toMatchObject({
      owner: 'staff', status: 'to_verify', priority: 'uncertain', source: 'device', deviceId: 'bp', priorityReason: 'Dữ liệu thiết bị bị gián đoạn',
      detail: 'Thiết bị chưa gửi dữ liệu mới. Không kết luận người dùng an toàn.',
    })
    const fresh = second.state.notifications.filter((n) => n.caseId === ev.id)
    expect(fresh.map((n) => n.to).sort()).toEqual(['family', 'staff'])
  })

  test('disconnect while a stale event is open creates no second missing event', () => {
    const swept = tick(staleBp(), staleBp().now).state
    expect(missing(swept)).toHaveLength(1)
    const out = reduce(swept, { type: 'device/disconnect', deviceId: 'bp' })
    expect(missing(out)).toHaveLength(1)
    expect(dev(out, 'bp').connected).toBe(false)
    expect(missing(tick(out, out.now).state)).toHaveLength(1)
  })

  test('hasOpenMissing sees open missing events only, for that device', () => {
    const swept = tick(staleBp(), staleBp().now).state
    expect(hasOpenMissing(swept, 'bp')).toBe(true)
    expect(hasOpenMissing(swept, 'hr')).toBe(false)
    const closed = reduce(reduce(swept, { type: 'staff/takeEvent', id: 'EVT-001' }), { type: 'staff/resolveEvent', id: 'EVT-001', note: 'Đã kiểm tra máy' })
    expect(hasOpenMissing(closed, 'bp')).toBe(false)
    expect(hasOpenMissing(reduce(s0(), { type: 'device/push', deviceId: 'bp', mode: 'high' }), 'bp')).toBe(false) // a threshold alert is not a missing one
  })

  test('sweep skips disconnected devices (they have their own event) and the fall sensor', () => {
    const s = s0()
    const out = sweepDevices({ ...s, devices: s.devices.map((d) => (d.id === 'bp' ? { ...d, connected: false } : d)) })
    expect(events(out)).toHaveLength(0)
    expect(sweepDevices(s)).toBe(s)
  })
})

import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce } from './reducer'
import { MIN } from './helpers'
import { deviceStatus, evaluate } from './devices'
import type { EventCase, State } from './types'

const s0 = () => seed(new Date(2026, 9, 18, 12, 0))
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

  test('push suspicious creates an uncertain event', () => {
    const out = reduce(s0(), { type: 'device/push', deviceId: 'spo2', mode: 'suspicious' })
    expect(events(out)[0]).toMatchObject({ priority: 'uncertain', title: 'Dữ liệu đáng nghi' })
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

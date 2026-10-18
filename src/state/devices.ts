import { MIN, createEvent, notify } from './helpers.js'
import { raiseEmergency } from './cases.js'
import type { Device, DeviceKind, DeviceStatus, Reading, State } from './types.js'

type Metric = Exclude<DeviceKind, 'fall'>
type Range = [number, number]

// ponytail: one simulated threshold set for everyone ("ngưỡng giả lập"); real thresholds come from a clinician per person.
export const THRESHOLDS = { bp: { sys: [90, 140] as Range, dia: [60, 90] as Range }, hr: [50, 100] as Range, glucose: [3.9, 7.8] as Range, spo2: [94, 100] as Range }
export const PLAUSIBLE = { bp: { sys: [60, 250] as Range, dia: [30, 150] as Range }, hr: [25, 220] as Range, glucose: [1, 35] as Range, spo2: [50, 100] as Range }
export const STALE_AFTER = 360 // demo minutes
export const SIM_VALUES: Record<'normal' | 'high' | 'suspicious', Record<Metric, Reading['value']>> = {
  normal: { bp: [124, 80], hr: 74, glucose: 5.6, spo2: 97 },
  high: { bp: [165, 100], hr: 128, glucose: 11.2, spo2: 89 },
  suspicious: { bp: [300, 20], hr: 0, glucose: 0.2, spo2: 105 },
}

const inside = (v: number, [lo, hi]: Range) => v >= lo && v <= hi

export function evaluate(kind: Metric, value: Reading['value']): 'normal' | 'attention' | 'suspicious' {
  if (kind === 'bp') {
    if (!Array.isArray(value)) return 'suspicious'
    const [sys, dia] = value
    if (!inside(sys, PLAUSIBLE.bp.sys) || !inside(dia, PLAUSIBLE.bp.dia)) return 'suspicious'
    return inside(sys, THRESHOLDS.bp.sys) && inside(dia, THRESHOLDS.bp.dia) ? 'normal' : 'attention'
  }
  if (typeof value !== 'number' || !inside(value, PLAUSIBLE[kind])) return 'suspicious'
  return inside(value, THRESHOLDS[kind]) ? 'normal' : 'attention'
}

export function deviceStatus(d: Device, now: number): DeviceStatus {
  if (!d.connected) return 'missing'
  if (d.id === 'fall') return 'normal'
  const last = d.readings.at(-1)
  if (!last || now - last.at > STALE_AFTER * MIN) return 'missing'
  return evaluate(d.id, last.value)
}

const patchDevice = (s: State, id: DeviceKind, p: (d: Device) => Partial<Device>): State => ({
  ...s,
  devices: s.devices.map((d) => (d.id === id ? { ...d, ...p(d) } : d)),
})

export function pushReading(s: State, id: Metric, mode: 'normal' | 'high' | 'suspicious'): State {
  const value = SIM_VALUES[mode][id]
  let out = patchDevice(s, id, (d) => ({ connected: true, readings: [...d.readings, { at: s.now, value }] }))
  const result = evaluate(id, value)
  if (result === 'normal') return out
  const name = s.devices.find((d) => d.id === id)!.name
  let evId: string
  if (result === 'attention') {
    ;[out, evId] = createEvent(out, {
      title: 'Dữ liệu thiết bị vượt ngưỡng',
      detail: 'Dữ liệu giả lập vượt ngưỡng đã cấu hình. Chưa có kết luận y tế và chưa xác nhận nguyên nhân.',
      priority: 'priority', priorityReason: `${name}: vượt ngưỡng giả lập`, source: 'device', deviceId: id,
    })
    return notify(out, `${name}: dữ liệu vượt ngưỡng đã cấu hình. Cần gia đình xem, chưa có kết luận y tế.`, 'health', 'device', evId)
  }
  ;[out, evId] = createEvent(out, {
    title: 'Dữ liệu đáng nghi',
    detail: 'Dữ liệu có thể sai do đo hoặc truyền dẫn. Cần kiểm tra nguồn, đo lại nếu phù hợp.',
    priority: 'uncertain', priorityReason: `${name}: giá trị ngoài khoảng hợp lý`, source: 'device', deviceId: id,
  })
  return notify(out, `${name}: dữ liệu đáng nghi, cần kiểm tra nguồn.`, 'health', 'device', evId)
}

export function disconnect(s: State, id: DeviceKind): State {
  const d = s.devices.find((x) => x.id === id)
  if (!d || !d.connected) return s
  let out = patchDevice(s, id, () => ({ connected: false }))
  let evId: string
  ;[out, evId] = createEvent(out, {
    title: `Thiết bị mất kết nối: ${d.name}`,
    detail: 'Không đủ dữ liệu. Không kết luận người dùng an toàn.',
    priority: 'uncertain', priorityReason: 'Dữ liệu thiết bị bị gián đoạn', source: 'device', deviceId: id,
  })
  return notify(out, `${d.name} mất kết nối. Không đủ dữ liệu. Không kết luận người dùng an toàn.`, 'health', 'device', evId)
}

export function reconnect(s: State, id: DeviceKind): State {
  return patchDevice(s, id, () => ({ connected: true }))
}

export function reportFall(s: State): State {
  const out = patchDevice(s, 'fall', (d) => ({ readings: [...d.readings, { at: s.now, value: 'fall' }] }))
  return raiseEmergency(out, 'Thiết bị báo té ngã', 'Thiết bị phát hiện té ngã gửi tín hiệu. Chưa xác nhận mức độ chấn thương.', 'device')
}

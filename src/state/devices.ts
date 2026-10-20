import { MIN, createEvent, fmtValue, notifyAlert } from './helpers.js'
import { raiseEmergency } from './cases.js'
import type { Device, DeviceKind, DeviceStatus, EventCase, Reading, State } from './types.js'

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
  const last = lastDeviceReading(d)
  if (!last || now - last.at > STALE_AFTER * MIN) return 'missing'
  return evaluate(d.id, last.value)
}

const patchDevice = (s: State, id: DeviceKind, p: (d: Device) => Partial<Device>): State => ({
  ...s,
  devices: s.devices.map((d) => (d.id === id ? { ...d, ...p(d) } : d)),
})

export function pushReading(s: State, id: Metric, mode: 'normal' | 'high' | 'suspicious'): State {
  return recordReading(s, id, SIM_VALUES[mode][id], 'device')
}

const lastDeviceReading = (d: Device) => d.readings.findLast((r) => r.source !== 'elder')

export function validManualReading(id: Metric, value: unknown): value is number | [number, number] {
  const valid = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max
  return id === 'bp' ? Array.isArray(value) && value.length === 2 && valid(value[0], PLAUSIBLE.bp.sys[1]) && valid(value[1], PLAUSIBLE.bp.dia[1]) && value[0] > value[1] : valid(value, PLAUSIBLE[id][1])
}

export function manualReading(s: State, id: Metric, value: number | [number, number]): State {
  if (!validManualReading(id, value)) throw new Error('Chỉ số ngoài khoảng cho phép nhập. Huyết áp cần tâm thu lớn hơn tâm trương; SpO₂ không vượt quá 100%.')
  return recordReading(s, id, value, 'elder')
}

function recordReading(s: State, id: Metric, value: Reading['value'], source: 'elder' | 'device'): State {
  let out = patchDevice(s, id, (d) => ({ connected: source === 'device' ? true : d.connected, readings: [...d.readings, source === 'elder' ? { at: s.now, value, source } : { at: s.now, value }] }))
  const result = evaluate(id, value)
  if (result === 'normal') return out
  const name = s.devices.find((d) => d.id === id)!.name
  let evId: string
  if (result === 'attention') {
    ;[out, evId] = createEvent(out, {
      title: source === 'elder' ? 'Chỉ số nhập tay vượt ngưỡng' : 'Dữ liệu thiết bị vượt ngưỡng',
      detail: source === 'elder' ? `Người cao tuổi nhập ${fmtValue(value)}. Chỉ số vượt ngưỡng giả lập; cần kiểm tra lại, chưa có kết luận y tế.` : 'Dữ liệu giả lập vượt ngưỡng đã cấu hình. Chưa có kết luận y tế và chưa xác nhận nguyên nhân.',
      priority: 'priority', priorityReason: `${name}: vượt ngưỡng giả lập`, source, deviceId: id,
    })
    return notifyAlert(out, `${name}: ${source === 'elder' ? 'chỉ số nhập tay' : 'dữ liệu'} vượt ngưỡng đã cấu hình, chưa có kết luận y tế.`, 'health', source, evId)
  }
  ;[out, evId] = createEvent(out, {
    title: 'Dữ liệu đáng nghi',
    detail: source === 'elder' ? `Người cao tuổi nhập ${fmtValue(value)}. Giá trị ngoài khoảng hợp lý; cần kiểm tra và nhập lại.` : 'Dữ liệu có thể sai do đo hoặc truyền dẫn. Cần kiểm tra nguồn, đo lại nếu phù hợp.',
    priority: 'uncertain', priorityReason: `${name}: giá trị ngoài khoảng hợp lý`, source, deviceId: id,
  })
  return notifyAlert(out, `${name}: ${source === 'elder' ? 'chỉ số nhập tay' : 'dữ liệu'} đáng nghi, cần kiểm tra nguồn.`, 'health', source, evId)
}

const MISSING_TITLE = /^(Thiết bị mất kết nối|Thiếu dữ liệu)/
const missingEvents = (s: State, id: DeviceKind) => s.cases.filter((c): c is EventCase => c.kind === 'event' && c.deviceId === id && MISSING_TITLE.test(c.title))

// An open "mất kết nối" / "thiếu dữ liệu" event for this device: a second one adds nothing.
export const hasOpenMissing = (s: State, id: DeviceKind) => missingEvents(s, id).some((c) => c.status !== 'resolved')

// Staff closed the same gap (the last log entry is the closing one) after the last reading: only new data re-arms the sweep.
// A resolved disconnect does not count: the device came back and then went silent.
const closedSinceLastReading = (s: State, d: Device) =>
  missingEvents(s, d.id).some((c) => c.status === 'resolved' && c.title.startsWith('Thiếu dữ liệu') && c.history.at(-1)!.at > (lastDeviceReading(d)?.at ?? 0))

export function disconnect(s: State, id: DeviceKind): State {
  const d = s.devices.find((x) => x.id === id)
  if (!d || !d.connected) return s
  const out = patchDevice(s, id, () => ({ connected: false }))
  return hasOpenMissing(s, id) ? out : missingEvent(out, d, 'Thiết bị mất kết nối', 'Không đủ dữ liệu. Không kết luận người dùng an toàn.', `${d.name} mất kết nối. Không đủ dữ liệu. Không kết luận người dùng an toàn.`)
}

// ponytail: the fall sensor streams no readings, so it is never "stale": deviceStatus only calls it missing once disconnected.
export function sweepDevices(s: State): State {
  let out = s
  for (const d of s.devices)
    if (d.connected && deviceStatus(d, s.now) === 'missing' && !hasOpenMissing(out, d.id) && !closedSinceLastReading(out, d))
      out = missingEvent(out, d, 'Thiếu dữ liệu', 'Thiết bị chưa gửi dữ liệu mới. Không kết luận người dùng an toàn.', `${d.name}: chưa gửi dữ liệu mới. Không kết luận người dùng an toàn.`)
  return out
}

function missingEvent(s: State, d: Device, title: string, detail: string, text: string): State {
  const [out, evId] = createEvent(s, {
    title: `${title}: ${d.name}`, detail,
    priority: 'uncertain', priorityReason: 'Dữ liệu thiết bị bị gián đoạn', source: 'device', deviceId: d.id,
  })
  return notifyAlert(out, text, 'health', 'device', evId)
}

export function reconnect(s: State, id: DeviceKind): State {
  return patchDevice(s, id, () => ({ connected: true }))
}

export function reportFall(s: State): State {
  const out = patchDevice(s, 'fall', (d) => ({ readings: [...d.readings, { at: s.now, value: 'fall' }] }))
  return raiseEmergency(out, 'Thiết bị báo té ngã', 'Thiết bị phát hiện té ngã gửi tín hiệu. Chưa xác nhận mức độ chấn thương.', 'device')
}

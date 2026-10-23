import { MIN, atVN, vnDay } from './helpers.js'
import type { Device, Reading, Reminder, State } from './types.js'

const HOUR = 60 * MIN
const DAY = 24 * HOUR

// One reading a day for the past week, the latest an hour before the reset.
function week(now: number, values: Reading['value'][]): Reading[] {
  return values.map((value, i) => ({ at: now - HOUR - (6 - i) * DAY, value }))
}

// Times are relative to the reset moment so the demo reads as recent at any hour.
export const GREETING = 'Bác cần CAREBOX hỗ trợ gì ạ? Bác có thể nói yêu cầu, hỏi lịch hoặc nhờ liên hệ người thân.'

export function seed(now: number): State {
  const t = (hhmm: string) => atVN(now, hhmm)
  const schedule: Reminder[] = [
    { id: 'r1', dueAt: t('07:30'), title: 'Uống thuốc huyết áp', note: 'Theo đơn bác sĩ đã được gia đình cung cấp', kind: 'medicine', daily: true },
    { id: 'r2', dueAt: t('08:00'), title: 'Ăn sáng', note: '', kind: 'meal', daily: true },
    { id: 'r3', dueAt: t('09:00'), title: 'Đi khám định kỳ', note: 'Bệnh viện E, Cầu Giấy', kind: 'clinic', daily: true },
    { id: 'r4', dueAt: t('12:00'), title: 'Uống thuốc bổ', note: 'Theo đơn bác sĩ đã được gia đình cung cấp', kind: 'medicine', daily: true },
    { id: 'r5', dueAt: t('16:00'), title: 'Đi dạo', note: 'Công viên Nghĩa Đô', kind: 'activity', daily: true },
  ]
  // Past times count as answered so a reset never bursts into "Chưa có xác nhận" alerts.
  const reminders: Reminder[] = [
    ...schedule.map((r) => (r.dueAt < now ? { ...r, response: 'received' as const, respondedAt: r.dueAt } : r)),
    { id: 'r-demo', dueAt: now + 3 * MIN, title: 'Uống thuốc theo đơn', note: 'Theo lịch nhắc đã cài đặt', kind: 'medicine' },
  ]
  const devices: Device[] = [
    { id: 'bp', name: 'Máy đo huyết áp', unit: 'mmHg', connected: true,
      readings: [...week(now, [[126, 80], [122, 78], [130, 82], [124, 79], [128, 83], [125, 80], [127, 81]]), { at: now - 10 * MIN, value: [165, 100] }] }, // the reading behind EVT-001
    { id: 'hr', name: 'Thiết bị đo nhịp tim', unit: 'bpm', connected: true, readings: week(now, [72, 75, 70, 74, 78, 73, 72]) },
    { id: 'glucose', name: 'Máy đo đường huyết', unit: 'mmol/L', connected: true, readings: week(now, [5.6, 5.9, 5.4, 6.1, 5.8, 5.5, 5.6]) },
    { id: 'spo2', name: 'Máy đo SpO₂', unit: '%', connected: true, readings: week(now, [97, 98, 97, 96, 97, 98, 98]) },
    { id: 'fall', name: 'Thiết bị phát hiện té ngã', unit: '', connected: true, readings: [] },
  ]
  return {
    version: 3,
    rev: 0,
    now,
    day: vnDay(now),
    elder: { name: 'Bà Nguyễn Thị Lan', age: 72, birthDate: '12/03/1954', phone: '0987 654 321', address: 'Quận Cầu Giấy, Hà Nội' },
    family: [{ name: 'Chị Minh', relation: 'Con gái', phone: '0901 234 567' }],
    staff: { name: 'Anh Nam', title: 'Nhân viên điều phối' },
    carePartners: ['Anh Tuấn', 'Chị Hoa'],
    reminders,
    devices,
    cases: [
      {
        id: 'EVT-001', kind: 'event', title: 'Dữ liệu thiết bị vượt ngưỡng', detail: 'Máy đo huyết áp ghi nhận chỉ số vượt ngưỡng đã cấu hình.',
        source: 'device', priority: 'priority', priorityReason: 'Dữ liệu vượt ngưỡng đã cấu hình', createdAt: now - 10 * MIN,
        status: 'to_verify', unclear: [], owner: 'staff', deviceId: 'bp',
        history: [{ at: now - 10 * MIN, by: 'device', text: 'Tạo cảnh báo, chờ nhân viên xem.' }],
      },
    ],
    notifications: [],
    chat: {
      messages: [{ id: 'n3', from: 'ai', at: now, text: GREETING }],
      pending: null,
      misses: 0,
      recentMisses: [],
    },
    emergency: null,
    seq: { cb: 1, evt: 2, n: 4 },
  }
}


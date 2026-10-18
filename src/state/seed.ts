import type { Device, Reading, Reminder, State } from './types'

const at = (day: Date, h: number, m: number, dayOffset = 0) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + dayOffset, h, m).getTime()

function week(today: Date, values: Reading['value'][]): Reading[] {
  return values.map((value, i) => ({ at: at(today, 6, 45, i - 6), value }))
}

export function seed(today: Date): State {
  const t = (h: number, m: number, d = 0) => at(today, h, m, d)
  const reminders: Reminder[] = [
    { id: 'r1', dueAt: t(7, 30), title: 'Uống thuốc huyết áp', note: 'Theo đơn bác sĩ đã được gia đình cung cấp', kind: 'medicine', daily: true },
    { id: 'r2', dueAt: t(8, 0), title: 'Ăn sáng', note: '', kind: 'meal', daily: true },
    { id: 'r3', dueAt: t(9, 0), title: 'Đi khám định kỳ', note: 'Bệnh viện E, Cầu Giấy', kind: 'clinic', daily: true },
    { id: 'r4', dueAt: t(12, 0), title: 'Uống thuốc bổ', note: 'Theo đơn bác sĩ đã được gia đình cung cấp', kind: 'medicine', daily: true },
    { id: 'r5', dueAt: t(16, 0), title: 'Đi dạo', note: 'Công viên Nghĩa Đô', kind: 'activity', daily: true },
  ]
  const devices: Device[] = [
    { id: 'bp', name: 'Máy đo huyết áp', unit: 'mmHg', connected: true,
      readings: week(today, [[126, 80], [122, 78], [130, 82], [124, 79], [128, 83], [125, 80], [127, 81]]) },
    { id: 'hr', name: 'Thiết bị đo nhịp tim', unit: 'bpm', connected: true, readings: week(today, [72, 75, 70, 74, 78, 73, 72]) },
    { id: 'glucose', name: 'Máy đo đường huyết', unit: 'mmol/L', connected: true, readings: week(today, [5.6, 5.9, 5.4, 6.1, 5.8, 5.5, 5.6]) },
    { id: 'spo2', name: 'Máy đo SpO₂', unit: '%', connected: true, readings: week(today, [97, 98, 97, 96, 97, 98, 98]) },
    { id: 'fall', name: 'Thiết bị phát hiện té ngã', unit: '', connected: true, readings: [] },
  ]
  return {
    version: 2,
    now: t(7, 0),
    elder: { name: 'Bà Nguyễn Thị Lan', age: 72, birthDate: '12/03/1954', phone: '0987 654 321', address: 'Quận Cầu Giấy, Hà Nội' },
    family: [{ name: 'Chị Minh', relation: 'Con gái', phone: '0901 234 567' }],
    reminders,
    devices,
    cases: [
      {
        id: 'CB-001', kind: 'request', service: 'medicine', title: 'Hỗ trợ lấy thuốc',
        detail: 'Bác muốn lấy thuốc huyết áp ở hiệu thuốc.', source: 'elder', priority: 'normal',
        priorityReason: 'Yêu cầu dịch vụ thông thường', createdAt: t(14, 30, -1),
        fields: { thuoc: 'Thuốc huyết áp' }, status: 'need_info', unclear: [],
        history: [{ at: t(14, 30, -1), by: 'ai', text: 'AI ghi nhận yêu cầu. Thiếu thông tin về địa điểm và thời gian.' }],
      },
      {
        id: 'CB-002', kind: 'request', service: 'clinic', title: 'Đi khám bệnh',
        detail: 'Hỗ trợ đưa bác đi khám định kỳ.', source: 'elder', priority: 'normal',
        priorityReason: 'Yêu cầu dịch vụ thông thường', createdAt: t(16, 0, -2),
        fields: { noi_kham: 'Bệnh viện E', thoi_gian: '08:30 hôm qua', di_lai: 'Cần người đưa đi bằng taxi' },
        status: 'done', unclear: [], acceptedAt: t(16, 25, -2), completedAt: t(11, 0, -1),
        doneBy: 'Chị Minh', doneNote: 'Đã đưa mẹ đi khám và về nhà.',
        history: [
          { at: t(16, 0, -2), by: 'ai', text: 'AI ghi nhận yêu cầu, bác đã xác nhận nội dung.' },
          { at: t(16, 25, -2), by: 'family', text: 'Chị Minh nhận việc.' },
          { at: t(11, 0, -1), by: 'family', text: 'Chị Minh báo đã xong: Đã đưa mẹ đi khám và về nhà.' },
        ],
      },
    ],
    notifications: [
      { id: 'n1', at: t(14, 30, -1), category: 'request', source: 'ai', caseId: 'CB-001', read: false,
        text: '14:30 – Yêu cầu lấy thuốc đã được ghi nhận. Chưa xác nhận có người thực hiện.' },
      { id: 'n2', at: t(11, 0, -1), category: 'request', source: 'family', caseId: 'CB-002', read: true,
        text: 'Đi khám bệnh: Chị Minh đã báo xong.' },
    ],
    chat: {
      messages: [{ id: 'n3', from: 'ai', at: t(7, 0),
        text: 'Bác cần CAREBOX hỗ trợ gì ạ? Bác có thể nói yêu cầu, hỏi lịch hoặc nhờ liên hệ người thân.' }],
      pending: null,
      misses: 0,
      recentMisses: [],
    },
    emergency: null,
    seq: { cb: 3, evt: 1, n: 4 },
  }
}


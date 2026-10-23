import { MIN, fmtTime } from './helpers.js'
import { seed } from './seed.js'
import type { State } from './types.js'

const DAY = 24 * 60 * MIN

// The seed plus illustrative requests CB-001..CB-003 and their notifications, for tests that act on existing requests.
export function seedDemo(now: number): State {
  const s = seed(now)
  const c1 = now - 20 * MIN
  return {
    ...s,
    cases: [
      {
        id: 'CB-001', kind: 'request', service: 'medicine', title: 'Hỗ trợ lấy thuốc',
        detail: 'Bác muốn lấy thuốc huyết áp ở hiệu thuốc.', source: 'elder', priority: 'normal',
        priorityReason: 'Yêu cầu dịch vụ thông thường', createdAt: c1,
        fields: { thuoc: 'Thuốc huyết áp' }, status: 'need_info', unclear: [], owner: 'staff',
        history: [{ at: c1, by: 'ai', text: 'AI ghi nhận yêu cầu. Thiếu thông tin về địa điểm và thời gian.' }],
      },
      {
        id: 'CB-002', kind: 'request', service: 'clinic', title: 'Đi khám bệnh',
        detail: 'Hỗ trợ đưa bác đi khám định kỳ.', source: 'elder', priority: 'normal',
        priorityReason: 'Yêu cầu dịch vụ thông thường', createdAt: now - 2 * DAY,
        fields: { noi_kham: 'Bệnh viện E', thoi_gian: '08:30 hôm qua', di_lai: 'Cần người đưa đi bằng taxi' },
        status: 'done', unclear: [], owner: 'staff', acceptedAt: now - 2 * DAY + 25 * MIN, completedAt: now - DAY,
        confirmedAt: now - 2 * DAY + 10 * MIN, verifiedBy: 'Anh Nam', verifiedAt: now - 2 * DAY + 15 * MIN,
        verifyNote: 'Đã gọi bác xác nhận lịch khám.', assignee: 'Anh Tuấn',
        partnerReport: 'Đã đưa bác đi khám và về nhà.', partnerReportAt: now - DAY - 30 * MIN,
        doneBy: 'Anh Nam',
        history: [
          { at: now - 2 * DAY, by: 'ai', text: 'AI ghi nhận yêu cầu, bác đã xác nhận nội dung.' },
          { at: now - 2 * DAY + 10 * MIN, by: 'staff', text: 'Anh Nam xác nhận lại với bác.' },
          { at: now - 2 * DAY + 15 * MIN, by: 'staff', text: 'Anh Nam đã xác minh yêu cầu.' },
          { at: now - 2 * DAY + 25 * MIN, by: 'staff', text: 'Anh Nam giao Care Partner Anh Tuấn.' },
          { at: now - DAY - 30 * MIN, by: 'staff', text: 'Anh Nam ghi nhận báo cáo của Care Partner Anh Tuấn: Đã đưa bác đi khám và về nhà.' },
          { at: now - DAY, by: 'staff', text: 'Anh Nam xác nhận hoàn tất.' },
        ],
      },
      {
        id: 'CB-003', kind: 'request', service: 'groceries', title: 'Đi chợ giúp bác',
        detail: 'Bác nhờ mua rau và trứng.', source: 'elder', priority: 'normal',
        priorityReason: 'Yêu cầu dịch vụ thông thường', createdAt: now - 15 * MIN,
        fields: { danh_sach: 'Rau cải, 10 quả trứng', thoi_gian: 'Sáng mai' },
        status: 'await_staff', unclear: [], owner: 'staff', confirmedAt: now - 12 * MIN,
        history: [
          { at: now - 15 * MIN, by: 'ai', text: 'AI ghi nhận yêu cầu.' },
          { at: now - 12 * MIN, by: 'elder', text: 'Bác đã xác nhận nội dung. Chờ nhân viên điều phối.' },
        ],
      },
      ...s.cases,
    ],
    notifications: [
      { id: 'n1', at: c1, to: 'family', category: 'request', source: 'ai', caseId: 'CB-001', read: false,
        text: `${fmtTime(c1)} – Yêu cầu lấy thuốc đã được ghi nhận. Chưa xác nhận có người thực hiện.` },
      { id: 'n2', at: now - DAY, to: 'family', category: 'request', source: 'staff', caseId: 'CB-002', read: true,
        text: 'Đi khám bệnh: nhân viên CAREBOX đã xác nhận hoàn tất.' },
      ...s.notifications,
    ],
    seq: { ...s.seq, cb: 4 },
  }
}

// The demo seed without its illustrative device event (and the BP reading behind it) and waiting CB-003, for tests that count events or expect the first new ones to be EVT-001 and CB-003.
export function seedBare(now: number): State {
  const s = seedDemo(now)
  const devices = s.devices.map((d) => (d.id === 'bp' ? { ...d, readings: d.readings.slice(0, -1) } : d))
  return { ...s, devices, cases: s.cases.filter((c) => c.kind !== 'event' && c.id !== 'CB-003'), seq: { ...s.seq, cb: 3, evt: 1 } }
}

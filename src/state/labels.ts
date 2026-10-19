import type { DeviceStatus, EventStatus, Priority, ReminderStatus, RequestStatus, ServiceType, Source } from './types.js'

// Copy is verbatim from doc.pdf where the doc names the state.
export const REQUEST_STATUS: Record<RequestStatus, string> = {
  need_info: 'Chờ bổ sung thông tin',
  await_confirm: 'Chờ xác nhận',
  await_family: 'Chờ gia đình nhận',
  await_staff: 'Chờ điều phối',
  in_progress: 'Đang xử lý',
  done: 'Hoàn tất',
  refused: 'Đã từ chối',
}

export const EVENT_STATUS: Record<EventStatus, string> = {
  to_verify: 'Cần xem',
  handling: 'Đang xử lý',
  resolved: 'Đã xử lý',
}

export const PRIORITY: Record<Priority, string> = {
  normal: 'Thông thường',
  priority: 'Cần chú ý',
  emergency: 'Khẩn cấp',
  uncertain: 'Chưa chắc chắn',
}

export const SOURCE: Record<Source, string> = {
  device: 'Thiết bị (giả lập)',
  elder: 'Người cao tuổi báo',
  family: 'Gia đình xác nhận',
  ai: 'AI tổng hợp',
  staff: 'Nhân viên xác minh',
}

export const SERVICE: Record<ServiceType, string> = {
  medicine: 'Mua thuốc',
  groceries: 'Đi chợ',
  clinic: 'Đi khám bệnh',
  daily_help: 'Hỗ trợ sinh hoạt',
  contact_family: 'Liên hệ người thân',
  add_reminder: 'Thêm lịch nhắc',
}

export const SERVICE_ICON: Record<ServiceType, string> = {
  medicine: '💊',
  groceries: '🛒',
  clinic: '🏥',
  daily_help: '🧹',
  contact_family: '📞',
  add_reminder: '⏰',
}

export const DEVICE_STATUS: Record<DeviceStatus, string> = {
  normal: 'Bình thường theo ngưỡng đã cấu hình',
  attention: 'Cần chú ý',
  missing: 'Thiếu dữ liệu',
  suspicious: 'Dữ liệu đáng nghi',
}

export const REMINDER_STATUS: Record<ReminderStatus, string> = {
  upcoming: 'Sắp tới',
  due: 'Đến giờ',
  snoozed: 'Nhắc lại sau',
  received: 'Đã nhận nhắc',
  cant_do: 'Không thực hiện được',
  no_confirm: 'Chưa có xác nhận',
}

// Shown on a family request while no staff member has confirmed it with a care partner.
export const PARTNER_PENDING = 'Chờ nhân viên xác nhận'

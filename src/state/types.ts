export type Role = 'elder' | 'family' | 'staff'
export type Screen =
  | 'home' | 'schedule' | 'medicine' | 'clinic' | 'ride' | 'notifications' | 'health' | 'services' | 'requests' | 'chat'
  | 'f-dashboard' | 'f-schedule' | 'f-requests' | 'f-notifications' | 'f-profile' | 'f-report'
  | 's-board' | 's-schedule' | 's-case' | 's-notifications' | 's-report' | 's-profile'
export type Priority = 'normal' | 'priority' | 'emergency' | 'uncertain'
export type Source = 'device' | 'elder' | 'family' | 'ai' | 'staff'
export type Owner = 'staff' | 'family'
export type Audience = Role
export type ServiceType = 'medicine' | 'groceries' | 'clinic' | 'daily_help' | 'contact_family' | 'add_reminder'
export type RequestStatus = 'need_info' | 'await_confirm' | 'await_family' | 'await_staff' | 'in_progress' | 'done' | 'refused'
export type EventStatus = 'to_verify' | 'handling' | 'resolved'
export type DeviceStatus = 'normal' | 'attention' | 'missing' | 'suspicious'
export type ReminderStatus = 'upcoming' | 'due' | 'snoozed' | 'received' | 'cant_do' | 'no_confirm' | 'pending' | 'cancelled' | 'inactive'

export interface LogEntry { at: number; by: Source; text: string }

interface CaseBase {
  id: string
  title: string
  detail: string
  source: Source
  priority: Priority
  priorityReason: string
  createdAt: number
  history: LogEntry[]
  unclear: string[]
  owner: Owner
  familyAsk?: { question: string; askedAt: number; reply?: string; repliedAt?: number }
}

export interface RequestCase extends CaseBase {
  kind: 'request'
  service: ServiceType
  fields: Record<string, string>
  status: RequestStatus
  acceptedAt?: number
  completedAt?: number
  doneNote?: string
  doneBy?: string
  closedReason?: string
  confirmedAt?: number
  verifiedBy?: string
  verifiedAt?: number
  verifyNote?: string
  assignee?: string
  partnerReport?: string
  partnerReportAt?: number
}

export interface EventCase extends CaseBase {
  kind: 'event'
  status: EventStatus
  handler?: string
  closingNote?: string
  deviceId?: string
  reminderId?: string
}

export type Case = RequestCase | EventCase

export type ReminderKind = 'medicine' | 'meal' | 'clinic' | 'activity'
export interface ReminderInput {
  kind: ReminderKind
  title: string
  note: string
  times: string
  startDate: string
  endDate: string
  repeat: 'daily' | 'once'
  medicine: string
  dose: string
  instructions: string
  location: string
}
export interface Reminder {
  id: string
  dueAt: number
  title: string
  note: string
  kind: ReminderKind
  response?: 'received' | 'cant_do'
  respondedAt?: number
  snoozedUntil?: number
  escalated?: boolean
  daily?: boolean
  startDate?: string
  endDate?: string
  medicine?: string
  dose?: string
  instructions?: string
  location?: string
  createdBy?: Owner
  updatedBy?: Owner
  approval?: 'pending' | 'confirmed'
  revision?: number
  activatedAt?: number
  cancelledDates?: string[]
}

export type DeviceKind = 'bp' | 'hr' | 'glucose' | 'spo2' | 'fall'
export interface Reading { at: number; value: number | [number, number] | 'fall'; source?: 'elder' | 'device' }
export interface Device { id: DeviceKind; name: string; unit: string; connected: boolean; readings: Reading[] }

export type NotifCategory = 'request' | 'health' | 'other'
export interface Notification {
  id: string
  at: number
  text: string
  category: NotifCategory
  source: Source
  to: Audience
  caseId?: string
  read: boolean
}

export interface ChatMessage { id: string; from: 'elder' | 'ai'; text: string; at: number }
export interface ChatState {
  messages: ChatMessage[]
  pending: null | { caseId: string; stage: 'collect' | 'readback'; field?: string; first?: boolean }
  misses: number
  recentMisses: string[]
}

export interface State {
  version: 3
  rev: number // bumped on every save; clients keep the higher one
  now: number
  day: string // Vietnam date (YYYY-MM-DD) the reminder schedule belongs to
  elder: { name: string; age: number; birthDate: string; phone: string; address: string }
  family: { name: string; relation: string; phone: string }[]
  staff: { name: string; title: string }
  carePartners: string[]
  reminders: Reminder[]
  devices: Device[]
  cases: Case[]
  notifications: Notification[]
  chat: ChatState
  emergency: null | { caseId: string; calling: boolean; callingFamily?: boolean }
  seq: { cb: number; evt: number; n: number }
}

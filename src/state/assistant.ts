import { addCase, createEvent, familyName, fmtTime, fmtValue, nextCaseId, notify, sayAi, sayElder, updateCase } from './helpers'
import { REMINDER_STATUS, REQUEST_STATUS, SERVICE } from './labels'
import { isFinal, nextOwner, raiseEmergency, transition } from './cases'
import { deviceStatus } from './devices'
import { reminderStatus } from './reminders'
import type { DeviceKind, RequestCase, ServiceType, State } from './types'

export type Intent = 'emergency' | 'medical_decision' | 'problem' | 'reminder' | 'contact' | 'service' | 'info' | 'unknown'

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Phrase match on whole words: " dau nguc " inside " toi bi dau nguc qua ".
const has = (words: string, kws: string[]) => kws.some((k) => ` ${words} `.includes(` ${k} `))

// ponytail: keyword rules stand in for the real NLU; good enough to demo routing, not to understand people.
const KW = {
  emergency: [
    'dau nguc', 'tuc nguc', 'dau tim', 'kho tho', 'khong tho duoc', 'tho khong duoc', 'tho khong noi', 'nga', 'te nga', 'bi te',
    'te xuong', 'bat tinh', 'ngat', 'co giat', 'dot quy', 'meo mieng', 'te nua nguoi', 'chay mau', 'cap cuu', 'cuu',
  ],
  medical_decision: ['doi lieu', 'tang lieu', 'giam lieu', 'ke don', 'bo thuoc', 'uong them thuoc', 'doi thuoc'],
  problem: ['het thuoc', 'met', 'chong mat', 'dau dau', 'sot', 'khong khoe', 'buon non'],
  reminder: ['nhac', 'dat lich nhac'],
  contact: ['goi con', 'goi cho', 'lien he', 'nhan con', 'con gai', 'con trai'],
  info: ['lich', 'huyet ap', 'nhip tim', 'duong huyet', 'spo2', 'oxy', 'yeu cau', 'den dau'],
}
const SERVICE_KW: [ServiceType, string[]][] = [
  ['medicine', ['mua thuoc', 'lay thuoc']],
  ['groceries', ['di cho', 'mua do', 'mua rau', 'thuc pham']],
  ['clinic', ['di kham', 'kham benh', 'tai kham', 'benh vien']],
  ['daily_help', ['don dep', 'giat', 'ho tro sinh hoat', 'tham']],
]

// "ngã ba/tư/năm/sáu" are road junctions in addresses, not falls.
const JUNCTION = /\bnga (ba|tu|nam|sau)\b/g

export function classify(text: string): { intent: Intent; service?: ServiceType } {
  const w = normalize(text).replace(JUNCTION, ' ')
  if (has(w, KW.emergency)) return { intent: 'emergency' }
  if (has(w, KW.medical_decision)) return { intent: 'medical_decision' }
  if (has(w, KW.problem)) return { intent: 'problem' }
  if (has(w, KW.reminder)) return { intent: 'reminder', service: 'add_reminder' }
  if (has(w, KW.contact)) return { intent: 'contact', service: 'contact_family' }
  const svc = SERVICE_KW.find(([, kws]) => has(w, kws))
  if (svc) return { intent: 'service', service: svc[0] }
  if (has(w, KW.info)) return { intent: 'info' }
  return { intent: 'unknown' }
}

export const SERVICE_FIELDS: Record<ServiceType, { key: string; label: string; question: string }[]> = {
  medicine: [
    { key: 'thuoc', label: 'Loại thuốc', question: 'Bác cần lấy loại thuốc nào ạ?' },
    { key: 'dia_diem', label: 'Địa điểm lấy', question: 'Bác muốn lấy thuốc ở đâu ạ?' },
    { key: 'thoi_gian', label: 'Thời gian mong muốn', question: 'Bác muốn lấy vào lúc nào ạ?' },
  ],
  groceries: [
    { key: 'danh_sach', label: 'Danh sách cần mua', question: 'Bác cần mua những gì, số lượng bao nhiêu ạ?' },
    { key: 'thoi_gian', label: 'Thời gian mong muốn', question: 'Bác muốn nhận đồ lúc nào ạ?' },
  ],
  clinic: [
    { key: 'noi_kham', label: 'Nơi khám', question: 'Bác đi khám ở đâu ạ?' },
    { key: 'thoi_gian', label: 'Thời gian hẹn', question: 'Lịch hẹn khám lúc nào ạ?' },
    { key: 'di_lai', label: 'Nhu cầu di chuyển', question: 'Bác có cần người đưa đi không, đi bằng gì ạ?' },
  ],
  daily_help: [
    { key: 'noi_dung', label: 'Việc cần hỗ trợ', question: 'Bác cần hỗ trợ việc gì ạ?' },
    { key: 'thoi_gian', label: 'Thời gian mong muốn', question: 'Bác muốn cháu sắp xếp lúc nào ạ?' },
  ],
  contact_family: [
    { key: 'nguoi', label: 'Người cần liên hệ', question: 'Bác muốn liên hệ với ai ạ?' },
    { key: 'loi_nhan', label: 'Lời nhắn', question: 'Bác muốn nhắn gì ạ?' },
  ],
  add_reminder: [
    { key: 'noi_dung', label: 'Nội dung nhắc', question: 'Bác muốn cháu nhắc việc gì ạ?' },
    { key: 'thoi_gian', label: 'Thời gian nhắc', question: 'Cháu nhắc bác vào lúc nào ạ?' },
  ],
}

// "thôi" and "thời" both normalize to "thoi", so refusal is matched on the accented words unless the text has no accents at all.
function isRefusal(text: string): boolean {
  const raw = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')
  if (has(raw, ['thôi', 'hủy', 'huỷ', 'không cần'])) return true
  const plain = normalize(text)
  return plain === raw && has(plain, ['thoi', 'huy', 'khong can'])
}

const reqById = (s: State, id: string) => s.cases.find((c) => c.id === id) as RequestCase
const nextField = (c: RequestCase) =>
  SERVICE_FIELDS[c.service].find((f) => c.fields[f.key] === undefined && !c.unclear.includes(f.label))
const clearChat = (s: State, patch: Partial<State['chat']> = {}): State => ({ ...s, chat: { ...s.chat, pending: null, ...patch } })

function startRequest(s: State, service: ServiceType, detail: string): State {
  let [out, id] = nextCaseId(s, 'request')
  const r: RequestCase = {
    id, kind: 'request', service, title: SERVICE[service], detail, source: 'elder', priority: 'normal',
    priorityReason: 'Yêu cầu dịch vụ thông thường', createdAt: s.now, fields: {}, status: 'need_info', unclear: [],
    history: [{ at: s.now, by: 'ai', text: 'AI ghi nhận yêu cầu, đang hỏi thông tin còn thiếu.' }],
  }
  out = addCase(out, r)
  const first = SERVICE_FIELDS[service][0]
  out = { ...out, chat: { ...out.chat, pending: { caseId: id, stage: 'collect', field: first.key }, misses: 0, recentMisses: [] } }
  return sayAi(out, `Bác muốn CAREBOX hỗ trợ ${SERVICE[service].toLowerCase()}, đúng không ạ? ${first.question}`)
}

function askNextOrReadBack(s: State, c: RequestCase): State {
  const f = nextField(c)
  if (f) return sayAi({ ...s, chat: { ...s.chat, pending: { caseId: c.id, stage: 'collect', field: f.key } } }, f.question)
  const out = updateCase(s, c.id, { status: 'await_confirm' }, { by: 'ai', text: 'AI nhắc lại nội dung để bác xác nhận.' })
  const parts = SERVICE_FIELDS[c.service].map((x) => `${x.label}: ${c.fields[x.key] ?? 'chưa rõ'}`)
  return sayAi({ ...out, chat: { ...out.chat, pending: { caseId: c.id, stage: 'readback' } } },
    `Cháu nhắc lại: ${SERVICE[c.service]} — ${parts.join('; ')}. Bác xác nhận giúp cháu, đúng không ạ?`)
}

function collect(s: State, c: RequestCase, field: string, text: string): State {
  if (isRefusal(text)) return refuse(s, c)
  const spec = SERVICE_FIELDS[c.service].find((f) => f.key === field)!
  const w = normalize(text)
  let patch: Partial<RequestCase>
  if (has(w, ['khong biet', 'chua biet'])) patch = { unclear: [...c.unclear, spec.label] }
  else {
    patch = { fields: { ...c.fields, [field]: text.trim() } }
    if (c.service === 'clinic' && field === 'thoi_gian' && has(w, ['hom nay']))
      patch = { ...patch, priority: 'priority', priorityReason: 'Cần hỗ trợ đi khám trong ngày' }
  }
  const out = updateCase(s, c.id, patch)
  return askNextOrReadBack(out, reqById(out, c.id))
}

function refuse(s: State, c: RequestCase): State {
  const out = clearChat(transition(s, { type: 'request/cancel', id: c.id }))
  return sayAi(out, 'Dạ, cháu ghi nhận bác không cần nữa. Khi nào cần bác cứ gọi cháu nhé.')
}

function confirm(s: State, c: RequestCase): State {
  const name = familyName(s)
  let out = updateCase(s, c.id, { status: 'await_family' }, { by: 'elder', text: `Bác xác nhận nội dung; chuyển ${name}.` })
  out = notify(out, `${c.title}: chờ ${name} nhận việc`, 'request', 'ai', c.id)
  const msg = c.service === 'add_reminder'
    ? `Cháu đã gửi ${name} duyệt lịch nhắc. Lịch chỉ được thêm sau khi ${name} xác nhận, yêu cầu chưa hoàn tất ạ.`
    : c.service === 'contact_family'
      ? `Cháu đã chuyển lời nhắn cho ${name}. Yêu cầu chưa hoàn tất; cháu sẽ báo bác khi có phản hồi ạ.`
      : `Cháu đã gửi yêu cầu cho ${name}. Yêu cầu chưa hoàn tất; cháu sẽ báo bác khi ${name} nhận việc ạ.`
  return sayAi(clearChat(out), msg)
}

function readback(s: State, c: RequestCase, text: string): State {
  const w = normalize(text)
  if (isRefusal(text) || has(w, ['khong', 'sai'])) return refuse(s, c)
  if (has(w, ['dung', 'dong y', 'vang', 'ok', 'co'])) return confirm(s, c)
  return miss(s, text, 'Bác trả lời “đúng rồi” hoặc “không” giúp cháu nhé.')
}

function miss(s: State, text: string, reask: string): State {
  const out = { ...s, chat: { ...s.chat, misses: s.chat.misses + 1, recentMisses: [...s.chat.recentMisses, text.trim()] } }
  if (out.chat.misses >= 2) return handoff(out)
  return sayAi(out, `Cháu chưa hiểu ý bác. ${reask} Hoặc bác bấm “Nhờ con giúp”.`)
}

const HEALTH: [DeviceKind, string[]][] = [['bp', ['huyet ap']], ['hr', ['nhip tim']], ['glucose', ['duong huyet']], ['spo2', ['spo2', 'oxy']]]

function answerInfo(s: State, text: string): State {
  const w = normalize(text)
  const health = HEALTH.find(([, kws]) => has(w, kws))
  if (health) {
    const d = s.devices.find((x) => x.id === health[0])!
    const last = d.readings.at(-1)
    const disclaimer = 'Cháu không đánh giá được tình trạng sức khỏe; bác có thể hỏi bác sĩ ạ.'
    if (!last) return sayAi(s, `Chưa có dữ liệu từ ${d.name} (nguồn: thiết bị giả lập). ${disclaimer}`)
    const prefix = deviceStatus(d, s.now) === 'missing' ? `Hiện thiếu dữ liệu mới từ ${d.name}. ` : ''
    return sayAi(s, `${prefix}Lần đo gần nhất của ${d.name}: ${fmtValue(last.value)} ${d.unit} lúc ${fmtTime(last.at)} (nguồn: thiết bị giả lập). ${disclaimer}`)
  }
  if (has(w, ['lich'])) {
    const lines = [...s.reminders].sort((a, b) => a.dueAt - b.dueAt)
      .map((r) => `${fmtTime(r.dueAt)} ${r.title} (${REMINDER_STATUS[reminderStatus(r, s.now)]})`)
    return sayAi(s, `Lịch hôm nay của bác: ${lines.join('; ')}.`)
  }
  const open = s.cases.filter((c): c is RequestCase => c.kind === 'request' && !isFinal(c))
  if (!open.length) return sayAi(s, 'Hiện bác không có yêu cầu nào đang mở ạ.')
  return sayAi(s, `Yêu cầu của bác: ${open.map((c) => `${c.title} — ${REQUEST_STATUS[c.status]}, tiếp theo: ${nextOwner(c, s)}`).join('; ')}.`)
}

export function handoff(s: State): State {
  const name = familyName(s)
  const unclear = s.chat.recentMisses.length ? s.chat.recentMisses : ['Người cao tuổi chọn nhờ con giúp']
  let [out, id] = createEvent(s, {
    title: 'AI chưa hiểu yêu cầu', detail: `Cần ${name} gọi lại cho bác.`, source: 'ai', priority: 'uncertain',
    priorityReason: s.chat.recentMisses.length ? 'AI không hiểu sau khi hỏi lại' : 'Người dùng chọn nhờ con giúp', unclear,
  })
  out = notify(out, `${id}: AI chưa hiểu yêu cầu, cần ${name} gọi lại cho bác.`, 'other', 'ai', id)
  return sayAi(clearChat(out, { misses: 0, recentMisses: [] }), `Cháu đã báo ${name} gọi lại cho bác ạ.`)
}

export function startService(s: State, service: ServiceType): State {
  return startRequest(sayElder(clearChat(s), `Tôi cần ${SERVICE[service].toLowerCase()}`), service, `Bác chọn dịch vụ ${SERVICE[service]}.`)
}

export function handleUtterance(s: State, text: string): State {
  if (!text.trim()) return s
  let out = sayElder(s, text.trim())
  const { intent, service } = classify(text)
  if (intent === 'emergency') {
    out = raiseEmergency(clearChat(out), 'Người dùng báo dấu hiệu khẩn cấp', text.trim(), 'elder')
    return sayAi(out, `Cháu đang hướng dẫn gọi 115 và đã báo ${familyName(out)}.`)
  }
  if (intent === 'medical_decision') {
    // Checked before any pending question so a dose request is never stored as a field answer.
    ;[out] = createEvent(clearChat(out, { misses: 0, recentMisses: [] }), {
      title: 'Yêu cầu vượt phạm vi AI: thay đổi thuốc', detail: text.trim(), source: 'elder', priority: 'normal',
      priorityReason: 'AI không được tự quyết định y tế',
    })
    return sayAi(out, `Cháu không thể thay đổi thuốc hay liều. Bác hỏi bác sĩ hoặc dược sĩ nhé; cháu đã báo ${familyName(out)}.`)
  }
  const p = out.chat.pending
  const pendingCase = p && reqById(out, p.caseId)
  if (p && pendingCase && ['need_info', 'await_confirm'].includes(pendingCase.status)) {
    if (p.stage === 'collect' && p.field) return collect(out, pendingCase, p.field, text)
    return readback(out, pendingCase, text)
  }
  // The case was cancelled outside the chat: drop the stale question.
  if (p) out = clearChat(out)
  if (intent === 'unknown') return miss(out, text, 'Bác nói lại ngắn gọn giúp cháu nhé.')
  out = { ...out, chat: { ...out.chat, misses: 0, recentMisses: [] } }
  switch (intent) {
    case 'problem': {
      let id: string
      ;[out, id] = createEvent(out, { title: text.trim(), detail: text.trim(), source: 'elder', priority: 'priority', priorityReason: 'Người cao tuổi báo vấn đề' })
      out = notify(out, `Bác báo: “${text.trim()}”. Cần ${familyName(out)} xem và gọi lại cho bác.`, 'health', 'elder', id)
      return sayAi(out, `Cháu đã ghi nhận và báo ${familyName(out)}. Nếu bác khó thở hay đau ngực, bác nói ngay để cháu hướng dẫn gọi 115 nhé.`)
    }
    case 'info':
      return answerInfo(out, text)
    default:
      return startRequest(out, service!, text.trim())
  }
}

import { useState } from 'react'
import { useStore } from '../state/store'
import { fmtDate, fmtTime, fmtValue } from '../state/helpers'
import { effectivePriority, nextOwner, transition, type CaseAction } from '../state/cases'
import { SERVICE_FIELDS } from '../state/assistant'
import { PRIORITY, SERVICE, SOURCE } from '../state/labels'
import { PriorityBadge, StatusBadge } from '../ui/Badges'
import type { RequestCase, ServiceType } from '../state/types'

const SERVICES = Object.keys(SERVICE) as ServiceType[]

export function CaseDetail() {
  const { state, dispatch } = useStore()
  const c = state.cases.find((x) => x.id === state.view.caseId)
  const [partner, setPartner] = useState(state.partners[0])
  const [report, setReport] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [time, setTime] = useState('09:00')
  const [service, setService] = useState<ServiceType>('medicine')
  if (!c) return <p className="empty">Không tìm thấy mục này.</p>

  // Show a button only if the reducer would accept it, so the UI can never drift from the rules.
  const legal = (a: CaseAction) => transition(state, a) !== state
  const id = c.id
  const p = effectivePriority(c, state.now)
  const req = c.kind === 'request' ? (c as RequestCase) : null
  const fields = req ? SERVICE_FIELDS[req.service] : []
  const missing = req ? fields.filter((f) => req.fields[f.key] === undefined).map((f) => f.label) : []
  const device = c.kind === 'event' && c.deviceId ? state.devices.find((d) => d.id === c.deviceId) : undefined

  return (
    <div>
      <button className="back" onClick={() => dispatch({ type: 'nav', screen: 'ops-board' })}>‹ Bảng điều phối</button>
      <div className="row between wrap" style={{ margin: '8px 0 12px' }}>
        <h1 className="screen-title" style={{ margin: 0 }}>Chi tiết {c.kind === 'event' ? 'sự kiện' : 'yêu cầu'}: {id}</h1>
        <span className="row" style={{ gap: 6 }}><StatusBadge c={c} /><PriorityBadge c={c} now={state.now} /></span>
      </div>

      {p.priority === 'emergency' && (
        <div className="card emergency-rule">
          Nếu có dấu hiệu khẩn cấp từ người dùng hoặc nguồn đáng tin cậy, phải kích hoạt quy trình khẩn cấp phù hợp, không chờ hoàn tất các bước kiểm tra thông thường.
        </div>
      )}

      <div className="detail-grid">
        <div className="card">
          <dl className="kv">
            <dt>1. Mã</dt><dd>{id}</dd>
            <dt>2. Người liên quan · nguồn</dt><dd>{state.elder.name} · {SOURCE[c.source]}</dd>
            <dt>3. Nội dung</dt><dd><b>{c.title}</b><br />{c.detail}</dd>
            <dt>4. Thời điểm ghi nhận</dt><dd>{fmtTime(c.createdAt)} · {fmtDate(c.createdAt)}</dd>
            <dt>5. Mức ưu tiên · lý do</dt><dd>{PRIORITY[p.priority]} — {p.reason}</dd>
            <dt>6. Đã xác minh</dt>
            <dd>
              {req && fields.filter((f) => req.fields[f.key] !== undefined).map((f) => <div key={f.key}>{f.label}: {req.fields[f.key]}</div>)}
              {req?.verifiedBy ? <div>✔ Nhân viên {req.verifiedBy} đã xác minh</div> : <div className="muted">Chưa có nhân viên xác minh</div>}
            </dd>
            <dt>7. Chưa xác minh / còn thiếu</dt>
            <dd>{[...c.unclear, ...missing].length ? [...c.unclear, ...missing].join('; ') : '—'}</dd>
            <dt>9. Phụ trách tiếp theo</dt><dd><b>{nextOwner(c, state)}</b></dd>
            <dt>10. Kết quả</dt>
            <dd>
              {req?.cpReport && <div>Care Partner {req.assignee} ({fmtTime(req.cpReport.at)}): {req.cpReport.text}</div>}
              {req?.completedAt && <div>Nhân viên xác nhận hoàn tất lúc {fmtTime(req.completedAt)}</div>}
              {req?.closedReason && <div>Đóng: {req.closedReason}</div>}
              {c.kind === 'event' && c.closingNote && <div>{c.closingNote}</div>}
              {!req?.cpReport && !req?.completedAt && !req?.closedReason && !(c.kind === 'event' && c.closingNote) && <span className="muted">Chưa có</span>}
            </dd>
          </dl>
          {device && (
            <div className="note small">
              <b>{device.name}</b> — 3 lần đo gần nhất:{' '}
              {device.readings.slice(-3).map((r) => `${fmtValue(r.value)} (${fmtTime(r.at)})`).join(' · ') || 'không có'}.
              <br />Ngưỡng giả lập, không phải chỉ định y tế. {device.connected ? '' : 'Thiết bị đang mất kết nối.'}
            </div>
          )}
        </div>

        <div className="card">
          <div className="bold">8. Hành động đã thực hiện</div>
          <ul className="timeline">
            {c.history.map((h, i) => <li key={i}><b>{fmtTime(h.at)}</b> {h.text} <span className="source">{SOURCE[h.by]}</span></li>)}
          </ul>

          <div className="bold" style={{ marginTop: 14 }}>Thao tác</div>
          <div className="actions">
            {legal({ type: 'ops/verify', id }) && <button className="btn" onClick={() => dispatch({ type: 'ops/verify', id })}>Xác minh</button>}
            {legal({ type: 'ops/assign', id, partner }) && (
              <div className="action-row">
                <select className="input" value={partner} onChange={(e) => setPartner(e.target.value)}>
                  {state.partners.map((x) => <option key={x}>{x}</option>)}
                </select>
                <button className="btn" onClick={() => dispatch({ type: 'ops/assign', id, partner })}>Phân công</button>
              </div>
            )}
            {legal({ type: 'ops/cpReport', id, text: 'x' }) && (
              <div className="action-row col">
                <textarea className="input" rows={2} placeholder="Nội dung Care Partner báo cáo…" value={report} onChange={(e) => setReport(e.target.value)} />
                <button className="btn" disabled={!report.trim()} onClick={() => { dispatch({ type: 'ops/cpReport', id, text: report }); setReport('') }}>Ghi báo cáo Care Partner</button>
              </div>
            )}
            {legal({ type: 'ops/confirmDone', id }) && <button className="btn ok" onClick={() => dispatch({ type: 'ops/confirmDone', id })}>Xác nhận hoàn tất</button>}
            {legal({ type: 'ops/approveReminder', id, time: '09:00' }) && (
              <div className="action-row">
                <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                <button className="btn ok" onClick={() => dispatch({ type: 'ops/approveReminder', id, time })}>Duyệt lịch nhắc</button>
              </div>
            )}
            {legal({ type: 'ops/takeEvent', id }) && <button className="btn" onClick={() => dispatch({ type: 'ops/takeEvent', id })}>Tiếp nhận sự kiện</button>}
            {legal({ type: 'ops/resolveEvent', id, note: 'x' }) && (
              <div className="action-row col">
                <textarea className="input" rows={2} placeholder={p.priority === 'emergency' ? 'Ai đã tiếp nhận tình huống?' : 'Ghi chú xử lý…'} value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn ok" disabled={!note.trim()} onClick={() => { dispatch({ type: 'ops/resolveEvent', id, note }); setNote('') }}>Đóng sự kiện</button>
              </div>
            )}
            {legal({ type: 'ops/convertEvent', id, service }) && (
              <div className="action-row">
                <select className="input" value={service} onChange={(e) => setService(e.target.value as ServiceType)}>
                  {SERVICES.map((x) => <option key={x} value={x}>{SERVICE[x]}</option>)}
                </select>
                <button className="btn ghost" onClick={() => dispatch({ type: 'ops/convertEvent', id, service })}>Chuyển thành yêu cầu</button>
              </div>
            )}
            {legal({ type: 'ops/flag', id }) && <button className="btn ghost danger-text" onClick={() => dispatch({ type: 'ops/flag', id })}>Cần can thiệp</button>}
            {legal({ type: 'ops/unflag', id }) && <button className="btn ghost" onClick={() => dispatch({ type: 'ops/unflag', id })}>Bỏ cần can thiệp</button>}
            {legal({ type: 'ops/decline', id, reason: 'x' }) && (
              <div className="action-row">
                <input className="input" placeholder="Lý do từ chối…" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn danger" disabled={!reason.trim()} onClick={() => { dispatch({ type: 'ops/decline', id, reason }); setReason('') }}>Từ chối</button>
              </div>
            )}
            {req?.service === 'contact_family' && req.status === 'await_dispatch' && !req.familyRespondedAt && (
              <p className="muted small">Đang chờ gia đình phản hồi (màn hình Gia đình).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { useStore } from '../state/store'

export function EmergencyOverlay() {
  const { state, dispatch, view } = useStore()
  // closing is per device and acknowledges nothing; a new emergency shows again
  if (!state.emergency || view.dismissedEmergency === state.emergency.caseId) return null
  const c = state.cases.find((x) => x.id === state.emergency!.caseId)
  const daughter = state.family[0]
  return (
    <div className="emergency" role="alertdialog" aria-label="Tình huống khẩn cấp">
      <div className="emergency-icon">🚨</div>
      <h2>Bác đừng lo, cháu đang tìm trợ giúp</h2>
      <p className="emergency-detail">{c?.title}</p>
      {state.emergency.calling ? (
        <div className="calling">📞 Đang gọi 115 (mô phỏng)…</div>
      ) : (
        <button className="btn big-red" onClick={() => dispatch({ type: 'emergency/call115' })}>📞 Gọi 115</button>
      )}
      <button className="btn ghost-white" title="Mô phỏng, không gọi thật">
        Gọi {daughter.name} ({daughter.relation.toLowerCase()})
      </button>
      {c?.kind === 'event' && c.status === 'handling'
        ? <p className="emergency-ack">✅ {c.handler} đã nhận được và đang xử lý.</p>
        : <p className="emergency-note">Đã thông báo {daughter.name}. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.</p>}
      <button className="emergency-close" onClick={() => dispatch({ type: 'emergency/dismiss' })}>Đóng</button>
    </div>
  )
}

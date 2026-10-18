import { Fragment } from 'react'
import { useStore } from '../state/store'
import { fmtTime, fmtValue } from '../state/helpers'
import { DeviceBadge } from '../ui/Badges'

export function Profile() {
  const { state } = useStore()
  const { elder } = state
  return (
    <div>
      <h1 className="screen-title">👵 Hồ sơ người cao tuổi</h1>
      <div className="card row">
        <span className="avatar-lg">👵</span>
        <div>
          <div className="bold">{elder.name}</div>
          <div className="muted small">{elder.age} tuổi · Sống tại {elder.address}</div>
        </div>
      </div>
      <div className="card">
        <div className="bold">Thông tin cá nhân</div>
        <dl className="kv">
          <dt>Ngày sinh</dt><dd>{elder.birthDate}</dd>
          <dt>Số điện thoại</dt><dd>{elder.phone}</dd>
          {state.family.map((f) => (
            <Fragment key={f.name}>
              <dt>Người liên hệ</dt>
              <dd>{f.relation} – {f.name} · {f.phone}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      <div className="card">
        <div className="bold">Thiết bị kết nối</div>
        <p className="muted small">Chỉ hiển thị dữ liệu bác đã đồng ý chia sẻ với gia đình.</p>
        {state.devices.map((d) => {
          const last = d.readings.at(-1)
          return (
            <div key={d.id} className="device-row">
              <div className="grow">
                <div className="bold small">{d.name}</div>
                <div className="muted small">
                  {last ? `Lần đo cuối ${fmtTime(last.at)}: ${fmtValue(last.value)} ${d.unit}` : 'Chưa có tín hiệu'}
                </div>
              </div>
              <DeviceBadge d={d} now={state.now} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

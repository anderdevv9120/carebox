import type { ReactNode } from 'react'

export function PhoneFrame({ time, children, footer }: { time: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-status">
        <span>{time}</span>
        <span className="demo-chip">Dữ liệu minh họa</span>
        <span>📶 🔋</span>
      </div>
      <div className="phone-body">{children}</div>
      {footer}
    </div>
  )
}

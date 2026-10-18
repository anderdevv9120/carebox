import type { ReactNode } from 'react'

export function PhoneFrame({ time, children, footer, overlay, className = '' }: { time: string; children: ReactNode; footer?: ReactNode; overlay?: ReactNode; className?: string }) {
  return (
    <div className={`phone ${className}`}>
      {overlay}
      <div className="phone-status">
        <span>{time}</span>
        <span className="row" style={{ gap: 6 }}><span className="demo-chip">Dữ liệu minh họa</span>📶</span>
      </div>
      <div className="phone-body">{children}</div>
      {footer}
    </div>
  )
}

import { useState } from 'react'
import { PhoneFrame } from './ui/PhoneFrame'

type Role = 'elder' | 'family' | 'ops'
const ROLES: { id: Role; label: string }[] = [
  { id: 'elder', label: 'Người cao tuổi' },
  { id: 'family', label: 'Gia đình' },
  { id: 'ops', label: 'Điều phối' },
]

export default function App() {
  const [role, setRole] = useState<Role>('elder')
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">🧡</span>
          <div>
            <div className="brand-name">CAREBOX</div>
            <div className="brand-tag">AI watches. Family knows. CAREBOX steps in.</div>
          </div>
        </div>
        <span className="demo-note">Bản demo — không phải ứng dụng thật</span>
        <div className="role-switch">
          {ROLES.map((r) => (
            <button key={r.id} className={r.id === role ? 'active' : ''} onClick={() => setRole(r.id)}>{r.label}</button>
          ))}
        </div>
      </header>
      <div className="layout">
        <main className="stage">
          <PhoneFrame time="07:00"><p className="empty">{role}</p></PhoneFrame>
        </main>
        <aside />
      </div>
    </div>
  )
}

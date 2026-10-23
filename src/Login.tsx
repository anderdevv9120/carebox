import { useState, type FormEvent } from 'react'
import { login, type Session } from './api'
import type { Role } from './state/types'

const ROLES: { role: Role; icon: string; label: string }[] = [
  { role: 'elder', icon: '👵', label: 'Người cao tuổi' },
  { role: 'family', icon: '👩', label: 'Gia đình' },
  { role: 'staff', icon: '🧑‍💼', label: 'Nhân viên điều phối' },
]

// Role + username of the last successful login, prefilled after logout. Never the password.
const LAST_KEY = 'carebox-last-login'

function readLast(): { role: Role; user: string } {
  try {
    const s = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null')
    if (s && ROLES.some((r) => r.role === s.role) && typeof s.user === 'string') return s
  } catch {
    // storage unavailable or corrupt: start blank
  }
  return { role: 'elder', user: '' }
}

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [last] = useState(readLast)
  const [role, setRole] = useState(last.role)
  const [user, setUser] = useState(last.user)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const s = await login(user.trim(), password, role)
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ role, user: s.user }))
      } catch {
        // private mode: nothing to prefill next time
      }
      onLogin(s)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <div className="brand"><img className="brand-logo" src="/favicon.svg" alt="" /><span className="brand-name">CAREBOX</span></div>
      <p className="login-tagline">Công nghệ đồng hành, trọn từng khoảnh khắc.</p>
      <div className="accounts" role="radiogroup" aria-label="Chọn vai trò">
        {ROLES.map((r) => (
          <button key={r.role} type="button" role="radio" aria-checked={role === r.role}
            className={`card account ${role === r.role ? 'active' : ''}`} onClick={() => setRole(r.role)}>
            <span className="avatar-lg">{r.icon}</span>
            <b className="grow">{r.label}</b>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="muted">Tên đăng nhập</span>
        <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} />
      </label>
      <label className="block">
        <span className="muted">Mật khẩu</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn wide" type="submit" disabled={busy || !user.trim() || !password}>Đăng nhập</button>
      {error && <p className="danger-text small" role="alert">{error}</p>}
      <p className="muted small center">Demo: ba.lan · con.gai · nhan.vien — mật khẩu: carebox</p>
    </form>
  )
}

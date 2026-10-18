import { useState, type FormEvent } from 'react'
import { login, type Session } from './api'

const ACCOUNTS = [
  { user: 'ba.lan', icon: '👵', name: 'Bà Nguyễn Thị Lan', role: 'Người cao tuổi' },
  { user: 'con.gai', icon: '👩', name: 'Chị Minh (con gái)', role: 'Gia đình' },
]

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [user, setUser] = useState(ACCOUNTS[0].user)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onLogin(await login(user, password))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <div className="brand"><img className="brand-logo" src="/favicon.svg" alt="" /><span className="brand-name">CAREBOX</span></div>
      <p className="login-tagline">Công nghệ đồng hành, trọn từng khoảnh khắc.</p>
      <div className="accounts" role="radiogroup" aria-label="Chọn tài khoản">
        {ACCOUNTS.map((a) => (
          <button key={a.user} type="button" role="radio" aria-checked={user === a.user}
            className={`card account ${user === a.user ? 'active' : ''}`} onClick={() => setUser(a.user)}>
            <span className="avatar-lg">{a.icon}</span>
            <span className="grow">
              <b className="block">{a.name}</b>
              <span className="muted small">{a.role} · {a.user}</span>
            </span>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="muted">Mật khẩu</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn wide" type="submit" disabled={busy || !password}>Đăng nhập</button>
      {error && <p className="danger-text small" role="alert">{error}</p>}
      <p className="muted small center">Mật khẩu: carebox</p>
    </form>
  )
}

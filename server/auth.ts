import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Role } from '../src/state/types'

export const ACCOUNTS: Record<'ba.lan' | 'con.gai', { role: Role; name: string }> = {
  'ba.lan': { role: 'elder', name: 'Bà Nguyễn Thị Lan' },
  'con.gai': { role: 'family', name: 'Chị Minh' },
}
export const PASSWORD = 'carebox'

export const isAccount = (user: unknown): user is keyof typeof ACCOUNTS => typeof user === 'string' && Object.hasOwn(ACCOUNTS, user)

// ponytail: the dev default secret is demo-only; set SESSION_SECRET on Vercel. Tokens never expire; changing the secret logs everyone out.
const mac = (user: string) => createHmac('sha256', process.env.SESSION_SECRET ?? 'carebox-dev-secret').update(user).digest('base64url')

export const signToken = (user: string) => `${user}.${mac(user)}`

export function verifyToken(token: string | null): { user: string; role: Role; name: string } | null {
  if (!token) return null
  const i = token.lastIndexOf('.') // user names contain dots, base64url never does
  const user = token.slice(0, i)
  if (i < 1 || !isAccount(user)) return null
  const got = Buffer.from(token.slice(i + 1))
  const want = Buffer.from(mac(user))
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  return { user, ...ACCOUNTS[user] }
}

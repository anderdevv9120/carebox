import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Spec anti-goal: never claim health or completion the data can't support.
const BANNED = ['khỏe mạnh', 'Ổn định', 'Đã hoàn thành', 'Không có dấu hiệu bất thường']
const SRC = join(import.meta.dirname, '.')

test('UI and state copy never uses banned health/completion claims', () => {
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))
  expect(files.length).toBeGreaterThan(10)
  const hits = files.flatMap((f) => {
    const text = readFileSync(join(SRC, f), 'utf8')
    return BANNED.filter((b) => text.includes(b)).map((b) => `${f}: ${b}`)
  })
  expect(hits).toEqual([])
})

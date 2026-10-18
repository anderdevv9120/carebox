import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Spec anti-goal: never claim health or completion the data can't support.
const BANNED = ['khỏe mạnh', 'Ổn định', 'Đã hoàn thành', 'Không có dấu hiệu bất thường']
// The staff role is gone: the daughter handles requests.
const STAFF = ['Care Partner', 'nhân viên điều phối', 'Gặp nhân viên', 'Chờ điều phối']
const SRC = join(import.meta.dirname, '.')

function sources(dir: string): { f: string; text: string }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))
    .map((f) => ({ f, text: readFileSync(join(dir, f), 'utf8') }))
}
const hits = (files: { f: string; text: string }[], words: string[]) =>
  files.flatMap(({ f, text }) => words.filter((b) => text.includes(b)).map((b) => `${f}: ${b}`))

test('UI and state copy never uses banned health/completion claims', () => {
  const files = sources(SRC)
  expect(files.length).toBeGreaterThan(10)
  expect(hits(files, BANNED)).toEqual([])
})

// Task 4 widens this to all of src/ once the ops screens are deleted and the UI copy is updated.
test('state and server code never mention staff', () => {
  const files = [...sources(join(SRC, 'state')), ...sources(join(SRC, '..', 'server'))]
  expect(files.length).toBeGreaterThan(5)
  expect(hits(files, STAFF)).toEqual([])
})

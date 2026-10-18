import { expect, test } from 'vitest'
import { pickNewer } from './api'
import { seed } from './state/seed'

const NOW = Date.UTC(2026, 9, 18, 2, 0) // 09:00 Vietnam time

test('pickNewer keeps the higher rev (stale poll never overwrites an action result)', () => {
  const a = { ...seed(NOW), rev: 5 }, b = { ...seed(NOW), rev: 4 }
  expect(pickNewer(a, b)).toBe(a); expect(pickNewer(b, a)).toBe(a); expect(pickNewer(null, b)).toBe(b)
})

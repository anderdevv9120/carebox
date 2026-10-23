import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { rename, rm, writeFile } from 'node:fs/promises'
import { saveState } from './storage'
import { seed } from '../src/state/seed'

vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), rename: vi.fn(), rm: vi.fn(), writeFile: vi.fn() }))

beforeEach(() => {
  vi.stubEnv('VITEST', '')
  vi.mocked(rename).mockReset().mockResolvedValue(undefined)
  vi.mocked(writeFile).mockReset().mockResolvedValue(undefined)
  vi.mocked(rm).mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

const denied = () => Object.assign(new Error('temporary file lock'), { code: 'EPERM' })

test('a temporary Windows lock retries the atomic rename without rewriting state', async () => {
  vi.mocked(rename).mockRejectedValueOnce(denied()).mockRejectedValueOnce(denied())
  const state = seed(Date.UTC(2026, 9, 20))
  await saveState(state)
  expect(rename).toHaveBeenCalledTimes(3)
  expect(writeFile).toHaveBeenCalledTimes(1)
  expect(vi.mocked(writeFile).mock.calls[0][1]).toBe(JSON.stringify(state))
  expect(rm).toHaveBeenCalledTimes(1)
})

test('a persistent lock is surfaced after bounded retries and the temporary file is cleaned up', async () => {
  vi.mocked(rename).mockRejectedValue(denied())
  await expect(saveState(seed(Date.UTC(2026, 9, 20)))).rejects.toMatchObject({ code: 'EPERM' })
  expect(rename).toHaveBeenCalledTimes(4)
  expect(rm).toHaveBeenCalledTimes(1)
})

test('permanent filesystem errors propagate immediately rather than retrying or pretending to save', async () => {
  vi.mocked(rename).mockRejectedValue(Object.assign(new Error('disk error'), { code: 'EIO' }))
  await expect(saveState(seed(Date.UTC(2026, 9, 20)))).rejects.toMatchObject({ code: 'EIO' })
  expect(rename).toHaveBeenCalledTimes(1)
  expect(rm).toHaveBeenCalledTimes(1)
})

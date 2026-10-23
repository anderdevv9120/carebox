import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldDisable } from './kill-switch'

const url = 'https://control.example/api/status/test'
afterEach(() => { vi.unstubAllGlobals() })

describe('startup kill switch', () => {
  it.each([
    ['{"disabled":true}', 200, true], ['{"disabled":false}', 200, false],
    ['{"disabled":"true"}', 200, false], ['{"disabled":1}', 200, false],
    ['null', 200, false], ['{}', 200, false], ['[]', 200, false],
    ['invalid json', 200, false], ['{"disabled":true}', 503, false],
    ['{"disabled":true}', 404, false],
  ])('handles %s with HTTP %s', async (body, status, expected) => {
    const fetch = vi.fn().mockResolvedValue(new Response(body, { status }))
    vi.stubGlobal('fetch', fetch)
    expect(await shouldDisable(url)).toBe(expected)
    expect(fetch).toHaveBeenCalledWith(url, { cache: 'no-store', signal: expect.any(AbortSignal) })
  })
  it('runs normally when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await shouldDisable(url)).toBe(false)
  })
  it('aborts a stalled response after two seconds and runs normally', async () => {
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    expect(await shouldDisable(url)).toBe(false)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
  })
})

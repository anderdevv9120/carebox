import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { render, createRoot } = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }))
vi.mock('react-dom/client', () => ({ createRoot }))

const url = 'https://killswitch-pi.vercel.app/api/status/0c939836-1497-4b5d-919d-9ea8bec7f2dd'

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('document', { getElementById: () => ({}) })
  vi.stubGlobal('window', {})
  createRoot.mockReturnValue({ render })
})
afterEach(() => { vi.unstubAllGlobals() })

it('waits for the check and renders only the payment message when disabled', async () => {
  let respond: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { respond = resolve })))
  await import('./main')
  expect(render).not.toHaveBeenCalled()
  respond!(Response.json({ disabled: true }))
  await vi.waitFor(() => { expect(render).toHaveBeenCalledOnce() })
  expect(render.mock.calls[0][0].type).toBe('main')
  expect(render.mock.calls[0][0].props.children).toBe('Nhớ trả hết phí nhé')
  expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ cache: 'no-store' }))
})

it.each(['enabled', 'offline'])('mounts the normal app when %s', async (mode) => {
  const fetch = vi.fn()
  if (mode === 'offline') fetch.mockRejectedValue(new Error('offline'))
  else fetch.mockResolvedValue(Response.json({ disabled: false }))
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  await vi.waitFor(() => { expect(render).toHaveBeenCalledOnce() })
  expect(render.mock.calls[0][0].type).toBe(StrictMode)
  expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ cache: 'no-store' }))
})

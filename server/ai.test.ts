import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { seed } from '../src/state/seed'
import { generateReply } from './ai'

const { generateContent, constructorArgs } = vi.hoisted(() => ({ generateContent: vi.fn(), constructorArgs: vi.fn() }))
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
  GoogleGenAI: class {
    models = { generateContent }
    constructor(args: unknown) { constructorArgs(args) }
  },
}))
const ok = (text: string | undefined) => ({ text })

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key'
})
afterEach(() => {
  delete process.env.GEMINI_API_KEY
  generateContent.mockReset()
  constructorArgs.mockReset()
})

test('Gemma receives recent history and current message using the Google SDK', async () => {
  generateContent.mockResolvedValue(ok('{"status":"answered","reply":"  Dạ cháu nghe đây ạ.  "}'))
  const result = await generateReply(seed(Date.now()), 'Bác thích nghe chuyện')
  expect(result).toEqual({ text: 'Dạ cháu nghe đây ạ.', unclear: false })
  expect(constructorArgs).toHaveBeenCalledWith({ apiKey: 'test-key' })
  expect(generateContent).toHaveBeenCalledOnce()
  const body = generateContent.mock.calls[0][0]
  expect(body).toMatchObject({ model: 'gemma-4-26b-a4b-it', config: {
    systemInstruction: expect.any(String), thinkingConfig: { thinkingLevel: 'MINIMAL' },
  } })
  expect(body.contents.at(-1)).toEqual({ role: 'user', parts: [{ text: 'Bác thích nghe chuyện' }] })
  expect(body.contents.slice(0, -1)).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'model', parts: [expect.objectContaining({ text: expect.any(String) })] })]))
})

test('Gemma marks a request that needs clarification in its one response', async () => {
  generateContent.mockResolvedValue(ok('```json\n{"status":"unclear","reply":"Bác muốn mua món gì ạ?"}\n```'))
  expect(await generateReply(seed(Date.now()), 'Bác muốn cái trước đó')).toEqual({
    text: 'Bác muốn mua món gì ạ?', unclear: true,
  })
})

test('plain conversational replies work if Gemma ignores JSON format', async () => {
  generateContent.mockResolvedValue(ok('Cháu đang nghe bác kể chuyện ạ.'))
  expect(await generateReply(seed(Date.now()), 'Kể chuyện cho bác nghe')).toEqual({
    text: 'Cháu đang nghe bác kể chuyện ạ.', unclear: false,
  })
})

test('rejects malformed structured responses instead of displaying JSON in chat', async () => {
  generateContent.mockResolvedValue(ok('{"status":"unclear"}'))
  await expect(generateReply(seed(Date.now()), 'Món đó ấy')).rejects.toThrow('invalid structured reply')
})

test('empty model response is rejected', async () => {
  generateContent.mockResolvedValue(ok(undefined))
  await expect(generateReply(seed(Date.now()), 'Chào cháu')).rejects.toThrow('empty reply')
})

test('retries temporary provider 500s and keeps the original request', async () => {
  generateContent.mockRejectedValueOnce(Object.assign(new Error('temporary failure'), { status: 500 }))
    .mockResolvedValueOnce(ok('Dạ cháu nghe ạ.'))
  expect(await generateReply(seed(Date.now()), 'Chào cháu')).toEqual({ text: 'Dạ cháu nghe ạ.', unclear: false })
  expect(generateContent).toHaveBeenCalledTimes(2)
  expect(generateContent.mock.calls[0][0]).toEqual(generateContent.mock.calls[1][0])
})

test('does not retry invalid requests or quota failures', async () => {
  for (const status of [400, 429]) {
    generateContent.mockRejectedValue(Object.assign(new Error('provider failure'), { status }))
    await expect(generateReply(seed(Date.now()), 'Chào cháu')).rejects.toMatchObject({ status })
    expect(generateContent).toHaveBeenCalledTimes(1)
    generateContent.mockReset()
  }
})

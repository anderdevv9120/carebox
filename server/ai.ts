import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai'
import type { State } from '../src/state/types.js'

// The model talks to the elder; case creation, reminders and emergency actions remain server-owned.
const SYSTEM = `Bạn là trợ lý CAREBOX, nói chuyện với Bà Lan (người cao tuổi) bằng tiếng Việt thân thiện, ngắn gọn, dễ hiểu.
Chỉ trả lời và trò chuyện; không giả vờ đã tạo lịch nhắc, gọi 115, liên lạc gia đình, đặt dịch vụ hoặc đọc dữ liệu thiết bị.
Khi bác muốn làm những việc đó, hướng dẫn bác dùng các nút Dịch vụ, Lịch trình, Sức khỏe hoặc “Gặp nhân viên”.
Không tự kê đơn, chỉnh liều hoặc chẩn đoán bệnh. Nếu bác nói dấu hiệu cấp cứu, khuyên gọi 115 ngay và nhờ người gần đó hỗ trợ.
Đừng tự bịa thông tin cá nhân, tình trạng sức khỏe hay kết quả xử lý của CAREBOX. Trả lời tối đa 3 câu trừ khi bác yêu cầu chi tiết.
Chỉ trả về một đối tượng JSON, không có markdown: {"status":"answered","reply":"câu trả lời tiếng Việt"} hoặc {"status":"unclear","reply":"câu hỏi làm rõ"}.
Chọn "unclear" chỉ khi bác đang muốn nhờ thực hiện một việc nhưng cháu không hiểu bác muốn làm gì ngay cả khi xét hội thoại trước đó. Nếu unclear, reply là một câu hỏi làm rõ ngắn gọn.
Chọn "answered" cho chào hỏi, tâm sự, kể chuyện, câu hỏi thông thường và những câu bác có thể trả lời hoặc hướng dẫn. Đừng coi lời hỏi thêm thông tin bình thường trong cuộc trò chuyện là không hiểu yêu cầu.`

export type AIReply = { text: string; unclear: boolean }

export async function generateReply(s: State, text: string): Promise<AIReply> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing')
  const contents: Content[] = [
    ...s.chat.messages.slice(-12).map((m) => ({ role: m.from === 'elder' ? 'user' : 'model', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: text.trim() }] },
  ]
  const ai = new GoogleGenAI({ apiKey })
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemma-4-26b-a4b-it', contents,
        config: { systemInstruction: SYSTEM, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
      })
      const raw = response.text?.trim()
      if (!raw) throw new Error('Gemma returned an empty reply')
      const jsonText = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? raw
      try {
        const result: unknown = JSON.parse(jsonText)
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          const { status, reply } = result as Record<string, unknown>
          if ((status === 'answered' || status === 'unclear') && typeof reply === 'string' && reply.trim())
            return { text: reply.trim(), unclear: status === 'unclear' }
        }
      } catch { /* Plain-text responses are still valid conversation. */ }
      // shortcut: JSON formatting is not guaranteed; only explicitly tagged unclear replies count as misses.
      if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('```')) throw new Error('Gemma returned an invalid structured reply')
      return { text: raw, unclear: false }
    } catch (err) {
      const status = (err as { status?: number }).status
      if (attempt >= 2 || (status !== 500 && status !== 503)) throw err
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
}

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'

interface SpeechRec {
  lang: string
  interimResults: boolean
  onresult: (e: { results: { 0: { transcript: string } }[] }) => void
  onend: () => void
  start: () => void
}
type SpeechCtor = new () => SpeechRec
const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition

export function Chat() {
  const { state, dispatch, chatBusy } = useStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState<{ text: string; afterId?: string } | null>(null)
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { pending, messages } = state.chat

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, chatBusy, sending])

  const send = (t: string) => {
    if (!t.trim() || chatBusy) return
    const sent = dispatch({ type: 'chat/say', text: t })
    if (sent) {
      setSending({ text: t.trim(), afterId: messages.at(-1)?.id })
      void sent.then((ok) => {
        setSending(null)
        if (ok) setText((current) => current === t ? '' : current)
      })
    }
  }

  const savedIndex = messages.findIndex((m) => m.id === sending?.afterId)
  const showSending = sending && chatBusy && !messages.slice(savedIndex + 1).some((m) => m.from === 'elder' && m.text === sending.text)

  const listen = () => {
    if (!Recognition) return inputRef.current?.focus()
    const rec = new Recognition()
    rec.lang = 'vi-VN'
    rec.interimResults = false
    rec.onresult = (e) => send(e.results[0][0].transcript)
    rec.onend = () => setListening(false)
    setListening(true)
    rec.start()
  }

  const chips = !pending
    ? ['Nhắc lịch uống nước', 'Bác muốn mua thuốc', 'Bác muốn đi chợ', 'Lịch hôm nay']
    : pending.stage === 'collect'
      ? ['Không biết', 'Thôi']
      : ['Đúng rồi', 'Không']

  return (
    <div className="chat chat-screen">
      <div className="row between wrap">
        <h1 className="screen-title"><img className="chat-bot" src="/carebot.svg" alt="" /> Trợ lý CAREBOX</h1>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" disabled={chatBusy || messages.length <= 1}
            onClick={() => dispatch({ type: 'chat/clear' })}>Xóa hội thoại</button>
          <button className="btn ghost sm" disabled={chatBusy} onClick={() => dispatch({ type: 'chat/handoff' })}>Gặp nhân viên</button>
        </div>
      </div>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.from}`}>
            {m.from === 'ai' && <span className="avatar">🤖</span>}
            <div className="bubble-msg">
              {m.text}
              <span className="msg-time">{fmtTime(m.at)}</span>
            </div>
          </div>
        ))}
        {showSending && <div className="msg elder"><div className="bubble-msg">{sending.text}</div></div>}
        {chatBusy && <div className="msg ai" role="status"><span className="avatar">🤖</span><div className="bubble-msg">Đang trả lời…</div></div>}
        <div ref={endRef} />
      </div>
      <div className="chips">
        {chips.map((c) => <button key={c} disabled={chatBusy} onClick={() => send(c)}>{c}</button>)}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        <button type="button" className={`mic-sm ${listening ? 'on' : ''}`} onClick={listen} aria-label="Nói" disabled={chatBusy}>🎙️</button>
        <input ref={inputRef} className="input" placeholder="Bác nhắn cho cháu…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="submit" disabled={!text.trim() || chatBusy}>Gửi</button>
      </form>
    </div>
  )
}

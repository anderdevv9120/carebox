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
  const { state, dispatch } = useStore()
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { pending, messages } = state.chat

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = (t: string) => {
    if (!t.trim()) return
    dispatch({ type: 'chat/say', text: t })
    setText('')
  }

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
    <div className="chat">
      <div className="row between">
        <h1 className="screen-title">🤖 Trợ lý CAREBOX</h1>
        <button className="btn ghost sm" onClick={() => dispatch({ type: 'chat/handoff' })}>Gặp nhân viên</button>
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
        <div ref={endRef} />
      </div>
      <div className="chips">
        {chips.map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        <button type="button" className={`mic-sm ${listening ? 'on' : ''}`} onClick={listen} aria-label="Nói">🎙️</button>
        <input ref={inputRef} className="input" placeholder="Bác nhắn cho cháu…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="submit" disabled={!text.trim()}>Gửi</button>
      </form>
    </div>
  )
}

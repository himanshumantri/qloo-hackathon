import { useRef, useState } from 'react'

const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export default function InputScreen({ onSubmit, loading, error }) {
  const [text, setText] = useState('')
  const [brand, setBrand] = useState('')
  const [listening, setListening] = useState(false)
  const recognition = useRef(null)

  function toggleMic() {
    if (listening) {
      recognition.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.onresult = (e) => {
      const spoken = e.results[0][0].transcript
      setText((prev) => (prev ? `${prev} ${spoken}` : spoken))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognition.current = rec
    rec.start()
    setListening(true)
  }

  function submit(e) {
    e.preventDefault()
    if (text.trim()) onSubmit(text.trim(), brand.trim())
  }

  return (
    <form onSubmit={submit} className="screen">
      <p>Describe the food (or menu items, separated by commas) and find out how crunchy it is.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. peri-peri fries, onion rings, soft taco"
        rows={4}
        maxLength={1000}
      />
      {SpeechRecognition && (
        <button type="button" onClick={toggleMic}>
          {listening ? 'Stop listening' : '🎤 Speak instead'}
        </button>
      )}
      <input
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        placeholder="Brand or restaurant (optional)"
        maxLength={100}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading || !text.trim()}>
        {loading ? 'Checking...' : 'Check crunchiness'}
      </button>
    </form>
  )
}

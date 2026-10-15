import { useRef, useState } from 'react'
import { Affinity } from './Rating'
import { MAX_GUESTS } from '../guests'
import { seconds } from '../format'

const CATEGORY_OPTIONS = [
  { id: 'drink', label: 'Drink' },
  { id: 'snack', label: 'Snack' },
  { id: 'music', label: 'Music' },
  { id: 'watch', label: 'Watch' },
]

// Speech-to-text happens on the device (Chrome, Edge, Android); no audio is sent anywhere.
const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

function Recommendation({ result }) {
  if (!result) return null
  if (!result.found) return <p className="warning-text" role="status">{result.message}</p>
  const rec = result.recommendation
  const read = [
    ...(result.extracted?.mentions || []).map((m) => m.name),
    ...(result.extracted?.keywords || []),
  ]
  return (
    <div className="rec-card" role="status">
      <h4>{rec.headline}</h4>
      <Affinity qloo={rec.qloo} />
      {rec.onPlan && <small className="on-plan">Already on your list, so it is in the house.</small>}
      <p>
        <span className="ai-tag">AI note</span> {rec.reason}
      </p>
      <small className="qid" title={rec.entity_id}>
        {rec.name} · Qlooful ID {rec.entity_id.slice(0, 8)}
      </small>
      <details className="rec-proof">
        <summary>How this was found</summary>
        <p className="hint">
          <span className="ai-tag">AI step</span> The AI read your note and picked out: {read.join(', ') || 'nothing specific'}.
          It recommended nothing. Qlooful matched those names and returned the candidates, and the final pick is one of
          Qlooful&apos;s results.
        </p>
        {result.extracted?.unresolved?.length > 0 && (
          <p className="hint">Not found in Qlooful: {result.extracted.unresolved.join(', ')}.</p>
        )}
        {result.evidence && (
          <p className="hint">
            {result.evidence.requests} live Qlooful request{result.evidence.requests === 1 ? '' : 's'} (
            {seconds(result.evidence.totalMs)}s).
          </p>
        )}
      </details>
    </div>
  )
}

// One card per guest: (1) who, (2) what the host knows about them, (3) the one pick.
export default function GuestCards({ guests, onUpdate, onAdd, onRemove, onRecommend }) {
  const [busy, setBusy] = useState({})
  const [errors, setErrors] = useState({})
  const [listeningId, setListeningId] = useState(null)
  const recognition = useRef(null)

  const update = onUpdate

  async function ask(guest) {
    setErrors((e) => ({ ...e, [guest.id]: '' }))
    setBusy((b) => ({ ...b, [guest.id]: true }))
    try {
      const result = await onRecommend(guest)
      update(guest.id, { result })
    } catch (err) {
      setErrors((e) => ({ ...e, [guest.id]: err.message }))
    } finally {
      setBusy((b) => ({ ...b, [guest.id]: false }))
    }
  }

  function toggleMic(guest) {
    if (listeningId === guest.id) {
      recognition.current?.stop()
      return
    }
    recognition.current?.stop()
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.onresult = (e) => {
      const spoken = e.results[0][0].transcript
      update(guest.id, { note: guest.note ? `${guest.note} ${spoken}` : spoken, result: null })
    }
    rec.onend = () => setListeningId(null)
    rec.onerror = () => setListeningId(null)
    recognition.current = rec
    rec.start()
    setListeningId(guest.id)
  }

  return (
    <div className="guests-wrap">
      <ul className="guests">
        {guests.map((guest, index) => {
          const ready = guest.name.trim() && guest.note.trim().length >= 3
          return (
            <li key={guest.id} className="guest-card">
              <div className="gc-col">
                <h3 className="gc-title">1. Guest {index + 1}</h3>
                <label>
                  Name
                  <input
                    value={guest.name}
                    onChange={(e) => update(guest.id, { name: e.target.value, result: null })}
                    placeholder="e.g. Kathy"
                    maxLength={40}
                  />
                </label>
                <div className="chips" role="radiogroup" aria-label={`What to recommend for guest ${index + 1}`}>
                  {CATEGORY_OPTIONS.map((c) => (
                    <label key={c.id} className={`chip ${guest.category === c.id ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name={`cat-${guest.id}`}
                        checked={guest.category === c.id}
                        onChange={() => update(guest.id, { category: c.id, result: null })}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
                {guests.length > 1 && (
                  <button type="button" className="link-btn" onClick={() => onRemove(guest.id)}>
                    Remove guest
                  </button>
                )}
              </div>

              <div className="gc-col">
                <h3 className="gc-title">2. About them</h3>
                <label>
                  What do you know about them?
                  <textarea
                    value={guest.note}
                    onChange={(e) => update(guest.id, { note: e.target.value, result: null })}
                    placeholder="e.g. Big Coldplay fan, plays Sky Full of Stars on repeat with her beer"
                    rows={4}
                    maxLength={500}
                  />
                </label>
                {SpeechRecognition && (
                  <button type="button" onClick={() => toggleMic(guest)}>
                    {listeningId === guest.id ? 'Stop listening' : '🎤 Speak instead'}
                  </button>
                )}
              </div>

              <div className="gc-col">
                <h3 className="gc-title">3. Your one pick</h3>
                <button type="button" className="primary" disabled={!ready || busy[guest.id]} onClick={() => ask(guest)}>
                  {busy[guest.id] ? 'Asking Qlooful...' : 'Get my one pick'}
                </button>
                {errors[guest.id] && <p className="error" role="alert">{errors[guest.id]}</p>}
                <Recommendation result={guest.result} />
              </div>
            </li>
          )
        })}
      </ul>
      {guests.length < MAX_GUESTS && (
        <button type="button" onClick={onAdd}>
          Add another guest
        </button>
      )}
    </div>
  )
}

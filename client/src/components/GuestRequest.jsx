import { useState } from 'react'
import { RatingChip } from './Rating'
import { matchRating } from '../rating'
import { seconds } from '../format'
import { sortByRating } from '../rating'

const CATEGORIES = [
  { id: 'food', label: 'Food or drink', placeholder: "e.g. Domino's" },
  { id: 'music', label: 'Music', placeholder: 'e.g. Foo Fighters' },
  { id: 'watch', label: 'Watch', placeholder: 'e.g. Better Call Saul' },
]

const VERDICT_LABEL = {
  on_list: 'Already on your list',
  close_match: 'Close match',
  loose_match: 'Partial match',
  not_close: 'Nothing close planned',
}

// Qlooful's rating for a guest-request result, with its position among Qlooful's nearest matches.
function MatchNumbers({ item }) {
  if (!matchRating(item.affinity)) return null
  return (
    <span className="aff-inline">
      {' '}
      <RatingChip affinity={item.affinity} />
      {item.rank ? <small> #{item.rank} closest of 50</small> : null}
    </span>
  )
}

// "A guest asked for X": Qlooful compares it with the host's planned picks.
export default function GuestRequest({ plan, onMatch }) {
  const [category, setCategory] = useState('music')
  const [item, setItem] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState(null)

  async function check(e) {
    e.preventDefault()
    if (!item.trim()) return
    setLoading(true)
    setError('')
    setAnswer(null)
    try {
      const picks = (plan[category] || []).map(({ entity_id, name, type }) => ({ entity_id, name, type }))
      setAnswer(await onMatch({ category, item: item.trim(), picks }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const current = CATEGORIES.find((c) => c.id === category)

  return (
    <section className="block">
      <h2>A guest asked for something?</h2>
      <p className="hint">
        Type what they asked for. Qlooful checks how close it is to what you have planned, so you can answer with
        confidence.
      </p>
      <form className="match-form" onSubmit={check}>
        <div className="chips" role="radiogroup" aria-label="What kind of request">
          {CATEGORIES.map((c) => (
            <label key={c.id} className={`chip ${category === c.id ? 'selected' : ''}`}>
              <input type="radio" name="matchCategory" checked={category === c.id} onChange={() => setCategory(c.id)} />
              {c.label}
            </label>
          ))}
        </div>
        <input
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder={current.placeholder}
          maxLength={60}
          aria-label="What the guest asked for"
        />
        <button type="submit" className="primary" disabled={loading || !item.trim()}>
          {loading ? 'Checking with Qlooful...' : 'Check with Qlooful'}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {answer && !answer.found && <p className="warning-text" role="status">{answer.message}</p>}
      {answer && answer.found && (
        <div className={`answer ${answer.verdict}`} role="status">
          <small className="tag">{VERDICT_LABEL[answer.verdict]}</small>
          <h3>{answer.headline}</h3>
          <p>{answer.reply}</p>
          <p className="hint">Qlooful understood the request as {answer.guest.name}.</p>
          {answer.closest.length > 0 && answer.verdict !== 'on_list' && (
            <>
              <h4>Closest on your list</h4>
              <ul className="mini">
                {sortByRating(answer.closest, (c) => c.affinity).map((c) => (
                  <li key={c.entity_id}>
                    <strong>{c.name}</strong>
                    <MatchNumbers item={c} />
                    {c.why && <span> {c.why}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {answer.suggestions.length > 0 && answer.verdict !== 'on_list' && (
            <>
              <h4>Qlooful suggests adding</h4>
              <ul className="mini">
                {sortByRating(answer.suggestions, (c) => c.affinity).map((c) => (
                  <li key={c.entity_id}>
                    <strong>{c.name}</strong>
                    <MatchNumbers item={c} />
                    {c.why && <span> {c.why}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {answer.evidence && (
            <p className="hint">
              Answered from {answer.evidence.requests} live Qlooful request{answer.evidence.requests === 1 ? '' : 's'} (
              {seconds(answer.evidence.totalMs)}s).
            </p>
          )}
        </div>
      )}
    </section>
  )
}

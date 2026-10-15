import { useState } from 'react'

const TYPE_LABEL ={ brand: 'Brand', place: 'Place', artist: 'Artist', movie: 'Movie', tv_show: 'TV show' }

function Crunch({ score }) {
  return (
    <span className="crunch" aria-label={`Crunch ${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= score ? 'on' : ''} />
      ))}
      <b>{score}/5 crunch</b>
    </span>
  )
}

function Picks({ title, items, showCrunch }) {
  if (!items.length) return null
  return (
    <section className="block">
      <h2>{title}</h2>
      <ul className="picks">
        {items.map((p) => (
          <li key={p.entity_id}>
            <strong>{p.name}</strong> <small className="tag">{TYPE_LABEL[p.type] || p.type}</small>
            {showCrunch && typeof p.crunch === 'number' && <Crunch score={p.crunch} />}
            <p>{p.why}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers without the async clipboard API.
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

function Playlist({ songs }) {
  const [status, setStatus] = useState('')
  if (!songs.length) return null
  const text = songs.map((s) => `${s.artist} - ${s.title}`).join('\n')

  async function copyAll() {
    setStatus((await copyText(text)) ? 'Copied!' : 'Could not copy, select the list below instead.')
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <section className="block">
      <h2>Starter playlist</h2>
      <p className="hint">
        Add these {songs.length} songs to a new Spotify playlist. Once they are in, Spotify suggests more songs in the
        same vibe at the bottom of the playlist. The artists come from Qloo.
      </p>
      <ol className="songs">
        {songs.map((s) => (
          <li key={`${s.artist}-${s.title}`}>
            <span>
              <strong>{s.title}</strong> <small>{s.artist}</small>
            </span>
            <a href={s.url} target="_blank" rel="noreferrer">
              Open in Spotify
            </a>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="primary" onClick={copyAll}>
          Copy song list
        </button>
      </div>
      {status && <p className="hint" role="status">{status}</p>}
    </section>
  )
}

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

// "A guest asked for X": Qloo compares it with the host's planned picks.
function GuestRequest({ plan, onMatch }) {
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
        Type what they asked for. Qloo checks how close it is to what you have planned, so you can answer with
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
          {loading ? 'Checking with Qloo...' : 'Check with Qloo'}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {answer && !answer.found && <p className="warning-text" role="status">{answer.message}</p>}
      {answer && answer.found && (
        <div className={`answer ${answer.verdict}`} role="status">
          <small className="tag">{VERDICT_LABEL[answer.verdict]}</small>
          <h3>{answer.headline}</h3>
          <p>{answer.reply}</p>
          <p className="hint">Qloo understood the request as {answer.guest.name}.</p>
          {answer.closest.length > 0 && answer.verdict !== 'on_list' && (
            <>
              <h4>Closest on your list</h4>
              <ul className="mini">
                {answer.closest.map((c) => (
                  <li key={c.entity_id}>
                    <strong>{c.name}</strong>
                    {c.why && <span> {c.why}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {answer.suggestions.length > 0 && answer.verdict !== 'on_list' && (
            <>
              <h4>Qloo suggests adding</h4>
              <ul className="mini">
                {answer.suggestions.map((c) => (
                  <li key={c.entity_id}>
                    <strong>{c.name}</strong>
                    {c.why && <span> {c.why}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function Signals({ signals }) {
  const rows = [
    ['Occasion', signals.occasion],
    ['Qloo tags used', (signals.tags || []).join(', ')],
    ['Guest favorites matched in Qloo', (signals.seeds || []).join(', ')],
    ['Audiences', (signals.audiences || []).join(', ')],
    ['Notes', (signals.notes || []).join(', ')],
    ['Not found in Qloo', (signals.unresolved || []).join(', ')],
  ].filter(([, value]) => value)
  return (
    <details className="block">
      <summary>How Qloo shaped this plan</summary>
      <p className="hint">
        Every food, music and watch pick above came from Qloo. Super Host only chose among Qloo&apos;s results and
        wrote the explanations and checklist.
      </p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export default function PlanResult({ saved, onToggle, onReset, onMatch }) {
  const { plan, signals, checked } = saved
  const done = plan.checklist.filter((_, i) => checked[i]).length

  return (
    <div className="screen">
      <p className="summary">{plan.summary}</p>

      {plan.warnings.length > 0 && (
        <div className="warning" role="note">
          {plan.warnings.map((w) => (
            <p key={w}>⚠️ {w}</p>
          ))}
        </div>
      )}

      <Picks title="Food and drink" items={plan.food} showCrunch />
      <Picks title="Music" items={plan.music} />
      <Playlist songs={plan.songs || []} />
      <Picks title="Watch" items={plan.watch} />

      <section className="block">
        <h2>Your checklist</h2>
        <p className="hint">
          {done} of {plan.checklist.length} done. Saved on this device.
        </p>
        <ul className="checklist">
          {plan.checklist.map((item, i) => (
            <li key={`${item.when}-${item.task}`} className={checked[i] ? 'done' : ''}>
              <label className="check">
                <input type="checkbox" checked={Boolean(checked[i])} onChange={() => onToggle(i)} />
                <span>
                  <small className="tag">{item.when}</small> {item.task}
                  {item.note && <small className="note"> {item.note}</small>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <GuestRequest plan={plan} onMatch={onMatch} />

      <Signals signals={signals} />

      <button type="button" onClick={onReset}>
        Plan another night
      </button>
    </div>
  )
}

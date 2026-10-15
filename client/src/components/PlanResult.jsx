import { useRef, useState } from 'react'

const TYPE_LABEL = { brand: 'Brand', place: 'Place', artist: 'Artist', movie: 'Movie', tv_show: 'TV show' }

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

const RATING_HELP =
  "Qlooful's own match rating for this pick against the signals shown: HIGH, CLOSE or WORTH A TRY. Weaker matches are not shown."

// Qlooful's rating bands. Anything below 0.8 is never shown (the server filters it out too).
function matchRating(affinity) {
  if (affinity === null || affinity === undefined) return null
  if (affinity >= 0.95) return { text: 'HIGH match', level: 'high' }
  if (affinity >= 0.9) return { text: 'CLOSE match', level: 'close' }
  if (affinity >= 0.8) return { text: 'WORTH A TRY', level: 'try' }
  return null
}

function RatingChip({ affinity }) {
  const rating = matchRating(affinity)
  if (!rating) return null
  return (
    <span className={`rating ${rating.level}`} title={RATING_HELP}>
      {rating.text}
    </span>
  )
}

// Qlooful's own rating for a pick (never written by the AI) and the signals behind it.
function Affinity({ qloo }) {
  if (!qloo) return null
  const { affinity, drivers = [] } = qloo
  if (affinity === null || affinity === undefined) {
    return <small className="affinity-note">Genre match from Qlooful</small>
  }
  const matched = drivers.map((d) => d.name).join(', ')
  return (
    <div className="affinity">
      <RatingChip affinity={affinity} />
      {matched && <small className="aff-why">Matched on {matched}</small>}
    </div>
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
            <Affinity qloo={p.qloo} />
            {showCrunch && typeof p.crunch === 'number' && <Crunch score={p.crunch} />}
            <p>
              <span className="ai-tag">AI note</span> {p.why}
            </p>
            <small className="qid" title={p.entity_id}>
              Qlooful ID {p.entity_id.slice(0, 8)}
            </small>
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
        same vibe at the bottom of the playlist. The artists come from Qlooful.
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

const seconds = (ms) => (ms / 1000).toFixed(1)

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
          <p>
            <span className="ai-tag">AI note</span> {answer.reply}
          </p>
          <p className="hint">Qlooful understood the request as {answer.guest.name}.</p>
          {answer.closest.length > 0 && answer.verdict !== 'on_list' && (
            <>
              <h4>Closest on your list</h4>
              <ul className="mini">
                {answer.closest.map((c) => (
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
                {answer.suggestions.map((c) => (
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

// The proof panel: what Qlooful was asked, and every live request made to build this plan.
function Proof({ signals, evidence, open, onToggle, panelRef }) {
  const rows = [
    ['Occasion', signals.occasion],
    ['Qlooful tags used', (signals.tags || []).join(', ')],
    ['Guest favorites matched in Qlooful', (signals.seeds || []).join(', ')],
    ['Audiences', (signals.audiences || []).join(', ')],
    ['Notes', (signals.notes || []).join(', ')],
    ['Not found in Qlooful', (signals.unresolved || []).join(', ')],
  ].filter(([, value]) => value)
  return (
    <details className="block proof" open={open} onToggle={(e) => onToggle(e.currentTarget.open)} ref={panelRef}>
      <summary>How Qlooful shaped this plan</summary>
      <p className="hint">
        Every food, music and watch pick above came from Qlooful&apos;s taste data, along with its match rating and
        ID. The planner (AI) only chose among those results and wrote the notes marked &quot;AI note&quot; and the
        checklist.
      </p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {evidence && evidence.calls && (
        <>
          <h3 className="proof-title">Live Qlooful requests for this plan</h3>
          <p className="hint">
            {evidence.requests} requests, {evidence.cached} answered from a short-lived cache, {seconds(evidence.totalMs)}s
            of Qlooful time.
          </p>
          <ol className="calls">
            {evidence.calls.map((c, i) => (
              <li key={i}>
                <span>
                  <strong>{c.what}</strong>
                  <small>
                    {c.endpoint} · {c.results} result{c.results === 1 ? '' : 's'} · {c.ms} ms{c.cached ? ' · cached' : ''}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </details>
  )
}

export default function PlanResult({ saved, onToggle, onReset, onMatch }) {
  const { plan, signals, checked, evidence } = saved
  const done = plan.checklist.filter((_, i) => checked[i]).length
  const [proofOpen, setProofOpen] = useState(false)
  const proofRef = useRef(null)

  function showProof() {
    setProofOpen(true)
    // Wait for the panel to open, then bring it into view.
    setTimeout(() => proofRef.current && proofRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <div className="screen">
      <p className="summary">{plan.summary}</p>

      {evidence && evidence.requests > 0 && (
        <div className="evidence-banner" role="note">
          <strong>Built from {evidence.requests} live Qlooful requests</strong>
          <span>
            Every pick below carries Qlooful&apos;s own ID and match rating. Text marked &quot;AI note&quot; is the only part
            written by AI.
          </span>
          <button type="button" onClick={showProof}>
            See the live requests
          </button>
        </div>
      )}

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

      <Proof signals={signals} evidence={evidence} open={proofOpen} onToggle={setProofOpen} panelRef={proofRef} />

      <button type="button" onClick={onReset}>
        Plan another night
      </button>
    </div>
  )
}

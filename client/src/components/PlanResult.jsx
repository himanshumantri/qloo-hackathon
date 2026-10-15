import { useRef, useState } from 'react'
import { Affinity } from './Rating'
import { seconds } from '../format'

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

export default function PlanResult({ saved, onToggle, onReset, onParty }) {
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

      <section className="block party-cta">
        <h2>Ready for the party?</h2>
        <p className="hint">
          On the day, open the party page to handle last-minute guest requests and give each guest one personal
          recommendation.
        </p>
        <button type="button" className="primary" onClick={onParty}>
          It&apos;s party time
        </button>
      </section>

      <Proof signals={signals} evidence={evidence} open={proofOpen} onToggle={setProofOpen} panelRef={proofRef} />

      <button type="button" onClick={onReset}>
        Plan another night
      </button>
    </div>
  )
}

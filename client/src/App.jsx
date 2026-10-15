import { useRef, useState } from 'react'
import Wizard from './components/Wizard'
import Loading from './components/Loading'
import PlanResult from './components/PlanResult'
import PartyPage from './components/PartyPage'
import { createGuest, MAX_GUESTS } from './guests'
import { loadSaved, save, clearSaved } from './storage'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function post(path, body) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // The browser could not reach the server at all (offline, or the free host is waking up).
    throw new Error("Can't reach the server. It may be waking up (free hosting can take about a minute), so please try again shortly.")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

const list = (text) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function toPayload(form) {
  return {
    occasion: form.occasion,
    occasionText: form.occasionText,
    guestRange: form.guestRange,
    kidsCount: form.kidsCount,
    malePercent: form.malePercent,
    city: form.city,
    considerations: {
      allergies: form.allergies,
      noise: form.noise,
      speakerFriendly: form.speakerFriendly,
      kidsPresent: form.kidsPresent,
      crunchy: form.crunchy,
      includeScreen: form.includeScreen,
    },
    favorites: { artists: list(form.artists), brands: list(form.brands), shows: list(form.shows) },
  }
}

function App() {
  const [saved, setSaved] = useState(loadSaved)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null) // keeps the form if planning fails
  const savedRef = useRef(saved) // always the latest saved plan, for async guest updates (kept in sync by commit)

  async function generate(form) {
    setLoading(true)
    setError('')
    setDraft(form)
    try {
      const data = await post('/api/plan', toPayload(form))
      const next = { form, plan: data.plan, signals: data.signals, evidence: data.evidence, checked: {}, createdAt: Date.now() }
      commit(next)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function commit(next) {
    save(next)
    setSaved(next)
    savedRef.current = next
  }

  // Party day: open/close the party page (guests start with one blank card).
  function openParty() {
    const cur = savedRef.current
    commit({ ...cur, view: 'party', guests: cur.guests && cur.guests.length ? cur.guests : [createGuest()] })
  }
  function closeParty() {
    commit({ ...savedRef.current, view: 'plan' })
  }
  function updateGuest(id, patch) {
    const cur = savedRef.current
    commit({ ...cur, guests: cur.guests.map((g) => (g.id === id ? { ...g, ...patch } : g)) })
  }
  function addGuest() {
    const cur = savedRef.current
    if (cur.guests.length < MAX_GUESTS) commit({ ...cur, guests: [...cur.guests, createGuest()] })
  }
  function removeGuest(id) {
    const cur = savedRef.current
    commit({ ...cur, guests: cur.guests.filter((g) => g.id !== id) })
  }
  function recommendForGuest(guest) {
    const { plan } = savedRef.current
    const planned = [...plan.food, ...plan.music, ...plan.watch].map(({ entity_id, name, type }) => ({ entity_id, name, type }))
    return post('/api/guest', { name: guest.name, note: guest.note, category: guest.category, planned })
  }

  function toggle(index) {
    commit({ ...saved, checked: { ...saved.checked, [index]: !saved.checked[index] } })
  }

  function reset() {
    clearSaved()
    setSaved(null)
    savedRef.current = null
    setDraft(null)
  }

  return (
    <main className={`app ${saved && saved.view === 'party' ? 'wide' : ''}`}>
      <header>
        <h1>Qlooful Host</h1>
        <p className="tagline">Plan the perfect night for your guests, powered by Qlooful.</p>
      </header>
      {loading ? (
        <Loading />
      ) : saved && saved.view === 'party' ? (
        <PartyPage
          saved={saved}
          onBack={closeParty}
          onMatch={(body) => post('/api/match', body)}
          onUpdateGuest={updateGuest}
          onAddGuest={addGuest}
          onRemoveGuest={removeGuest}
          onRecommend={recommendForGuest}
          onNewParty={reset}
        />
      ) : saved ? (
        <PlanResult saved={saved} onToggle={toggle} onReset={reset} onParty={openParty} />
      ) : (
        <Wizard initial={draft} startAtEnd={Boolean(draft)} onSubmit={generate} loading={loading} error={error} />
      )}
    </main>
  )
}

export default App

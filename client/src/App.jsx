import { useState } from 'react'
import Wizard from './components/Wizard'
import Loading from './components/Loading'
import PlanResult from './components/PlanResult'
import { loadSaved, save, clearSaved } from './storage'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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
    guestMin: form.guestMin,
    guestMax: form.guestMax,
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

  async function generate(form) {
    setLoading(true)
    setError('')
    setDraft(form)
    try {
      const data = await post('/api/plan', toPayload(form))
      const next = { form, plan: data.plan, signals: data.signals, checked: {}, createdAt: Date.now() }
      save(next)
      setSaved(next)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggle(index) {
    const next = { ...saved, checked: { ...saved.checked, [index]: !saved.checked[index] } }
    save(next)
    setSaved(next)
  }

  function reset() {
    clearSaved()
    setSaved(null)
    setDraft(null)
  }

  return (
    <main className="app">
      <header>
        <h1>Super Host</h1>
        <p className="tagline">Plan the perfect night for your guests, powered by Qloo.</p>
      </header>
      {loading ? (
        <Loading />
      ) : saved ? (
        <PlanResult saved={saved} onToggle={toggle} onReset={reset} />
      ) : (
        <Wizard initial={draft} startAtEnd={Boolean(draft)} onSubmit={generate} loading={loading} error={error} />
      )}
    </main>
  )
}

export default App

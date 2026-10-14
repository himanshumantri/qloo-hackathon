import { useState } from 'react'

const OCCASIONS = [
  { id: 'kids_outing', label: "Kids' outing", icon: '🎈' },
  { id: 'beer_party', label: 'Beer party', icon: '🍺' },
  { id: 'binge_night', label: 'Binge night', icon: '🍿' },
  { id: 'poker_night', label: 'Poker night', icon: '🃏' },
  { id: 'custom', label: 'Something else', icon: '✨' },
]

const DEFAULT_FORM = {
  occasion: 'beer_party',
  occasionText: '',
  guestMin: 10,
  guestMax: 15,
  malePercent: 50,
  city: '',
  allergies: '',
  noise: 'any',
  speakerFriendly: false,
  kidsPresent: false,
  crunchy: false,
  includeScreen: false,
  artists: '',
  brands: '',
  shows: '',
}

const STEPS = ['Occasion', 'Guests', 'Details']

export default function Wizard({ initial, startAtEnd, onSubmit, loading, error }) {
  const [form, setForm] = useState(initial || DEFAULT_FORM)
  const [step, setStep] = useState(startAtEnd ? STEPS.length - 1 : 0)
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  function setGuests(field, value) {
    const n = Math.max(1, Math.min(500, Number(value) || 1))
    set(field === 'guestMin' ? { guestMin: n, guestMax: Math.max(n, form.guestMax) } : { guestMax: Math.max(n, form.guestMin) })
  }

  return (
    <form
      className="screen"
      onSubmit={(e) => {
        e.preventDefault()
        if (step < STEPS.length - 1) setStep(step + 1)
        else onSubmit(form)
      }}
    >
      <ol className="steps" aria-label="Progress">
        {STEPS.map((name, i) => (
          <li key={name} className={i === step ? 'current' : i < step ? 'done' : ''}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <fieldset>
          <legend>What are you hosting?</legend>
          <div className="cards">
            {OCCASIONS.map((o) => (
              <label key={o.id} className={`card ${form.occasion === o.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="occasion"
                  checked={form.occasion === o.id}
                  onChange={() => set({ occasion: o.id })}
                />
                <span aria-hidden="true">{o.icon}</span> {o.label}
              </label>
            ))}
          </div>
          {form.occasion === 'custom' && (
            <input
              value={form.occasionText}
              onChange={(e) => set({ occasionText: e.target.value })}
              placeholder="Describe it, e.g. farewell lunch for the team"
              maxLength={60}
            />
          )}
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend>Who is coming?</legend>
          <div className="row">
            <label>
              Guests, from
              <input type="number" inputMode="numeric" min="1" max="500" value={form.guestMin} onChange={(e) => setGuests('guestMin', e.target.value)} />
            </label>
            <label>
              to
              <input type="number" inputMode="numeric" min="1" max="500" value={form.guestMax} onChange={(e) => setGuests('guestMax', e.target.value)} />
            </label>
          </div>
          <label>
            Guest mix: {form.malePercent}% male / {100 - form.malePercent}% female
            <input type="range" min="0" max="100" step="5" value={form.malePercent} onChange={(e) => set({ malePercent: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.kidsPresent} onChange={(e) => set({ kidsPresent: e.target.checked })} />
            Kids will be there
          </label>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend>Anything special?</legend>
          <label>
            Food allergies in the group (optional)
            <input value={form.allergies} onChange={(e) => set({ allergies: e.target.value })} placeholder="e.g. peanuts, shellfish" maxLength={200} />
          </label>
          <label>
            Music volume
            <select value={form.noise} onChange={(e) => set({ noise: e.target.value })}>
              <option value="any">No preference</option>
              <option value="low">Low: people should be able to talk</option>
              <option value="high">High: loud and energetic</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.speakerFriendly} onChange={(e) => set({ speakerFriendly: e.target.checked })} />
            Speaker-friendly music (plays well on a portable speaker)
          </label>
          <label className="check">
            <input type="checkbox" checked={form.crunchy} onChange={(e) => set({ crunchy: e.target.checked })} />
            Make the food crunchy
          </label>
          <label className="check">
            <input type="checkbox" checked={form.includeScreen} onChange={(e) => set({ includeScreen: e.target.checked })} />
            Include movies / TV
          </label>
          <label>
            City, for local restaurant picks (optional)
            <input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="e.g. London" maxLength={60} />
          </label>
          <p className="hint">Things your guests love (optional, separate with commas). Qloo uses these to match taste.</p>
          <label>
            Artists
            <input value={form.artists} onChange={(e) => set({ artists: e.target.value })} placeholder="e.g. Coldplay, Beyoncé" />
          </label>
          <label>
            Food and drink brands or restaurants
            <input value={form.brands} onChange={(e) => set({ brands: e.target.value })} placeholder="e.g. Heineken, Pizza Hut" />
          </label>
          <label>
            Shows
            <input value={form.shows} onChange={(e) => set({ shows: e.target.value })} placeholder="e.g. Breaking Bad" />
          </label>
        </fieldset>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <div className="row nav">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} disabled={loading}>
            Back
          </button>
        )}
        <button type="submit" className="primary" disabled={loading}>
          {step < STEPS.length - 1 ? 'Next' : 'Plan my night'}
        </button>
      </div>
    </form>
  )
}

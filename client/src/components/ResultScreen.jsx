import { useState } from 'react'

function CrunchMeter({ score }) {
  return (
    <div className="meter" aria-label={`Crunch score ${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= score ? 'on' : ''} />
      ))}
      <strong>{score}/5</strong>
    </div>
  )
}

export default function ResultScreen({ result, onPick, onMusic, onReset }) {
  const [music, setMusic] = useState(null)
  const [musicError, setMusicError] = useState('')

  async function loadMusic() {
    const top = result.dishes.find((d) => d.name === result.crunchiest) || result.dishes[0]
    setMusicError('')
    try {
      setMusic(await onMusic(top.name, top.score))
    } catch (e) {
      setMusicError(e.message)
    }
  }

  if (result.needsPick) {
    return (
      <div className="screen">
        <p>That's a lot of dishes. Pick one to check:</p>
        {result.dishes.map((d) => (
          <button key={d.name} onClick={() => onPick(d.name)}>
            {d.name}
          </button>
        ))}
        <button onClick={onReset}>Start over</button>
      </div>
    )
  }

  return (
    <div className="screen">
      {result.brand && <p>Brand / restaurant: {result.brand}</p>}
      {result.dishes.map((d) => (
        <div key={d.name} className="dish">
          <h2>
            {d.name}
            {result.dishes.length > 1 && d.name === result.crunchiest ? ' ⭐ crunchiest' : ''}
          </h2>
          <CrunchMeter score={d.score} />
          <p>{d.message}</p>
          <small>{d.why}</small>
        </div>
      ))}

      <div className="music">
        <p>Is this for a social gathering or beer party? Want music to go with it?</p>
        {!music && <button onClick={loadMusic}>Yes, suggest music</button>}
        {musicError && <p className="error">{musicError}</p>}
        {music && (
          <ul>
            {music.suggestions.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong> {s.note}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button onClick={onReset}>Check another</button>
    </div>
  )
}

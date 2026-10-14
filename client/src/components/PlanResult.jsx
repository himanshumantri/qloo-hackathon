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
            {showCrunch && typeof p.crunch === 'number' && <Crunch score={p.crunch} />}
            <p>{p.why}</p>
          </li>
        ))}
      </ul>
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

export default function PlanResult({ saved, onToggle, onReset }) {
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

      <Signals signals={signals} />

      <button type="button" onClick={onReset}>
        Plan another night
      </button>
    </div>
  )
}

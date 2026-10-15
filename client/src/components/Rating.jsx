import { matchRating, RATING_HELP } from '../rating'

export function RatingChip({ affinity }) {
  const rating = matchRating(affinity)
  if (!rating) return null
  return (
    <span className={`rating ${rating.level}`} title={RATING_HELP}>
      {rating.text}
    </span>
  )
}

// Qlooful's own rating for a pick (never written by the AI) and the signals behind it.
export function Affinity({ qloo }) {
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

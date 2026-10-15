export const RATING_HELP =
  "Qlooful's own match rating for this pick against the signals shown: HIGH, CLOSE or WORTH A TRY. Weaker matches are not shown."

// Sort picks so HIGH matches come first, then CLOSE, then WORTH A TRY; picks with no rating (genre-only
// searches) go last. The sort is stable, so ties keep Qlooful's own order.
const BAND_ORDER = { high: 0, close: 1, try: 2 }
export function sortByRating(items, affinityOf = (item) => item.qloo && item.qloo.affinity) {
  const band = (item) => {
    const rating = matchRating(affinityOf(item))
    return rating ? BAND_ORDER[rating.level] : 3
  }
  return [...items].sort((a, b) => band(a) - band(b))
}

// Qlooful's rating bands. Anything below 0.7 is never shown (the server filters it out too).
export function matchRating(affinity) {
  if (affinity === null || affinity === undefined) return null
  if (affinity >= 0.95) return { text: 'HIGH match', level: 'high' }
  if (affinity >= 0.85) return { text: 'CLOSE match', level: 'close' }
  if (affinity >= 0.7) return { text: 'WORTH A TRY', level: 'try' }
  return null
}

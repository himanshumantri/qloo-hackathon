export const RATING_HELP =
  "Qlooful's own match rating for this pick against the signals shown: HIGH, CLOSE or WORTH A TRY. Weaker matches are not shown."

// Qlooful's rating bands. Anything below 0.7 is never shown (the server filters it out too).
export function matchRating(affinity) {
  if (affinity === null || affinity === undefined) return null
  if (affinity >= 0.95) return { text: 'HIGH match', level: 'high' }
  if (affinity >= 0.85) return { text: 'CLOSE match', level: 'close' }
  if (affinity >= 0.7) return { text: 'WORTH A TRY', level: 'try' }
  return null
}

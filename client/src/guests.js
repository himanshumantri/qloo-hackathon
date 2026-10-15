export const MAX_GUESTS = 8

// A blank guest card. Guests, their notes and their recommendations are saved in the browser only.
export function createGuest() {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return { id, name: '', note: '', category: 'drink', result: null }
}

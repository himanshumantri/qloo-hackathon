// The plan and checklist are saved in the browser only (no database). localStorage can be
// missing or throw (private windows, blocked site data), so every access is wrapped.
const KEY = 'superhost.plan.v1'

export function loadSaved() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Saving is a convenience; the app still works without it.
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

import { useEffect, useState } from 'react'

// Planning takes 30-45 seconds, so show what Super Host is doing while the host waits.
const MESSAGES = [
  'Asking Qloo what your guests will love...',
  'Matching food brands and places...',
  'Finding music that fits the food and the crowd...',
  'Checking movies and shows...',
  'Writing your checklist...',
]

export default function Loading() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, MESSAGES.length - 1)), 7000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="screen loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{MESSAGES[index]}</p>
      <small>This usually takes 30 to 45 seconds.</small>
    </div>
  )
}

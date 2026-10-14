import { useState } from 'react'
import InputScreen from './components/InputScreen'
import ResultScreen from './components/ResultScreen'
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

function App() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastInput, setLastInput] = useState(null)

  async function score(text, brand) {
    setLoading(true)
    setError('')
    try {
      setLastInput({ text, brand })
      setResult(await post('/api/score', { text, brand }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <h1>Crunchy Comida</h1>
      {result ? (
        <ResultScreen
          result={result}
          onPick={(dish) => score(dish, lastInput?.brand)}
          onMusic={(dish, score) => post('/api/music', { dish, score })}
          onReset={() => setResult(null)}
        />
      ) : (
        <InputScreen onSubmit={score} loading={loading} error={error} />
      )}
    </main>
  )
}

export default App

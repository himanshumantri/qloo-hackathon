require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const MAX_TEXT_LENGTH = 1000;

// Comma-separated list of allowed frontend origins (e.g. your Vercel URL)
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10kb' }));

// Minimal in-memory rate limiter: 30 requests per minute per IP
const hits = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }
  recent.push(now);
  hits.set(req.ip, recent);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// STUB: replace with real LLM / Qloo calls once rules and API access are confirmed.
// Splits the description into dishes on commas / "and" / newlines and scores each.
function stubScore(text) {
  const dishes = text
    .split(/,|\n|\band\b/i)
    .map((d) => d.trim())
    .filter(Boolean);
  return dishes.map((name) => {
    const hash = [...name.toLowerCase()].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { name, score: hash % 6, why: 'Placeholder score (AI scoring not connected yet).' };
  });
}

function messageFor(score) {
  if (score >= 5) return 'Crackly crunch! Pure crunch heaven.';
  if (score >= 4) return 'Very crunchy, a great pick.';
  if (score >= 3) return 'Pleasantly crunchy.';
  if (score >= 2) return 'Some crunch, but mostly soft.';
  if (score >= 1) return 'Barely any crunch.';
  return 'No crunch at all.';
}

app.post('/api/score', (req, res) => {
  const { text, brand } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Please describe the food item.' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Description is too long (max ${MAX_TEXT_LENGTH} characters).` });
  }

  const dishes = stubScore(text);
  const brandNote = typeof brand === 'string' && brand.trim() ? brand.trim().slice(0, 100) : null;

  // More than 3 dishes: the user must pick one first (no scores yet).
  if (dishes.length > 3) {
    return res.json({ needsPick: true, brand: brandNote, dishes: dishes.map((d) => ({ name: d.name })) });
  }

  const ranked = dishes
    .map((d) => ({ ...d, message: messageFor(d.score) }))
    .sort((a, b) => b.score - a.score);
  res.json({ needsPick: false, brand: brandNote, dishes: ranked, crunchiest: ranked[0].name });
});

// STUB: replace with Qloo music recommendations.
app.post('/api/music', (req, res) => {
  const { dish } = req.body || {};
  if (typeof dish !== 'string' || !dish.trim()) {
    return res.status(400).json({ error: 'Missing dish.' });
  }
  res.json({
    dish: dish.trim().slice(0, 100),
    suggestions: [
      { title: 'Placeholder: upbeat party mix', note: 'Music recommendations are not connected yet.' },
    ],
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

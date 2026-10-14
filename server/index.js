require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scoreFoods, suggestMusic, MODEL } = require('./agent');

const app = express();
const PORT = process.env.PORT || 4000;
const MAX_TEXT_LENGTH = 1000;
const MAX_DISHES_TO_SCORE = 3;
// Safety net for the Claude spend cap: AI requests allowed per UTC day (resets on restart too)
const MAX_DAILY_AI_CALLS = Number(process.env.MAX_DAILY_AI_CALLS || 300);

// Comma-separated list of allowed frontend origins (e.g. your Vercel URL)
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

// Render sits behind a proxy; trust it so req.ip is the real client IP
app.set('trust proxy', 1);

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

// Daily cap on AI calls, applied to the endpoints that spend money
let aiDay = '';
let aiCalls = 0;
function aiBudget(_req, res, next) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== aiDay) {
    aiDay = today;
    aiCalls = 0;
  }
  if (aiCalls >= MAX_DAILY_AI_CALLS) {
    return res.status(503).json({ error: 'The demo has reached its daily AI limit. Please try again tomorrow.' });
  }
  aiCalls += 1;
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

function messageFor(score) {
  if (score >= 5) return 'Crackly crunch! Pure crunch heaven.';
  if (score >= 4) return 'Very crunchy, a great pick.';
  if (score >= 3) return 'Pleasantly crunchy.';
  if (score >= 2) return 'Some crunch, but mostly soft.';
  if (score >= 1) return 'Barely any crunch.';
  return 'No crunch at all.';
}

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

app.post('/api/score', aiBudget, async (req, res) => {
  const { text, brand } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Please describe the food item.' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Description is too long (max ${MAX_TEXT_LENGTH} characters).` });
  }

  const dishNames = text
    .split(/,|;|\n/)
    .map((d) => d.trim())
    .filter(Boolean);
  const brandNote = clean(brand, 100) || null;

  // Too many dishes: the user must pick one first (no AI call yet).
  if (dishNames.length > MAX_DISHES_TO_SCORE) {
    return res.json({ needsPick: true, brand: brandNote, dishes: dishNames.map((name) => ({ name })) });
  }

  try {
    const scored = await scoreFoods({ dishes: dishNames, brand: brandNote });
    const ranked = scored
      .map((d) => ({ ...d, message: messageFor(d.score) }))
      .sort((a, b) => b.score - a.score);
    res.json({ needsPick: false, brand: brandNote, dishes: ranked, crunchiest: ranked[0].name });
  } catch (err) {
    console.error('score failed:', err.message);
    res.status(502).json({ error: 'Could not score that right now. Please try again.' });
  }
});

app.post('/api/music', aiBudget, async (req, res) => {
  const { dish, score, occasion } = req.body || {};
  const dishName = clean(dish, 100);
  if (!dishName) {
    return res.status(400).json({ error: 'Missing dish.' });
  }
  const numericScore = Number.isInteger(score) && score >= 0 && score <= 5 ? score : null;

  try {
    const suggestions = await suggestMusic({
      dish: dishName,
      score: numericScore,
      occasion: clean(occasion, 100) || 'social gathering or beer party',
    });
    res.json({ dish: dishName, suggestions: suggestions.map((s) => ({ title: s.artist, note: s.why })) });
  } catch (err) {
    console.error('music failed:', err.message);
    res.status(502).json({ error: 'Could not get music suggestions right now. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (model: ${MODEL})`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { buildPool, warmTags, OCCASIONS } = require('./pipeline');
const { composePlan, MODEL } = require('./agent');

const app = express();
const PORT = process.env.PORT || 4000;
// Safety net for the Claude spend cap: AI requests allowed per UTC day (resets on restart too)
const MAX_DAILY_AI_CALLS = Number(process.env.MAX_DAILY_AI_CALLS || 300);
// Qloo requests are serialized, so cap how many plans may be in flight at once.
const MAX_CONCURRENT_PLANS = Number(process.env.MAX_CONCURRENT_PLANS || 3);

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

// ---- input validation -------------------------------------------------------------

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const int = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const names = (list) =>
  (Array.isArray(list) ? list : [])
    .map((x) => clean(x, 60))
    .filter(Boolean)
    .slice(0, 5);

function parsePlanForm(body) {
  const b = body || {};
  const occasion = Object.keys(OCCASIONS).includes(b.occasion) ? b.occasion : 'custom';
  const guestMin = int(b.guestMin, 1, 500, 10);
  const guestMax = Math.max(guestMin, int(b.guestMax, 1, 500, guestMin));
  const c = b.considerations || {};
  const f = b.favorites || {};
  return {
    occasion,
    occasionText: clean(b.occasionText, 60),
    guestMin,
    guestMax,
    malePercent: int(b.malePercent, 0, 100, 50),
    city: clean(b.city, 60),
    considerations: {
      allergies: clean(c.allergies, 200),
      noise: ['low', 'high', 'any'].includes(c.noise) ? c.noise : 'any',
      speakerFriendly: Boolean(c.speakerFriendly),
      kidsPresent: Boolean(c.kidsPresent),
      crunchy: Boolean(c.crunchy),
      includeScreen: Boolean(c.includeScreen),
    },
    favorites: { artists: names(f.artists), brands: names(f.brands), shows: names(f.shows) },
  };
}

// ---- routes -----------------------------------------------------------------------

let plansInFlight = 0;

app.post('/api/plan', aiBudget, async (req, res) => {
  if (plansInFlight >= MAX_CONCURRENT_PLANS) {
    return res.status(503).json({ error: 'Super Host is busy planning other parties. Please retry in a moment.' });
  }
  const form = parsePlanForm(req.body);
  const started = Date.now();
  plansInFlight += 1;
  try {
    const built = await buildPool(form); // Qloo first
    const { plan, dropped, usage } = await composePlan(form, built); // Claude strictly after
    res.json({
      plan,
      signals: { ...built.signals, unresolved: built.unresolved },
      meta: { model: MODEL, dropped, tokens: usage, ms: Date.now() - started },
    });
  } catch (err) {
    console.error('plan failed:', err.message);
    res.status(502).json({ error: 'Could not build a plan right now. Please try again.' });
  } finally {
    plansInFlight -= 1;
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (model: ${MODEL})`);
  warmTags().catch((err) => console.error('tag warm-up failed:', err.message));
});

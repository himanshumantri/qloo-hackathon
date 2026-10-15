require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { buildPool, warmTags, OCCASIONS } = require('./pipeline');
const { composePlan, composeMatchReply, MODEL } = require('./agent');
const { findMatch, CATEGORY_TYPES } = require('./match');
const { withTrace } = require('./qloo');
const { recommendForGuest, CATEGORIES: GUEST_CATEGORIES } = require('./guest');

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
  res.json({ status: 'ok', model: MODEL, commit: (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7) });
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

// Guest-size choices offered in the wizard (min, max); "25+" is planned as 25-40.
const GUEST_RANGES = {
  lt5: [1, 4],
  '5_10': [5, 10],
  '10_15': [10, 15],
  '15_25': [15, 25],
  '25_plus': [25, 40],
};

function parsePlanForm(body) {
  const b = body || {};
  const occasion = Object.keys(OCCASIONS).includes(b.occasion) ? b.occasion : 'custom';
  const guestRange = Object.keys(GUEST_RANGES).includes(b.guestRange) ? b.guestRange : '5_10';
  const [guestMin, guestMax] = GUEST_RANGES[guestRange];
  const c = b.considerations || {};
  const f = b.favorites || {};
  const kidsPresent = Boolean(c.kidsPresent);
  return {
    occasion,
    occasionText: clean(b.occasionText, 60),
    guestRange,
    guestMin,
    guestMax,
    kidsCount: kidsPresent ? int(b.kidsCount, 1, 200, 1) : 0,
    malePercent: int(b.malePercent, 0, 100, 50),
    city: clean(b.city, 60),
    considerations: {
      allergies: clean(c.allergies, 200),
      noise: ['low', 'high', 'any'].includes(c.noise) ? c.noise : 'any',
      speakerFriendly: Boolean(c.speakerFriendly),
      kidsPresent,
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
    return res.status(503).json({ error: 'Qlooful Host is busy planning other parties. Please retry in a moment.' });
  }
  const form = parsePlanForm(req.body);
  const started = Date.now();
  plansInFlight += 1;
  try {
    const { result, evidence } = await withTrace(async () => {
      const built = await buildPool(form); // Qloo first
      const composed = await composePlan(form, built); // Claude strictly after
      return { built, composed };
    });
    const { built, composed } = result;
    res.json({
      plan: composed.plan,
      signals: { ...built.signals, unresolved: built.unresolved },
      evidence,
      meta: { model: MODEL, dropped: composed.dropped, tokens: composed.usage, ms: Date.now() - started },
    });
  } catch (err) {
    console.error('plan failed:', err.message);
    res.status(502).json({ error: 'Could not build a plan right now. Please try again.' });
  } finally {
    plansInFlight -= 1;
  }
});


// ---- last-minute guest request ----------------------------------------------------

const ENTITY_TYPES = ['brand', 'place', 'artist', 'tv_show', 'movie'];

// Planned picks come back from the client's saved plan; keep only well-formed ones for the category.
function parsePicks(list, category) {
  const allowedTypes = CATEGORY_TYPES[category];
  return (Array.isArray(list) ? list : [])
    .filter((p) => p && typeof p.entity_id === 'string' && ENTITY_TYPES.includes(p.type) && allowedTypes.includes(p.type))
    .slice(0, 12)
    .map((p) => ({ entity_id: clean(p.entity_id, 64), name: clean(p.name, 100), type: p.type }));
}

app.post('/api/match', aiBudget, async (req, res) => {
  const b = req.body || {};
  const category = Object.keys(CATEGORY_TYPES).includes(b.category) ? b.category : null;
  const query = clean(b.item, 60);
  if (!category || !query) {
    return res.status(400).json({ error: 'Choose food, music or watch and type what the guest asked for.' });
  }
  const picks = parsePicks(b.picks, category);
  try {
    const { result: match, evidence } = await withTrace(() => findMatch({ query, category, picks })); // Qloo decides
    if (!match.found) {
      return res.json({
        found: false,
        evidence,
        message: `Qlooful couldn't find "${query}". Check the spelling or try a more common name.`,
      });
    }
    res.json({ found: true, evidence, ...(await composeMatchReply(match)) }); // Claude only words it
  } catch (err) {
    console.error('match failed:', err.message);
    res.status(502).json({ error: 'Could not check that right now. Please try again.' });
  }
});

// ---- party day: one personal recommendation per guest ------------------------------

const NO_RECOMMENDATION = {
  no_signal: (first) => `Qlooful needs a bit more to go on for ${first}. Mention an artist, a brand, a show or a genre they love.`,
  no_strong_match: (first) => `Qlooful has no strong match for ${first} in this category yet. Try another category or add a favorite to the note.`,
};

app.post('/api/guest', aiBudget, async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 40);
  const note = clean(b.note, 500);
  const category = Object.keys(GUEST_CATEGORIES).includes(b.category) ? b.category : null;
  if (!name || note.length < 3 || !category) {
    return res.status(400).json({ error: 'Add the guest\'s name, a few words about them, and pick drink, snack, music or watch.' });
  }
  const planned = (Array.isArray(b.planned) ? b.planned : [])
    .filter((p) => p && typeof p.entity_id === 'string')
    .slice(0, 40)
    .map((p) => ({ entity_id: clean(p.entity_id, 64), name: clean(p.name, 100), type: clean(p.type, 20) }));
  try {
    const { result, evidence } = await withTrace(() => recommendForGuest({ name, note, category, planned }));
    if (!result.recommendation) {
      const first = name.split(/\s+/)[0];
      return res.json({ found: false, message: NO_RECOMMENDATION[result.reason](first), extracted: result.extracted, evidence });
    }
    res.json({ found: true, ...result, evidence });
  } catch (err) {
    console.error('guest failed:', err.message);
    res.status(502).json({ error: 'Could not get a recommendation right now. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (model: ${MODEL})`);
  warmTags().catch((err) => console.error('tag warm-up failed:', err.message));
});

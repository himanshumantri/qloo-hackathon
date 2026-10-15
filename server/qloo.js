// Thin wrapper around the Qloo hackathon API. Responses are trimmed so callers
// (and the agent) only see the fields they need, which keeps token usage low.
const BASE_URL = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';

// Picks Qloo scores below this affinity are never shown to the host (weak matches).
// Picks with no score at all (genre-only searches) are kept.
const MIN_AFFINITY = 0.8;
const isStrongMatch = (entity) => entity.affinity === null || entity.affinity === undefined || entity.affinity >= MIN_AFFINITY;

const ENTITY_TYPES = {
  artist: 'urn:entity:artist',
  place: 'urn:entity:place',
  brand: 'urn:entity:brand',
  movie: 'urn:entity:movie',
  tv_show: 'urn:entity:tv_show',
};

// Qloo rate-limits bursts (HTTP 429), so every request goes through a strictly serial
// queue (one request at a time), retries with backoff, and successful responses are
// cached briefly.
const { AsyncLocalStorage } = require('node:async_hooks');

// Evidence for the host: every Qloo request made while a plan is built is logged here, so the
// UI can show the live calls that produced the picks (endpoint, inputs, result count, time).
const traceStore = new AsyncLocalStorage();

async function withTrace(fn) {
  const calls = [];
  const result = await traceStore.run(calls, fn);
  const cached = calls.filter((c) => c.cached).length;
  return {
    result,
    evidence: {
      calls,
      requests: calls.length,
      cached,
      totalMs: calls.reduce((sum, c) => sum + c.ms, 0),
    },
  };
}

// Entity names by id, so affinity "drivers" (the seed entities behind a result) can be shown by name.
const entityNames = new Map();
const nameOf = (id) => entityNames.get(id) || null;
function rememberName(id, name) {
  if (!id || !name) return;
  if (entityNames.size > 5000) entityNames.clear();
  entityNames.set(id, name);
}

// A short human description of a request's inputs, e.g. "artist | 1 seed | filter: 1 tag".
function describe(path, params) {
  if (path === '/search') return `find "${params.query}"${params.types ? ' as ' + params.types.replace('urn:entity:', '') : ''}`;
  if (path === '/v2/tags') return `tags matching "${params['filter.query']}"`;
  if (path === '/v2/audiences') return `audiences matching "${params['filter.query']}"`;
  const ids = (k) => (params[k] ? String(params[k]).split(',') : []);
  const tagLabel = (id) => id.split(':').pop().replace(/_/g, ' ');
  const bits = [String(params['filter.type'] || '').replace('urn:entity:', '')];
  const seeds = ids('signal.interests.entities').map((id) => nameOf(id) || 'an entity');
  if (seeds.length) bits.push(`seeded by ${seeds.slice(0, 2).join(' + ')}${seeds.length > 2 ? ` +${seeds.length - 2}` : ''}`);
  if (ids('signal.interests.tags').length) bits.push(`taste: ${ids('signal.interests.tags').map(tagLabel).join(', ')}`);
  if (ids('filter.tags').length) bits.push(`tag: ${ids('filter.tags').map(tagLabel).join(', ')}`);
  if (ids('signal.demographics.audiences').length) bits.push(`audience: ${ids('signal.demographics.audiences').map(tagLabel).join(', ')}`);
  if (params['signal.demographics.gender']) bits.push(`gender: ${params['signal.demographics.gender']}`);
  if (params['filter.location.query']) bits.push(`in ${params['filter.location.query']}`);
  if (params['filter.popularity.min']) bits.push(`popularity >= ${params['filter.popularity.min']}`);
  return bits.join(' | ');
}

const resultCount = (data) => {
  const r = data && data.results;
  if (Array.isArray(r)) return r.length;
  if (r && typeof r === 'object') return (r.entities || r.tags || r.audiences || []).length;
  return 0;
};

const MAX_ATTEMPTS = 4;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let queue = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'X-Api-Key': process.env.QLOO_API_KEY },
        signal: AbortSignal.timeout(25_000),
      });
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(`Qloo ${url.pathname} failed with status ${res.status}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 700 * 2 ** attempt);
  }
}

function qlooGet(path, params) {
  if (!process.env.QLOO_API_KEY) return Promise.reject(new Error('QLOO_API_KEY is not set'));
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const key = url.toString();
  const log = traceStore.getStore();
  const record = (data, started, cached) => {
    if (log) log.push({ endpoint: path, what: describe(path, params), results: resultCount(data), ms: Date.now() - started, cached });
  };
  const run = async () => {
    const started = Date.now();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      record(hit.data, started, true);
      return hit.data;
    }
    const data = await fetchWithRetry(url);
    cache.set(key, { at: Date.now(), data });
    record(data, started, false);
    return data;
  };
  // Chain onto the queue so only one Qloo request runs at a time.
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

const clip = (text, n) => (typeof text === 'string' ? text.slice(0, n) : undefined);

const round = (n, digits = 3) => (typeof n === 'number' ? Number(n.toFixed(digits)) : null);

function trimEntity(e, typeName) {
  const props = e.properties || {};
  const q = e.query || {};
  // Which input signals Qloo says carried this result (only present for seeded queries).
  const drivers = ((q.explainability && q.explainability['signal.interests.entities']) || [])
    .map((d) => ({ entity_id: d.entity_id, score: round(d.score, 2) }))
    .sort((a, b) => b.score - a.score);
  rememberName(e.entity_id, e.name);
  return {
    entity_id: e.entity_id,
    name: e.name,
    type: typeName || (e.subtype || '').replace('urn:entity:', ''),
    popularity: round(e.popularity, 2),
    affinity: round(q.affinity), // Qloo's own score (0-1); absent for genre-only queries
    drivers,
    description: clip(props.short_description || props.description, 140),
  };
}

// Find entities by name. type is optional (artist | place | brand | movie | tv_show).
async function searchEntities({ query, type }) {
  const data = await qlooGet('/search', { query, types: ENTITY_TYPES[type], take: 5 });
  return (data.results || []).slice(0, 5).map((e) => {
    rememberName(e.entity_id, e.name);
    return { entity_id: e.entity_id, name: e.name, type: ((e.types || [])[0] || '').replace('urn:entity:', '') };
  });
}

// Find taste tags by keyword. entity_type restricts to tags used by that entity type.
async function searchTags({ query, entity_type }) {
  const data = await qlooGet('/v2/tags', {
    'filter.query': query,
    'filter.parents.types': ENTITY_TYPES[entity_type],
    take: 8,
  });
  return ((data.results && data.results.tags) || []).slice(0, 8).map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
  }));
}

// Find audience segments by keyword (e.g. "parents").
async function searchAudiences({ query }) {
  const data = await qlooGet('/v2/audiences', { 'filter.query': query, take: 6 });
  return ((data.results && data.results.audiences) || []).map((a) => ({ id: a.id, name: a.name }));
}

// Qloo recommendations of one entity type, steered by tags, seed entities, audiences,
// gender and/or location. This is the main taste-graph call.
async function recommend({
  entity_type,
  interest_tag_ids,
  interest_entity_ids,
  audience_ids,
  gender,
  filter_tag_ids,
  location,
  popularity_min,
  limit,
}) {
  const data = await qlooGet('/v2/insights', {
    'filter.type': ENTITY_TYPES[entity_type],
    'signal.interests.tags': (interest_tag_ids || []).join(','),
    'signal.interests.entities': (interest_entity_ids || []).join(','),
    'signal.demographics.audiences': (audience_ids || []).join(','),
    'signal.demographics.gender': gender,
    'filter.tags': (filter_tag_ids || []).join(','),
    'filter.location.query': location,
    'filter.popularity.min': popularity_min,
    'feature.explainability': 'true',
    take: Math.min(limit || 8, 50),
  });
  return ((data.results && data.results.entities) || []).map((e) => trimEntity(e, entity_type));
}

// Entities most similar to a seed entity (used to rank a host's existing picks).
async function similar({ entity_id, entity_type, limit }) {
  return recommend({ entity_type, interest_entity_ids: [entity_id], limit: limit || 30 });
}

module.exports = {
  ENTITY_TYPES,
  MIN_AFFINITY,
  isStrongMatch,
  withTrace,
  nameOf,
  searchEntities,
  searchTags,
  searchAudiences,
  recommend,
  similar,
};

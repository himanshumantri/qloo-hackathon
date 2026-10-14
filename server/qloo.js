// Thin wrapper around the Qloo hackathon API. Responses are trimmed so the
// agent only sees the fields it needs (keeps token usage, and cost, low).
const BASE_URL = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';

const ENTITY_TYPES = {
  artist: 'urn:entity:artist',
  place: 'urn:entity:place',
  brand: 'urn:entity:brand',
};

async function qlooGet(path, params) {
  if (!process.env.QLOO_API_KEY) throw new Error('QLOO_API_KEY is not set');
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    headers: { 'X-Api-Key': process.env.QLOO_API_KEY },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Qloo ${path} failed with status ${res.status}`);
  return res.json();
}

const clip = (text, n) => (typeof text === 'string' ? text.slice(0, n) : undefined);

async function searchEntities({ query, type }) {
  const data = await qlooGet('/search', {
    query,
    types: ENTITY_TYPES[type],
    take: 5,
  });
  return (data.results || []).slice(0, 5).map((e) => ({
    name: e.name,
    entity_id: e.entity_id,
    types: e.types,
  }));
}

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

async function recommend({ entity_type, interest_tag_ids, interest_entity_ids, popularity_min, limit }) {
  const data = await qlooGet('/v2/insights', {
    'filter.type': ENTITY_TYPES[entity_type],
    'signal.interests.tags': (interest_tag_ids || []).join(','),
    'signal.interests.entities': (interest_entity_ids || []).join(','),
    'filter.popularity.min': popularity_min,
    take: Math.min(limit || 6, 8),
  });
  return ((data.results && data.results.entities) || []).map((e) => ({
    name: e.name,
    entity_id: e.entity_id,
    description: clip(e.properties && (e.properties.short_description || e.properties.description), 160),
    known_for: clip(e.properties && e.properties.known_for, 160),
  }));
}

module.exports = { searchEntities, searchTags, recommend, ENTITY_TYPES };

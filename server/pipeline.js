// Qloo-first stage: builds a pool of candidate food, music and watch picks from the
// host's inputs using only Qloo (no LLM). The agent stage then plans from this pool.
//
// Chain: occasion/guests -> tags + audiences + favorites -> food -> music -> shows.
// Tags act as hard filters (genre/category); seeds, audiences and gender are the taste
// signal that ranks within them. Each stage seeds the next via Qloo's cross-domain graph.
// Qloo requests run one at a time (see qloo.js), so the code here is written sequentially.
const { AsyncLocalStorage } = require('node:async_hooks');
const qloo = require('./qloo');

// Each plan gets a time budget; once spent, fallback attempts are skipped so a slow Qloo
// spell can't stall the whole request.
const TIME_BUDGET_MS = 45_000;
const budget = new AsyncLocalStorage();
const budgetSpent = () => {
  const deadline = budget.getStore();
  return deadline !== undefined && Date.now() > deadline;
};

// Keywords are resolved to real Qloo tag ids at runtime (never hard-coded ids).
const OCCASIONS = {
  kids_outing: {
    label: "Kids' outing",
    music: ['kids'],
    media: ['family', 'animation'],
    brandTags: ['snacks'],
    placeTags: ['pizza', 'burger'],
    screen: true,
    parents: true,
  },
  beer_party: {
    label: 'Beer party',
    music: ['rock', 'party'],
    media: ['comedy'],
    brandTags: ['beer', 'snacks'],
    placeTags: ['wings', 'burger', 'bar'],
    screen: false,
  },
  binge_night: {
    label: 'Binge night',
    music: ['acoustic'],
    media: ['thriller', 'comedy'],
    brandTags: ['snacks'],
    placeTags: ['pizza', 'snacks'],
    screen: true,
  },
  poker_night: {
    label: 'Poker night',
    music: ['jazz', 'blues'],
    media: ['crime', 'thriller'],
    brandTags: ['beer', 'snacks'],
    placeTags: ['bar', 'wings'],
    screen: false,
  },
  custom: {
    label: 'Get-together',
    music: ['party', 'pop'],
    media: ['comedy'],
    brandTags: ['snacks'],
    placeTags: ['pizza'],
    screen: false,
  },
};

const MAX_TAGS_PER_STAGE = 2;
const MAX_AFFINITY_BRANDS = 2;

// Tag-id substrings we prefer per entity type when a keyword returns several tags.
const PREFERRED_TAG_PARTS = {
  artist: [':genre:music:', ':theme:', ':style:'],
  movie: [':genre:media:'],
  tv_show: [':genre:media:'],
  brand: [':genre:brand:'],
  place: [':genre:place:restaurant:', ':specialty_dish:', ':category:place:'],
};

const tagCache = new Map();

async function resolveTag(keyword, entityType) {
  const key = `${entityType}:${keyword}`;
  if (tagCache.has(key)) return tagCache.get(key);
  let found = null;
  try {
    const tags = await qloo.searchTags({ query: keyword, entity_type: entityType });
    for (const part of PREFERRED_TAG_PARTS[entityType] || []) {
      found = tags.find((t) => t.id.includes(part));
      if (found) break;
    }
    found = found || tags[0] || null;
  } catch (err) {
    console.error(`tag lookup failed for ${key}:`, err.message);
  }
  if (found) tagCache.set(key, found);
  return found;
}

async function resolveTags(keywords, entityType) {
  const tags = [];
  for (const keyword of keywords) {
    const tag = await resolveTag(keyword, entityType);
    if (tag) tags.push(tag);
  }
  return tags;
}

async function resolveFavorites(names, type) {
  const entities = [];
  const unresolved = [];
  for (const name of names || []) {
    try {
      const [top] = await qloo.searchEntities({ query: name, type });
      if (top) entities.push(top);
      else unresolved.push(name);
    } catch (err) {
      console.error(`favorite lookup failed for "${name}":`, err.message);
      unresolved.push(name);
    }
  }
  return { entities, unresolved };
}

// Run attempts from most to least specific until one returns enough results; if none
// does, return the largest result seen (a narrow query can return just one entity).
const MIN_RESULTS = 4;
async function firstNonEmpty(attempts) {
  let best = [];
  for (const attempt of attempts) {
    if (best.length && budgetSpent()) break;
    try {
      const result = await attempt();
      if (result.length >= MIN_RESULTS) return result;
      if (result.length > best.length) best = result;
    } catch (err) {
      console.error('qloo attempt failed:', err.message);
    }
  }
  return best;
}

const ids = (list) => list.map((x) => x.entity_id);
const dedupe = (list) => [...new Map(list.map((x) => [x.entity_id, x])).values()];

// Round-robin merge of several lists, dropping duplicates.
function interleave(lists) {
  const merged = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const list of lists) if (list[i]) merged.push(list[i]);
  return dedupe(merged);
}

// One query per tag (tags are hard filters), merged round-robin so each tag is represented.
async function perTag(tags, makeAttempts) {
  const lists = [];
  for (const tag of tags.slice(0, MAX_TAGS_PER_STAGE)) {
    lists.push(await firstNonEmpty(makeAttempts(tag)));
  }
  const merged = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const list of lists) if (list[i]) merged.push(list[i]);
  return dedupe(merged);
}

function buildPool(form) {
  return budget.run(Date.now() + TIME_BUDGET_MS, () => buildPoolInner(form));
}

async function buildPoolInner(form) {
  const config = OCCASIONS[form.occasion] || OCCASIONS.custom;
  const wantsScreen = config.screen || form.considerations.includeScreen;
  const signals = { occasion: config.label, tags: [], seeds: [], audiences: [], notes: [] };

  // 1. Profile: favorites, audiences and tags, all resolved through Qloo.
  const artistFavs = await resolveFavorites(form.favorites.artists, 'artist');
  const brandFavs = await resolveFavorites(form.favorites.brands, 'brand');
  const showFavs = await resolveFavorites(form.favorites.shows, 'tv_show');
  const audiences =
    config.parents || form.considerations.kidsPresent
      ? await qloo.searchAudiences({ query: 'parents' }).catch(() => [])
      : [];
  const musicTags = await resolveTags(config.music, 'artist');
  const brandTags = await resolveTags(config.brandTags, 'brand');
  const mediaTags = wantsScreen ? await resolveTags(config.media, 'tv_show') : [];
  const placeTags = form.city ? await resolveTags(config.placeTags, 'place') : [];
  const crunchTag = form.city && form.considerations.crunchy ? await resolveTag('crunchy', 'place') : null;

  const audienceIds = audiences.map((a) => a.id);
  // Only use gender as a signal when the group is clearly skewed.
  const gender = form.malePercent >= 65 ? 'male' : form.malePercent <= 35 ? 'female' : undefined;
  signals.audiences = audiences.map((a) => a.name || a.id);
  if (gender) signals.notes.push(`guest mix skews ${gender}`);
  signals.tags = [...new Set([...musicTags, ...mediaTags, ...brandTags].map((t) => t.name.replace(/"/g, '')))];
  signals.seeds = [
    ...new Set([...artistFavs.entities, ...brandFavs.entities, ...showFavs.entities].map((e) => e.name)),
  ];
  const unresolved = [...artistFavs.unresolved, ...brandFavs.unresolved, ...showFavs.unresolved];

  // 2. Food: brands (brand tag filter, ranked by favorite brands) and, with a city, places.
  const brands = await perTag(brandTags, (tag) => [
    () =>
      qloo.recommend({
        entity_type: 'brand',
        filter_tag_ids: [tag.id],
        interest_entity_ids: ids(brandFavs.entities),
        popularity_min: 0.5,
        limit: 8,
      }),
    () => qloo.recommend({ entity_type: 'brand', filter_tag_ids: [tag.id], limit: 8 }),
    () => qloo.recommend({ entity_type: 'brand', interest_tag_ids: [tag.id], limit: 8 }),
  ]);
  const places = form.city
    ? await perTag([...(crunchTag ? [crunchTag] : []), ...placeTags], (tag) => [
        () => qloo.recommend({ entity_type: 'place', filter_tag_ids: [tag.id], location: form.city, limit: 5 }),
      ])
    : [];
  const food = dedupe([...brands, ...places]);

  // 3. Music, two separate Qloo signals (mixing them in one query returns obscure artists):
  //    a) genre/occasion filter, ranked by the guests' favorite artists, audience and gender;
  //    b) cross-domain affinity: artists loved by fans of the host's food and drink brands.
  const artistSeeds = ids(artistFavs.entities);
  const genreMusic = await perTag(musicTags, (tag) => [
    () =>
      qloo.recommend({
        entity_type: 'artist',
        filter_tag_ids: [tag.id],
        interest_entity_ids: artistSeeds,
        audience_ids: audienceIds,
        gender,
        popularity_min: 0.7,
        limit: 8,
      }),
    () =>
      qloo.recommend({
        entity_type: 'artist',
        filter_tag_ids: [tag.id],
        interest_entity_ids: artistSeeds,
        popularity_min: 0.6,
        limit: 8,
      }),
    () => qloo.recommend({ entity_type: 'artist', filter_tag_ids: [tag.id], popularity_min: 0.5, limit: 8 }),
    () => qloo.recommend({ entity_type: 'artist', filter_tag_ids: [tag.id], limit: 8 }),
    // Some tags (e.g. kids music) match few entities as a hard filter; as a taste signal they work.
    () => qloo.recommend({ entity_type: 'artist', interest_tag_ids: [tag.id], popularity_min: 0.6, limit: 8 }),
  ]);
  const affinityBrands = dedupe([...brandFavs.entities, ...brands]).slice(0, MAX_AFFINITY_BRANDS);
  const brandMusic = [];
  for (const brand of affinityBrands) {
    const artists = await firstNonEmpty([
      () => qloo.recommend({ entity_type: 'artist', interest_entity_ids: [brand.entity_id], popularity_min: 0.7, limit: 5 }),
      () => qloo.recommend({ entity_type: 'artist', interest_entity_ids: [brand.entity_id], limit: 5 }),
    ]);
    brandMusic.push(artists.map((a) => ({ ...a, via: `fans of ${brand.name}` })));
  }
  const music = interleave([genreMusic, ...brandMusic]);

  // 4. Shows and movies: genre filter + favorite shows + the artist/brand picks.
  let tv = [];
  let movies = [];
  if (wantsScreen) {
    // Named favorite shows are the strongest signal; only fall back to cross-domain seeds without them.
    const screenSeeds = showFavs.entities.length
      ? ids(showFavs.entities)
      : [...ids(genreMusic.slice(0, 2)), ...ids(brands.slice(0, 1))];
    const screenFor = (entity_type) =>
      perTag(mediaTags, (tag) => [
        () =>
          qloo.recommend({
            entity_type,
            filter_tag_ids: [tag.id],
            interest_entity_ids: screenSeeds,
            popularity_min: 0.6,
            limit: 6,
          }),
        () => qloo.recommend({ entity_type, filter_tag_ids: [tag.id], popularity_min: 0.7, limit: 6 }),
      ]);
    tv = await screenFor('tv_show');
    movies = await screenFor('movie');
  }

  const strong = (list) => list.filter(qloo.isStrongMatch);
  return { pool: { food: strong(food), music: strong(music), tv: strong(tv), movies: strong(movies) }, signals, unresolved, wantsScreen };
}

// Pre-resolve every occasion keyword so the first real request doesn't pay for tag lookups.
async function warmTags() {
  for (const config of Object.values(OCCASIONS)) {
    await resolveTags(config.music, 'artist');
    await resolveTags(config.brandTags, 'brand');
    await resolveTags(config.media, 'tv_show');
    await resolveTags(config.placeTags, 'place');
  }
  await resolveTag('crunchy', 'place');
}

module.exports = { buildPool, warmTags, OCCASIONS };

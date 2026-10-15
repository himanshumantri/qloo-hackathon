// Last-minute guest request: "a guest asked for X, how close is it to what I've planned?"
// Qloo does all of the matching here (plain code); Claude only words the result afterwards.
const qloo = require('./qloo');

// Which Qloo entity types each category covers.
const CATEGORY_TYPES = {
  food: ['brand', 'place'],
  music: ['artist'],
  watch: ['tv_show', 'movie'],
};

const SIMILAR_LIMIT = 50;
const CLOSE_RANK = 20; // within Qloo's 20 nearest matches counts as a close match
const MAX_REVERSE_CHECKS = 3;
const MAX_SUGGESTIONS = 4;

// Find the guest's request in Qloo, trying each type in the category.
async function findGuestEntity(query, category) {
  for (const type of CATEGORY_TYPES[category]) {
    for (const attempt of queryVariants(query)) {
      const [top] = await qloo.searchEntities({ query: attempt, type });
      if (!top) continue;
      // Qloo's search is fuzzy and can return something unrelated ("Hienken" -> a billiards
      // club); only accept a result whose name is genuinely close to what the host typed.
      if (!plausible(query, top.name)) continue;
      return { entity_id: top.entity_id, name: top.name, type };
    }
  }
  return null;
}

const simplify = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// The result's name must contain the typed text (or the reverse), or be within a small typo distance.
function plausible(query, name) {
  const q = simplify(query);
  const n = simplify(name);
  if (!q || !n) return false;
  if (n.includes(q) || q.includes(n)) return true;
  return editDistance(q, n) <= Math.max(2, Math.floor(q.length * 0.25));
}

// Classic Levenshtein distance (small inputs only).
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

// Qloo's search is close to exact-match, so a typo ("Coldplae") finds nothing. Retry with
// the name trimmed from the end (at most 3 shorter forms, never below 4 characters).
function queryVariants(query) {
  const variants = [query];
  for (let cut = 1; cut <= 3 && query.length - cut >= 4; cut++) variants.push(query.slice(0, query.length - cut));
  return variants;
}

// picks: the host's planned picks [{ entity_id, name, type }] for this category.
async function findMatch({ query, category, picks }) {
  const guest = await findGuestEntity(query, category);
  if (!guest) return { found: false };

  const onList = picks.some((p) => p.entity_id === guest.entity_id);
  if (onList) {
    return { found: true, verdict: 'on_list', guest, closest: picks.filter((p) => p.entity_id === guest.entity_id), suggestions: [] };
  }

  // Qloo's nearest matches to the guest's request (one list per type in the category).
  const lists = new Map();
  for (const type of CATEGORY_TYPES[category]) {
    lists.set(type, await qloo.similar({ entity_id: guest.entity_id, entity_type: type, limit: SIMILAR_LIMIT }).catch(() => []));
  }

  // Rank (position in Qloo's list) and Qloo's own affinity score for a planned pick.
  const rankIn = (type, id) => {
    const index = (lists.get(type) || []).findIndex((e) => e.entity_id === id);
    return index === -1 ? null : { rank: index + 1, affinity: lists.get(type)[index].affinity };
  };

  let closest = picks
    .map((p) => ({ ...p, ...rankIn(p.type, p.entity_id) }))
    .filter((p) => p.rank !== undefined && qloo.isStrongMatch(p))
    .sort((a, b) => a.rank - b.rank);

  // Nothing found from the guest's side: check the other direction (picks seeding Qloo).
  if (!closest.length) {
    for (const pick of picks.slice(0, MAX_REVERSE_CHECKS)) {
      const fromPick = await qloo
        .similar({ entity_id: pick.entity_id, entity_type: guest.type, limit: SIMILAR_LIMIT })
        .catch(() => []);
      const index = fromPick.findIndex((e) => e.entity_id === guest.entity_id);
      if (index !== -1 && qloo.isStrongMatch(fromPick[index])) closest.push({ ...pick, rank: index + 1, affinity: fromPick[index].affinity });
    }
    closest.sort((a, b) => a.rank - b.rank);
  }

  const plannedIds = new Set(picks.map((p) => p.entity_id));
  const suggestions = (lists.get(guest.type) || [])
    .filter((e) => e.entity_id !== guest.entity_id && !plannedIds.has(e.entity_id) && qloo.isStrongMatch(e))
    .slice(0, MAX_SUGGESTIONS)
    .map((e) => ({ entity_id: e.entity_id, name: e.name, type: e.type, affinity: e.affinity }));

  // close: among Qloo's 20 nearest matches; loose: only in its top 50; none: not in the top 50.
  const verdict = !closest.length ? 'not_close' : closest[0].rank <= CLOSE_RANK ? 'close_match' : 'loose_match';
  return { found: true, verdict, guest, closest, suggestions };
}

module.exports = { findMatch, CATEGORY_TYPES };

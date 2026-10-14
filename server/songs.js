// Qloo has artists but no songs. For each Qloo-picked artist we ask Apple's free public
// iTunes Search API for that artist's top songs, so every title is a real catalogue entry
// (Claude never proposes song titles). Songs are interleaved across artists for variety.
const ITUNES_URL = 'https://itunes.apple.com/search';
const PLAYLIST_SIZE = 10;
const SONGS_PER_ARTIST = 3;

// Lowercase, drop accents, bracketed suffixes ("(Live)", "- Remastered") and punctuation.
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Drop catalogue noise like "(Remastered 2026)" or "- 2011 Mix" so Spotify searches stay clean.
const NOISE = /remaster|mono|stereo|version|edit\b|deluxe|mix\b|anniversary/i;
function cleanTitle(title) {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, (part) => (NOISE.test(part) ? '' : part))
    .replace(/\s-\s.*$/, (part) => (NOISE.test(part) ? '' : part))
    .trim();
}

// Skip recordings that are clearly not the artist's own studio track.
const BAD_VERSION = /\b(live|karaoke|tribute|cover|instrumental|remix|acoustic|demo)\b/i;

async function topSongsFor(artist) {
  const url = new URL(ITUNES_URL);
  url.searchParams.set('term', artist);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('attribute', 'artistTerm');
  url.searchParams.set('limit', '25');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  const wantArtist = normalize(artist);
  const seen = new Set();
  const songs = [];
  for (const r of data.results || []) {
    const a = normalize(r.artistName);
    const title = normalize(r.trackName);
    // Exact artist only (collaborations like "X & Y" are allowed if X is the first name).
    const artistOk = a === wantArtist || a.startsWith(`${wantArtist} `);
    if (!artistOk || BAD_VERSION.test(r.trackName) || seen.has(title)) continue;
    seen.add(title);
    songs.push({ artist, title: cleanTitle(r.trackName) });
    if (songs.length >= SONGS_PER_ARTIST) break;
  }
  return songs;
}

const spotifySearchUrl = (artist, title) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;

// artists: names in priority order. Returns up to PLAYLIST_SIZE songs, one per artist per round.
async function buildPlaylist(artists) {
  const perArtist = [];
  for (const artist of artists) {
    try {
      perArtist.push(await topSongsFor(artist));
    } catch (err) {
      console.error(`song lookup failed for "${artist}":`, err.message);
      perArtist.push([]);
    }
  }
  const playlist = [];
  for (let round = 0; round < SONGS_PER_ARTIST && playlist.length < PLAYLIST_SIZE; round++) {
    for (const songs of perArtist) {
      if (songs[round] && playlist.length < PLAYLIST_SIZE) playlist.push(songs[round]);
    }
  }
  return playlist.map((s) => ({ ...s, url: spotifySearchUrl(s.artist, s.title) }));
}

module.exports = { buildPlaylist, normalize };

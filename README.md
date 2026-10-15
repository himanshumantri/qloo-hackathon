# Qlooful Host

**Plan the perfect night for your guests, powered by Qlooful.**

Live demo: **https://qlooful-host.vercel.app**
(The backend runs on a free Render instance. If it has been idle, the first request can take about a minute to wake up.)

> Built with the [Qloo API](https://docs.qloo.com) for the Qloo Agentic Hackathon. "Qlooful" is the friendly name the app uses for the Qloo taste engine behind it.

## What it does

A host picks an occasion (kids' outing, beer party, binge night, poker night, or their own), how many guests are coming, the guest mix, and anything special (allergies, music volume, speaker-friendly music, crunchy food, kids, movies/TV, a city). Optionally they name things the guests already love.

Qlooful Host then plans the whole night:

- **Food and drink**: brands and local places that fit the crowd.
- **Music**: artists, plus a **10-song starter playlist** with a copy button and Spotify search links.
- **Watch**: TV shows and movies for screen nights.
- **A checklist** with "when" labels, which can be ticked off and is saved in the browser.
- **"A guest asked for something?"**: type what a guest requested at the last minute (a dish, an artist, a show). Qlooful checks how close it is to what is already planned, so the host can answer with confidence.

Every food, music and watch pick comes from the Qloo API. Each pick shows a **match rating** (HIGH, CLOSE or WORTH A TRY) with the signals behind it, and the app lists the live Qloo requests that built the plan.

## How a plan is built

```
Wizard answers
      |
      v
1. Qloo first (plain code, no AI)      server/pipeline.js
   tags -> audiences -> favorites -> food -> music -> shows
      |   each stage seeds the next through Qloo's taste graph
      v
   candidate pool (every item has a Qloo entity ID)
      |
      v
2. Claude agent                         server/agent.js
   reads the pool, may call Qloo tools to fill gaps or fix a misspelling,
   then submits a structured plan
      |
      v
3. Validator (code)
   drops any pick whose entity ID Qloo did not return, and any pick Qloo
   rates below 0.8
      |
      v
Plan + checklist + evidence (the live Qloo requests that built it)
```

**Qloo runs first and Claude runs strictly after it.** The AI never supplies picks from its own knowledge: its only jobs are choosing among Qloo's results, explaining them, and writing the checklist and wording.

### Where Qloo is used

| Qloo endpoint | Used for |
|---|---|
| `GET /search` | Resolving the guests' favorite artists, brands and shows (and guest requests) to Qloo entities |
| `GET /v2/tags` | Turning occasion keywords into real Qloo tag IDs (genres, restaurant categories, "crunchy" specialty dishes) |
| `GET /v2/audiences` | Audience signals, such as parents with young children |
| `GET /v2/insights` | The main taste-graph call: recommendations of artists, brands, places, TV shows and movies |

The `/v2/insights` calls combine several Qloo features:

- **Hard genre/category filters** (`filter.tags`), ranked by taste signals (`signal.interests.entities`, audiences, gender) and a popularity floor.
- **Cross-domain affinity**: food and drink brands seed the music search ("fans of Heineken also love..."), and artists and brands seed the TV and movie search.
- **Location** for local restaurant picks (`filter.location.query`).
- **Affinity scores and explainability** (`feature.explainability`), which power the match ratings.
- **Similarity for guest requests**: the 50 nearest matches to what a guest asked for are compared with the host's planned picks.

### Match ratings

Qloo returns an affinity score for seeded recommendations. The app shows it as a word, never a raw number:

| Qloo affinity | Shown as |
|---|---|
| 0.95 or higher | **HIGH match** |
| 0.90 to 0.95 | **CLOSE match** |
| 0.80 to 0.90 | **WORTH A TRY** |
| below 0.80 | not shown |

Picks from genre-only searches have no affinity score in Qloo's data, so they are labelled "Genre match from Qlooful" instead of getting a rating.

## Verify that the results come from Qloo

You do not have to take this on trust:

1. **In the app**: every pick carries a Qlooful ID (the Qloo entity ID). A green banner at the top of the plan says how many live Qloo requests built it, and **See the live requests** opens a panel listing each one (what was asked, the endpoint, how many results came back, and how long it took). Text written by AI is marked **AI note**; everything else is Qloo data.
2. **In the API response**: `POST /api/plan` returns, for each pick, a `qloo` object (affinity, popularity and the signals that drove it) and an `evidence` object with the full request log:

   ```bash
   curl -s -X POST https://crunchy-comida-api.onrender.com/api/plan \
     -H 'Content-Type: application/json' \
     -d '{"occasion":"beer_party","guestRange":"10_15","malePercent":50,
          "favorites":{"artists":["Coldplay"],"brands":["Heineken"],"shows":[]}}'
   ```

3. **On the server**: set `AGENT_TRACE=1` to print every Qloo call and result the agent makes.
4. **Against Qloo directly**: take any Qlooful ID and use it as `signal.interests.entities` in a `/v2/insights` request with your own key.

## The agent

The planning step is a Claude tool-use loop (`server/agent.js`) with Qloo as its tools: `qloo_search_entities`, `qloo_search_tags`, `qloo_search_audiences`, `qloo_recommend`, and a strict `submit_plan` tool for the result. For example, when a guest favorite is misspelled ("Coldplae"), the agent retries the search itself.

The guest-request flow (`server/match.js`) is Qloo-led as well: Qloo finds the request, lists its nearest matches and ranks the planned picks. Claude only words the answer, and every entity it cites must be one Qloo returned.

The default model is Claude Haiku 5.5 (`claude-haiku-5-5`), which costs roughly $0.002 per plan.

## Run it locally

Requirements: Node.js 20 or newer, a Qloo hackathon API key, and an Anthropic API key.

```bash
git clone https://github.com/himanshumantri/qloo-hackathon.git
cd qloo-hackathon

# backend
cd server
npm install
cp .env.example .env      # then fill in QLOO_API_KEY and ANTHROPIC_API_KEY
npm run dev               # http://localhost:4000

# frontend (second terminal)
cd client
npm install
cp .env.example .env      # VITE_API_URL defaults to http://localhost:4000
npm run dev               # http://localhost:5173
```

### Environment variables

| Where | Variable | Purpose |
|---|---|---|
| server | `QLOO_API_KEY` | Qloo hackathon API key (server-side only) |
| server | `ANTHROPIC_API_KEY` | Anthropic API key (server-side only) |
| server | `CLIENT_ORIGIN` | Comma-separated allowed frontend origins (default `http://localhost:5173`) |
| server | `ANTHROPIC_MODEL` | Optional model override (default `claude-haiku-5-5`) |
| server | `MAX_DAILY_AI_CALLS` | Optional daily cap on AI requests (default 300) |
| server | `MAX_CONCURRENT_PLANS` | Optional cap on plans in flight (default 3) |
| server | `AGENT_TRACE` | Optional: log every Qloo call the agent makes |
| client | `VITE_API_URL` | Backend base URL |

Keys are never sent to the browser, and `.env` files are git-ignored.

## Deploy

- **Frontend (Vercel)**: root directory `client`, build command `npm run build`, output `dist`, environment variable `VITE_API_URL` set to the backend URL.
- **Backend (Render)**: root directory `server`, build command `npm install`, start command `npm start`, environment variables as in the table above. Set `CLIENT_ORIGIN` to the Vercel URL. Do not set `PORT`; Render provides it.
- `GET /api/health` reports the running model and commit, which is handy for checking what is deployed.

## Project structure

```
client/                 React + Vite single-page app (no router, no database)
  src/App.jsx           flow: wizard -> loading -> plan
  src/components/       Wizard, Loading, PlanResult (picks, playlist, checklist,
                        guest requests, evidence panel)
  src/storage.js        saves the plan and checklist in the browser (localStorage)
server/                 Node + Express API (no database)
  index.js              routes (/api/plan, /api/match, /api/health), validation,
                        rate limit, daily AI cap
  qloo.js               Qloo client: serial request queue, retries, short cache,
                        affinity + request log
  pipeline.js           Qloo-first stage that builds the candidate pool
  agent.js              Claude agent, validator, guest-request wording
  match.js              guest-request matching with Qloo
  songs.js              starter playlist from the public iTunes Search API
```

## Safety and cost controls

- Qloo requests are sent one at a time (Qloo rate-limits bursts), with retries and a 10-minute cache.
- Per-IP rate limit, a cap on plans in flight, a daily cap on AI calls, a 10 KB request limit, and validated, length-limited inputs.
- Host-written text (allergies, favorites) is treated as data, not instructions.

## Honest limitations

- **Allergies**: Qloo has no ingredient or allergen data. The app adds a checklist warning and tells the host to check labels or the venue. It never claims anything is allergen-safe, and removes such claims from AI text.
- **Songs**: Qloo has artists but no songs. The artists come from Qloo; the songs come from Apple's public iTunes Search API (each artist's top catalogue songs). Spotify cannot import a text list, so each song is a Spotify search link.
- **Crunch ratings** (the optional crunchy-food toggle) are the AI's estimate. When a city is given, Qloo's "crunchy" specialty-dish tags help find places.
- **Speed**: a plan takes about 20 to 30 seconds, mostly because Qloo requests run one at a time.
- **Free hosting**: the first request after a period of inactivity is slow while the backend wakes up.

## Third-party services

Qloo API (taste data), Anthropic API (planning and wording), Apple iTunes Search API (public, no key; song titles), Spotify (search links only, no API).

## License

[MIT](LICENSE)

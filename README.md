# TAM.TV

**TAM began as a place. TAM is becoming a network.**

TAM.TV is the digital home of TAM (Temple of Art and Music) and TAM Festival. It is a live music and media platform that turns each night at TAM into content that lasts: performance films, interviews, artist pages and stories. Search engines and AI systems can read all of it, and the audience it builds belongs to TAM, not to a social platform.

This repository is the **Phase 1 MVP** from the [development brief](docs/BRIEF.md).

```
EVENT → CONTENT → DISTRIBUTION → DISCOVERY → AUDIENCE → DATA → NEXT EVENT
```

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test
```

Node 20 or newer. The server uses no web framework and has one dependency (the Anthropic SDK, used only by the optional Production Agent).

## What's in the MVP

| Brief section | Where |
|---|---|
| Homepage: next event, latest performance, artist, story | `/` |
| TAM Festival: upcoming, strands, past nights | `/festival`, `/events/:slug` (+ `.ics` calendar export) |
| Artist directory and permanent artist pages | `/artists`, `/artists/:slug` |
| Watch (YouTube privacy-enhanced embeds) | `/watch`, `/watch/:slug` |
| Listen (playlists / radio) | `/listen` |
| Stories (People, Projects, Festival…) | `/stories`, `/stories/:slug` |
| About: the six-year story and the transition | `/about` |
| "Play TAM" artist submissions | `/submit` → `data/submissions.jsonl` |
| Newsletter with explicit consent | footer form → `data/signups.jsonl` |
| Consent-first first-party analytics | banner + `/api/track` → `data/events.jsonl` |
| Search + AI discovery | schema.org JSON-LD on every page, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/graph.json` |
| AI Production Agent (§20) | `/studio`, `POST /api/agent/production` |

## The logo, alive

The TAM mark is rebuilt in code (`src/lib/logo.js`) as four separate letters sharing one circle: **T** at the top, **A** at the bottom and an **M** on each side. Because each letter is its own piece, the mark can move:

- **It keeps London time.** The gold light makes one full turn around the mark every 24 hours. The palette moves through dawn (rose gold), day, dusk (amber) and night, when the mark glows and slowly breathes like a lit sign. The "Temple of Art and Music" lettering turns like a minute hand, and a dot on the rim ticks off the seconds. The server renders the current state, and `public/js/tam.js` keeps it moving.
- **It assembles.** On the homepage the four letters fly in from their own quadrants and lock together. The hero mark also tilts slightly toward the pointer. Motion is turned off when the visitor's system asks for reduced motion.
- **Generative sigils.** Every artist, event and film gets its own version of the mark, generated from its name. The colour leans toward the genre, the light angle and the lit letter are picked by a hash of the name, and the outer grooves encode the name like a record's run-out groove. The same name always gives the same sigil, so it works as a permanent avatar or poster until real photography exists. Download one at `/sigil/<slug>.svg`. Even the 404 page draws a sigil from the missing URL.
- **Six years, six rings.** On `/about` the archive is drawn as one ring per year around the mark. Each ring grows as that year's material is added back into the archive.

The original artwork is kept at `public/img/tam-logo-original.jpg`.

## AI: the Production Agent

`/studio` turns one night into a content package. You pick an artist and an event and paste your notes. Claude then drafts a profile, captions for Instagram, TikTok, YouTube and X, an SEO title and description, clip ideas, interview questions and story angles. The output follows a JSON schema, and a person edits it before anything is published. To switch it on, set `ANTHROPIC_API_KEY` and `ADMIN_TOKEN`. The studio is protected by the token and is not indexed by search engines.

## Content

For now the "CMS" is the JSON files in `content/`, edited through GitHub. Everything else is generated from them. Slugs and cross-references are checked when the server starts, so a typo fails loudly. Run `npm run check:content` to test them without starting the server.

Entries marked `"sample": true` are placeholders and show a **Sample** badge on the site. Replace them with real TAM artists, events, films and stories before launch.

## Deploy (Railway)

`railway.json` sets the start command and the health check (`/healthz`). Set these variables (see `.env.example`):

- `SITE_URL`: the public URL, used for canonical links, the sitemap and structured data
- `DATA_DIR`: point it at a mounted Railway volume (e.g. `/data`) so submissions, sign-ups and analytics survive redeploys
- `ANTHROPIC_API_KEY` and `ADMIN_TOKEN`: optional, enable the Production Agent

## Architecture

```
server.js              HTTP entry point
src/app.js             routing, forms, APIs, security headers (CSP etc.)
src/views.js           page templates
src/lib/content.js     content loading, validation, queries   ← swap for a CMS later
src/lib/seo.js         JSON-LD, sitemap, llms.txt, knowledge graph
src/lib/logo.js        the live mark, sigils, archive rings
src/lib/store.js       first-party data (JSONL)              ← swap for Postgres later
src/lib/ai.js          Production Agent (Claude)
public/                CSS, client JS, images
content/               the site's content
```

Each module is a seam where later phases plug in (pledges, membership, more agents) without rebuilding the platform. The roadmap is in [docs/ROADMAP.md](docs/ROADMAP.md).

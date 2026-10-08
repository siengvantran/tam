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

## The logo

The TAM logo is a trademark, and TAM.TV only ever shows it **exactly as drawn**. Every logo file in `public/img/` (full logo, circular mark, wordmark, favicons, social card) is cut directly from the original artwork `public/img/tam-logo-original.jpg` by `scripts/extract_logo.py`. The script only makes the black background transparent; nothing is redrawn, recoloured or reshaped. Where the logo sits over the moving background, a solid black disc behind the circle keeps it looking exactly like the original.

All the movement happens *around* the logo:

- **London time.** A halo behind the logo, and the gold used across the site, shift from rose-gold dawn to bright day, amber dusk and a slow-breathing glow at night.
- **The TAM 108.** Behind every page, 108 songs fall from the top of the screen (`content/chorus.json`). Each one shows its title and artist. Choruses appear only for the 12 public-domain songs, because song lyrics are copyright. You can add a chorus for any other song once TAM holds a lyric licence for it, or has permission from the artist (e.g. TAM's own artists). Set `"licensed": true` on that song; the content check refuses unlicensed lyrics. Visitors can pause the rain from the footer, and it stays still for anyone whose system asks for reduced motion.
- **Coloured vinyl.** Every artist, event and film gets its own vinyl record (`/art/<slug>.svg`) until real photography exists. Its name picks one of 24 rare colourways and one of 7 pressing styles. The colourways are borrowed from minerals, deep-sea light, iridescence and astronomy: Opal Fire, Bioluminescence, Labradorite, Ammolite, Hummingbird Throat, Cosmic Latte (the average colour of the universe)… The styles are marble, splatter, galaxy, colour-in-colour, split, pinwheel and smoke. The same name always gets the same record. Records spin on hover, and artist pages say what the record is pressed on. The palettes are in `src/lib/vinyl.js`. The record deliberately doesn't use the TAM mark.
- **Six years, six rings.** On `/about` the archive is drawn as one ring per year around the untouched mark, growing as each year's material is added.

To regenerate the logo files: `python3 scripts/extract_logo.py` (needs Pillow and NumPy).

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
src/lib/brand.js       logo (original artwork only), archive rings
src/lib/vinyl.js       coloured vinyl artwork (24 colourways x 7 pressings)
src/lib/store.js       first-party data (JSONL)              ← swap for Postgres later
src/lib/ai.js          Production Agent (Claude)
public/                CSS, client JS, images
content/               the site's content (incl. chorus.json, the TAM 108)
scripts/extract_logo.py  cuts the official logo files from the original artwork
```

Each module is a seam where later phases plug in (pledges, membership, more agents) without rebuilding the platform. The roadmap is in [docs/ROADMAP.md](docs/ROADMAP.md).

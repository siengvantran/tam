# TAM.TV

**TAM began as a place. TAM is becoming a network.**

TAM.TV is the digital home of TAM (Temple of Art and Music) and TAM Festival, which hosts emerging artists and cult legends alike. It is a live music and media platform that turns each night at TAM into content that lasts: performance films, interviews, artist pages and stories. Search engines and AI systems can read all of it, and the audience it builds belongs to TAM, not to a social platform.

## What it is

**The complete, living record of a London music venue.** Every night TAM has put on since 2020 (1,572 of them, imported from Eventbrite) has its own page. So does every artist who has played (287), every regular night (29), every venue (6) and every year. They're all linked to each other and published as structured data for search engines and AI assistants. On top of that sit two data loops:

- **"Bring them back"** on every artist page: fans tell TAM who to book next and can leave an email to hear when that artist is announced.
- **"I was there"** on every past night: the audience adds itself to the archive, building a first-party map of who came to what.

Every press is logged (`data/demand.jsonl`) and its total is shown publicly. Together they're the first version of the brief's pledge engine.

```
EVENT → CONTENT → DISTRIBUTION → DISCOVERY → AUDIENCE → DATA → NEXT EVENT
```

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test
```

Node 20 or newer. CI runs the tests on Node 20 and 22.

## Pages

| | |
|---|---|
| `/` | Next night with countdown, coming up, **On this day at TAM**, cult legends, regulars, TAM TV, the archive rings |
| `/whats-on` | Every upcoming night (from Eventbrite), grouped by day |
| `/artists`, `/artists/:slug` | All 287 artists: cult legends, most-played, A–Z. Each page lists every night they played, who they shared the bill with, where, their TAM TV films, and the "Bring them back" button |
| `/events/:slug` (+ `.ics`) | Each of the 1,572 nights: line-up, venue, series, Eventbrite link, "I was there" |
| `/archive`, `/archive/:year` | The archive by year and month |
| `/series`, `/series/:slug` | Regular nights (Great British Blues Jam, Singers @ Sunday Spot, Word of Mouth…) |
| `/genres`, `/genres/:genre` | Blues, jazz, soul, funk, rock, folk, latin… in London |
| `/locations`, `/locations/:venue` | Elephant & Castle, Canary Wharf (TAM's Vineyard & Jazz Club), Smithfield, Dalston, Mayfair, Elephant Park |
| `/tv`, `/tv/:slug` | TAM TV films and *Globetrotting With Gillespie* |
| every old `www.tam.tv` URL | See below |
| `/submit`, `/studio`, `/stories`, `/listen`, `/about`, `/privacy` | As before |
| `/sitemap.xml`, `/llms.txt`, `/graph.json`, `/robots.txt` | Discovery |

## Keeping the old site's search value

All 54 pages of the old Google Sites `www.tam.tv` were crawled (`scripts/crawl_oldsite.py`), and **every old URL still answers at the same address**:

- Old artist URLs keep their slugs (`/artists/danagillespie`, `/artists/hans-theessink`…). They became full artist pages, with the old text and photos folded in.
- `/locations/elephant-castle` and `/locations/smithfield` became venue pages: the old text, opening hours and photos, plus every night held there.
- `/tv` and `/whats-on` are now the TAM TV and What's on pages.
- Every other old page (Dana's projects, Austria, private parties, Singers, NFT…) is served at its original URL in the new design.
- `/home` returns a 301 redirect to `/`. The test suite requests every crawled URL, so CI fails if one breaks.

The old site's image links expire (Google Sites signs them), so its 165 photos were downloaded and stored as WebP in `public/img/archive/`.

## Refreshing the data

```bash
# Eventbrite history (past + upcoming) → content/archive/
node scripts/fetch_eventbrite.mjs /tmp/eventbrite.json      # needs Playwright
python3 scripts/import_eventbrite.py /tmp/eventbrite.json

# The old site → content/legacy/, content/videos.json, public/img/archive/
python3 scripts/crawl_oldsite.py /tmp/oldsite.json
python3 scripts/import_oldsite.py /tmp/oldsite.json        # needs Pillow
```

Artists are matched to nights by name in the event titles (Eventbrite descriptions are empty), using the hand-curated list in `scripts/sources/performers.txt`. Each line is a name, its aliases, and optionally `@slug=` (keep an old URL), `@note=` (tell namesakes apart, e.g. TAM's pianist David Gray is not the singer-songwriter) and `!legend`. To add or correct an artist, edit that file and re-run the import. Bios and links go in `content/artists.json`, keyed by slug.

## The logo

The TAM logo is a trademark, and TAM.TV only ever shows it **exactly as drawn**. Every logo file in `public/img/` (full logo, circular mark, wordmark, favicons, social card) is cut directly from the original artwork `public/img/tam-logo-original.jpg` by `scripts/extract_logo.py`. The script only makes the black background transparent; nothing is redrawn, recoloured or reshaped. Where the logo sits over the moving background, a solid black disc behind the circle keeps it looking exactly like the original.

All the movement happens *around* the logo:

- **London time.** A halo behind the logo, and the gold used across the site, shift from rose-gold dawn to bright day, amber dusk and a slow-breathing glow at night.
- **The TAM 108.** Behind every page, 108 songs fall from the top of the screen (`content/chorus.json`). Each one shows its title and artist. Choruses appear only for the 12 public-domain songs, because song lyrics are copyright. You can add a chorus for any other song once TAM holds a lyric licence for it, or has permission from the artist (e.g. TAM's own artists). Set `"licensed": true` on that song; the content check refuses unlicensed lyrics. Visitors can pause the rain from the footer, and it stays still for anyone whose system asks for reduced motion.
- **Coloured vinyl.** Every artist and night gets its own vinyl record (`/art/<slug>.svg`) until real photography exists. Its name picks one of 24 rare colourways and one of 7 pressing styles. The colourways are borrowed from minerals, deep-sea light, iridescence and astronomy: Opal Fire, Bioluminescence, Labradorite, Ammolite, Hummingbird Throat, Cosmic Latte (the average colour of the universe)… The styles are marble, splatter, galaxy, colour-in-colour, split, pinwheel and smoke. The same name always gets the same record. Records spin on hover, and artist pages say what the record is pressed on. The palettes are in `src/lib/vinyl.js`. The record deliberately doesn't use the TAM mark.
- **Six years, six rings.** On `/about` the archive is drawn as one ring per year around the untouched mark, growing as each year's material is added.

To regenerate the logo files: `python3 scripts/extract_logo.py` (needs Pillow and NumPy).

## AI: the Production Agent

`/studio` turns one night into a content package. You pick an artist and an event and paste your notes. Claude then drafts a profile, captions for Instagram, TikTok, YouTube and X, an SEO title and description, clip ideas, interview questions and story angles. The output follows a JSON schema, and a person edits it before anything is published. To switch it on, set `ANTHROPIC_API_KEY` and `ADMIN_TOKEN`. The studio is protected by the token and is not indexed by search engines.

## Cult legends

Artists marked `!legend` in `scripts/sources/performers.txt` (or `"legend": true` in `content/artists.json`) are listed first on `/artists`, appear in the homepage's legends row, get a gold **Cult legend** badge and are pressed as a **Legend Edition** record. The current list is a conservative first pass: Dana Gillespie, Hans Theessink, Holly Penfield, Todd Sharpville, Osibisa, Keith West, Ian Siegal, Jimmy Carpenter, Big Joe Louis, Earl Okin and Keith Shocklee. Edit it freely.

## Content

Everything lives in `content/` as JSON and is validated when the server starts (slugs, cross-references, the lyric-licence guard), so a typo fails loudly. Run `npm run check:content` to test without starting the server.

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
src/lib/content.js     content loading, validation, indexes, queries   ← swap for a CMS later
src/lib/seo.js         JSON-LD, sitemap, llms.txt, knowledge graph
src/lib/brand.js       logo (original artwork only), archive rings
src/lib/vinyl.js       coloured vinyl artwork (24 colourways x 7 pressings)
src/lib/store.js       first-party data: submissions, sign-ups, demand, analytics (JSONL)   ← swap for Postgres later
src/lib/ai.js          Production Agent (Claude)
public/                CSS, client JS, images
content/               the site's content: archive/ (Eventbrite), legacy/ (old site), videos, chorus.json (the TAM 108)
scripts/               fetch/crawl/import scripts and the curated performer list
```

Each module is a seam where later phases plug in (pledges, membership, more agents) without rebuilding the platform. The roadmap is in [docs/ROADMAP.md](docs/ROADMAP.md).

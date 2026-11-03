# TAM.TV

The Temple of Art and Music on the web: every night, festival and artist at TAM, with TAM's own box office. It's a fresh build that brings every idea from **The Best Christmas Ever** (christmas.tam.tv) into the main site, so any festival or night can switch them on. Every page of the old Google Sites `www.tam.tv` still answers at its address.

- What was ported, and what wasn't: [docs/PORTING.md](docs/PORTING.md)
- What we found on the current tam.tv: [docs/REVIEW.md](docs/REVIEW.md)

## Tailored to who you are

The site starts by asking **what brings you to TAM**, and shapes itself around the answer:

| Pathway | For | What changes |
| --- | --- | --- |
| `/for/live-music` | Londoners and visitors after live music | nights picked for them, the regulars, the festival, how to get there |
| `/for/musician` | players and singers | the jam, the open mic, the Sunday Spot, young artists' nights, pitching a night |
| `/for/venue-hire` | hiring the room | capacity (up to 150), what's included, an enquiry form |
| `/for/party` | parties and team nights | group discounts, startup packs, Team Tables, sponsorship, private hire |
| `/for/brand` | brands and sponsors | sponsorship packages, hosting a night |

Pathways live in `content/pathways.json`. Choosing one sets a preference cookie (`tam_path`), so the home page reorders itself for that visitor and Ask TAM knows who it's talking to. Enquiries from any pathway (or from Ask TAM) land in `/admin` → **Enquiries**, and are emailed to `ENQUIRIES_TO` when email is on.

### Ask TAM, the concierge agent

Every public page has **Ask TAM**: a chat that answers from TAM's own data. It's Claude (`claude-opus-5-5` at `low` effort by default, through the official `@anthropic-ai/sdk`) with nine tools (`src/services/concierge.js`):

`find_nights` · `get_night` · `quote_tickets` (prices exactly as the box office charges, with a pre-filled booking link) · `find_artists` · `search_past_nights` · `venue_guide` · `festival_info` · `pathway_guide` · `start_enquiry` (only after the visitor gives their details and says yes)

- It never takes payment: it quotes and links to the booking form, which opens with the ticket and quantity chosen.
- The page streams what it's doing ("Checking what's on…") and shows the nights, artists and booking links its tools found as cards.
- The system prompt and tools never change, so they're cached; today's date, the visitor's pathway and the page go in a mid-conversation system message. Refused requests fall back server-side (`fallbacks: "default"`).
- **Without `ANTHROPIC_API_KEY`**, or if the API fails, or past `AGENT_DAILY_LIMIT` questions a day, it still answers from keywords: the right pathway and matching nights.
- 20 questions per visitor per 10 minutes. `/admin` → **Ask TAM** shows what people ask, which pathways and tools, and how often it fell back.

## A musical experience

The site is an instrument and a piece of generative digital art:

- **Play the site** (the switch in the header, off by default, remembered): every tile, card, button and link plays a note as you hover it (the same element always plays the same note, so moving around makes a melody), clicks play chords, and the A–K keys play the scale. A soft electric-piano voice with an echo, tuned to a pentatonic scale (`public/js/instrument.js`, Web Audio, no samples).
- **The living background** (`public/js/visuals.js`): neon ribbons drawn fresh every frame, like an oscilloscope made of light. They swell with the bass, shimmer with the treble, bend towards the pointer and take the colour of the note being played (Tamalume's note-to-colour map).
- **Light from sound**: every note, whether from the visitor or from Tamalume's beat, sends a ripple of neon light out from where it happened and tints the headlines in that note's colour.
- For visitors who prefer reduced motion the ribbons are drawn once and stay still, with no ripples. Sound only starts when someone switches Play on.

## TAM's schedule

`content/schedule.json` is every **public** night from TAM's Elephant & Castle performance schedule (the Google Sheet, May 2021 onwards), imported by `python3 scripts/import_schedule.py <schedule.xlsx>`. The sheet is TAM's internal calendar, so the importer leaves out private hires, bookings, birthdays, rehearsals, shoots, closures and anything with a fee, strips staff names, and drops any name the sheet ever ties to a private booking. **Never commit the spreadsheet**, and check the output before publishing.

Past nights join the archive (unless Eventbrite already has them). Upcoming ones become nights. **Everything in December is part of The Best Christmas Ever** (`claims: { months: [12] }` in the festival): on its ticketed nights the schedule becomes the night's programme ("The Great British Blues Jam + TAM Karaoke"), and other December dates are still festival nights, without tickets.

## Run it

```bash
ADMIN_TOKEN=change-me-please DOOR_TOKEN=door-code npm start   # http://localhost:3000
npm test
```

Node 20 or newer. One dependency: the Anthropic SDK for Ask TAM (`npm install`). Data goes to `./data` unless `DATA_DIR` is set.

Search and christmas.tam.tv: every page has one home, so neither site is filtered as a copy of the other. See [docs/SEO.md](docs/SEO.md).

## How it fits together

```
server.js                 entry point
src/app.js                wiring: config → store → services → domains → routes
src/lib/http.js           router, JSON/HTML responses, body parsing, rate limit, static files, CSP
src/lib/store.js          db.json in DATA_DIR (atomic writes) + uploaded images
src/lib/content.js        loads and checks content/, generates festival nights, London time
src/lib/qr.cjs            QR encoder for tickets (from bestchristmas, dependency-free)
shared/pricing.js         ticket pricing, shared by the server and the browser
src/domain/tickets.js     bookings, holds, Team Tables, Stripe checkout + webhook, ticket keys, door
src/domain/community.js   Party Wall, remix cards, sponsorship, follows, demand, visit counts
src/domain/collections.js numbered verified collections and certificates
src/domain/raffle.js      the charity raffle desk
src/domain/admin.js       staff sign-in and the /admin API
src/services/             Stripe (no SDK) and Resend email
src/views/                server-rendered pages (escaped by default)
public/js/                browser modules: site, festival, song, tamalume, collection, admin, door, raffle
content/                  everything editable, as JSON
scripts/                  content import and checks
```

### One price, everywhere

`shared/pricing.js` is the only place prices are worked out. The server imports it to charge, and the browser imports the same file from `/shared/pricing.js` to show the total. A night's `sale` says how it sells:

| Mode | Used for | Rules |
| --- | --- | --- |
| `own` | a night with its own ticket types (the Hootenanny: Robin £7, GA £10, VIP £15) | optional per-type `limit`, `tableRequest` |
| `schedule` | an early-bird ladder | tiers end at `until` or when `limit` sells out; a `door` price shows the saving |
| `flat` | festival nights at one price (£10) | |
| `standard` | headline nights (Dana's night, £22) | group tiers (6+, 10+, 20+) and packs (Startup pack, 4–15 people) |

All of them have a `capacity` and a `maxPerBooking`. Unpaid Stripe checkouts hold their tickets for 35 minutes.

## Festivals

A festival is one JSON file in `content/festivals/`. Its `dates` generate one night per open date (minus `closed`), priced by its `pricing`. Hand-made nights in `content/events.json` with `"festival": "<slug>"` replace the generated night on that date. Each festival turns on the features it wants:

```json
"features": {
  "countdown": true,      "ambient": "snow",     "tamalume": true,
  "cards": true,          "teamTables": true,    "partyWall": true,
  "sponsorship": true,    "donation": true,      "raffle": true,    "invites": true
}
```

The festival page shows a section for each one that's on, and its nights' pages use the same sections. **The Best Christmas Ever is set up as content** (`content/festivals/best-christmas-ever.json`), with the same 21 nights, prices, discounts, team tables, charity, raffle and sponsorship as christmas.tam.tv. To run another festival, copy that file and change it. Startup checks every reference, so a typo stops the server instead of breaking a page.

## Pages

| | |
| --- | --- |
| `/` | next night with a countdown, the current festival, coming up, cult legends, TAM TV, on this day at TAM |
| `/whats-on` | every upcoming night, and booking for any of them |
| `/the-best-christmas-ever` (a festival's `path`) | the festival: song and cards, programme, calendar, charity, tickets, Team Tables, Party Wall, sponsorship |
| `/events/:slug` (+ `.ics`) | a night: line-up, running order, invite a friend, tickets, team tables, add to calendar |
| `/artists`, `/artists/:slug` | cult legends and A–Z; bio, next gigs (booking links credit the artist), follow, "Bring them back", films, past nights |
| `/archive`, `/archive/:year`, `/archive/night/:slug` | TAM's Eventbrite history, with "I was there" |
| `/tv` | TAM TV films |
| `/card/:id` | a remix card, opened from an envelope |
| `/invite/:id` | an invitation card (`?to=&from=&m=` adds a personal note) |
| `/ticket/:ref?k=` | a ticket with its QR code; staff phones get the check-in panel |
| `/pay/:ref?k=` | pay for a reserved booking by card |
| `/collections/:slug`, `/verify` | a numbered collection (Dana's 108 signed books) and certificate checks |
| `/admin`, `/door`, `/raffle-desk` | staff |
| every old www.tam.tv URL | the old page's text and photos, in the new design |

## Staff

- **Admin** (`/admin`, `ADMIN_TOKEN`, 12+ characters): sales per night, bookings (mark paid, cancel, email the ticket, send a payment link), Party Wall approvals and gold pins, sponsor enquiries, collection orders, artist stats (visits, invite views, followers, bookings through their links), demand, emailing followers, CSV exports.
- **Door** (`/door`, `DOOR_TOKEN`, 8+ characters): sign in once, then scan tickets with the phone camera. The ticket opens with ✓/✗ and check-in buttons. You can also type a reference.
- **Raffle desk** (`/raffle-desk`, the door code): sell numbered tickets (cash or card), void a sale, draw winners.

Staff sign-in sets an HttpOnly cookie signed with the site's secret.

## Configuration

See `.env.example`.

| Variable | |
| --- | --- |
| `SITE_URL` | public URL: canonical links, sitemap, emails, Stripe return links |
| `DATA_DIR` | bookings and uploads. On Railway, mount a volume and point this at it |
| `ADMIN_TOKEN`, `DOOR_TOKEN` | staff codes |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | card payments. Without them, bookings are reserved and invoiced. Webhook: `https://<site>/api/stripe/webhook` for `checkout.session.completed`, `…async_payment_succeeded`, `…async_payment_failed`, `…expired` |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | ticket, order and follower emails |
| `PIN_MODERATION=off` | publish Party Wall pins without review |
| `ANTHROPIC_API_KEY` | turns on Ask TAM's agent (without it, Ask TAM answers from keywords) |
| `TAM_AI_MODEL`, `TAM_AI_EFFORT` | default `claude-opus-5-5`, `low` |
| `AGENT_DAILY_LIMIT` | agent questions per day before falling back to keywords (default 1500) |
| `ENQUIRIES_TO` | where enquiry emails go (needs `RESEND_API_KEY`) |
| `INDEXING=on` | **only on the real tam.tv**: lets search engines index the site. Everywhere else every page is `noindex` (see [docs/SEO.md](docs/SEO.md)) |

## Deploy on Railway

1. New Project → Deploy from GitHub repo → this repo. `railway.json` sets the start command and the `/healthz` check.
2. Add a volume mounted at `/data` and set `DATA_DIR=/data`.
3. Set `SITE_URL`, `ADMIN_TOKEN` and `DOOR_TOKEN`, plus Stripe and Resend when you're ready.

## Content

- `content/site.json`, `venues.json`: the site and its rooms
- `content/festivals/*.json`, `events.json`: festivals and hand-made nights
- `content/artists.json`: profiles, laid over `archive/performers.json` (from Eventbrite)
- `content/invites.json`, `stories.json`, `polaroids.json`, `collections.json`: from The Best Christmas Ever
- `content/archive/`, `legacy/pages.json`, `videos.json`: from the `tam` repo's crawl of www.tam.tv and TAM's Eventbrite history

`node scripts/import_christmas.cjs ../bestchristmas` refreshes the Christmas content and artwork. The archive and the old site refresh with the earlier scripts:

```bash
node scripts/fetch_eventbrite.mjs /tmp/eventbrite.json && python3 scripts/import_eventbrite.py /tmp/eventbrite.json   # → content/archive/
python3 scripts/crawl_oldsite.py /tmp/oldsite.json && python3 scripts/import_oldsite.py /tmp/oldsite.json          # → content/legacy/, videos.json, public/img/archive/
```

Imported venues (`content/archive/venues.json`) are merged with `content/venues.json`, where the hand-written details live. `npm run check:content` checks everything without starting the server.

## Before launch

- Prices, capacity, discounts, sponsorship packages and the raffle are the Christmas site's placeholders. Sign them off in `content/festivals/best-christmas-ever.json`.
- Review the privacy notice (`/privacy`) with TAM.
- Point `charity.url` at TAM's own fundraising page once it exists.

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

## Readable by AI (Google AI Mode, Gemini, ChatGPT, Claude, Perplexity)

Google's AI Mode answers questions like "what's on at TAM tonight, how much, are tickets left?" by reading the site, and calls the venue when it can't find the answer ([Google's guide](https://support.google.com/websearch/answer/17104441)). So tam.tv says it all in ways machines read (`src/views/ai.js`):

- **The venue** (home page and Find TAM): schema.org `MusicVenue` with the address, **opening hours (Mondays closed)**, capacity, food and drink, socials, and how to book tickets or hire the room. The opening times are also shown to everyone in the Find TAM section; they're in `content/venues.json` (`guide.openingTimes` for people, `hours` for machines).
- **Every night**: schema.org `MusicEvent` with the venue's full address, door time, prices, **availability (in stock, limited, sold out) and tickets left** from TAM's box office or Eventbrite, the performers and the booking link. What's on carries the whole list.
- **/whats-on.json**: every upcoming night as data (times, prices, tickets left, who sells them, booking link).
- **/llms.txt**: a plain-language guide to TAM for AI assistants: where it is, when it's open, how tickets work, what's coming up, the regulars, hiring the venue.
- **/calendar.ics**: the same nights as a calendar.
- **robots.txt** welcomes search engines and AI crawlers (Googlebot, Google-Extended, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Applebot, DuckAssistBot) to the public site and keeps them out of staff pages and the API. Remove `Google-Extended` or `GPTBot` there to opt out of AI training while staying in search and answers.
- The Blues Jam Saturdays are written into the page itself, as not every assistant runs scripts.

Keep the opening times right in `content/venues.json` and on TAM's Google Business Profile: AI Mode compares both.

## The Great British Blues Jam (/great-british-blues-jam, short link tam.tv/blues)

TAM's Saturday afternoon jam has its own page: each coming Saturday's **host** and **house band**, the jam list, a **sign-up** to jam (name and instrument, email optional and seen only by staff; people can cancel their own), and **The Great British Blues Wall** (short notes; while `PIN_MODERATION` is on they wait for a staff OK, like the Party Wall).

- **The big screen** (`/great-british-blues-jam/screen`, or tam.tv/blues/screen) is for the projector in the Temple. It shows the title, the TAM logo large and pulsing to the beat of the room (through the laptop's microphone, with rings of light on every beat), the host, who's on stage, who's next, the house band, the wall, and a QR code to sign up. It refreshes itself every few seconds. Press the start button (the browser asks for the microphone once). Keys: **F** full screen, **M** microphone, **A** steady shuffle beat, **Space** tap the tempo, **H** hide the lists. It keeps the screen awake and hides the cursor.
- **Running it** (`/great-british-blues-jam/manage`, for the team: sign in at /shows): set each Saturday's host, house band (name and instrument), jam list size, sign-ups open or closed, and a note; run the jam list (put someone **On stage**, mark them done, move up or down, remove); show or hide wall posts. Everything appears on the page and the screen straight away.

See `src/domain/blues.js`, `src/views/blues.js`, `public/js/blues.js`, `public/js/blues-screen.js`, `public/js/blues-manage.js`.

## The Analogue Room (/analogue-room, short link tam.tv/room)

A daily escape room built from the day's news and set in a TAM of five years from now, where the room is a chartered "analogue room": live music made and heard by people, nothing recorded. The news is real and sourced; the future is labelled fiction on the page.

- **Four locks**: file six lines from the wire as *on the record* or *story*; turn a four-digit dial hidden in one of the facts; rule on four things that want to cross the wall (what may enter, act, leave, and what happens on failure); then say the word the rulings spell.
- **Points**: opening the doors gives TAM Club members **+2 points, once a day** (`RULES.room` in `src/domain/club.js`). Anyone can play; only members bank points.
- **No answers in the page**: the page asks `/api/room/check` whether each move is right, and `/api/room/open` only opens the doors (and gives the points) when the whole room is sent back solved.
- **A room a day** lives in `content/rooms.json` (oldest first; the newest room dated today or earlier is the one on the page, and earlier rooms stay playable). Each fact card must point at one of the room's `sources`. A room that fails `validRoom()` is skipped and a file that won't parse means no rooms, so a bad morning's file can't take the site down. Never put a real, named person in the fiction.

- **On the home page** as a tile (the musician pathway gets its own words), and **on every public page** as one line inviting the visitor in (`public/js/room-invite.js`). The wording is picked for artists or the public, and for where the visit came from: search, social, AI assistants, email, ticket sites, other TAM sites, direct. The site learns which wording gets doors opened; one visitor in five sees a wording at random so it keeps learning. Add or change wordings in `INVITES` in `src/domain/room.js`.
- **Who plays** (`/analogue-room/stats`, for admins): shown, followed, started, doors opened and points banked, by source, audience and wording, over 30 days. Totals only, kept 90 days: no cookie, nothing about who anyone is. The kind of source is kept for the visit in the browser's sessionStorage; the privacy notice says so.

- **Any language.** The room opens in the visitor's browser language, with a picker of 48 languages in their own names (any other language a browser asks for works too). Claude translates the day's room and the game's own words once per language and the site keeps the result (`src/services/room-translator.js`, the same `ANTHROPIC_API_KEY` and `TAM_AI_MODEL` as Ask TAM; without a key the room is English only and the picker is hidden). The page says the translation is automatic, and source links stay the originals. Right-to-left languages are laid out right to left. The answers are the same everywhere: the dial is digits and the letters spell the same English word. At most 60 new translations a day, so nobody can run up the bill; past that, or if a translation fails, the room is in English. A translated line that comes back empty or with a broken `{placeholder}` stays in English.

See `src/domain/room.js`, `src/services/room-translator.js`, `src/views/room.js`, `public/js/room.js`, `public/js/room-invite.js`, `test/room.test.js`.

## Shows: the back office for creating nights (/shows)

**tam.tv/shows** is where TAM's team creates and runs shows: a month calendar of every night (TAM shows, Eventbrite listings, the schedule, festival nights; Mondays marked as the rest day), and an editor for each show.

- **Sign in** with an emailed link (no passwords): type your work email at /shows. The link works once, for 20 minutes, and opens a page with a Sign in button (so email scanners can't use it up). Sessions last 30 days. The admin code still works.
- **The team** is set by `STAFF` on Railway, e.g. `STAFF="Vivian <vivian@…> ops; Sieng <sieng@…> admin"`, and managed in **/admin → Team**. **Ops** (Vivian, the ops director) creates and publishes shows, sets up tickets, posts to Eventbrite, Facebook and Google, and runs the door. **Admin** can do everything, including the team. Emails stay out of the repo.
- **A show** has a title, date and times, summary, description, image, video, line-up (names can be kept secret: the page says "+1 to be revealed"), running order and tickets. It's a draft until it's published; then it's a night on tam.tv and replaces the Eventbrite or schedule entry for the same night. Shows can be copied to another date or repeated weekly (as drafts), and nights already on the site can be brought in to manage ("Manage it in Shows"). Every change is logged with who made it.
- **Tickets**, per show: TAM box office · TAM box office + Eventbrite (the Eventbrite allocation comes out of the same capacity, so nothing oversells) · Eventbrite only · free guest list (RSVP, books without a card) · free entry.
- **Share it**:
  - **Eventbrite**: creates a draft listing with the show's title, times (UK clock changes included), words, image (cropped 2:1) and ticket types, then publishes, syncs sales and cancels. Needs `EVENTBRITE_TOKEN` (a private token from the account that owns TAM's organiser page). Its listing is never shown twice: the live Eventbrite read sync skips listings that belong to a show.
  - **Facebook**: Meta doesn't let apps create Facebook Events, so: connect TAM's Facebook Page in Eventbrite once (Account settings → Facebook) and published listings appear there as Facebook Events; and /shows posts to the Page with the link. Needs `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_TOKEN` (long-lived, `pages_manage_posts`).
  - **Google Business Profile**: an Event post with date, times, photo and a Book button. Needs `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN` (OAuth, scope `business.manage`), `GBP_ACCOUNT_ID` and `GBP_LOCATION_ID`. Google also finds every show through the event details on its tam.tv page.
  - Not connected yet? The posts are still written for you: copy them, post by hand, and mark them as posted.
- **Write it for me**: Claude drafts the summary, description and posts from the show's details and your notes (`ANTHROPIC_API_KEY`). It uses only the facts given and changes nothing until you press Use.
- **tam.tv/calendar.ics** is a public calendar of every upcoming night, to subscribe to in Google or Apple Calendar.

Built from christmas.tam.tv (the Eventbrite and social publishing), friday.tam.tv (staff roles, line-up reveals, free RSVP through the box office) and immersive.tam.tv. See `src/domain/shows.js`, `src/domain/team.js`, `src/services/eventbrite-publish.js`, `src/services/social.js`, `src/services/writer.js`, `public/js/shows.js`.

## TAM's live Eventbrite listing comes first

TAM's Eventbrite organiser page ([eventbrite.co.uk/o/33409225909](https://www.eventbrite.co.uk/o/33409225909)) is the **superior data set**. `src/services/eventbrite-live.js` reads the same public endpoints that page uses, at startup and every 30 minutes: every upcoming listing and the most recent past ones. Where Eventbrite and the schedule both have a night (same date, matching name: "The Original Singers Club" is the schedule's "Singers @ Sunday Spot"), **Eventbrite's name, start time, price, sold-out state and ticket link win**. Cancelled listings are left out. December listings join The Best Christmas Ever. Schedule nights Eventbrite doesn't list, and dates beyond its last listing, still come from the schedule.

**Tickets are modelled from each listing's own ticket types** (`/api/v3/events/:id/ticket_classes/for_sale/`, the list Eventbrite's checkout shows): free, paid (price plus Eventbrite's booking fee) or pay-what-you-like, with on-sale state, sales end and the ticket's description. A night with a free ticket on sale is "Free entry" (TAM Karaoke's General Ticket), otherwise it's priced from its cheapest paid ticket. The organiser feed's "minimum price" isn't used: it reports the dearest ticket plus fee (£16.96 for karaoke). Each night's page lists every ticket type, and the structured data carries one offer per type. If a listing's ticket types can't be fetched, the last known ones stay.

The last good copy is saved as `DATA_DIR/eventbrite-live.json`, so if Eventbrite is down the site keeps its listings. Staff see when it last refreshed on the admin overview. `EVENTBRITE_SYNC=off` turns it off. `EVENTBRITE_ORGANIZER` and `EVENTBRITE_BASE` change the organiser and host.

## The old www.tam.tv

Every page of the old site is still live at its old address, and stays in the sitemap, so no link or search ranking is lost. The new site doesn't link to the pages only the old site has (About, Private parties, TAM Singers, the NFT and TOM pages and so on) until staff reconnect them: **/admin → Old site** lists every old page and puts any of them in the header or footer navigation, with its own label. Reconnecting a page also brings back the new site's own links to it, such as the pathway cards that point at `/private-parties` (until then they fall back to the card's `fallback`, e.g. the enquiry form). See `src/domain/legacy-links.js`.

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

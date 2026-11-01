# Porting christmas.tam.tv into TAM.TV

Every concept from The Best Christmas Ever (`siengvantran/bestchristmas`), where it lives now, and how it changed. The main change: on christmas.tam.tv each feature was hard-wired to one festival. Here each one is a **festival feature**, switched on in a festival's JSON and available to any night.

✅ ported · 🟡 ported with changes · ⬜ not ported yet

## Tickets and money

| Concept | Status | Where | Notes |
| --- | --- | --- | --- |
| Per-night prices (weekday, weekend, special) | ✅ | `shared/pricing.js` `standard` mode, `festival.pricing.nightPrices` | |
| £10 flat nights with exceptions | ✅ | `flat` mode, `pricing.flat.except` | |
| A night's own ticket types (Robin, GA, VIP) | ✅ | `own` mode, `tickets` in `events.json` | adds an optional per-type `limit` |
| Price schedule / early-bird ladder | ✅ | `schedule` mode | from the `tam` repo's Dana ladder; not used by the Christmas content, which keeps £22 |
| Group discounts 6+/10+/20+ | ✅ | `pricing.groupTiers` | |
| Startup pack (4–15, 20% off, team name) | 🟡 | `pricing.packs` | now a list of packs, so a festival can have several |
| Capacity per night, max per booking | ✅ | `pricing.capacity`, `maxPerBooking` | |
| Closed nights (24–28 Dec) | ✅ | `festival.closed` | |
| One price shown = price charged | ✅ | `/shared/pricing.js` imported by both sides | an ES module instead of a dual CommonJS/window file |
| Charity donation on bookings (presets, own amount, £500 max) | ✅ | `features.donation`, `festival.donation` | its own Stripe line, as before |
| Fundraising total on the page | ✅ | `/api/availability` → `raised` | |
| Stripe Checkout, 30-minute holds, keyed confirm | 🟡 | `src/domain/tickets.js`, `src/services/stripe.js` | confirming a booking now needs the ticket key too |
| Stripe webhook (completed, async success/fail, expired) | ✅ | `/api/stripe/webhook` | |
| Paid after a lapsed hold → flagged / renumbered | ✅ | `markPaid` in tickets and collections | |
| Reserve-and-invoice without Stripe | ✅ | | |
| Payment links (`/pay/REF?k=`) | 🟡 | `/pay/:ref`, admin **Send payment link** | one booking at a time; the "all reserved bookings at once" button isn't ported |
| VIP table requests | ✅ | `tableRequest` ticket flag | |

## Community features

| Concept | Status | Where | Notes |
| --- | --- | --- | --- |
| Team Tables (start, join, seats, blurb) | ✅ | `features.teamTables` | |
| Party Wall (booking ref + email, logo, moderation, gold sponsor pins) | ✅ | `features.partyWall` | pins belong to a festival |
| Sponsorship packages + enquiries | ✅ | `features.sponsorship` | packages are festival content |
| Christmas cards (effects, Polaroids, own photos, message, envelope) | 🟡 | `features.cards`, `public/js/song.js`, `/card/:id` | generalised to "remix cards" for any festival song. The recipient can't switch story theme yet |
| Story layer on the trailer (22 Dana themes, `?stories=` links, remembered) | ✅ | `content/stories.json`, linked by `song.stories` | |
| Invitation cards (Hootenanny line-up, Dana fans, Polaroids, `?to=&from=&m=`, `via` tracking) | ✅ | `content/invites.json`, `/invite/:id`, invite composer on event pages | uses the existing preview images. New invites need their own 1200×630 image |
| Artist landing pages + Follow (consent, one-click unsubscribe) | ✅ | `/artists/:slug` | merged with tam.tv's 278 archive artists. Old URLs kept (`/artists/danagillespie`) |
| Email followers (test, send, pace, history) | ✅ | admin **Email followers** | |
| Artist stats (visits, invite views, followers, bookings via) | ✅ | admin **Artists** | |

## On the night

| Concept | Status | Where | Notes |
| --- | --- | --- | --- |
| QR tickets | ✅ | `/ticket/:ref`, `src/lib/qr.cjs` | same encoder |
| Door check-in (sign in once, camera app, partial check-in, undo, wrong-night flags) | 🟡 | `/door`, ticket page panel | sign-in is a signed HttpOnly cookie instead of a stored token. "Tonight" includes nights that run past midnight |
| In-page QR scanning | ✅ | `BarcodeDetector` where supported | |
| Raffle desk (deals, numbers never reused, voids, crypto draw) | ✅ | `features.raffle`, `/raffle-desk` | |
| Hootenanny run sheet (crew, setlist) | ⬜ | | kept out on purpose: it's private crew data (`runsheet.js`) and wasn't on the public site |

## Look and feel

| Concept | Status | Where | Notes |
| --- | --- | --- | --- |
| Chrome display type, acid ticker, offset-shadow buttons | ✅ | `public/css/site.css` | the default TAM theme is gold and violet; `theme: "christmas"` gives the festive palette |
| Starfield that swells with the music | ✅ | `public/js/site.js` | every page |
| Snow | 🟡 | `features.ambient: "snow"` | the "melts on Dana's hat and coat" detail isn't ported: it was traced from one video frame |
| Tamalume player (song / your track / mic, note → colour, beat) | ✅ | `public/js/tamalume.js` | same palette and tempo method. The song's tempo and chords are content (`song.bpm`, `song.bars`) |
| Theme-song video in the two hero circles, floating as you scroll | ⬜ | | the player and the trailer drive the visuals instead. Worth porting as a festival hero option |
| Countdown to opening night (on now, after) | ✅ | `features.countdown`, home page | |
| Shard tree, title lock-up, programme cards | ✅ | `festival.heroArt`, `lockup`, `programme` | |
| Calendar (tap a night to book) | ✅ | `festivalCalendar` | |

## Merch

| Concept | Status | Where | Notes |
| --- | --- | --- | --- |
| Signed books in Dana's 108 Verified Collection | 🟡 | `content/collections.json`, `/collections/dana-108`, `/verify` | generalised to "numbered verified collections" (prints, vinyl…). Codes are HMAC-signed |

## Integrations

| Concept | Status | Notes |
| --- | --- | --- |
| Ticket / order / follow emails (Resend) | ✅ | the email links to the ticket page with its QR code, rather than embedding the QR image |
| Eventbrite listings from admin (create, publish, update, sales) | ⬜ | `eventbrite.js` in bestchristmas. The next big port |
| Post to Facebook / Google Business Profile, Copy for Google | ⬜ | `social.js` in bestchristmas |
| Privacy notice | 🟡 | `/privacy`, rewritten for the whole site; needs TAM's review |

## From the `tam` repo (the earlier tam.tv rebuild)

Brought across as data: the crawl of all 54 old pages and their 165 photos, the 1,539-night Eventbrite archive, 278 performers, venues, series and TAM TV films. Not brought across: the Production Agent (`/studio`), Tech Nights, the live YouTube feed, coloured-vinyl artwork and "the TAM 108" falling songs. They can come over the same way when wanted.

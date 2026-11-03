# One home for every page: tam.tv and christmas.tam.tv

Search engines don't penalise a site for having the same content as another site; they pick one version (the "canonical"), show it, and filter the copies out. The risk is that ranking signals get split and the wrong copy shows. So every piece of content has exactly one home, and every copy says where that home is.

## The rules

| Situation | What TAM.TV does |
| --- | --- |
| A preview (Railway, local) | `X-Robots-Tag: noindex, nofollow` on every response, a `noindex` meta tag, and no sitemap in robots.txt. Crawling stays allowed, so search engines can see the noindex. Only the real site sets `INDEXING=on`. |
| A page christmas.tam.tv also has | Its `<link rel="canonical">` points to the christmas.tam.tv page. It has no event markup (JSON-LD), so the event isn't listed twice, and it isn't in the sitemap. Visitors can still use it normally. |
| Everything else (nights, artists, the archive, old www.tam.tv pages) | Canonical to itself on tam.tv, with its own markup and a sitemap entry. |

The overlapping pages are listed in `content/festivals/best-christmas-ever.json` → `canonical`:

| tam.tv | home now |
| --- | --- |
| `/the-best-christmas-ever` | `christmas.tam.tv/` |
| `/events/big-christmas-hootenanny` | `/opening-night` |
| `/events/dana-gillespie-live` | `/dana-gillespie` |
| `/collections/dana-108` | `/books` |
| `/invite/<id>` (every invitation card) | `/invite/<id>` |
| `/artists/bakers-dozen`, `hugh-baker`, `matt-hootenanny-host`, `thomas-caulfield`, `queenie-slinger`, `molly-chadwick`, `haydn-bardoe`, `ger-ohanlon`, `felix-cassell` | `/artist/band`, `hugh`, `matt`, `thomas`, `queenie`, `molly`, `haydn`, `ger`, `felix` |

Dana Gillespie and Gemma Schito keep **tam.tv** as their home (`/artists/danagillespie`, `/artists/gemma-schito`): those pages carry their full history at TAM and the old www.tam.tv URLs. The festival's generated nights (`/events/best-christmas-ever-2026-12-05` and so on) exist only here, so they're tam.tv's own.

## Launching tam.tv

1. Point tam.tv at the Railway service and set `SITE_URL=https://tam.tv` and `INDEXING=on`.
2. Leave every other deployment (previews, staging) without `INDEXING`.
3. In Google Search Console, add tam.tv and submit `https://tam.tv/sitemap.xml`.

## After the festival: consolidating into tam.tv (January 2027)

When christmas.tam.tv's season is over, move its authority to tam.tv for good:

1. On christmas.tam.tv, **301-redirect every path to the same path on tam.tv**, except `/`, which goes to `/the-best-christmas-ever`. TAM.TV already answers the festival site's old paths and sends each to its tam.tv page (`/opening-night` → the Hootenanny, `/books` → the collection, `/artist/hugh` → `/artists/hugh-baker`…), and `/invite/<id>`, `/verify` and `/privacy` exist on both. So that one rule covers everything.
2. Delete the `canonical` block from the festival file. The pages become tam.tv's own, with their event markup and sitemap entries.
3. In Search Console, use **Change of address** for christmas.tam.tv → tam.tv only if the whole subdomain is redirecting; otherwise the 301s are enough.
4. Keep the redirects in place for at least a year.

## Optional, on christmas.tam.tv now

It has no canonical tags and no robots.txt. That's fine: search engines treat each page as its own canonical. Adding explicit self-canonicals there (`<link rel="canonical" href="https://christmas.tam.tv/opening-night">` and so on) makes the choice unambiguous.

## Duplicate text

The festival page on tam.tv reuses christmas.tam.tv's wording (the lede, programme cards, charity and sponsorship copy). With the canonical tags above this is fine. Once tam.tv becomes the festival's home, it's the only copy.

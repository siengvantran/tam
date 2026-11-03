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

## christmas.tam.tv is the permanent home for Christmas

Christmas at TAM builds authority on its own subdomain, year after year, rather than being folded into tam.tv. So:

- These tam.tv pages **always** point their canonical to christmas.tam.tv, and the `canonical` block in the festival file stays.
- tam.tv's festival page tells visitors where the festival lives (`home` in the festival file) and links to its next-Christmas and past-Christmases pages, so the links go to the subdomain.
- christmas.tam.tv keeps a page for every year (`/2021` … `/2026`), recruits for the next one at `/2027`, publishes evergreen guides and has its own sitemap. See the `bestchristmas` repo's README.

When the season ends, christmas.tam.tv's home page becomes next year's hub, and this year's festival lives on at `/2026`. Then change `/the-best-christmas-ever`'s canonical target in the festival file from `/` to `/2026`, so it points at the page with the same content.

## On christmas.tam.tv

Self-canonicals on every page, `robots.txt` and `sitemap.xml` are in [siengvantran/bestchristmas#59](https://github.com/siengvantran/bestchristmas/pull/59).

## Duplicate text

The festival page on tam.tv reuses christmas.tam.tv's wording (the lede, programme cards, charity and sponsorship copy). With the canonical tags above this is fine: search engines treat christmas.tam.tv's wording as the original.

# www.tam.tv today

Reviewed 1 November 2026.

## What it is

A Google Sites site: 54 pages, each with the full menu repeated two or three times (desktop, mobile, "More"). The menu has 40+ entries: EAO, Tom (Ignition, TransMission, Convergence, Artist Village), Festivals, Singers, Karaoke, Made In London / Breakthrough Week, The Best Christmas Ever, About, What's on, Junior Open Mic, Locations (Elephant & Castle, Austria: Innsbruck and Vienna), Private Parties, Artists (Albie Salter, Gemma Schito, Iris, Dana Gillespie, Dino Baptiste, Harry Whitty, Hans Theessink), NFT & AI (Holly Penfield, Black Card, News, TAM Token, Meme Coin / Pepe, Ech0 / 1008 Ech0s, Songs), and TV.

The home page is a long scroll of posts: an exclusive event, the Bunker Sessions, Singers' RSVP, Dana at SXSW (Om Shakti), the Bowie *Blackstar* 10th anniversary night, Dana's signed 7″, Breakthrough Week (June 2–8), Dana's birthday, a Junior Open Mic write-up and an open-mic essay.

## Problems

| | What happens | What TAM.TV does instead |
| --- | --- | --- |
| No tickets of its own | Every "Get tickets" goes to Eventbrite, and TAM gives up the buyer relationship and fees | TAM's own box office on every night, with Eventbrite links kept for archived nights |
| Out-of-date content | e.g. "The Next JOM at TAM will be May 18" (2025), Breakthrough Week with no year | nights are data with dates. Past nights move to the archive by themselves |
| No structure for search | posts are paragraphs, with no event data | `MusicEvent`, `Festival`, `MusicVenue` and `MusicGroup` JSON-LD, a sitemap, `.ics` files |
| Images expire | Google Sites signs its image links | the 165 photos are stored locally (from the `tam` repo's crawl) |
| Heavy pages | ~420 KB of HTML before images, much of it repeated menus | 7–50 KB pages (story themes load separately), no framework |
| Christmas lives elsewhere | christmas.tam.tv is a separate site, and tam.tv's `/the-best-christmas-ever` is a static page | the festival is part of the site, and its old URL is the festival page |
| No first-party audience | no sign-ups, follows or demand signals | Follow an artist, "Bring them back", "I was there", invitations with `via` tracking |

## Kept

Every one of the 54 URLs still answers (`/home` redirects to `/`), with its old text and photos, so search value carries over. The tests request every one.

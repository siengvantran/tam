# Roadmap

## Phase 1: Digital home ✅ (this repo)
Homepage, events, artist pages, watch, listen, stories, about, Play TAM submissions, newsletter, consent-first analytics, structured data / sitemap / llms.txt / knowledge graph, living logo and generative sigils, Production Agent.

**Before launch**
- [ ] Replace all `"sample": true` content with real artists, events, films and stories
- [ ] Add real social links in `content/site.json`
- [ ] Have the privacy notice reviewed
- [ ] Mount a Railway volume at `DATA_DIR`; set `SITE_URL`
- [ ] Point the domain at Railway; submit the sitemap to Google Search Console
- [ ] Send newsletter sign-ups to an email platform (export from `signups.jsonl` until then)

## Phase 2: TAM Festival
- Import the existing calendar and the six-year archive (`content/archive.json` → the archive rings fill up)
- Photographer galleries per event
- Ticketing links / integration
- Instagram/TikTok/YouTube feeds on artist and event pages

## Phase 3: Play TAM
- Review queue for `submissions.jsonl` (status: new → shortlisted → programmed)
- Accepted submissions become draft artist and event records

## Phase 4: "Would you come?"
- Public proposal pages with an interest button → pledge → threshold → event activated
- Move `store.js` to Postgres (records are already shaped for import)

## Phase 5: Membership
- £10 membership: pledges, early access, member content, priority booking

## Phase 6: AI layer
Agents from brief §20 alongside the Production Agent: Editorial, Artist, Social, SEO, Programming (submissions + demand), Audience (recommendations).

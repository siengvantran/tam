// Loads everything in content/, checks it, and builds the indexes the site
// reads from. A broken reference fails loudly at startup, not on a live page.
//
// Nights come from three places:
//   1. festivals/*.json `dates`: one night per open date, priced by the festival
//   2. events.json: hand-made nights (override a festival's generated night on the same date)
//   3. archive/events.json: TAM's Eventbrite history (past nights, Eventbrite links)

import fs from 'node:fs';
import path from 'node:path';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const ENQUIRY_KINDS = ['venue-hire', 'party', 'perform', 'sponsor', 'other'];
export const FEATURES = ['countdown', 'ambient', 'tamalume', 'cards', 'teamTables', 'partyWall', 'sponsorship', 'donation', 'raffle', 'invites'];

export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now); // YYYY-MM-DD
}
export function dateParts(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return { weekday: DAY[d.getUTCDay()], day: d.getUTCDate(), month: MONTH[d.getUTCMonth()], year: d.getUTCFullYear(), dow: d.getUTCDay() };
}
export const longDate = (iso) => { const p = dateParts(iso); return `${p.weekday} ${p.day} ${p.month} ${p.year}`; };
export const shortDate = (iso) => { const p = dateParts(iso); return `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}`; };

// London wall-clock time → UTC ISO. Handles GMT/BST; an end before the doors is after midnight.
export function londonToUtc(date, time) {
  const guess = new Date(`${date}T${time}:00Z`);
  const offsetMin = (d) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour').value), m = Number(parts.find((p) => p.type === 'minute').value);
    let diff = h * 60 + m - (d.getUTCHours() * 60 + d.getUTCMinutes());
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    return diff;
  };
  return new Date(guess.getTime() - offsetMin(guess) * 60000).toISOString();
}
const addDay = (iso) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

function readJson(dir, file, fallback) {
  const f = path.join(dir, file);
  if (!fs.existsSync(f)) return fallback;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`content/${file}: ${e.message}`); }
}

export function loadContent(dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'content')) {
  const problems = [];
  const check = (ok, msg) => { if (!ok) problems.push(msg); };

  const site = readJson(dir, 'site.json', {});
  // venues: the Eventbrite import's list, with hand-written details (transport, maps) laid over it
  const venueMap = new Map(readJson(dir, 'archive/venues.json', []).map((v) => [v.slug, v]));
  for (const v of readJson(dir, 'venues.json', [])) venueMap.set(v.slug, { ...venueMap.get(v.slug), ...v });
  const venues = [...venueMap.values()];
  const profiles = readJson(dir, 'artists.json', []);
  const performers = readJson(dir, 'archive/performers.json', []);
  const series = readJson(dir, 'archive/series.json', []);
  const archive = readJson(dir, 'archive/events.json', []);
  const handmade = readJson(dir, 'events.json', []);
  const legacy = readJson(dir, 'legacy/pages.json', []);
  const videos = readJson(dir, 'videos.json', []);
  const invites = readJson(dir, 'invites.json', []);
  const stories = readJson(dir, 'stories.json', []);
  const polaroids = readJson(dir, 'polaroids.json', []);
  const collections = readJson(dir, 'collections.json', []);
  const pathways = readJson(dir, 'pathways.json', []);
  const schedule = readJson(dir, 'schedule.json', []);
  const festivals = fs.existsSync(path.join(dir, 'festivals'))
    ? fs.readdirSync(path.join(dir, 'festivals')).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(dir, `festivals/${f}`))
    : [];

  const by = (list, key = 'slug') => new Map(list.map((x) => [x[key], x]));
  const venueBy = by(venues);

  // ----- artists: Eventbrite history, with hand-written profiles laid over it -----
  const artistBy = new Map();
  for (const p of performers) artistBy.set(p.slug, { slug: p.slug, name: p.name, legend: Boolean(p.legend), bio: [], links: [], archive: p });
  for (const p of profiles) {
    const a = artistBy.get(p.slug) || { slug: p.slug, archive: null };
    artistBy.set(p.slug, { ...a, ...p, legend: Boolean(p.legend || a.legend), bio: p.bio || [], links: p.links || [] });
  }
  for (const a of artistBy.values()) check(/^[A-Za-z0-9-]+$/.test(a.slug) && a.name, `artist ${a.slug}: needs a slug and a name`);

  // ----- festivals -----
  const festivalBy = by(festivals);
  for (const f of festivals) {
    check(f.slug && f.name && f.path, `festival ${f.slug || '?'}: needs slug, name and path`);
    check(!f.venue || venueBy.has(f.venue), `festival ${f.slug}: unknown venue ${f.venue}`);
    for (const k of Object.keys(f.features || {})) check(FEATURES.includes(k), `festival ${f.slug}: unknown feature ${k}`);
    f.features = f.features || {};
    if (f.features.donation) check(f.donation && f.donation.max, `festival ${f.slug}: donation feature needs a donation block`);
    if (f.features.raffle) check(f.raffle && f.raffle.price, `festival ${f.slug}: raffle feature needs a raffle block`);
    if (f.features.sponsorship) check(f.sponsorship && (f.sponsorship.packages || []).length, `festival ${f.slug}: sponsorship needs packages`);
    if (f.song && f.song.artist) check(artistBy.has(f.song.artist), `festival ${f.slug}: unknown song artist ${f.song.artist}`);
  }

  // What a festival night sells, for shared/pricing.js
  function festivalSale(f, date, ev) {
    const p = f.pricing || {};
    const base = { capacity: (ev && ev.capacity) || p.capacity || 0, maxPerBooking: p.maxPerBooking || 60 };
    if (ev && ev.tickets) return { ...base, mode: 'own', tickets: ev.tickets };
    if (ev && ev.pricing && ev.pricing.tiers) return { ...base, mode: 'schedule', tiers: ev.pricing.tiers, door: ev.pricing.door };
    if (p.flat && !(p.flat.except || []).includes(date)) return { ...base, mode: 'flat', price: p.flat.price };
    const { dow } = dateParts(date);
    const kind = (p.special || []).includes(date) ? 'special' : (dow === 0 || dow >= 5) ? 'weekend' : 'weekday';
    return { ...base, mode: 'standard', kind, price: (p.nightPrices || {})[kind], groupTiers: p.groupTiers || [], packs: p.packs || [] };
  }
  function standaloneSale(ev) {
    const base = { capacity: ev.capacity || 0, maxPerBooking: ev.maxPerBooking || 20 };
    if (ev.tickets) return { ...base, mode: 'own', tickets: ev.tickets };
    if (ev.pricing && ev.pricing.tiers) return { ...base, mode: 'schedule', tiers: ev.pricing.tiers, door: ev.pricing.door };
    return null;
  }

  // ----- TAM's own nights -----
  const handBy = new Map();
  for (const e of handmade) {
    check(e.slug && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''), `event ${e.slug || '?'}: needs a slug and a YYYY-MM-DD date`);
    check(!e.festival || festivalBy.has(e.festival), `event ${e.slug}: unknown festival ${e.festival}`);
    for (const a of e.artists || []) check(artistBy.has(a), `event ${e.slug}: unknown artist ${a}`);
    for (const t of e.tickets || []) check(t.id && t.name && Number.isInteger(t.price), `event ${e.slug}: ticket types need id, name and a price in pence`);
    if (e.festival) handBy.set(`${e.festival}|${e.date}`, e);
    if (e.festival && festivalBy.get(e.festival) && festivalBy.get(e.festival).dates) {
      const fd = festivalBy.get(e.festival).dates;
      check(e.date >= fd.from && e.date <= fd.to, `event ${e.slug}: ${e.date} is outside its festival's dates`);
    }
  }
  function makeNight(e, f) {
    const date = e.date;
    const doors = e.doors || (f && f.dates && f.dates.doors) || '19:00';
    const ends = e.ends || (f && f.dates && f.dates.ends) || '23:00';
    const endDate = ends < doors ? addDay(date) : date;
    const label = e.label || (f && (f.nightLabels || {})[date]) || '';
    const sale = f ? festivalSale(f, date, e) : standaloneSale(e);
    return {
      slug: e.slug, date, ...dateParts(date),
      title: e.title || label || (f ? f.name : 'TAM'),
      label, presenters: e.presenters || '',
      festival: f ? f.slug : null,
      venue: e.venue || (f && f.venue) || site.defaultVenue,
      doors, ends, timesTbc: Boolean(e.timesTbc),
      start: londonToUtc(date, doors), end: londonToUtc(endDate, ends),
      summary: e.summary || '', schedule: e.schedule || [], artists: e.artists || [],
      image: e.image || (f && f.og) || '/img/og.jpg',
      stories: e.stories || null, collection: e.collection || null,
      handmade: Boolean(e.title), url: e.url || '', sale,
    };
  }

  const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
  const claimant = (date) => festivals.find((f) => f.claims && (f.claims.months || []).includes(Number(date.slice(5, 7)))
    && (!f.dates || date.slice(0, 4) === f.dates.from.slice(0, 4) || date < f.dates.from)) || null;
  const SERIES_TIMES = { 'great-british-blues-jam': ['16:00', '19:00'], 'singers-sunday-spot': ['19:30', '22:30'] };
  const titleOf = (e) => (e.theme ? `${e.title}: ${e.theme}` : e.title);
  const sig = (t) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !['night', 'with', 'the', 'great', 'british', 'live', 'hosted', 'party'].includes(w)).map((w) => w.slice(0, 6)));
  // Regular nights the two sources name differently ("Singers @ Sunday Spot" is Eventbrite's "The Original Singers Club").
  const SERIES_WORDS = { 'singers-sunday-spot': /singer/i, 'great-british-blues-jam': /blues jam/i, 'tam-karaoke': /karaoke/i, 'word-of-mouth': /word of mouth|\bwom\b/i, 'open-mic': /open mic/i, 'junior-open-mic': /junior|\bjom\b/i, 'jazz-jam': /jazz jam/i, 'latin-jam': /latin/i };
  const sameNight = (a, b, series) => (series && SERIES_WORDS[series] && SERIES_WORDS[series].test(b)) || [...sig(a)].some((w) => sig(b).has(w));

  const archivePast = archive.map((e) => ({ ...e, ...dateParts(e.date), source: 'eventbrite' }));
  const archiveIds = new Set(archive.map((e) => String(e.id)));
  const nights = [];
  const nightBy = new Map();
  const past = [];
  const pastBy = new Map();
  let liveCount = { upcoming: 0, past: 0 };

  // Builds every night and the archive. `live` is TAM's live Eventbrite listing
  // (src/services/eventbrite-live.js): it outranks the schedule, so where both
  // have the same night, Eventbrite's name, time, price and link win. Rebuilt in
  // place whenever the listing refreshes, so every page sees it at once.
  function build(live) {
    const loadDay = londonToday();
    const out = [];
    for (const f of festivals) {
      if (!f.dates) continue;
      const closed = new Set(f.closed || []);
      for (let d = f.dates.from; d <= f.dates.to; d = addDay(d)) {
        if (closed.has(d)) continue;
        const hand = handBy.get(`${f.slug}|${d}`);
        out.push(makeNight(hand || { slug: `${f.slug}-${d}`, date: d }, f));
      }
    }
    for (const e of handmade) if (!(e.festival && festivalBy.get(e.festival).dates)) out.push(makeNight(e, e.festival ? festivalBy.get(e.festival) : null));

    const usedSlugs = new Set([...out.map((n) => n.slug), ...archive.map((e) => e.slug)]);
    const uniqueSlug = (base) => { let x = base, i = 2; while (usedSlugs.has(x)) x = `${base}-${i++}`; usedSlugs.add(x); return x; };
    const festNightOn = new Map(out.filter((n) => n.festival).map((n) => [`${n.festival}|${n.date}`, n]));

    // 1. Eventbrite, the live listing
    const liveOn = new Map(); // date → names Eventbrite lists that day
    const livePast = [];
    liveCount = { upcoming: 0, past: 0 };
    for (const e of (live && live.events) || []) {
      if (!e || e.cancelled || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || !e.name) continue;
      liveOn.set(e.date, [...(liveOn.get(e.date) || []), e.name]);
      const f = claimant(e.date);
      if (e.date < loadDay) {
        if (archiveIds.has(String(e.id))) continue;
        livePast.push({ id: String(e.id), slug: uniqueSlug(`${slugify(e.name)}-${e.date}`), title: e.name, date: e.date, time: e.time || '', venue: site.defaultVenue,
          url: e.url || '', image: e.image || '', performers: [], series: null, genres: [], source: 'eventbrite', festival: f ? f.slug : null });
        liveCount.past++;
        continue;
      }
      liveCount.upcoming++;
      const host = f && festNightOn.get(`${f.slug}|${e.date}`);
      const listing = { id: String(e.id), url: e.url || '', priceText: e.priceText || '', free: Boolean(e.free), soldOut: Boolean(e.soldOut) };
      if (host) {
        if (host.handmade && sameNight(host.title, e.name)) { host.eventbrite = listing; continue; } // TAM's own headline night, also on Eventbrite
        host.programme = [...(host.programme || []), { title: e.name, time: e.time || '', url: e.url || '', eventbrite: listing, source: 'eventbrite' }];
        continue;
      }
      const n = makeNight({ slug: uniqueSlug(`${slugify(e.name)}-${e.date}`), date: e.date, title: e.name, doors: e.time || '19:00', summary: e.summary || '', url: e.url || '', image: e.image || '' }, null);
      n.ends = '';                                                     // Eventbrite listings give a start time only
      n.end = new Date(Date.parse(n.start) + 3 * 3600000).toISOString();
      n.handmade = false;
      n.festival = f ? f.slug : null;
      if (!e.image && f) n.image = f.og || n.image;
      n.source = 'eventbrite';
      n.eventbrite = listing;
      out.push(n);
    }
    const listedOn = (date, title, series) => (liveOn.get(date) || []).some((name) => sameNight(title, name, series));

    // 2. TAM's performance schedule, wherever Eventbrite doesn't already have the night.
    // Past dates join the archive; upcoming ones become nights. A festival that claims a
    // month (Christmas claims December) owns every event in it: on its ticketed nights
    // the schedule becomes the night's programme, on other dates the event is still part
    // of the festival, without tickets.
    const pastByDate = new Map();
    for (const e of [...archive, ...livePast]) pastByDate.set(e.date, [...(pastByDate.get(e.date) || []), e]);
    const scheduledPast = [];
    for (const e of schedule) {
      if (!built) check(/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && e.title, `schedule: bad entry ${JSON.stringify(e)}`);
      const f = claimant(e.date);
      if (e.date < loadDay) {
        if ((pastByDate.get(e.date) || []).some((x) => sameNight(e.title, x.title, e.series))) continue;
        scheduledPast.push({ slug: uniqueSlug(`${slugify(titleOf(e))}-${e.date}`), title: titleOf(e), date: e.date, venue: site.defaultVenue,
          performers: [], series: e.series || null, genres: [], source: 'schedule', festival: f ? f.slug : null, host: e.host || null });
        continue;
      }
      if (listedOn(e.date, e.title, e.series)) continue;            // Eventbrite has it: its version wins
      const host = f && festNightOn.get(`${f.slug}|${e.date}`);
      if (host) {
        if (host.handmade && !e.series) continue; // the headline night already says who's on
        host.programme = [...(host.programme || []), { title: titleOf(e), host: e.host || '', series: e.series || null }];
        continue;
      }
      const [doors, ends] = SERIES_TIMES[e.series] || [null, null];
      const n = makeNight({ slug: uniqueSlug(`${slugify(titleOf(e))}-${e.date}`), date: e.date, title: titleOf(e), doors: doors || '19:00', ends: ends || '23:00',
        timesTbc: !doors, summary: e.host ? `Hosted by ${e.host}.` : '' }, null);
      n.handmade = false;
      n.festival = f ? f.slug : null;
      n.source = 'schedule';
      n.series = e.series || null;
      n.image = f ? f.og || n.image : '/img/og.jpg';
      out.push(n);
    }
    // a festival night with a programme takes its name from it
    for (const n of out) {
      if (!n.programme || n.handmade) continue;
      const t = (x) => x.time || (SERIES_TIMES[x.series] || ['20:00'])[0];
      n.programme.sort((a, b) => t(a).localeCompare(t(b)));
      const names = n.programme.map((x) => x.title);
      n.label = n.label || names.join(' + ');
      n.summary = `Part of ${festivalBy.get(n.festival).name}: ${names.join(', then ')}.`;
    }
    out.sort((a, b) => a.start.localeCompare(b.start));
    nights.length = 0; nights.push(...out);
    nightBy.clear(); for (const n of nights) nightBy.set(n.slug, n);
    past.length = 0;
    past.push(...archivePast, ...livePast.map((e) => ({ ...e, ...dateParts(e.date) })), ...scheduledPast.map((e) => ({ ...e, ...dateParts(e.date) })));
    past.sort((a, b) => b.date.localeCompare(a.date));
    pastBy.clear(); for (const e of past) pastBy.set(e.slug, e);
    built = true;
  }
  let built = false;
  build(null);
  check(nightBy.size === nights.length, 'two nights share a slug');

  // ----- everything else -----
  const inviteBy = by(invites, 'id');
  for (const i of invites) {
    check(nightBy.has(i.event), `invite ${i.id}: unknown event ${i.event}`);
    check(!i.artist || artistBy.has(i.artist), `invite ${i.id}: unknown artist ${i.artist}`);
  }
  const storyBy = by(stories, 'id');
  const collectionBy = by(collections);
  for (const c of collections) check(c.size > 0 && (c.items || []).length, `collection ${c.slug}: needs a size and items`);
  for (const f of festivals) {
    if (f.song && f.song.stories) check(storyBy.has(f.song.stories), `festival ${f.slug}: unknown stories ${f.song.stories}`);
    if (f.collection) check(collectionBy.has(f.collection), `festival ${f.slug}: unknown collection ${f.collection}`);
  }
  const legacyBy = by(legacy, 'path');
  for (const p of pathways) {
    check(/^[a-z0-9-]+$/.test(p.slug || '') && p.who && p.title, `pathway ${p.slug || '?'}: needs a slug, who and title`);
    check(!p.enquiry || ENQUIRY_KINDS.includes(p.enquiry), `pathway ${p.slug}: unknown enquiry kind ${p.enquiry}`);
    check(!(p.nights && p.nights.festival) || festivalBy.has(p.nights.festival), `pathway ${p.slug}: unknown festival ${p.nights && p.nights.festival}`);
  }
  const pathwayBy = by(pathways);
  for (const p of legacy) check(p.path && p.path.startsWith('/'), `legacy page ${p.title}: needs a path`);

  if (problems.length) throw new Error(`Content problems:\n  - ${problems.join('\n  - ')}`);

  // ----- queries -----
  // Where a page's content officially lives, when that's another site (see docs/SEO.md).
  const canonicalElsewhere = new Map();
  for (const f of festivals) {
    const cn = f.canonical;
    if (!cn || !cn.host) continue;
    for (const [here, there] of Object.entries(cn.paths || {})) canonicalElsewhere.set(here, `${cn.host}${there}`);
    if (cn.invites) for (const i of invites) if ((nightBy.get(i.event) || {}).festival === f.slug) canonicalElsewhere.set(`/invite/${i.id}`, `${cn.host}/invite/${i.id}`);
  }

  const upcoming = (today = londonToday()) => nights.filter((n) => n.date >= today);
  const nightsFor = (festivalSlug) => nights.filter((n) => n.festival === festivalSlug);
  const artistNights = (slug) => ({
    upcoming: nights.filter((n) => n.artists.includes(slug) && n.date >= londonToday()),
    past: past.filter((e) => (e.performers || []).includes(slug)),
  });
  const pastFor = (pattern) => past.filter((e) => new RegExp(pattern, 'i').test(e.title));
  const pastForFestival = (f) => past.filter((e) => e.festival === f.slug || (f.pastPattern && new RegExp(f.pastPattern, 'i').test(e.title)) || (f.claims && (f.claims.months || []).includes(e.month === 'December' ? 12 : 0)));
  const festivalAt = (p) => festivals.find((f) => f.path === p) || null;
  const videosFor = (artist) => videos.filter((v) => (v.artists || []).includes(artist));

  // Nights that suit a pathway: a festival's, ones whose title matches, or all of them.
  const nightsForPathway = (p, today = londonToday()) => {
    const up = nights.filter((n) => n.date >= today);
    const f = (p && p.nights) || {};
    if (f.festival) return up.filter((n) => n.festival === f.festival);
    if (f.match) {
      const rx = new RegExp(f.match, 'i');
      return up.filter((n) => rx.test(`${n.title} ${n.label} ${n.summary}`));
    }
    return f.any ? up : [];
  };

  return {
    applyLive: (live) => build(live), liveCounts: () => liveCount,
    pathways, pathwayBy, nightsForPathway, canonicalElsewhere,
    site, venues, venueBy, artists: [...artistBy.values()].sort((a, b) => a.name.localeCompare(b.name)), artistBy,
    series, festivals, festivalBy, festivalAt, nights, nightBy, past, pastBy, legacy, legacyBy, videos,
    invites, inviteBy, stories, storyBy, polaroids, collections, collectionBy,
    upcoming, nightsFor, artistNights, pastFor, pastForFestival, videosFor, schedule,
  };
}

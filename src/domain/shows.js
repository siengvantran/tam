// Shows: what TAM's team (Vivian, the ops director, and the admins) creates
// in /shows. A show is a draft until it's published; then it's a night on
// tam.tv with TAM's own box office, and can go out to Eventbrite, Facebook
// and Google Business Profile from the same screen.
//
// Stored in db.shows:
//   { id, slug, status: draft|published|cancelled, title, presenters, date,
//     doors, ends, summary, description, image, video, artists[], lineup[{name, role, revealed}],
//     schedule[[time, what]], notes,
//     sales: { mode: tam|both|eventbrite|rsvp|none, capacity, maxPerBooking,
//              tickets[{id, name, price, blurb, limit}], eventbriteAllocation },
//     eventbrite: { id, url, status, allocation, tickets{}, sold, error, syncedAt } | null,
//     social: { facebook: {id, url, message, at, by, manual} | null, google: … },
//     series, createdAt, createdBy, updatedAt, updatedBy, history[{at, by, what}] }
//
// Ticket sales (sales.mode):
//   tam        TAM's box office on tam.tv only
//   both       TAM's box office plus an Eventbrite listing; the Eventbrite
//              allocation comes out of the same capacity, so nothing oversells
//   eventbrite on Eventbrite only: tam.tv links to the listing
//   rsvp       free guest list through TAM's box office
//   none       free entry, nothing to book

import { fail, send, readJson, text, newId } from '../lib/http.js';
import { longDate } from '../lib/content.js';

export const MODES = { tam: 'TAM box office', both: 'TAM box office + Eventbrite', eventbrite: 'Eventbrite only', rsvp: 'Free guest list (RSVP)', none: 'Free entry, no booking' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_REPEATS = 26;

const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const clip = (v, n) => text(typeof v === 'number' ? String(v) : v, n);

export function showsDomain(ctx, { tickets, eventbrite, social, writer }) {
  const { db, save, content: c } = ctx;
  if (!Array.isArray(db.shows)) db.shows = [];
  const apply = () => c.applyShows(db.shows);
  apply();

  const find = (id) => { const s = db.shows.find((x) => x.id === id); if (!s) throw fail(404, 'That show isn’t here any more.'); return s; };
  const log = (s, who, what) => { s.history = [{ at: new Date(ctx.now()).toISOString(), by: who.name, what }, ...(s.history || [])].slice(0, 60); s.updatedAt = s.history[0].at; s.updatedBy = who.name; };

  // A slug no other night or show uses.
  function slugFor(s) {
    const base = `${c.slugify(s.title || 'tam-show') || 'tam-show'}-${s.date}`;
    const taken = (x) => db.shows.some((o) => o.id !== s.id && o.slug === x) || (c.nightBy.has(x) && c.nightBy.get(x).showId !== s.id) || c.pastBy.has(x);
    let slug = base, i = 2;
    while (taken(slug)) slug = `${base}-${i++}`;
    return slug;
  }

  // Cleans what the editor sends. Unknowns stay empty; nothing is invented.
  function clean(b, prev = {}) {
    const s = { ...prev };
    if ('title' in b) s.title = clip(b.title, 120);
    if ('presenters' in b) s.presenters = clip(b.presenters, 160);
    if ('date' in b) { if (!DATE.test(b.date || '')) throw fail(400, 'Pick a date.'); s.date = b.date; }
    for (const k of ['doors', 'ends']) if (k in b) {
      const v = String(b[k] || '');
      if (v && !TIME.test(v)) throw fail(400, `Type the ${k === 'doors' ? 'start' : 'end'} time like 19:30.`);
      s[k] = v;
    }
    if ('summary' in b) s.summary = clip(b.summary, 300);
    if ('description' in b) s.description = clip(b.description, 6000);
    if ('notes' in b) s.notes = clip(b.notes, 2000);
    if ('video' in b) { const v = clip(b.video, 200); s.video = (/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(v) || [])[1] || (/^[\w-]{11}$/.test(v) ? v : ''); }
    if ('image' in b && typeof b.image === 'string' && (b.image === '' || /^\/(uploads|img)\/[\w./-]+$/.test(b.image))) s.image = b.image;
    if ('artists' in b) s.artists = (Array.isArray(b.artists) ? b.artists : []).map(String).filter((a) => c.artistBy.has(a)).slice(0, 30);
    if ('lineup' in b) s.lineup = (Array.isArray(b.lineup) ? b.lineup : []).slice(0, 40).map((x) => ({ name: clip(x && x.name, 80), role: clip(x && x.role, 80), revealed: !(x && x.revealed === false) })).filter((x) => x.name);
    if ('schedule' in b) s.schedule = (Array.isArray(b.schedule) ? b.schedule : []).slice(0, 30).map((r) => [clip(r && r[0], 5), clip(r && r[1], 140)]).filter((r) => r[1]);
    if ('sales' in b) {
      const x = b.sales || {};
      const mode = MODES[x.mode] ? x.mode : 'tam';
      const capacity = Math.max(0, Math.min(2000, parseInt(x.capacity, 10) || 0));
      const ticketsIn = (Array.isArray(x.tickets) ? x.tickets : []).slice(0, 12).map((t, i) => {
        const donation = Boolean(t && t.donation); // pay what you like: sold on Eventbrite, which takes the payment
        const price = donation ? 0 : Math.round(Number(String(t && t.price).replace(/[£,\s]/g, '')) * 100);
        return { id: clip(t && t.id, 24).replace(/[^\w-]/g, '') || `t${i + 1}`, name: clip(t && t.name, 60), price: Number.isFinite(price) && price >= 0 ? price : NaN, blurb: clip(t && t.blurb, 300), limit: parseInt(t && t.limit, 10) || null, ...(donation ? { donation: true } : {}) };
      }).filter((t) => t.name);
      for (const t of ticketsIn) if (!Number.isInteger(t.price)) throw fail(400, `Give “${t.name}” a price, like 12 or 12.50 (0 for free).`);
      const ids = new Set(); for (const t of ticketsIn) { while (ids.has(t.id)) t.id += 'x'; ids.add(t.id); }
      s.sales = { mode, capacity, maxPerBooking: Math.max(1, Math.min(50, parseInt(x.maxPerBooking, 10) || 10)), tickets: ticketsIn, eventbriteAllocation: Math.max(0, parseInt(x.eventbriteAllocation, 10) || 0) };
    }
    return s;
  }

  // Everything that must be true before a show goes public.
  function problems(s) {
    const p = [];
    if (!s.title) p.push('a title');
    if (!s.date) p.push('a date');
    if (!s.doors) p.push('a start time');
    if (!s.summary) p.push('a short summary');
    const sl = s.sales || {};
    if (['tam', 'both'].includes(sl.mode)) {
      if (!sl.tickets || !sl.tickets.length) p.push('at least one ticket type');
      if (!sl.capacity) p.push('a capacity');
    }
    if (sl.mode === 'rsvp' && !sl.capacity) p.push('a capacity for the guest list');
    if (sl.mode === 'both' && sl.eventbriteAllocation >= sl.capacity) p.push('an Eventbrite allocation smaller than the capacity');
    return p;
  }

  // Sold and remaining on TAM's box office.
  function salesOf(s) {
    const n = c.nightBy.get(s.slug);
    const a = n && n.showId === s.id && n.sale ? tickets.nightAvailability(n) : null;
    const sold = db.bookings.filter((b) => b.night === s.slug && ['paid', 'reserved', 'awaiting_payment'].includes(b.status));
    return {
      boxOffice: Boolean(a), left: a ? a.left : null,
      sold: sold.reduce((t, b) => t + b.qty, 0), paid: sold.filter((b) => b.status === 'paid').reduce((t, b) => t + b.total, 0),
      eventbriteSold: (s.eventbrite && s.eventbrite.sold) || 0,
    };
  }

  const view = (s) => ({
    ...s, history: (s.history || []).slice(0, 15), problems: problems(s), sales: s.sales || { mode: 'tam', capacity: 0, tickets: [], maxPerBooking: 10, eventbriteAllocation: 0 },
    when: s.date ? longDate(s.date) : '', page: s.status === 'published' ? `/events/${s.slug}` : null, stats: salesOf(s),
    drafts: social ? social.drafts(s, ctx.cfg.siteUrl) : null,
  });

  // The month on the calendar: every night on the site, plus drafts.
  function month(ym) {
    if (!/^\d{4}-\d{2}$/.test(ym)) throw fail(400, 'Ask for a month like 2026-11.');
    const inMonth = (d) => d.startsWith(ym);
    const entries = [];
    for (const n of c.nights.filter((x) => inMonth(x.date))) {
      entries.push({ date: n.date, title: n.label && n.label !== n.title ? `${n.title}: ${n.label}` : n.title, time: n.timesTbc ? '' : n.doors,
        source: n.source === 'show' ? 'show' : n.festival && !n.source ? 'festival' : n.source || 'tam', status: 'published',
        showId: n.showId || null, slug: n.slug, festival: n.festival, onEventbrite: Boolean(n.eventbrite || n.url) });
    }
    for (const s of db.shows.filter((x) => x.status !== 'published' && x.date && inMonth(x.date))) {
      entries.push({ date: s.date, title: s.title || 'Untitled show', time: s.doors || '', source: 'show', status: s.status, showId: s.id, slug: s.slug });
    }
    entries.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return { month: ym, today: ctx.today(), entries };
  }

  // A night already on the site (Eventbrite or the schedule) brought into /shows to manage here.
  function fromNight(slug, who) {
    const n = c.nightBy.get(slug);
    if (!n) throw fail(404, 'That night isn’t on the site.');
    if (n.showId) return find(n.showId);
    const s = {
      id: newId('SHW'), status: 'draft', title: n.title, presenters: n.presenters || '', date: n.date, doors: n.timesTbc ? '' : n.doors, ends: n.ends || '',
      summary: n.summary || '', description: '', image: n.image && !/og\.jpg$/.test(n.image) ? n.image : '', video: '', artists: n.artists || [], lineup: [], schedule: n.schedule || [],
      sales: n.eventbrite ? { mode: 'eventbrite', capacity: 0, maxPerBooking: 10, tickets: (n.eventbrite.tickets || []).filter((t) => t.kind !== 'donation').map((t, i) => ({ id: `t${i + 1}`, name: t.name, price: t.price || 0, blurb: t.about || '', limit: null })), eventbriteAllocation: 0 }
        : { mode: 'tam', capacity: 0, maxPerBooking: 10, tickets: [], eventbriteAllocation: 0 },
      eventbrite: n.eventbrite && n.eventbrite.id ? { id: n.eventbrite.id, url: n.eventbrite.url, status: 'live', allocation: 0, tickets: {}, sold: 0, linked: true } : null,
      social: {}, createdAt: new Date(ctx.now()).toISOString(), createdBy: who.name,
    };
    s.slug = slugFor(s);
    log(s, who, n.eventbrite ? 'Brought in from its Eventbrite listing' : 'Brought in from the schedule');
    db.shows.push(s);
    return s;
  }

  function copies(s, dates, who) {
    const made = [];
    for (const d of dates) {
      const x = { ...structuredClone(s), id: newId('SHW'), status: 'draft', date: d, eventbrite: null, social: {}, history: [], createdAt: new Date(ctx.now()).toISOString(), createdBy: who.name, series: s.series || s.id };
      x.slug = slugFor(x);
      log(x, who, `Copied from ${s.title || 'a show'} on ${longDate(s.date)}`);
      db.shows.push(x);
      made.push(x);
    }
    s.series = s.series || s.id;
    return made;
  }

  function routes(r) {
    const guard = (req) => ctx.team.guard(req, 'ops');

    r.get('/api/shows/month', (req, res, { url }) => { guard(req); send(res, 200, month(url.searchParams.get('m') || ctx.today().slice(0, 7))); });
    r.get('/api/shows/setup', (req, res) => {
      const me = guard(req);
      send(res, 200, {
        me, modes: MODES, today: ctx.today(),
        artists: c.artists.map((a) => ({ slug: a.slug, name: a.name })),
        connections: { eventbrite: eventbrite.enabled(), facebook: social.enabled().facebook, google: social.enabled().google, writer: writer.enabled() },
        upcoming: db.shows.filter((s) => s.date >= ctx.today() && s.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12).map((s) => ({ id: s.id, title: s.title, date: s.date, status: s.status })),
      });
    });
    r.get('/api/shows/:id', (req, res, { params }) => { guard(req); send(res, 200, view(find(params.id))); });

    r.post('/api/shows', async (req, res) => {
      const who = guard(req);
      const b = await readJson(req, 64 * 1024);
      if (b.fromNight) { const s = fromNight(String(b.fromNight), who); await save(); apply(); return send(res, 201, view(s)); }
      const s = clean({ sales: { mode: 'tam', capacity: 120, tickets: [{ id: 'ga', name: 'General admission', price: '10' }] }, ...b });
      Object.assign(s, { id: newId('SHW'), status: 'draft', social: {}, eventbrite: null, createdAt: new Date(ctx.now()).toISOString(), createdBy: who.name });
      if (!s.date) throw fail(400, 'Pick a date.');
      s.title = s.title || '';
      s.slug = slugFor(s);
      log(s, who, 'Created');
      db.shows.push(s);
      await save();
      send(res, 201, view(s));
    });

    r.post('/api/shows/:id', async (req, res, { params }) => {
      const who = guard(req);
      const s = find(params.id);
      const b = await readJson(req, 64 * 1024);
      const next = clean(b, s);
      if (next.sales && s.eventbrite && !s.eventbrite.linked && next.sales.mode === 'tam') throw fail(400, 'This show is on Eventbrite: cancel the listing there first, or keep Eventbrite in the ticket setting.');
      const titleOrDate = next.title !== s.title || next.date !== s.date;
      Object.assign(s, next);
      if (titleOrDate && s.status === 'draft') s.slug = slugFor(s); // a published page keeps its address
      log(s, who, 'Saved changes');
      await save();
      apply();
      send(res, 200, view(s));
    });

    r.post('/api/shows/:id/image', async (req, res, { params }) => {
      const who = guard(req);
      const s = find(params.id);
      const b = await readJson(req, 1600 * 1024);
      s.image = await ctx.saveImage(b.image, `show-${s.id}-${Date.now().toString(36)}`, { maxKB: 1200, what: 'The image' });
      log(s, who, 'New image');
      await save();
      apply();
      send(res, 200, view(s));
    });

    r.post('/api/shows/:id/status', async (req, res, { params }) => {
      const who = guard(req);
      const s = find(params.id);
      const b = await readJson(req, 1024);
      const to = String(b.status || '');
      if (!['draft', 'published', 'cancelled'].includes(to)) throw fail(400, 'Publish, unpublish or cancel.');
      if (to === 'published') {
        const p = problems(s);
        if (p.length) throw fail(400, `Before it goes live, add ${p.join(', ')}.`);
      }
      if (to !== 'published' && s.status === 'published' && salesOf(s).sold) {
        if (!b.confirm) throw fail(409, `${salesOf(s).sold} tickets are already booked on tam.tv. Confirm to ${to === 'cancelled' ? 'cancel' : 'unpublish'} anyway.`, { needsConfirm: true });
      }
      s.status = to;
      log(s, who, { published: 'Published on tam.tv', draft: 'Unpublished (back to draft)', cancelled: 'Cancelled' }[to]);
      await save();
      apply();
      send(res, 200, view(s));
    });

    r.post('/api/shows/:id/copy', async (req, res, { params }) => {
      const who = guard(req);
      const s = find(params.id);
      const b = await readJson(req, 4096);
      let dates = (Array.isArray(b.dates) ? b.dates : []).filter((d) => DATE.test(d));
      const weeks = Math.max(0, Math.min(MAX_REPEATS, parseInt(b.weekly, 10) || 0));
      if (weeks) dates = Array.from({ length: weeks }, (_, i) => addDays(s.date, 7 * (i + 1)));
      if (!dates.length) throw fail(400, 'Pick a date to copy it to, or a number of weeks.');
      const made = copies(s, dates.slice(0, MAX_REPEATS), who);
      await save();
      send(res, 201, { made: made.map((x) => ({ id: x.id, date: x.date })) });
    });

    r.post('/api/shows/:id/delete', async (req, res, { params }) => {
      const who = guard(req);
      const s = find(params.id);
      if (s.status === 'published') throw fail(400, 'Unpublish or cancel it first.');
      if (s.eventbrite && !s.eventbrite.linked && !['canceled', 'deleted'].includes(s.eventbrite.status)) throw fail(400, 'It has an Eventbrite listing: cancel that first.');
      db.shows = db.shows.filter((x) => x.id !== s.id);
      console.log(`Show ${s.id} (${s.title}) deleted by ${who.name}`);
      await save();
      apply();
      send(res, 200, { ok: true });
    });

    // ----- Eventbrite -----
    r.get('/api/shows/connections/eventbrite', async (req, res) => { guard(req); send(res, 200, await eventbrite.account()); });
    r.post('/api/shows/:id/eventbrite/:action', async (req, res, { params }) => {
      const who = guard(req);
      const s = find(params.id);
      const b = await readJson(req, 2048);
      const act = params.action;
      if (!['create', 'update', 'publish', 'refresh', 'cancel'].includes(act)) throw fail(404, 'Not found.');
      const sl = s.sales || {};
      if (act === 'create' && !['both', 'eventbrite', 'rsvp'].includes(sl.mode)) throw fail(400, 'Set tickets to “TAM box office + Eventbrite” or “Eventbrite only” first.');
      if (b.allocation !== undefined) sl.eventbriteAllocation = Math.max(0, parseInt(b.allocation, 10) || 0);
      try {
        await eventbrite[act](s, { base: ctx.cfg.siteUrl, soldHere: salesOf(s).sold });
        log(s, who, { create: 'Listed on Eventbrite (draft)', update: 'Updated the Eventbrite listing', publish: 'Published on Eventbrite', refresh: 'Synced from Eventbrite', cancel: 'Cancelled on Eventbrite' }[act]);
      } finally {
        await save(); // whatever Eventbrite made is kept, even when a later step failed
        apply();
      }
      send(res, 200, view(s));
    });

    // ----- Facebook and Google -----
    r.post('/api/shows/:id/post/:network', async (req, res, { params }) => {
      const who = guard(req);
      const s = find(params.id);
      const net = params.network;
      if (!['facebook', 'google'].includes(net)) throw fail(404, 'Not found.');
      if (s.status !== 'published') throw fail(400, 'Publish the show on tam.tv first, so the post has a page to link to.');
      const b = await readJson(req, 8192);
      s.social = s.social || {};
      if (b.manual) {
        s.social[net] = { url: clip(b.url, 300), manual: true, at: new Date(ctx.now()).toISOString(), by: who.name };
        log(s, who, `Marked as posted on ${net === 'google' ? 'Google' : 'Facebook'}`);
      } else {
        const message = clip(b.text, 1500);
        if (!message) throw fail(400, 'Write the post first.');
        const r2 = net === 'facebook' ? await social.postFacebook(s, message, ctx.cfg.siteUrl) : await social.postGoogle(s, message, ctx.cfg.siteUrl);
        s.social[net] = { ...r2, message, at: new Date(ctx.now()).toISOString(), by: who.name };
        log(s, who, `Posted on ${net === 'google' ? 'Google Business Profile' : 'Facebook'}`);
      }
      await save();
      send(res, 200, view(s));
    });

    // ----- Writing help (Claude) -----
    r.post('/api/shows/:id/write', async (req, res, { params }) => {
      guard(req);
      const s = find(params.id);
      const b = await readJson(req, 8192);
      send(res, 200, await writer.write(s, { notes: clip(b.notes, 2000), want: Array.isArray(b.want) ? b.want : ['summary', 'description', 'facebook', 'google'] }));
    });
  }

  return { routes, month, problems, apply, MODES };
}

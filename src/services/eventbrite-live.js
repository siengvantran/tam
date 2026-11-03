// TAM's live Eventbrite listing: the superior source for nights.
//
// Reads the same public organiser-profile endpoints the organiser page uses
// (https://www.eventbrite.co.uk/o/33409225909), at startup and every 30 minutes:
// every upcoming listing and the most recent past ones. The content loader
// merges them over TAM's schedule (content.applyLive). The last good copy is
// cached in DATA_DIR, so the site keeps its listings if Eventbrite is down.
//
// EVENTBRITE_SYNC=off turns it off; EVENTBRITE_ORGANIZER and EVENTBRITE_BASE
// override the organiser and host (tests use a mock).

import fs from 'node:fs/promises';
import path from 'node:path';
import { londonToday } from '../lib/content.js';

const EVERY = 30 * 60 * 1000;

// Each night's tickets, modelled from its Eventbrite ticket types
// (/api/v3/events/:id/ticket_classes/for_sale/, the list the Eventbrite checkout shows).
// The organiser feed's "minimum price" is not to be trusted: for TAM's karaoke, with a
// free General Ticket, it says £16.96 (the £15 TAM Ally ticket plus its fee).

const money = (p) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;
const pence = (m) => (m && Number.isFinite(Number(m.value)) ? Number(m.value) : null);

// A ticket's description, cut to a sentence or two.
function shortText(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= 200) return s;
  const cut = s.slice(0, 200);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

const KIND_ORDER = { free: 0, paid: 1, donation: 2 };

// One Eventbrite ticket type → { id, name, kind: free|paid|donation, price, fee (pence), status, salesEnd, max, about }
export function ticketClass(t) {
  const kind = t.donation || t.category === 'donation' ? 'donation' : t.free ? 'free' : 'paid';
  return {
    id: String(t.id || ''), name: String(t.display_name || t.name || 'Ticket').trim(), kind,
    price: kind === 'paid' ? pence(t.cost) || 0 : 0,
    fee: kind === 'paid' && !t.include_fee ? pence(t.fee) || 0 : 0,
    status: t.on_sale_status || 'AVAILABLE', salesEnd: t.sales_end || null,
    max: t.maximum_quantity_per_order || t.maximum_quantity || null, about: shortText(t.description),
  };
}

export const sortTickets = (list) => list.slice().sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.price - b.price);

// What the night costs, from its ticket types: free if a free ticket is on sale,
// otherwise the cheapest paid one, or pay-what-you-like.
export function summarise(tickets, feed = {}) {
  if (!tickets || !tickets.length) {
    return { free: Boolean(feed.is_free), soldOut: Boolean(feed.is_sold_out), from: null, priceText: feed.is_sold_out ? 'Sold out' : feed.is_free ? 'Free' : '' };
  }
  const open = tickets.filter((t) => t.status === 'AVAILABLE');
  if (!open.length) {
    const soon = tickets.some((t) => t.status === 'NOT_YET_ON_SALE');
    return { free: false, soldOut: !soon, from: null, priceText: soon ? 'On sale soon' : 'Sold out' };
  }
  const free = open.some((t) => t.kind === 'free');
  const paid = open.filter((t) => t.kind === 'paid').map((t) => t.price);
  const from = paid.length ? Math.min(...paid) : null;
  return { free, soldOut: false, from, priceText: free ? 'Free' : from !== null ? money(from) : 'Pay what you like' };
}

export function normalise(e, tickets = null) {
  const t = e.ticket_availability || {};
  const list = tickets ? sortTickets(tickets) : [];
  return {
    id: String(e.id || e.eid || ''), name: String(e.name || '').trim(), date: e.start_date, time: String(e.start_time || '').slice(0, 5),
    url: e.url || '', image: (e.image && e.image.url) || '', summary: String(e.summary || '').trim().slice(0, 400),
    cancelled: Boolean(e.is_cancelled), venue: (e.primary_venue && e.primary_venue.name) || '',
    tickets: list, ...summarise(list, t),
  };
}

export function eventbriteLive({ content, dataDir, organizer = '33409225909', base = 'https://www.eventbrite.co.uk', enabled = true, fetchImpl = fetch } = {}) {
  const cacheFile = path.join(dataDir, 'eventbrite-live.json');
  const status = { enabled, source: 'none', fetchedAt: null, upcoming: 0, past: 0, error: null, organizer };
  let timer = null;

  const host = base.replace(/\/$/, '');
  async function getJson(p) {
    const res = await fetchImpl(p.startsWith('/') ? host + p : `${host}/organizer-profile/api/organizers/${organizer}/${p}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; TAM.TV listings)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Eventbrite ${res.status} for ${p.split('?')[0]}`);
    return res.json();
  }

  // Every ticket type on sale for one event (Eventbrite's public checkout list).
  async function ticketsFor(id) {
    const all = [];
    let cont = '';
    for (let i = 0; i < 4; i++) {
      const j = await getJson(`/api/v3/events/${encodeURIComponent(id)}/ticket_classes/for_sale/${cont ? `?continuation=${encodeURIComponent(cont)}` : ''}`);
      all.push(...(j.ticket_classes || []).map(ticketClass));
      cont = j.pagination && j.pagination.has_more_items && j.pagination.continuation;
      if (!cont) break;
    }
    return all;
  }

  // Tickets for every upcoming listing, four at a time. If one fails, keep what we last knew.
  async function withTickets(list, previous) {
    const out = new Array(list.length);
    let next = 0, failed = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++, e = list[i];
        let t = null;
        if (!e.is_cancelled) {
          try { t = await ticketsFor(e.id); } catch { failed++; t = (previous.get(String(e.id)) || {}).tickets || null; }
        }
        out[i] = normalise(e, t);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { events: out, failed };
  }

  let last = null; // the last listing applied, for ticket fallbacks

  async function pages(p, max) {
    const all = [];
    for (let n = 1; n <= max; n++) {
      const j = await getJson(`${p}page=${n}&pageSize=50`);
      const list = Array.isArray(j.events) ? j.events : [];
      all.push(...list);
      if (!j.hasMore || !list.length) break;
    }
    return all;
  }

  function apply(data, source) {
    content.applyLive(data);
    const counts = content.liveCounts();
    Object.assign(status, { source, fetchedAt: data.fetchedAt, upcoming: counts.upcoming, past: counts.past });
  }

  async function load() {
    try {
      const data = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
      if (Array.isArray(data.events)) { apply(data, 'cache'); last = data; }
    } catch { /* no cache yet */ }
  }

  // One refresh at a time: a second caller waits for the one already running.
  let running = null;
  const refresh = () => (running ||= doRefresh().finally(() => { running = null; }));

  async function doRefresh() {
    try {
      const upcoming = await pages(`events-from-date/?from_date=${londonToday()}&`, 10);
      const recent = await pages('past-events/?', 2);
      const previous = new Map(((last && last.events) || []).map((e) => [e.id, e]));
      const priced = await withTickets(upcoming, previous);
      const events = [...priced.events, ...recent.map((e) => normalise(e))].filter((e) => e.id && e.name && e.date);
      const data = { fetchedAt: new Date().toISOString(), organizer, events };
      apply(data, 'live');
      last = data;
      status.error = priced.failed ? `Ticket types failed for ${priced.failed} listing${priced.failed === 1 ? '' : 's'}` : null;
      await fs.writeFile(`${cacheFile}.tmp`, JSON.stringify(data));
      await fs.rename(`${cacheFile}.tmp`, cacheFile);
    } catch (e) {
      status.error = e.message;
      console.warn(`Eventbrite listings: ${e.message} (keeping ${status.source === 'none' ? 'the schedule' : 'the last good copy'})`);
    }
  }

  // Loads the cached copy at once, then refreshes in the background: startup never waits on Eventbrite.
  async function start() {
    await load();
    if (!enabled) return;
    refresh();
    timer = setInterval(refresh, EVERY);
    timer.unref();
  }

  return { start, refresh, load, status, stop: () => clearInterval(timer) };
}

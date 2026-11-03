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

// Eventbrite's display price is "16.96 GBP" (its value fields can be 0).
export function priceText(t) {
  if (!t) return '';
  if (t.is_free) return 'Free';
  const m = /([\d.,]+)\s*([A-Z]{3})/.exec((t.minimum_ticket_price && t.minimum_ticket_price.display) || '');
  if (!m) return '';
  const n = Number(m[1].replace(/,/g, ''));
  if (!n) return 'Free';
  const sym = { GBP: '£', EUR: '€', USD: '$' }[m[2]] || `${m[2]} `;
  return `${sym}${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function normalise(e) {
  const t = e.ticket_availability || {};
  return {
    id: String(e.id || e.eid || ''), name: String(e.name || '').trim(), date: e.start_date, time: String(e.start_time || '').slice(0, 5),
    url: e.url || '', image: (e.image && e.image.url) || '', summary: String(e.summary || '').trim().slice(0, 400),
    cancelled: Boolean(e.is_cancelled), soldOut: Boolean(t.is_sold_out), free: Boolean(t.is_free), priceText: priceText(t),
    venue: (e.primary_venue && e.primary_venue.name) || '',
  };
}

export function eventbriteLive({ content, dataDir, organizer = '33409225909', base = 'https://www.eventbrite.co.uk', enabled = true, fetchImpl = fetch } = {}) {
  const cacheFile = path.join(dataDir, 'eventbrite-live.json');
  const status = { enabled, source: 'none', fetchedAt: null, upcoming: 0, past: 0, error: null, organizer };
  let timer = null;

  async function getJson(p) {
    const res = await fetchImpl(`${base.replace(/\/$/, '')}/organizer-profile/api/organizers/${organizer}/${p}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; TAM.TV listings)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Eventbrite ${res.status} for ${p.split('?')[0]}`);
    return res.json();
  }

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
      if (Array.isArray(data.events)) apply(data, 'cache');
    } catch { /* no cache yet */ }
  }

  // One refresh at a time: a second caller waits for the one already running.
  let running = null;
  const refresh = () => (running ||= doRefresh().finally(() => { running = null; }));

  async function doRefresh() {
    try {
      const upcoming = await pages(`events-from-date/?from_date=${londonToday()}&`, 10);
      const recent = await pages('past-events/?', 2);
      const events = [...upcoming, ...recent].map(normalise).filter((e) => e.id && e.name && e.date);
      const data = { fetchedAt: new Date().toISOString(), organizer, events };
      apply(data, 'live');
      status.error = null;
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

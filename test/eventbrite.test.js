import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { ticketClass, summarise, normalise } from '../src/services/eventbrite-live.js';
import { londonToday } from '../src/lib/content.js';

const schedule = JSON.parse(fs.readFileSync(new URL('../content/schedule.json', import.meta.url)));
const today = londonToday();
// A Sunday singers' night still ahead in the schedule: Eventbrite will list it under another name.
const singers = schedule.find((e) => e.series === 'singers-sunday-spot' && e.date > today && !e.date.startsWith(`${e.date.slice(0, 4)}-12`));
const later = (days) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
const year = Number(today.slice(0, 4)) + (today.slice(5, 7) === '12' ? 1 : 0);
const decemberDay = `${today.slice(5, 7) === '12' ? year : today.slice(0, 4)}-12-02`; // a festival date with no ticketed night

const listing = (id, name, date, time, t = {}) => ({ id, name, url: `https://www.eventbrite.co.uk/e/${id}`, start_date: date, start_time: time, end_time: time,
  is_cancelled: false, summary: `${name} at TAM`, image: { url: `https://img.evbuc.com/${id}.jpg` },
  ticket_availability: { is_sold_out: false, is_free: false, minimum_ticket_price: { display: '16.96 GBP', value: 0 }, ...t } });

// Ticket types as Eventbrite's checkout returns them (shapes from TAM's real listings).
const free = (name, extra = {}) => ({ id: `${name}-f`, display_name: name, free: true, donation: false, category: 'admission', on_sale_status: 'AVAILABLE', description: ' This ticket is valid for entry before 8 PM. If you arrive later, a small entry fee will apply.', ...extra });
const paid = (name, p, fee, extra = {}) => ({ id: `${name}-${p}`, display_name: name, free: false, donation: false, category: 'admission', on_sale_status: 'AVAILABLE',
  cost: { display: `£${p / 100}`, value: p, currency: 'GBP' }, fee: { value: fee, currency: 'GBP' }, include_fee: false, sales_end: '2099-01-01T20:30:00Z', ...extra });
const gift = (name) => ({ id: `${name}-d`, display_name: name, free: false, donation: true, category: 'donation', on_sale_status: 'AVAILABLE' });
const TICKETS = {
  1001: [free('General Admission'), paid('Cover the Night', 500, 113), paid('Support the Venue', 800, 138)],
  1002: [paid('TAM Ally - Support Your Grassroots Venue', 1500, 196), free('General Ticket'), paid('Feeling Generous - Keep Grassroots Music Alive', 800, 138)],
  1003: [paid('General Admission + Soft Drink', 400, 104, { on_sale_status: 'UNAVAILABLE' }), free('General Admission', { on_sale_status: 'UNAVAILABLE' })],
  1005: [free('General Admission'), gift('Supporter Ticket')],
  1006: [gift('Supporter Ticket'), paid('General Admission + 1 Soft Drink', 400, 104), paid('General Admission + 1 Wine / Prosecco', 750, 133)],
};

async function mockEventbrite() {
  const state = { down: false, hits: [] };
  const upcoming = [
    listing('1001', 'The Original Singers Club', singers.date, '19:30'),
    listing('1002', 'TAM Karaoke Night', later(4), '19:30', { minimum_ticket_price: { display: '16.96 GBP' } }),
    listing('1003', 'Word of Mouth Fusion Jazz night', later(5), '20:30', { is_sold_out: true }),
    { ...listing('1004', 'A Cancelled Thing', later(6), '20:00'), is_cancelled: true },
    listing('1005', 'New Developments: Blues Jam & Open Mic Night', later(7), '19:00', { is_free: true }),
    listing('1006', 'Christmas Karaoke Special', decemberDay, '19:30'),
  ];
  const server = http.createServer((req, res) => {
    state.hits.push(req.url);
    if (state.down) { res.writeHead(503); return res.end(); }
    const u = new URL(req.url, 'http://x');
    const tc = /^\/api\/v3\/events\/(\d+)\/ticket_classes\/for_sale\/$/.exec(u.pathname);
    if (tc) {
      if (state.ticketsDown) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ pagination: { has_more_items: false }, ticket_classes: TICKETS[tc[1]] || [] }));
    }
    assert.match(u.pathname, /^\/organizer-profile\/api\/organizers\/42\/(events-from-date|past-events)\/$/);
    const events = u.pathname.includes('past') ? [listing('900', 'Last Week’s Blues Jam', later(-7), '16:00')] : upcoming;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ events: u.searchParams.get('page') === '1' ? events : [], hasMore: false }));
  });
  await new Promise((r) => server.listen(0, r));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close(); } };
}

async function start(dir, eb) {
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: 'admin-token-for-tests', SITE_URL: 'http://tam.test', EVENTBRITE_BASE: eb.url, EVENTBRITE_ORGANIZER: '42' } });
  app.live.stop();
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { app, get: (p, o) => fetch(base + p, o), close: () => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }) };
}

test('Each Eventbrite ticket type is modelled, and the night priced from them', () => {
  const k = TICKETS[1002].map(ticketClass);
  assert.deepEqual(k.map((t) => [t.kind, t.price, t.fee]), [['paid', 1500, 196], ['free', 0, 0], ['paid', 800, 138]]);
  assert.match(k[1].about, /before 8 PM/);
  // karaoke: free General Ticket, whatever the feed's "minimum price" says
  const night = normalise(listing('1002', 'TAM Karaoke Night', '2026-11-04', '19:30:00'), k);
  assert.deepEqual([night.free, night.from, night.priceText, night.soldOut], [true, 800, 'Free', false]);
  assert.deepEqual(night.tickets.map((t) => t.name), ['General Ticket', 'Feeling Generous - Keep Grassroots Music Alive', 'TAM Ally - Support Your Grassroots Venue']);
  assert.equal(night.time, '19:30');
  assert.deepEqual(summarise(TICKETS[1006].map(ticketClass)), { free: false, soldOut: false, from: 400, priceText: '£4' });
  assert.deepEqual(summarise(TICKETS[1003].map(ticketClass)).soldOut, true);
  assert.equal(summarise([gift('x')].map(ticketClass)).priceText, 'Pay what you like');
  assert.equal(summarise([ticketClass({ ...paid('Early', 500, 0), on_sale_status: 'NOT_YET_ON_SALE' })]).priceText, 'On sale soon');
  assert.equal(ticketClass({ ...paid('Cover the Evening', 500, 99), include_fee: true }).fee, 0);
});

test('The live Eventbrite listing outranks the schedule, and survives Eventbrite going down', async (t) => {
  const eb = await mockEventbrite();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-eb-'));
  const s = await start(dir, eb);
  t.after(() => { s.close(); eb.close(); });
  await s.app.live.refresh();
  const c = s.app.ctx.content;
  assert.equal(s.app.live.status.source, 'live');
  assert.equal(s.app.live.status.upcoming, 5); // the cancelled one is skipped

  // Eventbrite's version replaces the schedule's version of the same night
  const onSingers = c.nights.filter((n) => n.date === singers.date);
  assert.ok(onSingers.some((n) => n.title === 'The Original Singers Club' && n.source === 'eventbrite' && n.eventbrite.free && n.eventbrite.tickets.length === 3));
  assert.ok(!onSingers.some((n) => n.title === singers.title));
  assert.ok(!c.nights.some((n) => n.title === 'A Cancelled Thing'));
  // December belongs to the festival
  const dec = c.nights.filter((n) => n.date === decemberDay);
  assert.ok(dec.length);
  const inFest = dec.some((n) => (n.title === 'Christmas Karaoke Special' && n.festival === 'best-christmas-ever')
    || (n.programme || []).some((x) => x.title === 'Christmas Karaoke Special'));
  assert.ok(inFest);
  // a past listing joins the archive
  assert.ok(c.past.some((e) => e.title === 'Last Week’s Blues Jam'));

  const page = await (await s.get('/whats-on')).text();
  assert.match(page, /The Original Singers Club/);
  assert.doesNotMatch(page, /16\.96/);
  assert.match(page, /Free entry/);
  assert.match(page, /Sold out/);
  assert.match(page, /Starts 19:30/);
  const karaoke = c.nights.find((n) => n.title === 'TAM Karaoke Night');
  const ev = await (await s.get(`/events/${karaoke.slug}`)).text();
  assert.match(ev, /https:\/\/www\.eventbrite\.co\.uk\/e\/1002/);
  assert.doesNotMatch(ev, /16\.96/);
  assert.match(ev, /id="tickets"/);
  assert.match(ev, /General Ticket[\s\S]*Feeling Generous[\s\S]*TAM Ally/);
  assert.match(ev, /£15<\/b><span class="small muted">\+ £1\.96 fee/);
  assert.match(ev, /Free entry · reserve on Eventbrite/);
  assert.match(ev, /"name":"General Ticket","url":"https:\/\/www\.eventbrite\.co\.uk\/e\/1002","price":"0\.00"/);
  const jam = c.nights.find((n) => n.title === 'Christmas Karaoke Special' || (n.programme || []).some((x) => x.title === 'Christmas Karaoke Special'));
  assert.ok(jam);
  const wom = c.nights.find((n) => n.title === 'Word of Mouth Fusion Jazz night');
  assert.match(await (await s.get(`/events/${wom.slug}`)).text(), /Sold out · join the waitlist/);
  const admin = await (await s.get('/api/admin/overview', { headers: { 'x-staff-token': 'admin-token-for-tests' } })).json();
  assert.equal(admin.eventbrite.upcoming, 5);

  // If ticket types can't be fetched, the last known ones stay
  eb.state.ticketsDown = true;
  await s.app.live.refresh();
  assert.match(s.app.live.status.error, /Ticket types failed for 5 listings/);
  assert.equal(c.nights.find((n) => n.title === 'TAM Karaoke Night').eventbrite.tickets.length, 3);
  eb.state.ticketsDown = false;

  // Eventbrite is down at the next start: the saved copy keeps the listings
  eb.state.down = true;
  const s2 = await start(dir, eb);
  t.after(() => s2.close());
  await s2.app.live.refresh();
  assert.equal(s2.app.live.status.source, 'cache');
  assert.match(s2.app.live.status.error, /503/);
  assert.ok(s2.app.ctx.content.nights.some((n) => n.title === 'The Original Singers Club'));
});

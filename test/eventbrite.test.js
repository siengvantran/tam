import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { priceText, normalise } from '../src/services/eventbrite-live.js';
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
  ticket_availability: { is_sold_out: false, is_free: false, minimum_ticket_price: { display: '9.38 GBP', value: 0 }, ...t } });

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

test('Eventbrite prices read the way the listing shows them', () => {
  assert.equal(priceText({ minimum_ticket_price: { display: '16.96 GBP', value: 0 } }), '£16.96');
  assert.equal(priceText({ minimum_ticket_price: { display: '10.00 GBP' } }), '£10');
  assert.equal(priceText({ is_free: true }), 'Free');
  assert.equal(priceText({}), '');
  assert.equal(normalise({ id: 5, name: ' X ', start_date: '2026-11-03', start_time: '20:30:00' }).time, '20:30');
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
  assert.ok(onSingers.some((n) => n.title === 'The Original Singers Club' && n.source === 'eventbrite' && n.eventbrite.priceText === '£9.38'));
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
  assert.match(page, /From £16\.96/);
  assert.match(page, /Sold out/);
  assert.match(page, /Starts 19:30/);
  const karaoke = c.nights.find((n) => n.title === 'TAM Karaoke Night');
  const ev = await (await s.get(`/events/${karaoke.slug}`)).text();
  assert.match(ev, /https:\/\/www\.eventbrite\.co\.uk\/e\/1002/);
  assert.match(ev, /"price":"16\.96"/);
  const admin = await (await s.get('/api/admin/overview', { headers: { 'x-staff-token': 'admin-token-for-tests' } })).json();
  assert.equal(admin.eventbrite.upcoming, 5);

  // Eventbrite is down at the next start: the saved copy keeps the listings
  eb.state.down = true;
  const s2 = await start(dir, eb);
  t.after(() => s2.close());
  await s2.app.live.refresh();
  assert.equal(s2.app.live.status.source, 'cache');
  assert.match(s2.app.live.status.error, /503/);
  assert.ok(s2.app.ctx.content.nights.some((n) => n.title === 'The Original Singers Club'));
});

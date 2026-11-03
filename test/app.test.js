import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadContent } from '../src/lib/content.js';

const ADMIN = 'admin-token-for-tests';
const DOOR = 'door-code-1';
const clock = { t: Date.parse('2026-11-20T12:00:00Z') };

async function start(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, DOOR_TOKEN: DOOR, SITE_URL: 'http://tam.test', PIN_MODERATION: 'on', EVENTBRITE_SYNC: 'off', ...env }, now: () => clock.t });
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let n = 0;
  const call = async (p, { method = 'GET', body, headers = {}, raw } = {}) => {
    // a different client address per call, so the rate limiter stays out of the way
    const res = await fetch(base + p, { method, redirect: 'manual', headers: { 'x-forwarded-for': `10.0.${(n >> 8) & 255}.${n++ & 255}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return { app, base, call, dir, close: () => new Promise((r) => app.server.close(r)) };
}
const book = (s, extra = {}) => s.call('/api/bookings', { method: 'POST', body: { night: 'best-christmas-ever-2026-12-08', type: 'standard', qty: 2, name: 'Sam', email: 'sam@example.com', ...extra } });

test('content: 21 Christmas nights, closed over Christmas, every reference checks', () => {
  const c = loadContent();
  const xmas = c.nightsFor('best-christmas-ever').filter((n) => n.sale);
  assert.equal(xmas.length, 21);
  assert.ok(!xmas.some((n) => n.date >= '2026-12-24' && n.date <= '2026-12-28'));
  assert.equal(c.nightBy.get('big-christmas-hootenanny').sale.mode, 'own');
  assert.equal(c.nightBy.get('dana-gillespie-live').sale.mode, 'standard');
  assert.equal(c.nightBy.get('dana-gillespie-live').sale.price, 2200);
  assert.equal(c.nightBy.get('best-christmas-ever-2026-12-29').sale.mode, 'flat');
  // the Hootenanny ends after midnight, in GMT
  assert.equal(c.nightBy.get('big-christmas-hootenanny').end, '2026-12-05T01:00:00.000Z');
});

test('every page of the old www.tam.tv still answers', async () => {
  const s = await start();
  const c = loadContent();
  for (const p of c.legacy) {
    const r = await s.call(p.path);
    if (p.path === '/home') assert.equal(r.status, 301, p.path);
    else assert.equal(r.status, 200, `${p.path} → ${r.status}`);
  }
  for (const p of ['/', '/whats-on', '/the-best-christmas-ever', '/events/big-christmas-hootenanny', '/events/dana-gillespie-live.ics', '/artists', '/artists/danagillespie',
    '/archive', '/archive/2024', '/tv', '/invite/band', '/invite/p-bowie-1', '/collections/dana-108', '/verify', '/privacy', '/sitemap.xml', '/robots.txt', '/healthz', '/admin', '/door', '/raffle-desk']) {
    assert.equal((await s.call(p)).status, 200, p);
  }
  assert.equal((await s.call('/nope')).status, 404);
  const ics = await s.call('/events/big-christmas-hootenanny.ics');
  assert.match(ics.body, /DTSTART:20261204T180000Z/);
  assert.match((await s.call('/events/dana-gillespie-live.ics')).body, /DTSTART;VALUE=DATE:20261216/);
  await s.close();
});

test('bookings: reserve without Stripe, keyed tickets, capacity', async () => {
  const s = await start();
  const r = await book(s, { qty: 3 });
  assert.equal(r.status, 201);
  const b = r.body.booking;
  assert.equal(b.status, 'reserved');
  assert.equal(b.total, 3000);
  assert.ok(b.ticket.startsWith(`/ticket/${b.id}?k=`));
  assert.equal((await s.call(b.ticket)).status, 200);
  assert.equal((await s.call(`/ticket/${b.id}?k=wrong`)).status, 404);
  assert.equal((await s.call(`/api/bookings/confirm?ref=${b.id}`)).status, 404);
  assert.match((await book(s, { email: 'nope' })).body.error, /valid email/);
  assert.match((await book(s, { night: 'best-christmas-ever-2026-12-25' })).body.error, /on sale/);
  // fill the night: 250 seats, 3 taken
  for (let i = 0; i < 4; i++) assert.equal((await book(s, { qty: 60 })).status, 201);
  const full = await book(s, { qty: 8 });
  assert.equal(full.status, 409);
  assert.match(full.body.error, /Only 7 tickets left/);
  const avail = await s.call('/api/availability?festival=best-christmas-ever');
  assert.equal(avail.body.nights.find((n) => n.slug === 'best-christmas-ever-2026-12-08').left, 7);
  await s.close();
});

test('startup packs, donations, team tables', async () => {
  const s = await start();
  const dana = { night: 'dana-gillespie-live', type: 'startup', qty: 5 };
  assert.match((await book(s, dana)).body.error, /needs a team name/);
  const a = await book(s, { ...dana, teamName: 'Engines', blurb: 'Five of us', mix: 'new', donation: 500 });
  assert.equal(a.status, 201);
  assert.equal(a.body.booking.total, 1760 * 5 + 500);
  const tables = (await s.call('/api/availability?festival=best-christmas-ever')).body.tables;
  assert.equal(tables.length, 1);
  assert.equal(tables[0].left, 15);
  const join = await book(s, { night: 'dana-gillespie-live', type: 'standard', qty: 15, teamName: 'Looms', mix: 'join', tableId: tables[0].id });
  assert.equal(join.status, 201);
  const over = await book(s, { night: 'dana-gillespie-live', type: 'standard', qty: 1, teamName: 'Late', mix: 'join', tableId: tables[0].id });
  assert.equal(over.status, 409);
  assert.match((await book(s, { night: 'dana-gillespie-live', type: 'standard', qty: 2, teamName: 'X', mix: 'join', tableId: 'TBL-NOPE' })).body.error, /not on this night/);
  assert.match((await book(s, { donation: 60000 })).body.error, /up to £500/);
  await s.close();
});

test('the Party Wall: booking reference, moderation, gold sponsor pins', async () => {
  const s = await start();
  const b = (await book(s)).body.booking;
  assert.equal((await s.call('/api/pins', { method: 'POST', body: { ref: b.id, email: 'other@example.com', company: 'Acme' } })).status, 403);
  const ok = await s.call('/api/pins', { method: 'POST', body: { ref: b.id, email: 'sam@example.com', company: 'Acme', website: 'acme.test.com', tagline: 'Hello' } });
  assert.deepEqual(ok.body, { status: 'pending' });
  assert.equal((await s.call('/api/pins', { method: 'POST', body: { ref: b.id, email: 'sam@example.com', company: 'Acme again' } })).status, 409);
  assert.equal((await s.call('/api/pins?festival=best-christmas-ever')).body.pins.length, 0);
  const pin = s.app.ctx.db.pins[0];
  assert.equal((await s.call(`/api/admin/pins/${pin.id}`, { method: 'POST', body: { action: 'approve' } })).status, 401);
  assert.equal((await s.call(`/api/admin/pins/${pin.id}`, { method: 'POST', body: { action: 'approve' }, headers: { 'x-staff-token': ADMIN } })).status, 200);
  const pins = (await s.call('/api/pins?festival=best-christmas-ever')).body.pins;
  assert.equal(pins[0].company, 'Acme');
  assert.equal(pins[0].website, 'https://acme.test.com/');
  assert.equal(pins[0].ref, undefined); // references stay private
  await s.close();
});

test('cards, sponsors, follows, demand', async () => {
  const s = await start();
  const card = await s.call('/api/cards', { method: 'POST', body: { festival: 'best-christmas-ever', to: 'Gran', from: 'Sam', text: 'Love you', fx: ['snow', 'bogus'], polaroids: ['bowie-1', 'nope'], theme: 'bowie' } });
  assert.equal(card.status, 201);
  const saved = s.app.ctx.db.cards[0];
  assert.deepEqual(saved.fx, ['snow']);
  assert.deepEqual(saved.polaroids, ['bowie-1']);
  assert.equal(saved.theme, 'bowie');
  const page = await s.call(`/card/${card.body.id}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /Sam sent you a card/);
  assert.equal((await s.call('/api/sponsors', { method: 'POST', body: { festival: 'best-christmas-ever', package: 'star', company: 'Co', name: 'Pat', email: 'pat@co.com' } })).status, 201);
  assert.match((await s.call('/api/sponsors', { method: 'POST', body: { festival: 'best-christmas-ever', package: 'gold', company: 'Co', name: 'Pat', email: 'pat@co.com' } })).body.error, /package/);
  assert.match((await s.call('/api/follow', { method: 'POST', body: { artist: 'danagillespie', email: 'fan@x.com' } })).body.error, /Tick the box/);
  assert.equal((await s.call('/api/follow', { method: 'POST', body: { artist: 'danagillespie', email: 'fan@x.com', consent: true } })).status, 201);
  const f = s.app.ctx.db.follows[0];
  assert.match((await s.call(`/unfollow?t=${f.token}`)).body, /unsubscribed/);
  assert.ok(s.app.ctx.db.follows[0].unsubscribedAt);
  assert.equal((await s.call('/api/demand', { method: 'POST', body: { kind: 'bring-back', target: 'danagillespie' } })).body.count, 1);
  assert.equal((await s.call('/api/demand', { method: 'POST', body: { kind: 'bring-back', target: 'nobody-at-all' } })).status, 400);
  await s.close();
});

test('the door: staff cookie, check-in on the night only', async () => {
  const s = await start();
  clock.t = Date.parse('2026-11-20T12:00:00Z');
  const b = (await book(s, { night: 'dana-gillespie-live', qty: 3 })).body.booking;
  assert.equal((await s.call(`/api/door/lookup?ref=${b.id}`)).status, 401);
  assert.equal((await s.call('/api/staff/login', { method: 'POST', body: { token: 'wrong' } })).status, 401);
  const login = await s.call('/api/staff/login', { method: 'POST', body: { token: DOOR } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const look = await s.call(`/api/door/lookup?ref=${b.id}`, { headers: { cookie } });
  assert.equal(look.body.booking.ok, false);
  assert.match(look.body.booking.problems[0], /not tonight/);
  assert.equal((await s.call('/api/admin/overview', { headers: { cookie } })).status, 401); // door staff aren't admins
  clock.t = Date.parse('2026-12-16T19:30:00Z');
  const k = new URL(`http://x${b.ticket}`).searchParams.get('k');
  assert.equal((await s.call(`/api/door/lookup?ref=${b.id}&k=${k}`, { headers: { cookie } })).body.booking.ok, true);
  assert.equal((await s.call(`/api/door/lookup?ref=${b.id}&k=bad`, { headers: { cookie } })).status, 400);
  const ci = await s.call('/api/door/checkin', { method: 'POST', headers: { cookie }, body: { ref: b.id, count: 2 } });
  assert.equal(ci.body.booking.checkedIn, 2);
  assert.equal((await s.call('/api/door/checkin', { method: 'POST', headers: { cookie }, body: { ref: b.id, count: 2 } })).status, 409);
  const t = await s.call('/api/door/tonight', { headers: { cookie } });
  assert.deepEqual([t.body.expected, t.body.arrived], [3, 2]);
  // a staff phone opening the ticket gets the check-in panel
  assert.match((await s.call(b.ticket, { headers: { cookie } })).body, /door-panel/);
  assert.doesNotMatch((await s.call(b.ticket)).body, /door-panel/);
  clock.t = Date.parse('2026-11-20T12:00:00Z');
  await s.close();
});

test('the raffle: numbers run on, voids keep their numbers, draws pick sold tickets', async () => {
  const s = await start();
  const h = { 'x-staff-token': DOOR };
  clock.t = Date.parse('2026-12-11T20:00:00Z');
  const a = await s.call('/api/raffle/sell', { method: 'POST', headers: h, body: { count: 3, method: 'cash' } });
  assert.deepEqual([a.body.sale.from, a.body.sale.to, a.body.sale.amount], [1, 3, 500]);
  const b = await s.call('/api/raffle/sell', { method: 'POST', headers: h, body: { count: 2, method: 'card', name: 'Jo' } });
  assert.deepEqual([b.body.sale.from, b.body.sale.to], [4, 5]);
  await s.call('/api/raffle/void', { method: 'POST', headers: h, body: { id: b.body.sale.id } });
  const c = await s.call('/api/raffle/sell', { method: 'POST', headers: h, body: { count: 1, method: 'cash' } });
  assert.equal(c.body.sale.from, 6);
  const drawn = new Set();
  for (let i = 0; i < 4; i++) {
    const d = await s.call('/api/raffle/draw', { method: 'POST', headers: h, body: { prize: `Prize ${i}` } });
    assert.equal(d.status, 201);
    assert.ok([1, 2, 3, 6].includes(d.body.draw.number));
    drawn.add(d.body.draw.number);
  }
  assert.equal(drawn.size, 4);
  assert.equal((await s.call('/api/raffle/draw', { method: 'POST', headers: h, body: { prize: 'x' } })).status, 409);
  assert.equal((await s.call('/api/raffle/tonight', { headers: h })).body.takings, 700);
  clock.t = Date.parse('2026-11-20T12:00:00Z');
  await s.close();
});

test('numbered collections and certificates', async () => {
  const s = await start();
  const o = await s.call('/api/orders', { method: 'POST', body: { collection: 'dana-108', items: { wbam: 2 }, delivery: 'collect', name: 'Lee', email: 'lee@x.com' } });
  assert.equal(o.status, 201);
  assert.deepEqual(o.body.order.copies.map((c) => c.number), [1, 2]);
  const v = await s.call(`/api/verify?code=${o.body.order.copies[0].code}`);
  assert.equal(v.body.status, 'reserved');
  assert.equal(v.body.number, 1);
  assert.equal((await s.call('/api/verify?code=D108-WBAM-001-0000')).status, 404);
  const id = o.body.order.id;
  await s.call(`/api/admin/orders/${id}`, { method: 'POST', headers: { 'x-staff-token': ADMIN }, body: { action: 'cancel' } });
  const again = await s.call('/api/orders', { method: 'POST', body: { collection: 'dana-108', items: { wbam: 1 }, delivery: 'collect', name: 'Kim', email: 'kim@x.com' } });
  assert.equal(again.body.order.copies[0].number, 1); // cancelling freed the number
  await s.close();
});

test('admin: overview and CSV that spreadsheets can’t execute', async () => {
  const s = await start();
  await book(s, { name: '=HYPERLINK("http://evil")' });
  assert.equal((await s.call('/api/admin/overview')).status, 401);
  const h = { 'x-staff-token': ADMIN };
  const o = await s.call('/api/admin/overview', { headers: h });
  assert.equal(o.status, 200);
  assert.equal(o.body.nights.find((n) => n.slug === 'best-christmas-ever-2026-12-08').sold, 2);
  const csv = await s.call('/api/admin/bookings.csv', { headers: h });
  assert.match(csv.body, /"'=HYPERLINK/);
  await s.close();
});

test('Stripe: checkout, signed webhook marks paid, bad signatures refused', async () => {
  const sessions = [];
  const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/v1/checkout/sessions' && req.method === 'POST') {
        const params = new URLSearchParams(body);
        sessions.push(params);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id: `cs_${sessions.length}`, url: `https://checkout.stripe.test/${sessions.length}` }));
      }
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise((r) => mock.listen(0, r));
  const secret = 'whsec_test';
  const s = await start({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_API: `http://127.0.0.1:${mock.address().port}/v1`, STRIPE_WEBHOOK_SECRET: secret });
  const r = await book(s, { qty: 2, donation: 300 });
  assert.equal(r.body.booking.status, 'awaiting_payment');
  assert.equal(r.body.checkoutUrl, 'https://checkout.stripe.test/1');
  const p = sessions[0];
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '1000');
  assert.equal(p.get('line_items[1][price_data][unit_amount]'), '300');
  assert.match(p.get('line_items[1][price_data][product_data][name]'), /Guy’s & St Thomas’/);
  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { object: 'checkout.session', id: 'cs_1', payment_status: 'paid', metadata: { booking: r.body.booking.id } } } });
  // the webhook checks signatures against the real clock
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await s.call('/api/stripe/webhook', { method: 'POST', raw: event, headers: { 'stripe-signature': `t=${now},v1=bad` } })).status, 400);
  const good = crypto.createHmac('sha256', secret).update(`${now}.${event}`).digest('hex');
  assert.equal((await s.call('/api/stripe/webhook', { method: 'POST', raw: event, headers: { 'stripe-signature': `t=${now},v1=${good}` } })).status, 200);
  assert.equal(s.app.ctx.db.bookings[0].status, 'paid');
  // an unpaid checkout's hold lapses after 35 minutes
  const r2 = await book(s, { qty: 2 });
  assert.equal(r2.status, 201);
  let avail = await s.call('/api/availability?festival=best-christmas-ever');
  assert.equal(avail.body.nights.find((n) => n.slug === 'best-christmas-ever-2026-12-08').left, 246);
  clock.t += 36 * 60000;
  avail = await s.call('/api/availability?festival=best-christmas-ever');
  assert.equal(avail.body.nights.find((n) => n.slug === 'best-christmas-ever-2026-12-08').left, 248);
  clock.t = Date.parse('2026-11-20T12:00:00Z');
  await s.close();
  mock.close();
});

test('the performance schedule: public nights only, and December belongs to the festival', () => {
  const raw = fs.readFileSync(new URL('../content/schedule.json', import.meta.url), 'utf8');
  // nothing from the internal sheet that must stay private
  assert.doesNotMatch(raw, /£|min(imum)? spend|private|booking|hire|deposit|birthday|\bbday\b|\d{6}|rehears/i);
  const c = loadContent();
  for (const n of c.nights.filter((x) => x.date.slice(5, 7) === '12')) assert.equal(n.festival, 'best-christmas-ever', n.slug);
  const sat = c.nightBy.get('best-christmas-ever-2026-12-05');
  assert.deepEqual(sat.programme.map((x) => x.series), ['great-british-blues-jam', 'tam-karaoke']);
  assert.match(sat.label, /Blues Jam/);
  assert.equal(c.nightBy.get('big-christmas-hootenanny').title, 'The Big Christmas Hootenanny'); // headline nights keep their own name
  assert.ok(c.nightBy.get('word-of-mouth-2026-12-01').festival === 'best-christmas-ever');
  assert.ok(c.upcoming('2026-11-02').some((n) => n.series === 'singers-sunday-spot' && n.date.startsWith('2027-')));
  const decPast = c.pastForFestival(c.festivalBy.get('best-christmas-ever'));
  assert.ok(decPast.length > 100);
  assert.ok(decPast.every((e) => e.month === 'December' || /christmas/i.test(e.title)));
});

test('search engines: previews are never indexed, and festival pages point to their one home', async () => {
  const preview = await start();
  const home = await preview.call('/');
  assert.equal(home.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(home.body, /<meta name="robots" content="noindex, nofollow">/);
  const robots = (await preview.call('/robots.txt')).body;
  assert.doesNotMatch(robots, /Sitemap/);
  await preview.close();

  const live = await start({ INDEXING: 'on', SITE_URL: 'https://tam.tv' });
  const page = await live.call('/');
  assert.equal(page.headers.get('x-robots-tag'), null);
  assert.doesNotMatch(page.body, /name="robots"/);
  assert.match(page.body, /<link rel="canonical" href="https:\/\/tam\.tv\/">/);
  assert.match((await live.call('/robots.txt')).body, /Sitemap: https:\/\/tam\.tv\/sitemap\.xml/);
  // pages that christmas.tam.tv also has: canonical there, no duplicate event listing
  for (const [here, there] of [['/the-best-christmas-ever', '/'], ['/events/big-christmas-hootenanny', '/opening-night'], ['/events/dana-gillespie-live', '/dana-gillespie'],
    ['/collections/dana-108', '/books'], ['/invite/band', '/invite/band'], ['/artists/bakers-dozen', '/artist/band']]) {
    const r = await live.call(here);
    assert.ok(r.body.includes(`<link rel="canonical" href="https://christmas.tam.tv${there}">`), here);
    assert.doesNotMatch(r.body, /application\/ld\+json/, here);
  }
  // TAM's own pages keep their own home and markup
  const dana = await live.call('/artists/danagillespie');
  assert.match(dana.body, /<link rel="canonical" href="https:\/\/tam\.tv\/artists\/danagillespie">/);
  const night = await live.call('/events/best-christmas-ever-2026-12-05');
  assert.match(night.body, /<link rel="canonical" href="https:\/\/tam\.tv\/events\/best-christmas-ever-2026-12-05">/);
  assert.match(night.body, /application\/ld\+json/);
  const sitemap = (await live.call('/sitemap.xml')).body;
  assert.doesNotMatch(sitemap, /the-best-christmas-ever<|big-christmas-hootenanny<|\/invite\//);
  assert.match(sitemap, /artists\/danagillespie</);
  // the festival page sends people to the festival's permanent home
  assert.match((await live.call('/the-best-christmas-ever')).body, /href="https:\/\/christmas\.tam\.tv\/2027"/);
  await live.close();
});

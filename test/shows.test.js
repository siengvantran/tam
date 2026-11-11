// The Shows back end end to end: Vivian signs in with an emailed link,
// creates a show on the calendar, publishes it with TAM's box office,
// lists it on Eventbrite and posts it to Facebook and Google (all mocked).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { londonToday } from '../src/lib/content.js';
import { parseStaff } from '../src/domain/team.js';

const ADMIN = 'admin-token-for-tests';
const later = (days) => new Date(Date.parse(`${londonToday()}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
// A Thursday at least a week away, not in December (the festival's month)
function showDate() { for (let i = 8; i < 60; i++) { const d = later(i); if (new Date(`${d}T12:00:00Z`).getUTCDay() === 4 && d.slice(5, 7) !== '12') return d; } return later(9); }

// One mock server for Eventbrite, Facebook, Google and Resend, recording every call.
async function mocks() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = raw && req.headers['content-type'] && req.headers['content-type'].includes('json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)); } catch { body = raw; }
      const u = new URL(req.url, 'http://x');
      calls.push({ method: req.method, path: u.pathname, body, auth: req.headers.authorization || '' });
      const p = u.pathname;
      const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      // Resend
      if (p === '/resend/emails') return json(200, { id: `em_${calls.length}` });
      // Eventbrite
      if (p === '/eb/users/me/') return json(200, { name: 'TAM', emails: [{ email: 'box@tam.test' }] });
      if (p === '/eb/users/me/organizations/') return json(200, { organizations: [{ id: 'ORG1', name: 'TAM' }] });
      if (p === '/eb/organizations/ORG1/organizers/') return json(200, { organizers: [{ id: '33409225909', name: 'Temple of Art and Music' }] });
      if (p === '/eb/organizations/ORG1/venues/') return json(200, { id: 'VEN1' });
      if (p === '/eb/organizations/ORG1/events/') return json(200, { id: '9001', url: 'https://www.eventbrite.co.uk/e/9001', status: 'draft' });
      if (p === '/eb/events/9001/ticket_classes/') return json(200, { id: `TC${calls.length}` });
      if (/^\/eb\/events\/9001\/ticket_classes\/TC\d+\/$/.test(p)) return json(200, {});
      if (p === '/eb/events/9001/structured_content/' && req.method === 'GET') return json(200, { page_version_number: '1' });
      if (/^\/eb\/events\/9001\/structured_content\/\d+\/$/.test(p)) return json(200, {});
      if (p === '/eb/events/9001/publish/') return json(200, { published: true });
      if (p === '/eb/events/9001/') return req.method === 'GET' ? json(200, { status: 'live', url: 'https://www.eventbrite.co.uk/e/9001', ticket_classes: [{ quantity_sold: 4 }, { quantity_sold: 1 }] }) : json(200, {});
      if (p === '/eb/media/upload/') return json(200, { id: 'IMG1' });
      // Facebook
      if (p === '/fb/PAGE1/feed') return json(200, { id: 'PAGE1_POST7' });
      // Google
      if (p === '/gtoken') return json(200, { access_token: 'g-access', expires_in: 3600 });
      if (p === '/gbp/accounts/ACC/locations/LOC/localPosts') return json(200, { name: 'accounts/ACC/locations/LOC/localPosts/P1', searchUrl: 'https://g.co/post1' });
      json(404, { error: 'NOT_FOUND', error_description: `no mock for ${req.method} ${p}` });
    });
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, close: () => { server.closeAllConnections(); server.close(); } };
}

async function start(m, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-shows-'));
  const app = await createApp({ env: {
    DATA_DIR: dir, ADMIN_TOKEN: ADMIN, SITE_URL: 'http://tam.test', EVENTBRITE_SYNC: 'off',
    STAFF: 'Vivian Ops <vivian@tam.test> ops; Sam Admin <sam@tam.test> admin',
    RESEND_API_KEY: 're_test', RESEND_API: `${m.base}/resend`,
    EVENTBRITE_TOKEN: 'eb-test', EVENTBRITE_API: `${m.base}/eb`,
    FACEBOOK_PAGE_ID: 'PAGE1', FACEBOOK_PAGE_TOKEN: 'fb-test', FACEBOOK_API: `${m.base}/fb`,
    GBP_CLIENT_ID: 'id', GBP_CLIENT_SECRET: 'secret', GBP_REFRESH_TOKEN: 'refresh', GBP_ACCOUNT_ID: 'ACC', GBP_LOCATION_ID: 'LOC', GBP_API: `${m.base}/gbp`, GBP_TOKEN_URL: `${m.base}/gtoken`,
    ...env,
  } });
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let n = 0;
  const call = async (p, { method = 'GET', body, cookie, headers = {} } = {}) => {
    const res = await fetch(base + p, { method, redirect: 'manual', headers: { 'x-forwarded-for': `10.7.${(n >> 8) & 255}.${n++ & 255}`, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return { app, call, close: () => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }) };
}

test('STAFF is read as names, emails and roles', () => {
  assert.deepEqual(parseStaff('Vivian Smith <Vivian@TAM.test> ops; sam@tam.test admin; nonsense'), [
    { name: 'Vivian Smith', email: 'vivian@tam.test', role: 'ops' }, { name: 'sam', email: 'sam@tam.test', role: 'admin' }]);
});

test('Vivian signs in with an emailed link, and only the team can use Shows', async (t) => {
  const m = await mocks();
  const s = await start(m);
  t.after(() => { s.close(); m.close(); });
  assert.equal((await s.call('/shows')).status, 200);
  assert.equal((await s.call('/api/shows/setup')).status, 401);

  // someone not on the team gets the same answer, and no email
  assert.equal((await s.call('/api/staff/link', { method: 'POST', body: { email: 'stranger@x.com' } })).status, 200);
  assert.equal(m.calls.filter((c) => c.path === '/resend/emails').length, 0);

  assert.equal((await s.call('/api/staff/link', { method: 'POST', body: { email: 'Vivian@tam.test' } })).status, 200);
  const mail = m.calls.find((c) => c.path === '/resend/emails');
  assert.deepEqual(mail.body.to, ['vivian@tam.test']);
  const t1 = /sign-in\?t=([\w-]+)/.exec(mail.body.text)[1];
  // the link opens a page; signing in takes a press of its button
  assert.equal((await s.call(`/staff/sign-in?t=${t1}`)).status, 200);
  const used = await s.call('/api/staff/link/use', { method: 'POST', body: { t: t1 } });
  assert.equal(used.status, 200);
  const cookie = used.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^tam_session=/);
  assert.equal((await s.call('/api/staff/link/use', { method: 'POST', body: { t: t1 } })).status, 400); // once only
  const me = (await s.call('/api/staff/me', { cookie })).body;
  assert.deepEqual([me.name, me.role], ['Vivian Ops', 'ops']);
  assert.equal((await s.call('/api/shows/setup', { cookie })).status, 200);
  // ops can run the door, not the admin
  assert.equal((await s.call('/api/admin/overview', { cookie })).status, 401);
  assert.equal((await s.call('/api/admin/team', { method: 'POST', cookie, body: { email: 'x@y.com' } })).status, 401);
  // the admin code still works everywhere, and admins manage the team
  const H = { 'x-staff-token': ADMIN };
  const team = await s.call('/api/admin/team', { method: 'POST', headers: H, body: { name: 'Jo', email: 'jo@tam.test', role: 'ops' } });
  assert.equal(team.body.team.length, 3);
  assert.ok((await s.call('/api/admin/overview', { headers: H })).body.team.some((p) => p.email === 'vivian@tam.test' && p.lastSignIn));
  // removing someone signs them out
  await s.call('/api/admin/team', { method: 'POST', headers: H, body: { email: 'vivian@tam.test', remove: true } });
  assert.equal((await s.call('/api/shows/setup', { cookie })).status, 401);
});

test('A show goes from the calendar to tam.tv, Eventbrite, Facebook and Google', async (t) => {
  const m = await mocks();
  const s = await start(m);
  t.after(() => { s.close(); m.close(); });
  const H = { 'x-staff-token': ADMIN };
  const date = showDate();

  // 1. a draft on the calendar
  const made = await s.call('/api/shows', { method: 'POST', headers: H, body: { date, title: 'Jazz Jam Deluxe', doors: '19:30', ends: '00:30' } });
  assert.equal(made.status, 201);
  const id = made.body.id;
  assert.equal(made.body.status, 'draft');
  assert.match(made.body.slug, new RegExp(`^jazz-jam-deluxe-${date}$`));
  assert.ok(made.body.problems.includes('a short summary'));
  let month = (await s.call(`/api/shows/month?m=${date.slice(0, 7)}`, { headers: H })).body;
  assert.ok(month.entries.some((e) => e.showId === id && e.status === 'draft'));
  assert.equal((await s.call(`/events/${made.body.slug}`)).status, 404); // drafts aren't public

  // can't publish an unfinished show
  assert.equal((await s.call(`/api/shows/${id}/status`, { method: 'POST', headers: H, body: { status: 'published' } })).status, 400);

  // 2. fill it in: tickets on TAM's box office and Eventbrite from one capacity
  const saved = await s.call(`/api/shows/${id}`, { method: 'POST', headers: H, body: {
    summary: 'House band at nine, then the floor is yours. Bring an instrument.', description: 'A night of jazz.\n\nOpen to all.',
    lineup: [{ name: 'The House Band', role: 'Band' }, { name: 'Secret Guest', revealed: false }],
    schedule: [['19:30', 'Doors'], ['21:00', 'House band']], video: 'https://youtu.be/cXdu_jnTcPI',
    sales: { mode: 'both', capacity: 100, eventbriteAllocation: 30, tickets: [{ name: 'General admission', price: '12.50', blurb: 'Entry' }, { name: 'Supporter', price: '20' }] },
  } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.sales.tickets.map((x) => x.price), [1250, 2000]);
  assert.equal(saved.body.video, 'cXdu_jnTcPI');
  assert.deepEqual(saved.body.problems, []);
  assert.equal((await s.call(`/api/shows/${id}`, { method: 'POST', headers: H, body: { sales: { mode: 'tam', capacity: 100, tickets: [{ name: 'Bad', price: 'free-ish' }] } } })).status, 400);

  // 3. live on tam.tv with its own box office
  const pub = await s.call(`/api/shows/${id}/status`, { method: 'POST', headers: H, body: { status: 'published' } });
  assert.equal(pub.body.status, 'published');
  const c = s.app.ctx.content;
  const night = c.nightBy.get(saved.body.slug);
  assert.equal(night.source, 'show');
  assert.equal(night.sale.capacity, 100); // not on Eventbrite yet
  const page = (await s.call(`/events/${night.slug}`)).body;
  assert.match(page, /Jazz Jam Deluxe/);
  assert.match(page, /The House Band/);
  assert.match(page, /\+ 1 to be revealed/);
  assert.doesNotMatch(page, /Secret Guest/);
  assert.match(page, /A night of jazz/);
  assert.match((await s.call('/whats-on')).body, /Jazz Jam Deluxe/);
  assert.match((await s.call('/calendar.ics')).body, /SUMMARY:Jazz Jam Deluxe/);
  const booked = await s.call('/api/bookings', { method: 'POST', body: { night: night.slug, type: 't1', qty: 2, name: 'Jo', email: 'jo@example.com' } });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));

  // 4. Eventbrite: a draft listing whose 30 tickets come out of the 100
  const eb = await s.call(`/api/shows/${id}/eventbrite/create`, { method: 'POST', headers: H, body: {} });
  assert.equal(eb.status, 200, JSON.stringify(eb.body));
  assert.equal(eb.body.eventbrite.id, '9001');
  assert.equal(eb.body.eventbrite.allocation, 30);
  const ev = m.calls.find((x) => x.path === '/eb/organizations/ORG1/events/');
  assert.equal(ev.auth, 'Bearer eb-test');
  assert.equal(ev.body.event.name.html, 'Jazz Jam Deluxe');
  assert.equal(ev.body.event.capacity, 30);
  assert.equal(ev.body.event.organizer_id, '33409225909');
  assert.equal(ev.body.event.start.timezone, 'Europe/London');
  assert.ok(Date.parse(ev.body.event.end.utc) > Date.parse(ev.body.event.start.utc)); // 00:30 is the next day
  const tcs = m.calls.filter((x) => x.path === '/eb/events/9001/ticket_classes/');
  assert.deepEqual(tcs.map((x) => [x.body.ticket_class.name, x.body.ticket_class.cost, x.body.ticket_class.quantity_total]), [['General admission', 'GBP,1250', 30], ['Supporter', 'GBP,2000', 30]]);
  const desc = m.calls.filter((x) => /structured_content\/\d+\/$/.test(x.path)).at(-1);
  assert.match(desc.body.modules[0].data.body.text, /The House Band/);
  assert.doesNotMatch(desc.body.modules[0].data.body.text, /Secret Guest/);
  assert.equal(c.nightBy.get(night.slug).sale.capacity, 70); // TAM's box office sells the rest
  // more than is left can't go to Eventbrite (2 booked here)
  assert.equal((await s.call(`/api/shows/${id}/eventbrite/update`, { method: 'POST', headers: H, body: { allocation: 99 } })).status, 400);
  assert.equal((await s.call(`/api/shows/${id}/eventbrite/publish`, { method: 'POST', headers: H, body: {} })).body.eventbrite.status, 'live');
  const synced = await s.call(`/api/shows/${id}/eventbrite/refresh`, { method: 'POST', headers: H, body: {} });
  assert.equal(synced.body.eventbrite.sold, 5);
  assert.equal(synced.body.stats.sold, 2);
  // the live Eventbrite read sync doesn't list the show twice
  c.applyLive({ events: [{ id: '9001', name: 'Jazz Jam Deluxe', date, time: '19:30', url: 'https://www.eventbrite.co.uk/e/9001', tickets: [], free: false, soldOut: false, priceText: '' }] });
  assert.equal(c.nights.filter((x) => x.date === date && /Jazz Jam/.test(x.title)).length, 1);

  // 5. Facebook and Google, with the suggested wording
  assert.match(synced.body.drafts.facebook, /Jazz Jam Deluxe/);
  assert.match(synced.body.drafts.facebook, /Tickets from £12\.50: http:\/\/tam\.test\/events\//);
  const fb = await s.call(`/api/shows/${id}/post/facebook`, { method: 'POST', headers: H, body: { text: synced.body.drafts.facebook } });
  assert.equal(fb.body.social.facebook.url, 'https://www.facebook.com/PAGE1/posts/POST7');
  assert.equal(m.calls.find((x) => x.path === '/fb/PAGE1/feed').body.link, `http://tam.test/events/${night.slug}`);
  const g = await s.call(`/api/shows/${id}/post/google`, { method: 'POST', headers: H, body: { text: synced.body.drafts.google } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const gp = m.calls.find((x) => x.path === '/gbp/accounts/ACC/locations/LOC/localPosts');
  assert.equal(gp.auth, 'Bearer g-access');
  assert.equal(gp.body.topicType, 'EVENT');
  assert.equal(gp.body.event.schedule.startTime.hours, 19);
  assert.equal(gp.body.callToAction.actionType, 'BOOK');

  // 6. copies for the next three weeks, as drafts with no listing
  const cp = await s.call(`/api/shows/${id}/copy`, { method: 'POST', headers: H, body: { weekly: 3 } });
  assert.equal(cp.body.made.length, 3);
  const copy = (await s.call(`/api/shows/${cp.body.made[0].id}`, { headers: H })).body;
  assert.deepEqual([copy.status, copy.eventbrite, copy.title], ['draft', null, 'Jazz Jam Deluxe']);

  // 7. cancelling with tickets booked needs a confirmation
  const cancel = await s.call(`/api/shows/${id}/status`, { method: 'POST', headers: H, body: { status: 'cancelled' } });
  assert.equal(cancel.status, 409);
  assert.equal((await s.call(`/api/shows/${id}/status`, { method: 'POST', headers: H, body: { status: 'cancelled', confirm: true } })).body.status, 'cancelled');
  assert.ok(!c.nightBy.has(night.slug));
  month = (await s.call(`/api/shows/month?m=${date.slice(0, 7)}`, { headers: H })).body;
  assert.ok(month.entries.some((e) => e.showId === id && e.status === 'cancelled'));
});

test('A free guest-list show books without a card, and nights from the schedule can be brought in', async (t) => {
  const m = await mocks();
  const s = await start(m, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_API: `${m.base}/stripe` });
  t.after(() => { s.close(); m.close(); });
  const H = { 'x-staff-token': ADMIN };
  const date = later(15);
  const made = (await s.call('/api/shows', { method: 'POST', headers: H, body: { date, title: 'Album Launch', doors: '19:00', summary: 'Hear it first.', sales: { mode: 'rsvp', capacity: 60 } } })).body;
  await s.call(`/api/shows/${made.id}/status`, { method: 'POST', headers: H, body: { status: 'published' } });
  const r = await s.call('/api/bookings', { method: 'POST', body: { night: made.slug, type: 'guest', qty: 2, name: 'Ali', email: 'ali@example.com' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(s.app.ctx.db.bookings.at(-1).status, 'reserved'); // no card for a free place
  assert.match((await s.call('/whats-on')).body, /Album Launch[\s\S]{0,400}Free tickets/); // not “From £0”
  assert.ok(!m.calls.some((x) => x.path.startsWith('/stripe')));

  // a night from TAM's schedule, brought into Shows to manage
  const sched = s.app.ctx.content.nights.find((n) => n.source === 'schedule' && n.date >= londonToday());
  if (sched) {
    const adopted = (await s.call('/api/shows', { method: 'POST', headers: H, body: { fromNight: sched.slug } })).body;
    assert.equal(adopted.title, sched.title);
    assert.equal(adopted.status, 'draft');
    assert.match(adopted.history[0].what, /schedule/);
  }
});

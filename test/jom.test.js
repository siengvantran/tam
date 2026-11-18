// JOM at TAM: an evergreen page for every JOM act, served at jom.tam.tv and
// /jom; parents claim and update a page, and TAM approves everything first;
// fans pledge to see them at The Best Christmas Ever.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';
const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64')}`;

test('JOM at TAM: permanent act pages, pledges, parents claim and update (TAM approves), jom.tam.tv', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-jom-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}` } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  app.ctx.cfg.enquiriesTo = 'team@tam.test';
  const staff = { 'x-staff-token': ADMIN };
  const call = async (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: type.includes('json') ? await r.json() : await r.text() };
  };
  const wait = async (n) => { for (let i = 0; i < 100 && sent.length < n; i++) await new Promise((x) => setTimeout(x, 15)); };

  // the hub: every act from the TAM x JOM Sessions line-up, grouped
  const hub = await call('/jom');
  assert.equal(hub.status, 200);
  for (const name of ['Yellowhammer', 'Beatrix Binyon', 'Lavender Drumming', 'Don’t Send Flowers', 'The Whippets', 'Eloise']) assert.ok(hub.body.includes(name), name);
  assert.equal(app.ctx.jom.all().length, 30);
  assert.match(hub.body, /JOM Junior Open Mic[\s\S]*JOM Youth Open Mic/);
  // an act's page: their plate, the night they played, the pledge
  const yh = await call('/jom/yellowhammer');
  assert.equal(yh.status, 200);
  assert.match(yh.body, /\/img\/jom-2026\/yellowhammer\.jpg/);
  assert.match(yh.body, /TAM x JOM Sessions 2026/);
  assert.match(yh.body, /See Yellowhammer at the festival/);
  assert.match(yh.body, /Claim this page/);
  assert.equal((await call('/jom/nobody-here')).status, 404);

  // jom.tam.tv: the same pages at the top level, its own sitemap; other paths go to www
  const J = { 'x-forwarded-host': 'jom.tam.tv' };
  const root = await call('/', { headers: J });
  assert.equal(root.status, 200);
  assert.match(root.body, /JOM at TAM/);
  assert.match(root.body, /href="\/yellowhammer"/);
  assert.match(root.body, /<link rel="canonical" href="https:\/\/jom\.tam\.tv\/">/);
  assert.match((await call('/yellowhammer', { headers: J })).body, /<link rel="canonical" href="https:\/\/jom\.tam\.tv\/yellowhammer">/);
  assert.match((await call('/sitemap.xml', { headers: J })).body, /jom\.tam\.tv\/the-whippets/);
  const away = await call('/whats-on', { headers: J });
  assert.equal(away.status, 302);
  assert.equal(away.headers.get('location'), `${B}/whats-on`);

  // pledges: once per browser per act (changing the number updates it)
  const id = 'browser-id-0123456789';
  assert.equal((await call('/api/jom/yellowhammer/pledge', { method: 'POST', body: { id, n: 3 } })).body.pledges, 3);
  const again = await call('/api/jom/yellowhammer/pledge', { method: 'POST', body: { id, n: 4 } });
  assert.equal(again.body.pledges, 4);
  assert.equal(again.body.updated, true);
  assert.equal((await call('/api/jom/yellowhammer/pledge', { method: 'POST', body: { id: 'other-browser-01234567', n: 99 } })).body.pledges, 12); // at most 8
  assert.match((await call('/jom')).body, /Most pledged for Christmas[\s\S]*Yellowhammer/);

  // a parent claims the page; nothing changes until TAM checks it
  assert.match((await call('/api/jom/yellowhammer/claim', { method: 'POST', body: { name: 'Pat', email: 'pat@family.test', relation: 'parent' } })).body.error, /Tick the box/);
  assert.equal((await call('/api/jom/yellowhammer/claim', { method: 'POST', body: { name: 'Pat', email: 'pat@family.test', relation: 'parent', consent: true } })).status, 201);
  assert.equal((await call('/api/jom/manage')).status, 401);
  let m = (await call('/api/jom/manage', { headers: staff })).body;
  assert.equal(m.claims.length, 1);
  const n0 = sent.length;
  await call(`/api/jom/manage/claims/${m.claims[0].id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  await wait(n0 + 1);
  const link = sent.slice(n0).find((x) => x.to[0] === 'pat@family.test');
  assert.match(link.subject, /claim for Yellowhammer is approved/);
  const signin = await call('/api/jom/in', { method: 'POST', body: { t: /jom\/in\?t=([\w-]+)/.exec(link.html)[1] } });
  const cookie = signin.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/jom/me', { cookie })).body.acts[0].slug, 'yellowhammer');

  // their update: no contact details, links only to music sites; only their own acts
  assert.match((await call('/api/jom/me/yellowhammer', { method: 'POST', cookie, body: { bio: 'Call us on 07700 900123' } })).body.error, /phone numbers/);
  assert.match((await call('/api/jom/me/yellowhammer', { method: 'POST', cookie, body: { bio: 'ok', links: 'https://example.com/x' } })).body.error, /Links can go to/);
  assert.equal((await call('/api/jom/me/the-whippets', { method: 'POST', cookie, body: { bio: 'hi' } })).status, 403);
  const ph = (await call('/api/jom/me/yellowhammer/photo', { method: 'POST', cookie, body: { photo: PNG } })).body.photo;
  assert.match(ph, /^\/uploads\/jom-yellowhammer-/);
  const sentUpdate = await call('/api/jom/me/yellowhammer', { method: 'POST', cookie, body: { name: 'Yellowhammer', bio: 'A five-piece from JOM who love 70s rock.', links: 'https://www.youtube.com/@yellowhammer', photos: [ph, '/img/jom-2026/yellowhammer.jpg'] } });
  assert.equal(sentUpdate.status, 201);
  assert.doesNotMatch((await call('/jom/yellowhammer')).body, /70s rock/); // not until TAM approves
  // the team is told there's something to check: the claim, and the update
  await wait(sent.length + 0);
  for (let i = 0; i < 60 && !sent.some((x) => /an update to Yellowhammer/.test(x.subject)); i++) await new Promise((x) => setTimeout(x, 15));
  const toTeam = sent.filter((x) => [].concat(x.to).includes('team@tam.test')).map((x) => x.subject);
  assert.ok(toTeam.some((x) => /a claim for Yellowhammer to approve/.test(x)), toTeam.join(' | '));
  assert.ok(toTeam.some((x) => /an update to Yellowhammer’s page to approve/.test(x)), toTeam.join(' | '));
  assert.match(sent.find((x) => /an update to Yellowhammer/.test(x.subject)).html, /a bio, 2 photos, links/);

  m = (await call('/api/jom/manage', { headers: staff })).body;
  assert.equal(m.changes.length, 1);
  await call(`/api/jom/manage/changes/${m.changes[0].id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  const live = (await call('/jom/yellowhammer')).body;
  assert.match(live, /A five-piece from JOM who love 70s rock\./);
  assert.ok(live.includes(ph));
  assert.match(live, /youtube\.com\/@yellowhammer/);
  assert.match(live, /looked after by Yellowhammer’s parent or guardian/);
  assert.doesNotMatch(live, /pat@family\.test/);

  // staff can clear pledges (after testing): one act's, then everyone's
  assert.equal((await call('/api/jom/manage/pledges/reset', { method: 'POST', body: { all: true } })).status, 401);
  assert.equal((await call('/api/jom/manage/pledges/reset', { method: 'POST', headers: staff, body: {} })).status, 400);
  await call('/api/jom/colette/pledge', { method: 'POST', body: { id, n: 2 } });
  assert.equal((await call('/api/jom/manage/pledges/reset', { method: 'POST', headers: staff, body: { slug: 'yellowhammer' } })).body.removed, 2);
  assert.match((await call('/jom/colette')).body, /data-count>2</);
  assert.equal((await call('/api/jom/manage/pledges/reset', { method: 'POST', headers: staff, body: { all: true } })).body.removed, 1);
  assert.match((await call('/jom/yellowhammer')).body, /data-count>0</);

  // a concern lands with the team; staff can hide a page
  assert.equal((await call('/api/jom/the-whippets/concern', { method: 'POST', body: { message: 'Please take this down' } })).status, 201);
  assert.ok(app.ctx.db.enquiries.some((x) => x.source === 'jom' && /The Whippets/.test(x.message)));
  await call('/api/jom/manage/acts', { method: 'POST', headers: staff, body: { slug: 'the-whippets', action: 'hide' } });
  assert.equal((await call('/jom/the-whippets')).status, 404);
  // and add an act from a later session
  await call('/api/jom/manage/acts', { method: 'POST', headers: staff, body: { name: 'New Band', group: 'youth' } });
  assert.equal((await call('/jom/new-band')).status, 200);
});

test('JOM hub: a carousel of banners and acts, the next JOM dates, and applications to play The Best Christmas Ever', async (t) => {
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-jom2-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const post = (p, body, headers = {}) => fetch(`${B}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  app.ctx.now = () => Date.parse('2026-11-20T12:00:00Z'); // after the TAM session, before the December dates

  const hub = await (await fetch(`${B}/jom`)).text();
  // the carousel: JOM's banners, then every act with a photo, linked to their page
  assert.match(hub, /data-carousel/);
  assert.match(hub, /\/img\/jom\/jom-junior-2026-12-13\.jpg/);
  assert.match(hub, /class="fx-slide fit"/);
  assert.match(hub, /href="\/jom\/yellowhammer"[^>]*><img src="\/img\/jom-2026\/yellowhammer\.jpg"/);
  assert.match(hub, /<script type="module" src="\/js\/carousel\.js">/);
  // the next JOM dates, at Hootananny Brixton
  assert.match(hub, /id="next-dates"[\s\S]*JOM Junior Open Mic[\s\S]*12pm to 2pm[\s\S]*Hootananny Brixton, 95 Effra Rd/);
  assert.match(hub, /JOM Youth Open Mic[\s\S]*2pm to 7:30pm[\s\S]*Ages 12 to 18[\s\S]*come and watch/);
  // the slots are full: no address for players to email (Vivian, 15 Nov), and JOM plays four venues
  assert.doesNotMatch(hub, /jomjunioropenmic|To play, email/);
  assert.match(hub, /four venues around London, TAM among them/);
  assert.match(hub, /Next JOM dates<\/span><b>JOM Junior Open Mic and JOM Youth Open Mic<\/b>/); // the hero points there once TAM's session has passed
  // the call to play The Best Christmas Ever
  assert.match(hub, /id="christmas"[\s\S]*date to be announced[\s\S]*Play The Best Christmas Ever 2026[\s\S]*id="jm-xmas"/);

  const ok = { act: 'Yellowhammer', group: 'youth', plays: 'Rock band', members: 5, links: 'https://www.youtube.com/@yh', name: 'Pat', email: 'pat@family.test', relation: 'parent', consent: true };
  assert.match((await post('/api/jom/apply-christmas', { ...ok, consent: false })).body.error, /Tick the box/);
  assert.match((await post('/api/jom/apply-christmas', { ...ok, group: '' })).body.error, /Junior/);
  assert.match((await post('/api/jom/apply-christmas', { ...ok, links: 'https://example.com' })).body.error, /Links can go to/);
  const r = await post('/api/jom/apply-christmas', ok);
  assert.equal(r.status, 201);
  assert.equal(r.body.page, 'yellowhammer');
  assert.equal((await post('/api/jom/apply-christmas', { ...ok, act: 'Brand New Band', group: 'junior' })).body.page, null);
  // staff see them (with the act's pledges) and set a status; it's never on a public page
  assert.equal((await fetch(`${B}/api/jom/manage`)).status, 401);
  const m = await (await fetch(`${B}/api/jom/manage`, { headers: { 'x-staff-token': ADMIN } })).json();
  assert.equal(m.applications.length, 2);
  const yh = m.applications.find((x) => x.act === 'Yellowhammer');
  assert.equal((await post(`/api/jom/manage/applications/${yh.id}`, { status: 'shortlist' }, { 'x-staff-token': ADMIN })).status, 200);
  assert.equal(app.ctx.db.jomApplications.find((x) => x.id === yh.id).status, 'shortlist');
  assert.doesNotMatch(await (await fetch(`${B}/jom`)).text(), /pat@family\.test/);
});

// Applying to play at TAM: choose Open Mic / Showcase / Friday Night Live /
// Festivals / propose a show, tell us your crowd and story, get a basic page
// straight away, gather pledges (worth five boosts), make a poster.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';

test('an act applies, gets a page at once, gathers pledges; staff see the application and who pledged', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-sta-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}`, MAIL_GAP_MS: '0', ENQUIRIES_TO: 'team@tam.test' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const staff = { 'x-staff-token': ADMIN };
  const call = async (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
  };

  // the form, with every option
  const form = await call('/stage/apply?for=show');
  for (const k of ['Open Mic', 'Junior &amp; Youth Open Mic', 'Sunday Showcase', 'Friday Night Live', 'Festivals', 'Propose a show']) assert.match(form.body, new RegExp(k));
  assert.match(form.body, /value="show" checked/);
  assert.equal((await call('/play')).headers.get('location'), '/stage/apply');

  const base = { name: 'Mo', email: 'mo@band.test', act: 'Mo Soul', plays: 'Soul singer', from: 'Brixton', age: '18+', consent: true, about: 'Mo writes soul songs on night shifts.',
    draw: { instagram: '2,400', tiktok: '12k', bring: '30', lastGig: 'The Windmill: about 40', sold: 'some' }, story: { hook: 'A nurse who writes soul songs on night shifts', filmed: true } };
  assert.match((await call('/api/stage/apply', { method: 'POST', body: { ...base, paths: [] } })).body.error, /Choose what/);
  assert.match((await call('/api/stage/apply', { method: 'POST', body: { ...base, paths: ['show'] } })).body.error, /idea for the show/);
  assert.match((await call('/api/stage/apply', { method: 'POST', body: { ...base, age: '', paths: ['openmic'] } })).body.error, /18 or over/);

  // applying gives a basic page straight away, signed in on this device
  const ap = await call('/api/stage/apply', { method: 'POST', body: { ...base, paths: ['openmic', 'show', 'nonsense'], show: { title: 'Night Shift Soul', idea: 'Soul from the night shift, with friends', crowd: '80', price: '£10' } } });
  assert.equal(ap.status, 201);
  assert.equal(ap.body.next, '/stage/me?welcome=1');
  const cookie = ap.headers.get('set-cookie').split(';')[0];
  for (let i = 0; i < 100 && !sent.some((m) => m.to[0] === 'team@tam.test'); i++) await new Promise((x) => setTimeout(x, 15));
  const team = sent.find((m) => m.to[0] === 'team@tam.test');
  assert.match(team.subject, /New application \(Play at TAM\): Mo Soul · Open Mic, Propose a show/);
  assert.match(team.html, /Night Shift Soul/);
  const me = (await call('/api/stage/me', { cookie })).body.artist;
  assert.deepEqual(me.paths, ['Open Mic', 'Propose a show']);
  assert.equal(me.from, 'Brixton');
  assert.equal(me.shareable, true);
  assert.ok(me.boosters.some((b) => /pledged fans/.test(b.label)));

  // an adult's page can be shared at once (not on /stage until TAM reviews it)
  const pg = await call(`/stage/${me.slug}`);
  assert.equal(pg.status, 200);
  assert.match(pg.body, /New on the TAM Stage/);
  assert.match(pg.body, /id="pledge"/);
  assert.match(pg.body, /id="st-card-data"/);
  assert.match(pg.body, /noindex/);
  assert.doesNotMatch(pg.body, /mo@band\.test/);
  assert.doesNotMatch((await call('/stage')).body, /Mo Soul/);

  // the same email again: added to the application, no new page, no sign-in
  const again = await call('/api/stage/apply', { method: 'POST', body: { ...base, act: 'Someone else', paths: ['festival'] } });
  assert.equal(again.body.next, undefined);
  assert.equal(again.headers.get('set-cookie'), null);
  assert.equal(app.ctx.db.arArtists.filter((a) => a.email === 'mo@band.test').length, 1);

  // an under-18 act's page waits for TAM
  const kid = await call('/api/stage/apply', { method: 'POST', body: { ...base, email: 'parent@x.test', act: 'Young Band', age: 'under18', paths: ['jom'] } });
  const kidSlug = app.ctx.db.arArtists.find((a) => a.email === 'parent@x.test').slug;
  assert.equal(kid.status, 201);
  assert.equal((await call(`/stage/${kidSlug}`)).status, 404);
  assert.equal((await call(`/api/stage/${kidSlug}/pledge`, { method: 'POST', body: { email: 'f@x.test', consent: true } })).status, 404);

  // pledges: email and consent; one per email (updated), worth five boosts
  assert.match((await call(`/api/stage/${me.slug}/pledge`, { method: 'POST', body: { email: 'fan@x.test' } })).body.error, /Tick the box/);
  assert.match((await call(`/api/stage/${me.slug}/pledge`, { method: 'POST', body: { consent: true } })).body.error, /email/);
  assert.equal((await call(`/api/stage/${me.slug}/pledge`, { method: 'POST', body: { name: 'Ana', email: 'fan@x.test', n: 2, consent: true } })).body.pledged, 2);
  const up = await call(`/api/stage/${me.slug}/pledge`, { method: 'POST', body: { name: 'Ana', email: 'FAN@x.test', n: 4, consent: true } });
  assert.equal(up.body.pledged, 4);
  assert.equal(up.body.updated, true);
  await call(`/api/stage/${me.slug}/pledge`, { method: 'POST', body: { email: 'pal@x.test', n: 1, consent: true } });
  await call(`/api/stage/${me.slug}/share`, { method: 'POST', body: { poster: true } });
  const me2 = (await call('/api/stage/me', { cookie })).body.artist;
  assert.equal(me2.pledged, 5);
  assert.equal(me2.support, 25);
  assert.ok(me2.boosters.find((b) => b.id === 'pledge5').done);
  assert.ok(me2.boosters.find((b) => b.id === 'poster').done);
  assert.match((await call(`/stage/${me.slug}`)).body, /data-pledged>5</);

  // staff: the application, the pledges, and who pledged
  const board = (await call('/api/stage/manage', { headers: staff })).body;
  const a = board.artists.find((x) => x.slug === me.slug);
  assert.equal(a.applications.length, 2);
  assert.deepEqual(a.applications[0].paths, ['openmic', 'show']);
  assert.equal(a.applications[0].draw.instagram, 2400);
  assert.equal(a.applications[0].draw.bring, 30);
  assert.equal(a.applications[0].show.title, 'Night Shift Soul');
  assert.equal(a.applications[0].story.filmed, true);
  assert.equal(a.stats.pledged, 5);
  assert.ok(board.pathways.friday);
  assert.equal((await call(`/api/stage/manage/${a.id}/pledges.csv`)).status, 401);
  const csv = await call(`/api/stage/manage/${a.id}/pledges.csv`, { headers: staff });
  assert.match(csv.body, /"Ana","fan@x\.test","4"/);
});

test('staff make a page from a play enquiry and invite the artist; they confirm 18+ to share it', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-stinv-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}`, MAIL_GAP_MS: '0' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const staff = { 'x-staff-token': ADMIN };
  const call = async (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
  };
  const wait = async (n) => { for (let i = 0; i < 100 && sent.length < n; i++) await new Promise((x) => setTimeout(x, 15)); };
  assert.equal((await call('/api/stage/invite', { method: 'POST', body: { email: 'c@folk.test', act: 'Clary' } })).status, 401);
  const inv = await call('/api/stage/invite', { method: 'POST', headers: staff, body: { email: 'c@folk.test', name: 'Clary', act: 'Clary Campbell Carter', plays: 'Folk singer-songwriter', from: 'London', bio: 'An independent folk singer from London.', links: ['https://instagram.com/clary'], paths: ['showcase'], enquiry: 'ENQ-4LC8BL' } });
  assert.equal(inv.status, 200);
  assert.equal(inv.body.artist.enquiry, 'ENQ-4LC8BL');
  await wait(1);
  const mail = sent.at(-1);
  assert.match(mail.subject, /Your TAM artist page: Clary Campbell Carter/);
  assert.match(mail.html, /pledge to see you live/);
  assert.match(mail.html, /best show format/);
  const slug = inv.body.artist.slug;
  assert.equal((await call(`/stage/${slug}`)).status, 404); // not shareable until they confirm 18+
  // the artist opens the link and confirms 18+: the page can be shared, with pledges
  const t0 = /stage\/in\?t=([\w-]+)/.exec(mail.html)[1];
  const cookie = (await call('/api/stage/in', { method: 'POST', body: { t: t0 } })).headers.get('set-cookie').split(';')[0];
  assert.match((await call('/api/stage/me/adults', { method: 'POST', cookie, body: {} })).body.error, /Tick the box/);
  assert.equal((await call('/api/stage/me/adults', { method: 'POST', cookie, body: { confirm: true } })).body.artist.shareable, true);
  assert.equal((await call(`/stage/${slug}`)).status, 200);
  assert.equal((await call(`/api/stage/${slug}/pledge`, { method: 'POST', body: { email: 'fan@x.test', consent: true } })).body.pledged, 1);
  // inviting again keeps their own edits
  await call('/api/stage/me', { method: 'POST', cookie, body: { bio: 'My own words about my folk songs, written by me for my page on the TAM Stage.' } });
  await call('/api/stage/invite', { method: 'POST', headers: staff, body: { email: 'c@folk.test', bio: 'TAM words', send: false } });
  assert.match((await call('/api/stage/me', { cookie })).body.artist.bio, /My own words/);
  // a youth performer stays private, and can't be made shareable by the parent's tick
  const y = await call('/api/stage/invite', { method: 'POST', headers: staff, body: { email: 'p@x.test', name: 'Mondli', act: 'Youth singer', age: 'under18', paths: ['jom'] } });
  await wait(sent.length);
  assert.match(sent.at(-1).html, /stays private until TAM has checked it/);
  assert.equal((await call(`/stage/${y.body.artist.slug}`)).status, 404);
});

test('an artist says they still want to play, and gets a new link with just their email', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-still-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}`, MAIL_GAP_MS: '0' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const staff = { 'x-staff-token': ADMIN };
  const call = async (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
  };
  const wait = async (n) => { for (let i = 0; i < 100 && sent.length < n; i++) await new Promise((x) => setTimeout(x, 15)); };
  await call('/api/stage/invite', { method: 'POST', headers: staff, body: { email: 'band@x.test', act: 'The Band', send: false } });
  // a stranger's email gets the same answer and no email; the artist's gets a link
  assert.equal((await call('/api/stage/link', { method: 'POST', body: { email: 'nobody@x.test' } })).body.ok, true);
  assert.equal(sent.length, 0);
  await call('/api/stage/link', { method: 'POST', body: { email: 'band@x.test' } });
  await wait(1);
  const t0 = /stage\/in\?t=([\w-]+)/.exec(sent[0].html)[1];
  const cookie = (await call('/api/stage/in', { method: 'POST', body: { t: t0 } })).headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/stage/me', { cookie })).body.artist.stillPlay, null);
  const r = await call('/api/stage/me/still-play', { method: 'POST', cookie, body: { when: 'Friday nights in January', note: 'Now a five-piece' } });
  assert.equal(r.body.artist.stillPlay.when, 'Friday nights in January');
  const a = (await call('/api/stage/manage', { headers: staff })).body.artists.find((x) => x.act === 'The Band');
  assert.equal(a.stillPlay.note, 'Now a five-piece');
  assert.match((await call('/stage/in')).body, /Get a link to your page/);
});

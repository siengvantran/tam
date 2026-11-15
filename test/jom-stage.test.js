// JOM parents opt their act in to a TAM artist profile on the TAM Stage: it
// shows only what TAM approved on the JOM page, follows it, starts at the
// Open Night planet, waits for TAM's review, and can be switched off.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';

test('JOM parents opt in to a TAM artist profile; it follows the approved JOM page and TAM reviews it', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-jomst-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}` } });
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

  // Sarah's claim for Jessica Quilter, approved; she signs in
  await call('/api/jom/jessica-quilter/claim', { method: 'POST', body: { name: 'Sarah', email: 'sarah@family.test', relation: 'parent', consent: true } });
  const claim = (await call('/api/jom/manage', { headers: staff })).body.claims[0];
  await call(`/api/jom/manage/claims/${claim.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((x) => setTimeout(x, 15));
  const cookie = (await call('/api/jom/in', { method: 'POST', body: { t: /jom\/in\?t=([\w-]+)/.exec(sent.at(-1).html)[1] } })).headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/jom/me', { cookie })).body.acts[0].stage, null);

  // opting in needs the consent tick, and only for their own act
  assert.match((await call('/api/jom/me/jessica-quilter/stage', { method: 'POST', cookie, body: { optIn: true } })).body.error, /Tick the box/);
  assert.equal((await call('/api/jom/me/colette/stage', { method: 'POST', cookie, body: { optIn: true, consent: true } })).status, 403);
  const opt = await call('/api/jom/me/jessica-quilter/stage', { method: 'POST', cookie, body: { optIn: true, consent: true } });
  assert.equal(opt.status, 200);
  assert.equal(opt.body.stage.status, 'review');
  assert.equal(opt.body.stage.planet, 'Open Night');
  const slug = opt.body.stage.slug;

  // not public until TAM reviews it; it's on the A&R board, marked JOM
  assert.equal((await call(`/stage/${slug}`)).status, 404);
  let board = (await call('/api/stage/manage', { headers: staff })).body;
  const ar = board.artists.find((x) => x.slug === slug);
  assert.equal(ar.source, 'JOM opt-in');
  assert.equal(ar.jom.slug, 'jessica-quilter');
  assert.equal(ar.suggest.action, 'review');
  // the parent's email is never public, and the parent can't get into the Stage editor with it
  assert.equal(ar.email, 'sarah@family.test');
  await call('/api/stage/apply', { method: 'POST', body: { name: 'Someone', email: 'sarah@family.test', act: 'Another act', consent: true } });
  assert.equal(app.ctx.db.arArtists.filter((x) => x.email === 'sarah@family.test').length, 2); // a separate act, not the JOM profile

  // TAM puts it live: the JOM badge and a link back to the JOM page
  await call(`/api/stage/manage/${ar.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  let pg = (await call(`/stage/${slug}`)).body;
  assert.match(pg, /A young artist with JOM Youth Music/);
  assert.match(pg, /href="\/jom\/jessica-quilter"/);
  assert.doesNotMatch(pg, /sarah@family\.test/);
  assert.match((await call('/stage')).body, /Jessica Quilter/);

  // an approved JOM update flows to the profile (an unapproved one doesn't)
  await call('/api/jom/me/jessica-quilter', { method: 'POST', cookie, body: { name: 'Jessica Quilter', bio: 'Jessica sings her own songs on keys.', posts: [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] } });
  assert.doesNotMatch((await call(`/stage/${slug}`)).body, /sings her own songs/);
  const change = (await call('/api/jom/manage', { headers: staff })).body.changes[0];
  await call(`/api/jom/manage/changes/${change.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  pg = (await call(`/stage/${slug}`)).body;
  assert.match(pg, /Jessica sings her own songs on keys\./);
  assert.match(pg, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match((await call('/api/jom/manage', { headers: staff })).body.acts.find((a) => a.slug === 'jessica-quilter').stage.status, /live/);

  // opting out takes the profile down; opting in again brings it back for review
  await call('/api/jom/me/jessica-quilter/stage', { method: 'POST', cookie, body: { optIn: false } });
  assert.equal((await call(`/stage/${slug}`)).status, 404);
  assert.equal((await call('/api/jom/me', { cookie })).body.acts[0].stage, null);
  const back = await call('/api/jom/me/jessica-quilter/stage', { method: 'POST', cookie, body: { optIn: true, consent: true } });
  assert.equal(back.body.stage.slug, slug);
  assert.equal(back.body.stage.status, 'review');
});

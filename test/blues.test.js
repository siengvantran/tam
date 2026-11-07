// The Great British Blues Jam: Saturdays, sign-ups, the wall, the big screen, and running it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';

async function start(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-blues-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, SITE_URL: 'http://tam.test', EVENTBRITE_SYNC: 'off', PIN_MODERATION: 'on', ...env } });
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let n = 0;
  const call = async (p, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + p, { method, redirect: 'manual', headers: { 'x-forwarded-for': `10.8.${(n >> 8) & 255}.${n++ & 255}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return { app, call, close: () => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }) };
}

test('The Great British Blues Jam: sign up to jam, the wall, the screen, and running it', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const H = { 'x-staff-token': ADMIN };

  // pages
  assert.equal((await s.call('/great-british-blues-jam')).status, 200);
  assert.equal((await s.call('/blues')).headers.get('location'), '/great-british-blues-jam');
  const screen = await s.call('/great-british-blues-jam/screen');
  assert.match(screen.body, /The Great British Blues Jam/);
  assert.match(screen.body, /tam-logo-640\.png/);
  assert.equal(screen.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match((await s.call('/great-british-blues-jam/qr.svg')).body, /<svg/);
  assert.match((await s.call('/sitemap.xml')).body, /great-british-blues-jam/);

  // Saturdays
  const pub = (await s.call('/api/blues')).body;
  assert.ok(pub.nights.length >= 6);
  for (const n of pub.nights) assert.equal(new Date(`${n.date}T12:00:00Z`).getUTCDay(), 6, n.date);
  const sat = pub.nights[1].date; // next week's jam: open for sign-ups
  assert.ok(pub.instruments.includes('Harmonica'));

  // staff set the host and house band
  assert.equal((await s.call(`/api/blues/night/${sat}`, { method: 'POST', body: { host: 'X' } })).status, 401);
  await s.call(`/api/blues/night/${sat}`, { method: 'POST', headers: H, body: { host: 'Big Mama Blue', band: [{ name: 'Ray', instrument: 'Drums' }, { name: 'Lou', instrument: 'Bass' }, { name: '' }], cap: 3, note: 'Amps and kit provided.' } });
  assert.equal((await s.call(`/api/blues/night/2026-11-10`, { method: 'POST', headers: H, body: { host: 'X' } })).status, 400); // a Tuesday

  // sign up
  const a = await s.call('/api/blues/signup', { method: 'POST', body: { date: sat, name: 'Muddy', instrument: 'Guitar', email: 'muddy@example.com' } });
  assert.equal(a.status, 201);
  assert.equal(a.body.position, 1);
  assert.equal((await s.call('/api/blues/signup', { method: 'POST', body: { date: sat, name: 'Muddy', instrument: 'Guitar' } })).status, 409); // already on
  assert.equal((await s.call('/api/blues/signup', { method: 'POST', body: { date: sat, name: 'Nobody' } })).status, 400); // no instrument
  assert.equal((await s.call('/api/blues/signup', { method: 'POST', body: { date: '2026-11-10', name: 'X', instrument: 'Bass' } })).status, 400); // not a Saturday
  const b = await s.call('/api/blues/signup', { method: 'POST', body: { date: sat, name: 'Howlin', instrument: 'Other', other: 'Washboard' } });
  assert.equal(b.status, 201);
  await s.call('/api/blues/signup', { method: 'POST', body: { date: sat, name: 'Etta', instrument: 'Vocals' } });
  assert.equal((await s.call('/api/blues/signup', { method: 'POST', body: { date: sat, name: 'Late', instrument: 'Keys' } })).status, 409); // the list is full (3)

  const night = (await s.call('/api/blues')).body.nights.find((n) => n.date === sat);
  assert.equal(night.host, 'Big Mama Blue');
  assert.deepEqual(night.band, [{ name: 'Ray', instrument: 'Drums' }, { name: 'Lou', instrument: 'Bass' }]);
  assert.deepEqual(night.jammers.map((j) => [j.name, j.instrument]), [['Muddy', 'Guitar'], ['Howlin', 'Washboard'], ['Etta', 'Vocals']]);
  assert.equal(night.spotsLeft, 0);
  assert.doesNotMatch(JSON.stringify(night), /muddy@example\.com/); // emails are for staff only

  // cancelling needs your own key
  assert.equal((await s.call(`/api/blues/signup/${b.body.id}/cancel`, { method: 'POST', body: { key: 'wrong' } })).status, 404);
  assert.equal((await s.call(`/api/blues/signup/${b.body.id}/cancel`, { method: 'POST', body: { key: b.body.key } })).status, 200);

  // the wall waits for a staff OK while moderation is on
  assert.equal((await s.call('/api/blues/wall', { method: 'POST', body: { name: 'Fan', message: 'See www.spam.com' } })).status, 400);
  const w = await s.call('/api/blues/wall', { method: 'POST', body: { name: 'Fan', message: 'That harmonica solo!' } });
  assert.equal(w.body.status, 'pending');
  assert.equal((await s.call('/api/blues')).body.wall.length, 0);

  // running it
  const m = (await s.call('/api/blues/manage', { headers: H })).body;
  const mn = m.nights.find((n) => n.date === sat);
  assert.equal(mn.signups.find((x) => x.name === 'Muddy').email, 'muddy@example.com');
  const etta = mn.signups.find((x) => x.name === 'Etta');
  await s.call(`/api/blues/signup/${etta.id}/staff`, { method: 'POST', headers: H, body: { action: 'up' } });
  await s.call(`/api/blues/signup/${etta.id}/staff`, { method: 'POST', headers: H, body: { action: 'stage' } });
  const post = m.wall.find((x) => x.status === 'pending');
  await s.call(`/api/blues/wall/${post.id}`, { method: 'POST', headers: H, body: { status: 'shown' } });
  const after = (await s.call('/api/blues')).body;
  assert.deepEqual(after.nights.find((n) => n.date === sat).jammers.map((j) => j.name), ['Etta', 'Muddy']);
  assert.equal(after.nights.find((n) => n.date === sat).onStage.name, 'Etta');
  assert.equal(after.wall[0].message, 'That harmonica solo!');
  assert.equal((await s.call('/api/blues/manage')).status, 401);

  // the screen shows the jam day (this Saturday, or the next)
  const sc = (await s.call('/api/blues/screen')).body;
  assert.equal(sc.date, pub.nights[0].date);
  assert.equal(sc.signUp, 'tam.test/blues');
  assert.ok(Array.isArray(sc.next) && Array.isArray(sc.wall));
  assert.equal(sc.wall[0].name, 'Fan');
});

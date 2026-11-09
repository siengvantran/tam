// Open Mic: the hub, the nights' pages, the subdomain front doors, and JOM
// (profiles that wait for staff, follows, cheers, and the desk).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function start(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-openmic-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, SITE_URL: 'http://tam.test', EVENTBRITE_SYNC: 'off', ...env } });
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let n = 0;
  const call = async (p, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + p, { method, redirect: 'manual', headers: { 'x-forwarded-for': `10.9.${(n >> 8) & 255}.${n++ & 255}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return { app, dir, call, close: () => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }) };
}

test('Open Mic: the hub, the nights and the front doors', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const hub = await s.call('/open-mic');
  assert.equal(hub.status, 200);
  assert.match(hub.body, /International Open Mic/);
  assert.match(hub.body, /Singers at TAM/);
  assert.match(hub.body, /Junior Open Mic/);
  assert.match(hub.body, /tam-logo-640\.png/); // the official logo
  assert.match(hub.body, /href="\/jom"/);
  assert.match(hub.body, /\/events\/|great-british|announced soon/); // dates come from TAM's own nights
  assert.equal((await s.call('/open-mic/international')).status, 200);
  assert.match((await s.call('/open-mic/singers')).body, /Singers at TAM/);
  assert.equal((await s.call('/openmic')).headers.get('location'), '/open-mic');
  assert.match((await s.call('/sitemap.xml')).body, /\/open-mic/);

  // jom.tam.tv, openmic.tam.tv and singers.tam.tv land on their pages
  for (const [host, to] of [['jom.tam.tv', '/jom'], ['openmic.tam.tv', '/open-mic/international'], ['singers.tam.tv', '/open-mic/singers']]) {
    const r = await s.call('/', { headers: { 'x-forwarded-host': host } });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), `http://tam.test${to}`);
  }
  assert.equal((await s.call('/healthz', { headers: { 'x-forwarded-host': 'jom.tam.tv' } })).status, 200);

  const jom = await s.call('/jom');
  assert.equal(jom.status, 200);
  assert.match(jom.body, /\/js\/jom\.js/);
  assert.match(jom.body, /tam-mark-96\.png/);
});

test('JOM: a profile waits for staff, then fans follow and cheer', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const H = { 'x-staff-token': ADMIN };
  const FAN = 'fan_aaaaaaaaaaaaaaaaaaaaaa';
  const profile = { name: 'Nova', act: 'Singer and guitarist', bio: 'Loves soul.', genres: 'Soul, Pop', setlist: ['One', 'Two'], stage: ['Junior Open Mic, TAM'],
    links: [{ label: 'Video', url: 'https://example.com/v' }], hue: 270, photo: PNG };

  // a parent or guardian has to agree, with an email only staff see
  assert.equal((await s.call('/api/jom/profile', { method: 'POST', body: { ...profile, guardianEmail: 'mum@example.com' } })).status, 400);
  assert.equal((await s.call('/api/jom/profile', { method: 'POST', body: { ...profile, guardianOk: true } })).status, 400);
  assert.equal((await s.call('/api/jom/profile', { method: 'POST', body: { ...profile, guardianOk: true, guardianEmail: 'mum@example.com', links: [{ label: 'x', url: 'javascript:alert(1)' }] } })).status, 400);
  const made = await s.call('/api/jom/profile', { method: 'POST', body: { ...profile, guardianOk: true, guardianEmail: 'mum@example.com' } });
  assert.equal(made.status, 201);
  const { id, key } = made.body;
  assert.equal(made.body.own.state, 'waiting');
  assert.match(made.body.own.photo, /^\/uploads\/jom-/);
  assert.equal((await s.call(made.body.own.photo)).status, 200);

  // nobody sees it yet, except its owner
  let pub = await s.call('/api/jom', { headers: { 'x-jom-fan': FAN } });
  assert.equal(pub.body.artists.length, 0);
  assert.equal(pub.body.own, null);
  assert.ok(!JSON.stringify(pub.body).includes('mum@example.com'));
  assert.equal((await s.call('/api/jom', { headers: { 'x-jom-own': `${id}.${key}` } })).body.own.name, 'Nova');
  assert.equal((await s.call('/api/jom', { headers: { 'x-jom-own': `${id}.wrong` } })).body.own, null);
  assert.equal((await s.call('/api/jom/fan', { method: 'POST', body: { fan: FAN, artist: id, follow: true } })).status, 404);

  // the desk is staff only
  assert.equal((await s.call('/api/jom/manage')).status, 401);
  assert.equal((await s.call(`/api/jom/manage/${id}`, { method: 'POST', body: { action: 'approve' } })).status, 401);
  const desk = await s.call('/api/jom/manage', { headers: H });
  assert.equal(desk.body.artists[0].guardianEmail, 'mum@example.com');
  assert.equal(desk.body.artists[0].status, 'pending');
  assert.equal((await s.call(`/api/jom/manage/${id}`, { method: 'POST', headers: H, body: { action: 'approve' } })).status, 200);

  pub = await s.call('/api/jom');
  assert.equal(pub.body.artists.length, 1);
  assert.equal(pub.body.artists[0].name, 'Nova');
  assert.deepEqual(pub.body.artists[0].genres, ['Soul', 'Pop']);
  assert.ok(!JSON.stringify(pub.body).includes('mum@example.com'));
  assert.ok(!JSON.stringify(pub.body).includes('keyHash'));

  // follow and cheer: counted once per fan, and undone
  let f = await s.call('/api/jom/fan', { method: 'POST', body: { fan: FAN, artist: id, follow: true } });
  assert.equal(f.body.followers, 1);
  f = await s.call('/api/jom/fan', { method: 'POST', body: { fan: FAN, artist: id, follow: true } });
  assert.equal(f.body.followers, 1);
  f = await s.call('/api/jom/fan', { method: 'POST', body: { fan: FAN, artist: id, cheer: 'encore', on: true } });
  assert.equal(f.body.cheers.encore, 1);
  assert.equal((await s.call('/api/jom/fan', { method: 'POST', body: { fan: FAN, artist: id, cheer: 'nonsense', on: true } })).status, 400);
  assert.equal((await s.call('/api/jom/fan', { method: 'POST', body: { fan: 'short', artist: id, follow: true } })).status, 400);
  pub = await s.call('/api/jom', { headers: { 'x-jom-fan': FAN } });
  assert.equal(pub.body.artists[0].followers, 1);
  assert.equal(pub.body.mine.follows[id], true);
  f = await s.call('/api/jom/fan', { method: 'POST', body: { fan: FAN, artist: id, follow: false } });
  assert.equal(f.body.followers, 0);

  // an edit to a live profile waits; the approved version stays up
  assert.equal((await s.call(`/api/jom/profile/${id}`, { method: 'POST', body: { ...profile, name: 'Nova Star', guardianOk: true, key: 'wrong' } })).status, 404);
  const edit = await s.call(`/api/jom/profile/${id}`, { method: 'POST', body: { name: 'Nova Star', act: 'Singer', guardianOk: true, key } });
  assert.equal(edit.body.own.state, 'changes-waiting');
  assert.equal(edit.body.own.name, 'Nova Star');
  assert.match(edit.body.own.photo, /^\/uploads\/jom-/); // kept
  assert.equal((await s.call('/api/jom')).body.artists[0].name, 'Nova');
  await s.call(`/api/jom/manage/${id}`, { method: 'POST', headers: H, body: { action: 'approve' } });
  assert.equal((await s.call('/api/jom')).body.artists[0].name, 'Nova Star');

  // staff hide it, show it, and add an artist themselves (live at once)
  await s.call(`/api/jom/manage/${id}`, { method: 'POST', headers: H, body: { action: 'hide' } });
  assert.equal((await s.call('/api/jom')).body.artists.length, 0);
  assert.equal((await s.call('/api/jom', { headers: { 'x-jom-own': `${id}.${key}` } })).body.own.state, 'hidden');
  await s.call(`/api/jom/manage/${id}`, { method: 'POST', headers: H, body: { action: 'show' } });
  assert.equal((await s.call('/api/jom/manage', { method: 'POST', body: { name: 'Sneaky' } })).status, 401);
  const added = await s.call('/api/jom/manage', { method: 'POST', headers: H, body: { name: 'Rio', act: 'Drummer' } });
  assert.equal(added.status, 201);
  assert.deepEqual((await s.call('/api/jom')).body.artists.map((a) => a.name).sort(), ['Nova Star', 'Rio']);

  // the family takes their profile down: gone, with its photo
  const photo = (await s.call('/api/jom')).body.artists.find((a) => a.name === 'Nova Star').photo;
  assert.equal((await s.call(`/api/jom/profile/${id}/remove`, { method: 'POST', body: { key: 'wrong' } })).status, 404);
  assert.equal((await s.call(`/api/jom/profile/${id}/remove`, { method: 'POST', body: { key } })).status, 200);
  assert.deepEqual((await s.call('/api/jom')).body.artists.map((a) => a.name), ['Rio']);
  assert.equal((await s.call(photo)).status, 404);

  assert.equal((await s.call('/jom/manage')).status, 200);
  await s.app.store.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(s.dir, 'db.json'), 'utf8'));
  assert.equal(saved.openMic.artists.length, 1);
});

// JOM: parents add Instagram, TikTok, Facebook and YouTube posts, and their
// own photos and videos, to their act's page. Nothing goes on until TAM approves.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';
const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64')}`;
const MP4 = Buffer.concat([Buffer.from('000000186674797069736f6d', 'hex'), Buffer.alloc(4000, 1)]);

test('JOM parents add posts, photos and videos; TAM checks them before they go on the page', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-jomm-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}` } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const staff = { 'x-staff-token': ADMIN };
  const call = async (p, { method = 'GET', body, raw, type, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(type ? { 'content-type': type } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: raw || (body ? JSON.stringify(body) : undefined) });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
  };

  // a parent claims Colette's page and TAM approves the claim
  await call('/api/jom/colette/claim', { method: 'POST', body: { name: 'Pat', email: 'pat@family.test', relation: 'parent', consent: true } });
  const claim = (await call('/api/jom/manage', { headers: staff })).body.claims[0];
  await call(`/api/jom/manage/claims/${claim.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((x) => setTimeout(x, 15));
  const signin = await call('/api/jom/in', { method: 'POST', body: { t: /jom\/in\?t=([\w-]+)/.exec(sent.at(-1).html)[1] } });
  const cookie = signin.headers.get('set-cookie').split(';')[0];

  // checking a link, uploading a photo and a video
  assert.match((await call('/api/jom/me/colette/check-post', { method: 'POST', cookie, body: { url: 'https://example.com/x' } })).body.error, /Instagram post or reel/);
  assert.equal((await call('/api/jom/me/colette/check-post', { method: 'POST', cookie, body: { url: 'https://www.tiktok.com/@colette/video/7301234567890123456' } })).body.post.kind, 'tiktok');
  assert.equal((await call('/api/jom/me/the-whippets/video', { method: 'POST', cookie, raw: MP4, type: 'video/mp4' })).status, 403); // not their act
  const photo = (await call('/api/jom/me/colette/photo', { method: 'POST', cookie, body: { photo: PNG } })).body.photo;
  const video = (await call('/api/jom/me/colette/video', { method: 'POST', cookie, raw: MP4, type: 'video/mp4' })).body.video;
  assert.match(video, /^\/uploads\/jom-colette-[0-9a-f]+\.mp4$/);

  // captions can't carry contact details; someone else's upload is ignored
  const posts = [
    { url: 'https://www.tiktok.com/@colette/video/7301234567890123456', caption: 'First song' },
    { url: 'https://www.instagram.com/reel/C9abcDEFghi/' },
    { kind: 'image', src: photo, caption: 'Soundcheck' },
    { kind: 'video', src: video, caption: 'At TAM' },
    { kind: 'image', src: '/uploads/jom-yellowhammer-abcdef.jpg' },
  ];
  assert.match((await call('/api/jom/me/colette', { method: 'POST', cookie, body: { bio: 'Hi', posts: [{ url: posts[0].url, caption: 'call 07700 900123' }] } })).body.error, /captions/);
  const sentUpdate = await call('/api/jom/me/colette', { method: 'POST', cookie, body: { name: 'Colette', bio: 'Colette sings and plays ukulele.', posts } });
  assert.equal(sentUpdate.status, 201);
  assert.deepEqual(sentUpdate.body.pending.changes.posts.map((p) => p.kind), ['tiktok', 'instagram', 'image', 'video']);

  // nothing on the page until TAM approves; staff see every post first
  assert.doesNotMatch((await call('/jom/colette')).body, /tiktok\.com\/embed/);
  const change = (await call('/api/jom/manage', { headers: staff })).body.changes[0];
  assert.equal(change.changes.posts.length, 4);
  await call(`/api/jom/manage/changes/${change.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  const live = (await call('/jom/colette')).body;
  assert.match(live, /From Colette/);
  assert.match(live, /tiktok\.com\/embed\/v2\/7301234567890123456/);
  assert.match(live, /instagram\.com\/reel\/C9abcDEFghi\/embed/);
  assert.ok(live.includes(`<img src="${photo}"`));
  assert.ok(live.includes(`<video src="${video}"`));

  // a later approved update that drops the video deletes the file
  const now = (await call('/api/jom/me', { cookie })).body.acts[0].posts;
  await call('/api/jom/me/colette', { method: 'POST', cookie, body: { name: 'Colette', bio: 'Colette sings and plays ukulele.', posts: now.filter((p) => p.kind !== 'video').map((p) => ({ id: p.id, caption: p.caption })) } });
  const change2 = (await call('/api/jom/manage', { headers: staff })).body.changes[0];
  await call(`/api/jom/manage/changes/${change2.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  assert.equal((await fetch(`${B}${video}`)).status, 404);
  assert.doesNotMatch((await call('/jom/colette')).body, /<video src=/);
});

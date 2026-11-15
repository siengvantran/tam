// Artists' posts: Instagram, TikTok, Facebook and YouTube links, and their own
// photos and videos, on Sunday Showcase walls and TAM Stage pages.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { postOf, embedHtml } from '../src/lib/media-posts.js';

const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64')}`;
const MP4 = Buffer.concat([Buffer.from('000000186674797069736f6d', 'hex'), Buffer.alloc(4000, 1)]);

test('links from all four networks become embeds; anything else is refused', () => {
  assert.deepEqual(postOf('https://www.instagram.com/reel/C9abcDEFghi/?igsh=x'), { kind: 'instagram', postId: 'C9abcDEFghi', postType: 'reel' });
  assert.deepEqual(postOf('https://www.tiktok.com/@scramblegut/video/7301234567890123456?lang=en'), { kind: 'tiktok', videoId: '7301234567890123456' });
  assert.equal(postOf('https://youtu.be/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  const fbv = postOf('https://www.facebook.com/TAM/videos/1234567890/');
  assert.equal(fbv.kind, 'facebook'); assert.equal(fbv.video, true);
  assert.equal(postOf('https://www.facebook.com/TAM/posts/pfbid0abc').video, false);
  assert.equal(postOf('https://example.com/x'), null);
  assert.equal(postOf('javascript:alert(1)'), null);
  assert.throws(() => postOf('https://vm.tiktok.com/ZGabc/'), /full link/);
  assert.match(embedHtml(postOf('https://www.tiktok.com/@a/video/7301234567890123456')), /tiktok\.com\/embed\/v2\/7301234567890123456/);
  assert.match(embedHtml(fbv), /facebook\.com\/plugins\/video\.php\?href=https%3A%2F%2Fwww\.facebook\.com%2FTAM%2Fvideos%2F1234567890/);
  assert.match(embedHtml({ kind: 'image', src: '/uploads/a.jpg', caption: '<b>' }), /alt="&lt;b&gt;"/);
});

test('artists add posts, photos and videos to their TAM Stage page and Sunday Showcase wall', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-media-')), ADMIN_TOKEN: 'admin-token-for-tests', EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}` } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const staff = { 'x-staff-token': 'admin-token-for-tests' };
  const call = async (p, { method = 'GET', body, raw, type, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(type ? { 'content-type': type } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: raw || (body ? JSON.stringify(body) : undefined) });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
  };

  // a TAM Stage artist
  await call('/api/stage/apply', { method: 'POST', body: { name: 'Jo', email: 'jo@band.test', act: 'Jo Waves', consent: true } });
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((x) => setTimeout(x, 15));
  const tok = /stage\/in\?t=([\w-]+)/.exec(sent[0].html)[1];
  const cookie = (await fetch(`${B}/api/stage/in`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: tok }) })).headers.get('set-cookie').split(';')[0];
  assert.match((await call('/api/stage/me/post', { method: 'POST', cookie, body: { url: 'https://example.com/x' } })).body.error, /Instagram post or reel, a TikTok, a Facebook/);
  await call('/api/stage/me/post', { method: 'POST', cookie, body: { url: 'https://www.tiktok.com/@jowaves/video/7301234567890123456', caption: 'Live at the open mic' } });
  await call('/api/stage/me/post', { method: 'POST', cookie, body: { url: 'https://www.instagram.com/p/C9abcDEFghi/' } });
  await call('/api/stage/me/post-photo', { method: 'POST', cookie, body: { image: PNG, caption: 'Soundcheck' } });
  assert.equal((await call('/api/stage/me/post-video?caption=First%20gig', { method: 'POST', cookie, raw: MP4, type: 'text/plain' })).status, 400); // not a video type
  const v = await call('/api/stage/me/post-video?caption=First%20gig', { method: 'POST', cookie, raw: MP4, type: 'video/mp4' });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const posts = v.body.artist.posts;
  assert.deepEqual(posts.map((p) => p.kind), ['video', 'image', 'instagram', 'tiktok']);
  const video = posts[0].src;
  assert.match(video, /^\/uploads\/stage-.+\.mp4$/);
  assert.equal((await fetch(`${B}${video}`, { headers: { range: 'bytes=0-99' } })).status, 206); // plays on iPhones
  // live: they show on the microverse
  const a = app.ctx.db.arArtists[0]; a.status = 'live';
  const pg = (await call(`/stage/${a.slug}`)).body;
  assert.match(pg, /From Jo Waves/);
  assert.match(pg, /tiktok\.com\/embed\/v2\/7301234567890123456/);
  assert.match(pg, new RegExp(`<video src="${video}"`));
  assert.match(pg, /Live at the open mic/);
  // removing a post deletes their file
  await call(`/api/stage/me/post/${posts[0].id}/remove`, { method: 'POST', cookie, body: {} });
  assert.equal((await fetch(`${B}${video}`)).status, 404);

  // a Sunday Showcase act's wall (as staff here; artists use their sign-in link)
  app.ctx.db.showcases = { '2026-12-27': { count: 1, acts: [{ slug: 'jo-waves', name: 'Jo Waves', links: [], media: [] }] } };
  const base = '/api/showcases/2026-12-27/act/jo-waves/wall';
  assert.equal((await call(`${base}/video`, { method: 'POST', raw: MP4, type: 'video/mp4' })).status, 403);
  assert.equal((await call(`${base}/post`, { method: 'POST', headers: staff, body: { url: 'https://www.facebook.com/jowaves/videos/1234567890/' } })).status, 201);
  assert.equal((await call(`${base}/photo`, { method: 'POST', headers: staff, body: { image: PNG, caption: 'Hi' } })).status, 201);
  assert.equal((await call(`${base}/video`, { method: 'POST', headers: staff, raw: MP4, type: 'video/quicktime' })).status, 201);
  const wall = await call(`${base}`, { headers: staff });
  assert.deepEqual(wall.body.items.map((w) => w.kind).sort(), ['facebook', 'image', 'video']);
  assert.match(wall.body.items.find((w) => w.kind === 'video').src, /\.mov$/);
});

// The TAM Stage: every request to play becomes an act with a microverse;
// artists vet their own page; staff approve, rate and move them up; fans
// boost them (TAM Club members earn points and a scout bonus).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';
const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64')}`;

async function setup(t) {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-stage-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}`, MAIL_GAP_MS: '0' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const call = async (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: type.includes('json') ? await r.json() : await r.text() };
  };
  const wait = async (n) => { for (let i = 0; i < 100 && sent.length < n; i++) await new Promise((x) => setTimeout(x, 15)); };
  return { app, call, sent, wait, staff: { 'x-staff-token': ADMIN } };
}

test('a request to play becomes a microverse: the artist vets their page, staff approve, rate and move them up; fans boost', async (t) => {
  const { app, call, sent, wait, staff } = await setup(t);

  // the Sunday Showcase call-out (an enquiry) starts a TAM Stage page too
  await call('/api/enquiries', { method: 'POST', body: { kind: 'perform', name: 'Jo', email: 'jo@band.test', company: 'Jo and the Waves', message: 'Soul trio. https://instagram.com/jowaves', pathway: 'showcase' } });
  await wait(1);
  const a0 = app.ctx.db.arArtists.find((a) => a.email === 'jo@band.test');
  assert.ok(a0, 'an act was made');
  assert.equal(a0.source, 'Sunday Showcase call-out');
  assert.deepEqual(a0.links, ['https://instagram.com/jowaves']);
  const mail = sent.find((m) => m.to[0] === 'jo@band.test' && /TAM Stage/.test(m.subject));
  assert.ok(mail, 'they get a link to build their page');

  // not public until TAM puts it live
  assert.equal((await call(`/stage/${a0.slug}`)).status, 404);

  // the emailed link signs them in
  const t0 = /stage\/in\?t=([\w-]+)/.exec(mail.html)[1];
  const signin = await call('/api/stage/in', { method: 'POST', body: { t: t0 } });
  assert.equal(signin.status, 200);
  const cookie = signin.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/stage/in', { method: 'POST', body: { t: t0 } })).status, 400); // once only

  // they vet their own page: they can't send it in until the checklist is done
  let me = (await call('/api/stage/me', { cookie })).body.artist;
  assert.equal(me.canSubmit, false);
  assert.match((await call('/api/stage/me/submit', { method: 'POST', body: {}, cookie })).body.error, /Still to do/);
  assert.equal((await call('/api/stage/me', { method: 'POST', cookie, body: { youtube: 'not a link' } })).status, 400);
  me = (await call('/api/stage/me', { method: 'POST', cookie, body: { plays: 'Soul trio', bio: 'We are a soul trio from Peckham. '.repeat(4), youtube: 'https://youtu.be/dQw4w9WgXcQ', vibe: 'disco', ownWork: true, links: 'https://instagram.com/jowaves\njavascript:alert(1)' } })).body.artist;
  assert.deepEqual(me.links, ['https://instagram.com/jowaves']);
  me = (await call('/api/stage/me/photo', { method: 'POST', cookie, body: { photo: PNG } })).body.artist;
  assert.equal(me.canSubmit, true);
  assert.equal((await call('/api/stage/me/submit', { method: 'POST', body: {}, cookie })).body.artist.status, 'review');
  assert.equal((await call(`/stage/${me.slug}`, { cookie })).status, 200); // they can preview it

  // staff only
  assert.equal((await call('/api/stage/manage')).status, 401);
  let board = (await call('/api/stage/manage', { headers: staff })).body;
  let a = board.artists.find((x) => x.slug === me.slug);
  assert.equal(a.suggest.action, 'review');
  a = (await call(`/api/stage/manage/${a.id}`, { method: 'POST', headers: staff, body: { action: 'approve', message: 'Love the video.' } })).body.artist;
  assert.equal(a.status, 'live');
  assert.equal(a.stage, 1);
  await wait(sent.length + 1);
  assert.ok(sent.some((m) => /page is live/.test(m.subject)));

  // live: the microverse, and on /stage
  const pg = await call(`/stage/${me.slug}`);
  assert.equal(pg.status, 200);
  assert.match(pg.body, /class="mv"/);
  assert.match(pg.body, /Jo and the Waves/);
  assert.match(pg.body, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.doesNotMatch(pg.body, /jo@band\.test/);
  assert.match((await call('/stage')).body, /Jo and the Waves/);

  // fans boost: once a day each; TAM Club members earn a point
  const id = 'browser-id-0123456789';
  assert.equal((await call(`/api/stage/${me.slug}/boost`, { method: 'POST', body: { id } })).body.boosts, 1);
  assert.equal((await call(`/api/stage/${me.slug}/boost`, { method: 'POST', body: { id } })).body.already, true);
  // a club member
  const before = sent.length;
  await call('/api/club/join', { method: 'POST', body: { email: 'fan@x.test', name: 'Sam', consent: true } });
  await wait(before + 1);
  const ct = /confirm\?t=([\w-]+)/.exec(sent.slice(before).find((m) => m.to[0] === 'fan@x.test').html)[1];
  const fan = (await call('/api/club/confirm', { method: 'POST', body: { t: ct } })).headers.get('set-cookie').split(/,(?=\s*tam_)/).map((x) => x.split(';')[0].trim()).join('; ');
  const fb = await call(`/api/stage/${me.slug}/boost`, { method: 'POST', body: { id: 'another-browser-0123456' }, cookie: fan });
  assert.equal(fb.body.member, true);
  const pts0 = (await call('/api/club/me', { cookie: fan })).body.member.balance;
  assert.match((await call(`/stage/${me.slug}`)).body, /Early backers[\s\S]*Sam/);

  // staff rate, mark them as having played an open night, and move them up: the backer gets a scout bonus
  await call(`/api/stage/manage/${a.id}`, { method: 'POST', headers: staff, body: { action: 'rate', ratings: { music: 4, presence: 4, original: 5, draw: 3, ready: 4 } } });
  a = (await call(`/api/stage/manage/${a.id}`, { method: 'POST', headers: staff, body: { action: 'played', what: 'open' } })).body.artist;
  assert.equal(a.stats.rating.avg, 4);
  assert.ok(a.score > 40, `score ${a.score}`);
  a = (await call(`/api/stage/manage/${a.id}`, { method: 'POST', headers: staff, body: { action: 'advance', message: 'See you at the Blues Jam' } })).body.artist;
  assert.equal(a.stage, 2);
  assert.equal((await call('/api/club/me', { cookie: fan })).body.member.balance, pts0 + 3);
  assert.equal((await call(`/api/stage/manage/${a.id}`, { method: 'POST', headers: staff, body: { action: 'advance' } })).body.artist.stage, 3);
  // goals for the next planet show what's left
  const v = (await call('/api/stage/me', { cookie })).body.artist;
  assert.ok(v.goals.some((g) => /Sunday Showcase/.test(g.label) && !g.done));
  assert.equal(v.messages[0].message, 'See you at the Blues Jam');

  // the staff notes and ratings never show on the public page
  await call(`/api/stage/manage/${a.id}`, { method: 'POST', headers: staff, body: { action: 'note', note: 'Late to sound check' } });
  assert.doesNotMatch((await call(`/stage/${me.slug}`)).body, /Late to sound check/);
});

test('reserved addresses are kept, and the showcase acts can be brought onto the Stage', async (t) => {
  const { app, call, staff } = await setup(t);
  await call('/api/stage/apply', { method: 'POST', body: { name: 'A', email: 'a@x.test', act: 'Manage', consent: true } });
  const a = app.ctx.db.arArtists.find((x) => x.email === 'a@x.test');
  assert.notEqual(a.slug, 'manage');
  assert.equal((await call('/api/stage/apply', { method: 'POST', body: { name: 'B', email: 'b@x.test', act: 'B' } })).status, 400); // consent
  app.ctx.db.showcases = { '2026-11-22': { acts: [{ slug: 'justyna', name: 'Justyna', plays: 'Pop', vibe: 'pop', email: 'j@x.test', links: [] }] } };
  assert.equal((await call('/api/stage/import-showcase', { method: 'POST', body: {}, headers: staff })).body.added, 1);
  assert.equal((await call('/api/stage/import-showcase', { method: 'POST', body: {}, headers: staff })).body.added, 0);
  const j = app.ctx.db.arArtists.find((x) => x.act === 'Justyna');
  assert.equal(j.stage, 3);
  assert.equal((await call(`/stage/${j.slug}`)).status, 200);
});

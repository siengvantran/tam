// The Analogue Room: the page never gets the answers, each move is checked
// here, and opening the doors banks club points once a day.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { validRoom, loadRooms } from '../src/domain/room.js';
import { londonToday } from '../src/lib/content.js';

const CONTENT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'content');

async function setup(t) {
  const sent = [];
  const resend = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { sent.push(JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json' }); res.end(`{"id":"em_${sent.length}"}`); });
  });
  await new Promise((r) => resend.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-room-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: 'admin-token-for-tests', EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're_test', RESEND_API: `http://127.0.0.1:${resend.address().port}`, MAIL_GAP_MS: '0' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const call = async (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: type.includes('json') ? await r.json() : await r.text() };
  };
  async function member(email) {
    const before = sent.length;
    await call('/api/club/join', { method: 'POST', body: { email, name: 'Ali Fan', consent: true } });
    for (let i = 0; i < 100 && sent.length < before + 1; i++) await new Promise((x) => setTimeout(x, 15));
    const mail = sent.slice(before).find((x) => x.to[0] === email);
    const c = await call('/api/club/confirm', { method: 'POST', body: { t: decodeURIComponent(/\/club\/confirm\?t=([\w-]+)/.exec(mail.html)[1]) } });
    return c.headers.get('set-cookie').split(/,(?=\s*tam_)/).map((x) => x.split(';')[0].trim()).join('; ');
  }
  // today's room, with its answers, straight from the file
  const room = loadRooms(CONTENT).filter((r) => r.date <= londonToday()).pop();
  const answers = { date: room.date, cards: room.cards.map((c) => c.record), code: room.code.answer, picks: room.gates.map((g) => g.opts.findIndex((o) => o.ok)), word: room.word };
  return { app, call, member, room, answers };
}

test('every room in content/rooms.json is well formed, and a broken one is refused', () => {
  const all = JSON.parse(fs.readFileSync(path.join(CONTENT, 'rooms.json'), 'utf8'));
  assert.ok(all.length >= 1);
  for (const r of all) assert.ok(validRoom(r), `room ${r.date}`);
  assert.equal(new Set(all.map((r) => r.date)).size, all.length, 'one room a day');
  const r = structuredClone(all[0]);
  assert.equal(validRoom({ ...r, word: 'NOPE' }), false, 'the letters must spell the word');
  r.cards.find((c) => c.record).src = undefined;
  assert.equal(validRoom(r), false, 'every fact carries its source');
  assert.deepEqual(loadRooms('/nowhere'), []);
});

test('the page and the API show the puzzle, never the answers', async (t) => {
  const { call, room } = await setup(t);
  const page = await call('/analogue-room');
  assert.equal(page.status, 200);
  assert.match(page.body, /The Analogue Room/);
  assert.match(page.body, /The news in this room is real and sourced/);
  assert.equal((await call('/room')).headers.get('location'), '/analogue-room');
  const got = await call('/api/room');
  assert.equal(got.body.room.date, room.date);
  assert.equal(got.body.points, 2);
  const raw = JSON.stringify(got.body);
  assert.ok(!raw.includes('"record"') && !raw.includes('"answer"') && !raw.includes('"ok"') && !raw.includes('"letter"'));
  assert.ok(!raw.includes(`"${room.word}"`));
  assert.equal((await call('/api/room?date=2099-01-01')).body.room, null);
  assert.match((await call('/club')).body, /Open the doors of The Analogue Room/);
});

test('each move is checked on the server', async (t) => {
  const { call, room, answers } = await setup(t);
  const check = (b) => call('/api/room/check', { method: 'POST', body: { date: room.date, ...b } });
  const right = await check({ lock: 'card', i: 0, value: answers.cards[0] });
  assert.equal(right.body.ok, true);
  assert.equal(right.body.note, room.cards[0].note);
  assert.deepEqual((await check({ lock: 'card', i: 0, value: !answers.cards[0] })).body, { ok: false });
  assert.equal((await check({ lock: 'code', value: '0000' })).body.ok, room.code.answer === '0000');
  assert.equal((await check({ lock: 'code', value: answers.code })).body.ok, true);
  const g = await check({ lock: 'gate', i: 0, value: answers.picks[0] });
  assert.equal(g.body.letter, room.word[0]);
  const wrong = await check({ lock: 'gate', i: 0, value: room.gates[0].opts.findIndex((o) => !o.ok) });
  assert.equal(wrong.body.ok, false);
  assert.ok(wrong.body.why);
  assert.equal((await check({ lock: 'door' })).status, 400);
  assert.equal((await call('/api/room/check', { method: 'POST', body: { date: '2099-01-01', lock: 'code', value: '1' } })).status, 404);
});

test('opening the doors: solved rooms only, 2 points for members, once a day', async (t) => {
  const { call, member, answers, app } = await setup(t);
  const open = (body, cookie) => call('/api/room/open', { method: 'POST', body, cookie });
  assert.deepEqual((await open({ ...answers, word: 'nope' })).body, { ok: false });
  assert.deepEqual((await open({ date: answers.date, word: answers.word })).body, { ok: false }, 'the word alone is not enough');
  const guest = await open(answers);
  assert.equal(guest.body.ok, true);
  assert.equal(guest.body.points, 0);
  assert.equal(guest.body.member, false);
  const cookie = await member('ali@example.com');
  const first = await open({ ...answers, word: answers.word.toLowerCase() }, cookie);
  assert.equal(first.body.points, 2);
  assert.ok(first.body.epilogue.length);
  assert.equal((await open(answers, cookie)).body.points, 0, 'once a day');
  assert.equal(app.ctx.db.clubLedger.filter((x) => x.rule === 'room').length, 1);
  assert.equal((await call('/api/room', { cookie })).body.banked, true);
});

test('the home page and every public page invite people in; artists get their own words', async (t) => {
  const { call } = await setup(t);
  const home = await call('/');
  assert.match(home.body, /data-room-tile data-aud="public"/);
  assert.match(home.body, /\/js\/room-invite\.js/);
  assert.match(home.body, /built from the day’s real news/);
  const artistHome = await call('/', { cookie: 'tam_path=musician' });
  assert.match(artistHome.body, /data-room-tile data-aud="artist"/);
  assert.match(artistHome.body, /played once, by people, and never copied/);
  assert.match((await call('/whats-on')).body, /\/js\/room-invite\.js/);

  const pub = (await call('/api/room/invite?src=search&page=/whats-on')).body.invite;
  assert.equal(pub.aud, 'public');
  assert.equal(pub.src, 'search');
  assert.equal(pub.href, '/analogue-room');
  assert.ok(['points', 'news', 'drink'].includes(pub.id));
  const byCookie = (await call('/api/room/invite?src=social&page=/', { cookie: 'tam_path=musician' })).body.invite;
  const byPage = (await call('/api/room/invite?src=nonsense&page=/sunday-showcases')).body.invite;
  for (const v of [byCookie, byPage]) { assert.equal(v.aud, 'artist'); assert.ok(['stage', 'once', 'card'].includes(v.id)); }
  assert.equal(byPage.src, 'other', 'unknown sources are counted as other');
});

test('counts are totals by source, and the wording that opens doors wins', async (t) => {
  const { call, app, member, answers } = await setup(t);
  const room = app.ctx.room;
  const sig = (body, headers) => call('/api/room/signal', { method: 'POST', body, headers });
  assert.equal((await sig({ type: 'shown', src: 'search', variant: 'news', aud: 'public' })).status, 200);
  assert.equal((await sig({ type: 'click', src: 'search', variant: 'news', aud: 'public' })).status, 200);
  assert.equal((await sig({ type: 'paid', src: 'search' })).status, 400);
  const cookie = await member('kim@example.com');
  const opened = await call('/api/room/open', { method: 'POST', cookie, body: { ...answers, src: 'search', variant: 'news', aud: 'public' } });
  assert.equal(opened.body.points, 2);
  const row = room.totals().find((r) => r.variant === 'news');
  assert.deepEqual({ ...row }, { aud: 'public', src: 'search', variant: 'news', shown: 1, click: 1, start: 0, open: 1, points: 1 });
  assert.ok(!JSON.stringify(app.ctx.db.roomStats).includes('kim@'), 'nothing about who');

  // with plenty of showings, the best wording for that source is the one shown (when not exploring)
  for (let i = 0; i < 80; i++) room.count('shown', { aud: 'public', src: 'social', variant: 'drink' });
  for (let i = 0; i < 30; i++) room.count('open', { aud: 'public', src: 'social', variant: 'drink' });
  for (let i = 0; i < 80; i++) room.count('shown', { aud: 'public', src: 'social', variant: 'points' });
  assert.equal(room.choose('public', 'social', () => 0.99).id, 'drink');
  assert.equal(room.choose('public', 'email', () => 0.99).id, 'drink', 'a source with few showings goes by everyone');
  assert.ok(['stage', 'once', 'card'].includes(room.choose('artist', 'social', () => 0.99).id));
  assert.equal(room.choose('public', 'social', () => 0).id, 'points', 'one in five is shown a wording at random');

  assert.equal((await call('/api/room/stats')).status, 401);
  const stats = await call('/api/room/stats', { headers: { 'x-staff-token': 'admin-token-for-tests' } });
  assert.ok(stats.body.rows.length >= 2);
  assert.equal((await call('/analogue-room/stats')).status, 302);
  assert.match((await call('/analogue-room/stats', { headers: { 'x-staff-token': 'admin-token-for-tests' } })).body, /Where they came from/);
});

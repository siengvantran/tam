// The TAM Club: the email list (double opt-in, segments, issues, clicks,
// one-click unsubscribe, archive) and the card (points, caps, referrals,
// bookings, the half pint at the bar).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { markdown } from '../src/lib/markdown.js';

const ADMIN = 'admin-token-for-tests';

async function setup(t, extra = {}) {
  const sent = [];
  const resend = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { sent.push(JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json' }); res.end(`{"id":"em_${sent.length}"}`); });
  });
  await new Promise((r) => resend.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-club-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're_test', RESEND_API: `http://127.0.0.1:${resend.address().port}`, MAIL_GAP_MS: '0', ...extra } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(() => resend.close(r)); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const call = async (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: type.includes('json') ? await r.json() : await r.text() };
  };
  const waitMail = async (n) => { for (let i = 0; i < 100 && sent.length < n; i++) await new Promise((x) => setTimeout(x, 15)); return sent; };
  const linkIn = (m, kind) => decodeURIComponent((new RegExp(`/club/${kind}\\?t=([\\w-]+)`).exec(m.html) || [])[1] || '');
  // join, confirm from the email, and come back with the card's cookie
  async function member(email, extraJoin = {}) {
    const before = sent.length;
    const j = await call('/api/club/join', { method: 'POST', body: { email, name: 'Ali Fan', consent: true, ...extraJoin } });
    assert.equal(j.status, 201);
    await waitMail(before + 1);
    const mail = sent.slice(before).find((x) => x.to[0] === email);
    const c = await call('/api/club/confirm', { method: 'POST', body: { t: linkIn(mail, 'confirm') } });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const cookie = c.headers.get('set-cookie').split(/,(?=\s*tam_)/).map((x) => x.split(';')[0].trim()).join('; ');
    return cookie;
  }
  return { app, B, call, sent, waitMail, member, linkIn, staff: { 'x-staff-token': ADMIN } };
}

test('joining: double opt-in, 10 points, the welcome email, and nobody can test who is on the list', async (t) => {
  const { call, sent, waitMail, member, app } = await setup(t);
  // every page has the sign-up; /club explains the card
  const home = await call('/');
  assert.match(home.body, /data-club-join data-source="footer"/);
  assert.match(home.body, /a drink on us/);
  const club = await call('/club');
  assert.match(club.body, /Get the list\.<br>Drink on us\./);
  assert.match(club.body, /Come to a night at TAM/);

  assert.match((await call('/api/club/join', { method: 'POST', body: { email: 'a@x.com' } })).body.error, /Tick the box/);
  assert.match((await call('/api/club/join', { method: 'POST', body: { email: 'nope', consent: true } })).body.error, /valid email/);

  const cookie = await member('ali@example.com', { interests: ['blues', 'bogus'], frequency: 'monthly' });
  const me = (await call('/api/club/me', { cookie })).body.member;
  assert.equal(me.status, 'active');
  assert.equal(me.balance, 12); // joined (10) + told us what they're into (2)
  assert.deepEqual(me.interests, ['blues']);
  assert.equal(me.frequency, 'monthly');
  assert.equal(me.tier.name, 'Fan');
  await waitMail(2);
  const welcome = sent.find((m) => /Welcome to the TAM Club/.test(m.subject));
  assert.ok(welcome, 'welcome email');
  assert.match(welcome.headers['List-Unsubscribe'], /\/api\/club\/unsubscribe\?t=/);
  assert.equal(welcome.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  // a used link doesn't work twice
  const confirmMail = sent.find((m) => /Confirm you’re on the TAM list/.test(m.subject));
  assert.equal(confirmMail.to[0], 'ali@example.com');
  // joining again with the same email sends a card link instead, with the same answer
  const n = sent.length;
  const again = await call('/api/club/join', { method: 'POST', body: { email: 'ali@example.com', consent: true } });
  assert.deepEqual(again.body, { ok: true, check: true, mail: true });
  await waitMail(n + 1);
  assert.match(sent.at(-1).subject, /Your TAM Club card/);
  // asking for a card link for someone who isn't on the list answers the same
  assert.deepEqual((await call('/api/club/link', { method: 'POST', body: { email: 'stranger@x.com' } })).body, { ok: true });
  assert.equal(app.ctx.db.members.length, 1);
});

test('points: spending earns most; daily caps, a streak, shares, referrals, and a drink of their choice poured at the bar', async (t) => {
  const { app, call, member, staff } = await setup(t);
  let now = Date.parse('2026-11-16T12:00:00Z');
  app.ctx.now = () => now;
  const cookie = await member('ali@example.com');
  const bal = async () => (await call('/api/club/me', { cookie })).body.member.balance;
  assert.equal(await bal(), 10);
  // paying customers earn more than everything else
  const { RULES, HALF, DRINKS } = await import('../src/domain/club.js');
  assert.equal(HALF, 108);
  assert.deepEqual(Object.keys(DRINKS), ['half', 'wine', 'water']);
  assert.ok(RULES.freeBooking.pts < RULES.booking.pts);
  for (const [k, r] of Object.entries(RULES)) if (!r.paid && !r.hidden && !r.unit) assert.ok(r.pts <= 10, `${k} earns ${r.pts}`);

  // a point a day for visiting, and a streak bonus on the third day of a week
  assert.equal((await call('/api/club/ping', { method: 'POST', body: {}, cookie })).body.got, 1);
  assert.equal((await call('/api/club/ping', { method: 'POST', body: {}, cookie })).body.got, 0);
  for (const d of [17, 18]) { now = Date.parse(`2026-11-${d}T12:00:00Z`); await call('/api/club/ping', { method: 'POST', body: {}, cookie }); }
  assert.equal(await bal(), 10 + 3 + 2);
  // shares: one a day
  for (const p of ['/a', '/b', '/c']) await call('/api/club/share', { method: 'POST', body: { path: p }, cookie });
  assert.equal(await bal(), 16);

  // a friend opens my link (+1, once per visitor a day), then joins with it (+5)
  const me = (await call('/api/club/me', { cookie })).body.member;
  const code = me.refLink.split('/').pop();
  const r = await call(`/r/${code}?to=/sunday-showcases`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/sunday-showcases?r=${code}`);
  assert.equal((await call(`/r/${code}?to=//evil.com`)).headers.get('location'), `/club?r=${code}`);
  await call('/api/club/ref-visit', { method: 'POST', body: { r: code } });
  await call('/api/club/ref-visit', { method: 'POST', body: { r: code } });
  await call('/api/club/ref-visit', { method: 'POST', body: { r: code }, cookie }); // opening your own link doesn't count
  assert.equal(await bal(), 17);
  await member('friend@example.com', { ref: code });
  assert.equal(await bal(), 22);

  // a paid booking earns when it's paid, not while it's only held
  const b = await call('/api/bookings', { method: 'POST', body: { night: 'best-christmas-ever-2026-12-08', type: 'standard', qty: 2, name: 'Ali', email: 'ali@example.com' } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(await bal(), 22);
  await call('/api/bookings', { method: 'POST', body: { night: 'best-christmas-ever-2026-12-08', type: 'standard', qty: 1, name: 'Sam', email: 'sam@example.com', joinClub: true } });
  assert.ok(app.ctx.db.members.some((m) => m.email === 'sam@example.com' && m.status === 'pending' && m.source === 'booking'));

  // at the bar: staff only, a point per £1 up to 30 a day, here tonight once (+5)
  const card = me.card;
  assert.equal((await call(`/api/club/card/${card}`)).status, 401);
  const page = await call(`/club/card/${card}`);
  assert.match(page.body, /Ali/);
  assert.doesNotMatch(page.body, /ali@example\.com/);
  assert.equal((await call(`/api/club/card/${card}/here`, { method: 'POST', body: {}, headers: staff })).body.got, 5);
  assert.equal((await call(`/api/club/card/${card}/here`, { method: 'POST', body: {}, headers: staff })).body.got, 0);
  assert.equal((await call(`/api/club/card/${card}/bar`, { method: 'POST', body: { pounds: 12.5 }, headers: staff })).body.got, 12);
  assert.equal((await call(`/api/club/card/${card}/bar`, { method: 'POST', body: { pounds: 40 }, headers: staff })).body.got, 18);
  assert.equal(await bal(), 22 + 5 + 30);
  assert.equal((await call('/api/club/claim', { method: 'POST', body: { drink: 'wine' }, cookie })).status, 409); // not 108 yet

  // claim a drink (their choice): a code, 108 points off, one a week; staff pour it
  const x0 = app.ctx.db.members.find((y) => y.email === 'ali@example.com');
  app.ctx.club.award(x0, 'gift', 'g0', { pts: 60 });
  const claim = await call('/api/club/claim', { method: 'POST', body: { drink: 'wine' }, cookie });
  assert.equal(claim.status, 201);
  const reward = claim.body.member.reward;
  assert.match(reward.code, /^[A-Z0-9]{6}$/);
  assert.equal(reward.drinkName, 'A glass of wine');
  assert.equal(claim.body.member.balance, 117 - 108);
  assert.equal((await call(`/api/club/card/${card}`, { headers: staff })).body.card.reward.drinkName, 'A glass of wine');
  assert.equal((await call('/api/club/claim', { method: 'POST', body: {}, cookie })).status, 409);
  assert.equal((await call(`/api/club/card/${card}/pour`, { method: 'POST', body: { code: 'WRONG1' }, headers: staff })).status, 400);
  assert.equal((await call(`/api/club/card/${card}/pour`, { method: 'POST', body: { code: reward.code }, headers: staff })).body.poured, true);
  assert.equal((await call(`/api/club/card/${card}/pour`, { method: 'POST', body: {}, headers: staff })).status, 409);
  const m = (await call('/api/club/me', { cookie })).body.member;
  assert.ok(m.badges.some((x) => x.name === 'On the house'));
  assert.ok(m.badges.some((x) => x.name === 'First night'));

  // an unused half gives the points back after 30 days
  const x = app.ctx.db.members.find((y) => y.email === 'ali@example.com');
  app.ctx.club.award(x, 'gift', 'g1', { pts: 100 });
  now += 8 * 86400000;
  const water = await call('/api/club/claim', { method: 'POST', body: {}, cookie });
  assert.equal(water.status, 201);
  assert.equal(water.body.member.reward.drink, 'half'); // no choice sent: half a pint
  now += 31 * 86400000;
  const after = (await call('/api/club/me', { cookie })).body.member;
  assert.equal(after.reward, null);
  assert.equal(after.balance, 109);
});

test('the newsletter: segments, personal tokens, A/B subjects, click points, one-click unsubscribe, the archive', async (t) => {
  const { app, call, sent, waitMail, member, staff } = await setup(t);
  const ali = await member('ali@example.com', { interests: ['blues'] });
  await member('bea@example.com', { interests: ['christmas'], frequency: 'big' });
  await member('cat@example.com');

  // staff only
  assert.equal((await call('/api/club/manage')).status, 401);
  const d = await call('/api/club/manage', { headers: staff });
  assert.equal(d.body.stats.members, 3);

  // the weekly digest, drafted from the calendar
  const dg = await call('/api/club/issues/digest', { method: 'POST', body: {}, headers: staff });
  assert.equal(dg.status, 201);
  assert.match(dg.body.issue.body, /\{\{whats_on\}\}/);
  assert.equal(dg.body.issue.audience, 2); // bea only wants big news

  // a weekly issue for blues fans: ali (blues) and cat (hasn't picked, gets everything)
  const save = await call('/api/club/issues', { method: 'POST', headers: staff, body: {
    kind: 'weekly', subject: 'Blues this Saturday', subjectB: '{{first_name}}, the jam is back', preheader: 'You have {{points}} points',
    body: 'Hey {{first_name|there}},\n\n**Bring your harp.** [Sign up](/great-british-blues-jam#jam)\n\n<script>alert(1)</script>\n\n{{card}}', segment: { interests: ['blues'], engagement: 'all' },
  } });
  const issue = save.body.issue;
  assert.equal(issue.audience, 2);
  const pv = await call(`/api/club/issues/${issue.id}/preview`, { headers: staff });
  assert.match(pv.body, /<strong>Bring your harp\.<\/strong>/);
  assert.doesNotMatch(pv.body, /<script>alert/);

  const before = sent.length;
  assert.equal((await call(`/api/club/issues/${issue.id}/send`, { method: 'POST', body: {}, headers: staff })).status, 202);
  await waitMail(before + 2);
  for (let i = 0; i < 50 && app.ctx.db.issues.find((x) => x.id === issue.id).status !== 'sent'; i++) await new Promise((x) => setTimeout(x, 20));
  const got = sent.slice(before);
  assert.deepEqual(got.map((m) => m.to[0]).sort(), ['ali@example.com', 'cat@example.com']);
  assert.deepEqual(got.map((m) => m.subject).sort(), ['Ali, the jam is back', 'Blues this Saturday']); // A/B: one each
  const toAli = got.find((m) => m.to[0] === 'ali@example.com');
  assert.match(toAli.html, /Hey Ali,/);
  assert.match(toAli.html, /Your TAM Club card: 12 points/);
  assert.match(toAli.headers['List-Unsubscribe'], /unsubscribe\?t=[0-9a-f]{32}/);

  // a click: counted, a point, then on to the link
  const link = /href="([^"]*\/c\/[^"]+)"/.exec(toAli.html)[1].replace(/&amp;/g, '&');
  const c = await call(link.replace(/^https?:\/\/[^/]+/, ''));
  assert.equal(c.status, 302);
  assert.match(c.headers.get('location'), /\/great-british-blues-jam#jam$/);
  assert.equal((await call('/api/club/me', { cookie: ali })).body.member.balance, 13);
  assert.equal((await call(link.replace(/^https?:\/\/[^/]+/, '').replace(/\/c\/([^/]+)\/([^/]+)\/[^/?]+/, '/c/$1/$2/0000000000000000'))).headers.get('location'), '/'); // a forged link goes nowhere
  const res = (await call(`/api/club/issues/${issue.id}`, { headers: staff })).body.issue;
  assert.equal(res.stats.sent, 2);
  assert.equal(res.stats.clickers, 1);

  // one-click unsubscribe from the mail client
  const unsubUrl = /<([^>]+)>/.exec(toAli.headers['List-Unsubscribe'])[1].replace(/^https?:\/\/[^/]+/, '');
  const u = await fetch(`${app.ctx.cfg.siteUrl}${unsubUrl}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  assert.equal(u.status, 200);
  const aliNow = (await call('/api/club/me', { cookie: ali })).body.member;
  assert.equal(aliNow.emails, false);
  assert.equal(aliNow.balance, 13); // the card stays

  // the archive and its feed
  const arch = await call('/newsletter');
  assert.match(arch.body, /Blues this Saturday/);
  const web = await call(`/newsletter/${issue.slug}`);
  assert.match(web.body, /Hey there,/);
  assert.doesNotMatch(web.body, /\/c\//); // no tracking on the web copy
  assert.match((await call('/newsletter/feed.xml')).body, /<rss version="2.0">[\s\S]*Blues this Saturday/);
  // sent issues can't be edited
  assert.equal((await call('/api/club/issues', { method: 'POST', headers: staff, body: { id: issue.id, subject: 'Changed' } })).status, 409);

  // deleting a card removes it all
  assert.equal((await call('/api/club/delete', { method: 'POST', body: {}, cookie: ali })).status, 200);
  assert.ok(!app.ctx.db.members.some((m) => m.email === 'ali@example.com'));
  assert.equal((await call('/api/club/me', { cookie: ali })).status, 401);
});

test('newsletter Markdown is escaped first: no HTML or script links get through', () => {
  const out = markdown('# Hi <b>there</b>\n\n[bad](javascript:alert(1)) [good](https://tam.tv)\n\n- one\n- two');
  assert.match(out, /<h2>Hi &lt;b&gt;there&lt;\/b&gt;<\/h2>/);
  assert.doesNotMatch(out, /javascript:/);
  assert.match(out, /<a href="https:\/\/tam\.tv"/);
  assert.match(out, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

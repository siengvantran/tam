// The food guide: Mercato Metropolitano's traders as draft listings TAM approves,
// traders claim (or join from an invite) and update their listing (TAM approves),
// partners take pre-orders for TAM nights and see a prep list per night.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { handleOf, pitch } from '../src/domain/vendors.js';

const ADMIN = 'admin-token-for-tests';

test('handles and the partnership pitch', () => {
  assert.equal(handleOf('@hot_chick'), 'hot_chick');
  assert.equal(handleOf('https://www.instagram.com/greenchoy/?hl=en'), 'greenchoy');
  assert.equal(handleOf('dumpling himalayan'), '');
  const p = pitch({ vendor: { name: 'Molo' }, link: 'https://x/join?t=1' });
  assert.match(p, /Hi Molo team/);
  assert.match(p, /pre-order/);
  assert.match(p, /waste less/);
  assert.match(p, /https:\/\/x\/join\?t=1/);
});

test('food guide: drafts until approved, claims, profile approval, outreach, pre-orders and prep lists', async (t) => {
  const sent = [];
  const resend = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push(JSON.parse(b)); res.end('{"id":"x"}'); }); });
  await new Promise((r) => resend.listen(0, r));
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-food-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', RESEND_API_KEY: 're', RESEND_API: `http://127.0.0.1:${resend.address().port}`, MAIL_GAP_MS: '0' } });
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
  const linkIn = (m, rx) => (rx.exec(m.text || m.html) || [])[1];

  // the import: every food and drink trader at MM Elephant & Castle, all drafts, menus included
  const all = app.ctx.food.all();
  assert.equal(all.length, 29);
  assert.ok(all.every((v) => v.status === 'draft'));
  assert.ok(!all.some((v) => v.name === 'TAM'));
  const hc = app.ctx.food.vendor('hot-chick');
  assert.equal(hc.instagram, 'hotchick_chicken');
  assert.ok(hc.menu.length > 5 && hc.menu.some((m) => m.price > 0));

  // nothing public before approval
  let dir = await call('/food');
  assert.equal(dir.status, 200);
  assert.doesNotMatch(dir.body, /Hot Chick/);
  assert.equal((await call('/food/hot-chick')).status, 404);
  assert.equal((await call('/api/food')).body.vendors.length, 0);
  // staff can preview a draft
  const prev = await call('/food/hot-chick', { headers: staff });
  assert.equal(prev.status, 200);
  assert.match(prev.body, /Preview: this listing is <b>draft<\/b>/);
  assert.equal((await call('/api/food/manage')).status, 401);
  const M = await call('/api/food/manage', { headers: staff });
  assert.equal(M.body.vendors.length, 29);

  // approve: live
  assert.equal((await call('/api/food/manage/vendors/hot-chick', { method: 'POST', headers: staff, body: { action: 'approve' } })).status, 200);
  dir = await call('/food');
  assert.match(dir.body, /Hot Chick/);
  const pg = await call('/food/hot-chick');
  assert.equal(pg.status, 200);
  assert.match(pg.body, /Claim this listing/);
  assert.match(pg.body, /instagram\.com\/hotchick_chicken/);
  assert.match(pg.body, /"@type":"Restaurant"/);

  // a trader claims it; TAM approves; they sign in by email link
  const claim = await call('/api/food/hot-chick/claim', { method: 'POST', body: { name: 'Sam', role: 'Manager', email: 'sam@hotchick.test', consent: true } });
  assert.equal(claim.status, 201);
  await wait(1);
  assert.equal(String(sent.at(-1).to), 'team@tam.test');
  const cl = (await call('/api/food/manage', { headers: staff })).body.claims[0];
  assert.equal(cl.email, 'sam@hotchick.test');
  await call(`/api/food/manage/claims/${cl.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  await wait(2);
  const t1 = linkIn(sent.at(-1), /\/food\/in\?t=([\w-]+)/);
  assert.ok(t1);
  const signin = await call('/api/food/in', { method: 'POST', body: { t: t1 } });
  assert.equal(signin.status, 200);
  const cookie = signin.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/food/in', { method: 'POST', body: { t: t1 } })).status, 400); // once only
  const me = await call('/api/food/me', { cookie });
  assert.equal(me.body.vendors[0].slug, 'hot-chick');
  assert.equal((await call('/api/food/me/molo', { method: 'POST', cookie, body: {} })).status, 403);

  // a profile update waits for TAM; contact details are refused
  const v0 = me.body.vendors[0];
  assert.equal((await call('/api/food/me/hot-chick', { method: 'POST', cookie, body: { ...v0, description: 'Call 020 7946 0000 now' } })).status, 400);
  const menu = [{ section: 'Wings', name: 'Ghost chilli wings', price: '9.50', dietary: ['halal'] }, { section: 'Sides', name: 'Fries', price: '4', dietary: ['vegan'] }, { name: 'Secret sauce', price: '' }];
  const up = await call('/api/food/me/hot-chick', { method: 'POST', cookie, body: { ...v0, tagline: 'Saucy fried chicken', menu } });
  assert.equal(up.status, 201);
  assert.equal(app.ctx.food.vendor('hot-chick').tagline, 'Award Winning Fried Chicken'); // not yet
  const ch = (await call('/api/food/manage', { headers: staff })).body.changes[0];
  await call(`/api/food/manage/changes/${ch.id}`, { method: 'POST', headers: staff, body: { action: 'approve' } });
  const after = app.ctx.food.vendor('hot-chick');
  assert.equal(after.tagline, 'Saucy fried chicken');
  assert.deepEqual(after.menu.map((m) => m.price), [950, 400, null]);

  // pre-orders: on for one night, 2 hours' notice
  const night = app.ctx.content.upcoming(app.ctx.today()).find((n) => !n.timesTbc && Date.parse(n.start) > Date.now() + 4 * 3600000);
  assert.ok(night, 'a night to pre-order for');
  const po = await call('/api/food/me/hot-chick/preorder', { method: 'POST', cookie, body: { enabled: true, nights: [night.slug], cutoffHours: 2, collect: 'Our counter by the warehouse' } });
  assert.equal(po.status, 200);
  assert.equal(app.ctx.food.vendor('hot-chick').partner, 'partner');
  const list = (await call(`/api/food/preorder?night=${night.slug}`)).body;
  const ln = list.nights.find((n) => n.slug === night.slug);
  assert.ok(ln && ln.selected);
  assert.deepEqual(ln.vendors.map((v) => v.slug), ['hot-chick']);
  assert.equal(ln.vendors[0].menu.length, 2); // only priced dishes
  assert.match((await call(`/events/${night.slug}`)).body, /Pre-order your food/);

  const items = ln.vendors[0].menu.map((m) => ({ id: m.id, qty: 2 }));
  assert.equal((await call('/api/food/preorder', { method: 'POST', body: { night: night.slug, vendor: 'hot-chick', name: 'Ana', email: 'ana@x.test', collect: '03:07', items } })).status, 400);
  const before = sent.length;
  const o = await call('/api/food/preorder', { method: 'POST', body: { night: night.slug, vendor: 'hot-chick', name: 'Ana', email: 'ana@x.test', collect: ln.slots[0], items, notes: 'no sesame' } });
  assert.equal(o.status, 201);
  assert.equal(o.body.total, 2 * 950 + 2 * 400);
  await wait(before + 2);
  assert.ok(sent.some((m) => String(m.to) === 'ana@x.test' && /Your pre-order from Hot Chick/.test(m.subject)));
  assert.ok(sent.some((m) => String(m.to) === 'sam@hotchick.test' && /New pre-order/.test(m.subject)));
  await call('/api/food/preorder', { method: 'POST', body: { night: night.slug, vendor: 'hot-chick', name: 'Bo', email: 'bo@x.test', collect: ln.slots[1] || ln.slots[0], items: [{ id: items[0].id, qty: 1 }] } });

  // the trader's prep list for the night
  const mine = (await call('/api/food/me', { cookie })).body.vendors[0];
  assert.deepEqual(mine.prep[night.slug].items, { 'Ghost chilli wings': 3, Fries: 2 });
  assert.equal(mine.prep[night.slug].orders, 2);
  assert.ok(!('email' in mine.orders[0]) || mine.orders[0].email); // their own customers' emails are theirs to see
  const csv = await call('/api/food/me/hot-chick/orders.csv', { cookie });
  assert.match(csv.body, /Ghost chilli wings/);

  // the customer cancels from their link; the prep list follows
  const k = new URL(o.body.link).searchParams.get('k');
  assert.equal((await call(`/api/food/order/${o.body.id}?k=wrong`)).status, 404);
  assert.equal((await call(`/api/food/order/${o.body.id}?k=${k}`)).body.canCancel, true);
  assert.equal((await call(`/api/food/order/${o.body.id}/cancel`, { method: 'POST', body: { k } })).status, 200);
  assert.deepEqual(app.ctx.food.prep('hot-chick', night.slug).items, { 'Ghost chilli wings': 1 });

  // outreach: email invite, and an Instagram DM message with its own invite link
  await call('/api/food/manage/vendors/molo', { method: 'POST', headers: staff, body: { action: 'contact', email: 'hello@molo.test', partner: 'none' } });
  const mail = await call('/api/food/manage/outreach/molo', { method: 'POST', headers: staff, body: { channel: 'email' } });
  assert.equal(mail.status, 200);
  await wait(sent.length);
  const inv = sent.find((m) => String(m.to) === 'hello@molo.test');
  assert.match(inv.subject, /Partner with TAM/);
  const ig = await call('/api/food/manage/outreach/korean-green-choy', { method: 'POST', headers: staff, body: { channel: 'instagram' } });
  assert.equal(ig.body.dm, 'https://ig.me/m/greenchoy');
  assert.match(ig.body.message, /\/food\/join\?t=/);
  assert.equal(app.ctx.food.vendor('korean-green-choy').partner, 'invited');
  assert.equal((await call('/api/food/manage/outreach/argentinian-grill', { method: 'POST', headers: staff, body: { channel: 'instagram' } })).status, 400); // no handle yet
  // the trader opens the invite: theirs to manage, no claim to check
  const jt = new URL(ig.body.link).searchParams.get('t');
  const j = await call(`/api/food/join?t=${jt}`);
  assert.equal(j.body.vendor.name, 'Korean Green Choy'); // a draft, shown to the invitee
  const joined = await call('/api/food/join', { method: 'POST', body: { t: jt, name: 'Min', email: 'min@greenchoy.test', consent: true } });
  assert.equal(joined.status, 201);
  assert.deepEqual(app.ctx.db.vendorState['korean-green-choy'].claimedBy, ['min@greenchoy.test']);
  assert.equal((await call('/food/korean-green-choy')).status, 404); // still a draft to the public

  // emails found on the web: private, with confidence; confirm one, flag others to ask in person
  const imp = await call('/api/food/manage/leads', { method: 'POST', headers: staff, body: { leads: {
    'the-duck-shed': { leads: [{ email: 'Hello@Duck.test', confidence: 'high', source: 'https://duck.test/contact', note: 'contact page' }, { email: 'old@duck.test', confidence: 'low' }], phone: '020 0000 0000' },
    'cocktail-caravan': { leads: [], notes: 'Probably run by MM', check: 'shack', checkWhy: 'Ask who manages the bar' },
    nobody: { leads: [{ email: 'x@y.test' }] } } } });
  assert.equal(imp.body.updated, 2);
  let MM = (await call('/api/food/manage', { headers: staff })).body;
  const duck = MM.vendors.find((v) => v.slug === 'the-duck-shed');
  assert.deepEqual(duck.leads.map((l) => [l.email, l.confidence, l.status]), [['hello@duck.test', 'high', 'unverified'], ['old@duck.test', 'low', 'unverified']]);
  assert.equal(MM.vendors.find((v) => v.slug === 'cocktail-caravan').check, 'shack');
  await call('/api/food/manage/vendors/the-duck-shed', { method: 'POST', headers: staff, body: { action: 'lead', email: 'hello@duck.test', status: 'confirmed' } });
  await call('/api/food/manage/vendors/the-duck-shed', { method: 'POST', headers: staff, body: { action: 'check', where: 'mm-group', why: 'Is old@ still used?' } });
  MM = (await call('/api/food/manage', { headers: staff })).body;
  assert.equal(MM.vendors.find((v) => v.slug === 'the-duck-shed').email, 'hello@duck.test');
  assert.equal(MM.vendors.find((v) => v.slug === 'the-duck-shed').check, 'mm-group');
  // a fresh crawl keeps what's been confirmed
  await call('/api/food/manage/leads', { method: 'POST', headers: staff, body: { leads: { 'the-duck-shed': { leads: [{ email: 'new@duck.test', confidence: 'medium' }] } } } });
  assert.deepEqual(app.ctx.db.vendorState['the-duck-shed'].leads.map((l) => l.email), ['new@duck.test', 'hello@duck.test']);
  assert.equal((await call('/api/food/manage/leads', { method: 'POST', body: { leads: {} } })).status, 401);

  // public data carries no private contact details
  const pub = JSON.stringify((await call('/api/food')).body);
  assert.doesNotMatch(pub, /sam@hotchick|hello@molo|@x\.test|duck\.test/);
  for (const p of ['/food', '/food/the-duck-shed', '/api/food/preorder']) assert.doesNotMatch((await call(p)).body.toString?.() || JSON.stringify((await call(p)).body), /duck\.test/);
  assert.match((await call('/api/food/manage/orders.csv', { headers: staff })).body, /Ana/);
});

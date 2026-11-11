// The Sunday Showcase running order: arranged as a show, private until every
// act has sound-checked and it's published; visitor reactions feed the numbers
// and suggestions; Google Analytics only with consent.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { autoArrange, withTimes, checks, metrics, suggest } from '../src/lib/running-order.js';

const ADMIN = 'admin-token-for-tests';
const ACTS = [['Justyna', 'disco'], ['Ariff A.B.', 'noir'], ['Waris Albakri', 'campfire'], ['seren', 'mist'], ['Nelena Paparisva', 'spotlight'], ['Scramble Gut', 'riot']];

test('the draft is arranged as a show: quiet to loud, an interval, finishing on time', () => {
  const acts = ACTS.map(([name, vibe], i) => ({ n: i + 1, name, vibe, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '') }));
  const r = withTimes(autoArrange(acts, { doors: '19:30', ends: '22:30' }));
  assert.deepEqual(r.slots.map((s) => s.slug), ['waris-albakri', 'seren', 'ariff-a-b', 'nelena-paparisva', 'justyna', 'scramble-gut']);
  assert.deepEqual(r.slots.map((s) => s.on), ['19:50', '20:15', '20:40', '21:15', '21:40', '22:10']);
  assert.deepEqual(r.intervalAt, { from: '21:00', to: '21:15' });
  assert.equal(r.finish, '22:30');
  assert.match(r.slots[0].why, /^Opens the night/);
  assert.match(r.slots[5].why, /^Closes the night/);
  assert.ok(checks(r, acts).some((c) => c.level === 'hold')); // nobody sound-checked yet
  // a quiet act straight after the loudest is flagged
  const bad = { ...r, slots: [...r.slots] }; [bad.slots[4], bad.slots[5]] = [bad.slots[5], bad.slots[4]];
  assert.ok(checks(bad, acts).some((c) => /follows Scramble Gut/.test(c.text)));
  // suggestions: none firm without visitors; with a clear favourite in the first half, a swap into its peak
  assert.match(suggest(r, acts, metrics(acts, {}, {}))[0].text, /Not enough visitors/);
  // the opener's favourite stays put: moving it would open the night on the darkest set
  const keep = suggest(r, acts, metrics(acts, { 'waris-albakri': { view: 40, invite: 6 }, seren: { view: 10 }, 'ariff-a-b': { view: 10 } }, {}));
  assert.ok(!keep.some((s) => s.kind === 'swap'));
  assert.ok(keep.some((s) => /would break the show's shape/.test(s.text)));
  // a favourite in the middle of a half moves to its peak
  const rows = metrics(acts, { seren: { view: 40, invite: 6 }, 'waris-albakri': { view: 10 }, 'ariff-a-b': { view: 10 } }, {});
  const sw = suggest(r, acts, rows).find((s) => s.kind === 'swap');
  assert.deepEqual(sw.swap, [1, 2]);
});

test('running order: staff only, sound check before publishing, then the times go public', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-ro-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const H = { 'x-staff-token': ADMIN, 'content-type': 'application/json' };
  const date = app.ctx.content.showcases.next.date;
  if (date < app.ctx.today()) return;
  const post = (p, b, h = H) => fetch(B + p, { method: 'POST', headers: h, body: JSON.stringify(b) });
  await post(`/api/showcases/${date}`, { count: 6, acts: ACTS.map(([name, vibe]) => ({ name, vibe })) });

  assert.equal((await fetch(`${B}/api/showcases/${date}/run`)).status, 401);
  const draft = await (await fetch(`${B}/api/showcases/${date}/run`, { headers: H })).json();
  assert.equal(draft.status, 'draft');
  assert.equal(draft.slots[0].slug, 'waris-albakri');
  assert.ok(draft.principles.length >= 4);
  // not public yet
  const pub0 = await (await fetch(`${B}/api/showcases`)).json();
  assert.equal(pub0.run, null);
  assert.equal(pub0.acts[0].on, undefined);

  // reactions from visitors feed the numbers
  for (let i = 0; i < 3; i++) await post(`/api/showcases/${date}/act/justyna/signal`, { type: 'view' }, { 'content-type': 'application/json' });
  await post(`/api/showcases/${date}/act/justyna/signal`, { type: 'invite' }, { 'content-type': 'application/json' });
  assert.equal((await post(`/api/showcases/${date}/act/justyna/signal`, { type: 'hack' }, { 'content-type': 'application/json' })).status, 400);
  assert.equal((await post(`/api/showcases/${date}/act/nobody/signal`, { type: 'view' }, { 'content-type': 'application/json' })).status, 404);

  // Vivian saves the draft; publishing waits for every sound check
  const saved = await (await post(`/api/showcases/${date}/run`, { ...draft, slots: draft.slots.map((s, i) => ({ ...s, soundcheck: i < 5 })) })).json();
  const j = saved.metrics.find((m) => m.slug === 'justyna');
  assert.deepEqual([j.view, j.invite, j.score], [3, 1, 4]);
  const held = await post(`/api/showcases/${date}/run/publish`, {});
  assert.equal(held.status, 409);
  assert.match((await held.json()).error, /Scramble Gut/);
  const ok = await (await post(`/api/showcases/${date}/run`, { ...saved, slots: saved.slots.map((s) => ({ ...s, soundcheck: true })) })).json();
  assert.ok(ok.slots.every((s) => s.soundcheckAt));
  assert.equal((await post(`/api/showcases/${date}/run/publish`, {})).status, 200);

  // public: the line-up takes the running order, with set times
  const pub = await (await fetch(`${B}/api/showcases`)).json();
  assert.deepEqual(pub.acts.map((a) => a.slug), ['waris-albakri', 'seren', 'ariff-a-b', 'nelena-paparisva', 'justyna', 'scramble-gut']);
  assert.equal(pub.acts[0].on, '19:50');
  assert.equal(pub.run.intervalAt.from, '21:00');
  assert.match(await (await fetch(`${B}/sunday-showcases/${date}/scramble-gut`)).text(), /On stage <b>22:10<\/b>/);
  assert.match(await (await fetch(`${B}/sunday-showcases`)).text(), /class="sc-run"/);

  // a change after publishing takes the times down until it's published again
  const again = await (await fetch(`${B}/api/showcases/${date}/run`, { headers: H })).json();
  await post(`/api/showcases/${date}/run`, { ...again, slots: again.slots.map((s, i) => ({ ...s, mins: i === 0 ? 25 : s.mins })) });
  assert.equal((await (await fetch(`${B}/api/showcases`)).json()).run, null);

  // renaming an act (a band's name arrives) keeps its address, votes and numbers
  const live = await (await fetch(`${B}/api/showcases`)).json();
  const acts = live.acts.map((a) => ({ slug: a.slug, name: a.slug === 'waris-albakri' ? 'The New Band Name' : a.name, vibe: a.vibe }));
  const renamed = await (await post(`/api/showcases/${date}`, { count: 6, acts })).json();
  assert.equal(renamed.acts[0].name, 'The New Band Name');
  assert.equal(renamed.acts[0].slug, 'waris-albakri');
  assert.equal((await fetch(`${B}/sunday-showcases/${date}/waris-albakri`)).status, 200);
});

test('Google Analytics only with a measurement ID, and only after consent', async (t) => {
  const mk = async (env) => {
    const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-ga-')), EVENTBRITE_SYNC: 'off', ...env } });
    await new Promise((r) => app.listen(0, r));
    t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
    return `http://127.0.0.1:${app.server.address().port}`;
  };
  const off = await (await fetch(`${await mk({})}/`)).text();
  assert.doesNotMatch(off, /data-ga=|consent\.js|googletagmanager/);
  const on = await (await fetch(`${await mk({ GA_MEASUREMENT_ID: 'G-TEST1234' })}/`)).text();
  assert.match(on, /<html lang="en-GB" data-theme="[a-z]+" data-ga="G-TEST1234">/);
  assert.match(on, /src="\/js\/consent\.js"/);
  assert.match(on, /data-cookie-choices>Cookie choices</);
  assert.doesNotMatch(on, /googletagmanager/); // loads in the browser, only after a yes
  // the security policy lets Google's tag and its hits through once analytics is on
  const csp = (await fetch(`${await mk({ GA_MEASUREMENT_ID: 'G-TEST1234' })}/`)).headers.get('content-security-policy');
  assert.match(csp, /script-src [^;]*https:\/\/\*\.googletagmanager\.com/);
  assert.match(csp, /connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
  const bad = await (await fetch(`${await mk({ GA_MEASUREMENT_ID: 'not-an-id"><script>' })}/`)).text();
  assert.doesNotMatch(bad, /data-ga=/);
});

test('the showcase night: its event page goes to the landing page, which sells the free tickets', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-sct-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const H = { 'x-staff-token': ADMIN, 'content-type': 'application/json' };
  const { date, night } = app.ctx.content.showcases.next;
  if (date < app.ctx.today()) return;
  const post = (p, b) => fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(b) });
  await post(`/api/showcases/${date}`, { count: 6, acts: [{ name: 'Justyna', vibe: 'disco' }] });

  // before tickets: the listed night's page takes people to the showcase page
  const r1 = await fetch(`${B}/events/${night}`, { redirect: 'manual' });
  assert.equal(r1.status, 302);
  assert.equal(r1.headers.get('location'), '/sunday-showcases#this-sunday');

  // Vivian makes the night a ticketed show: free tickets, and a donation ticket (taken on Eventbrite)
  const show = await (await post('/api/shows', { title: 'Sunday Showcase × TAM', date, doors: '19:30', ends: '22:30',
    summary: 'Six new acts, one stage. Free entry: book your place.', image: '/img/showcases/justyna.jpg',
    sales: { mode: 'tam', capacity: 100, maxPerBooking: 6, tickets: [{ id: 'free', name: 'Free ticket', price: '0' }, { id: 'give', name: 'Keep grassroots music live at TAM', donation: true }] } })).json();
  const pub = await post(`/api/shows/${show.id}/status`, { status: 'published' });
  assert.equal(pub.status, 200, await pub.text());

  // the calendar shows the Sunday Showcase in place of the listed night
  const on = (await (await fetch(`${B}/whats-on.json`)).json()).nights.filter((x) => x.date === date).map((x) => x.title);
  assert.ok(on.includes('Sunday Showcase × TAM'));
  assert.ok(!on.includes('Singers @ Sunday Spot'));
  assert.match(await (await fetch(`${B}/calendar.ics`)).text(), /SUMMARY:Sunday Showcase × TAM/);

  // the show's page and the old listing's address both go to the landing page's tickets
  const r2 = await fetch(`${B}/events/${show.slug}`, { redirect: 'manual' });
  assert.equal(r2.headers.get('location'), '/sunday-showcases#book');
  assert.equal((await fetch(`${B}/events/${night}`, { redirect: 'manual' })).headers.get('location'), '/sunday-showcases#this-sunday');
  assert.equal((await fetch(`${B}/events/${show.slug}?booking=TAM-X&k=y`, { redirect: 'manual' })).status, 200); // confirmations still show

  // the landing page sells the free tickets, and asks for a donation
  const land = await (await fetch(`${B}/sunday-showcases`)).text();
  assert.match(land, /<section class="section tix" id="book"/);
  assert.match(land, /Free tickets · /);
  assert.match(land, /Keep grassroots music live at TAM/);
  assert.match(land, /src="\/js\/festival\.js"/);
  // and a free booking works
  const bk = await post('/api/bookings', { night: show.slug, type: 'free', qty: 2, name: 'Test Fan', email: 'fan@example.com' });
  assert.ok([200, 201].includes(bk.status), await bk.text());
});

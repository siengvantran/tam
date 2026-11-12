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

test('artists sign in with their email and post to their wall; fans leave notes; emails stay private', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-aw-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', PIN_MODERATION: 'on' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const H = { 'x-staff-token': ADMIN, 'content-type': 'application/json' };
  const J = { 'content-type': 'application/json' };
  const { date } = app.ctx.content.showcases.next;
  if (date < app.ctx.today()) return;
  const post = (p, b, h = J) => fetch(B + p, { method: 'POST', headers: h, body: JSON.stringify(b) });
  await post(`/api/showcases/${date}`, { count: 6, acts: [{ name: 'Justyna', vibe: 'disco', email: 'Justyna@Example.com' }, { name: 'Ariff A.B.', vibe: 'noir' }] }, H);

  // the email is never public
  const pub = await (await fetch(`${B}/api/showcases`)).text();
  assert.doesNotMatch(pub, /example\.com/i);
  assert.doesNotMatch(await (await fetch(`${B}/sunday-showcases/${date}/justyna`)).text(), /example\.com/i);
  // staff see it in the editor, and a save from the public line-up (no email field) keeps it
  const live = JSON.parse(pub);
  await post(`/api/showcases/${date}`, { count: 6, acts: live.acts.filter((a) => !a.tba).map((a) => ({ slug: a.slug, name: a.name, vibe: a.vibe })) }, H);
  const m = await (await fetch(`${B}/api/showcases/manage`, { headers: H })).json();
  assert.equal(m.showcases[0].acts.find((a) => a.slug === 'justyna').email, 'justyna@example.com');

  // a fan's note waits to be checked
  const note = await (await post(`/api/showcases/${date}/act/justyna/wall`, { name: 'Sam', message: 'See you Sunday!' })).json();
  assert.equal(note.status, 'pending');
  assert.equal((await (await fetch(`${B}/api/showcases/${date}/act/justyna/wall`)).json()).items.length, 0);

  // the artist asks for a sign-in link (email is off in tests: the link is logged)
  const logged = [];
  const warn = console.warn; console.warn = (...a) => { logged.push(a.join(' ')); };
  try {
    assert.equal((await post('/api/showcases/artist/link', { email: 'nobody@example.com' })).status, 200); // same answer for anyone
    await post('/api/showcases/artist/link', { email: 'justyna@example.com' });
  } finally { console.warn = warn; }
  const link = logged.map((l) => /\/sunday-showcases\/artist\/sign-in\?t=([\w-]+)/.exec(l)).find(Boolean);
  assert.ok(link, 'a sign-in link for Justyna only');
  assert.equal(logged.filter((l) => /sign-in\?t=/.test(l)).length, 1);
  const use = await post('/api/showcases/artist/link/use', { t: link[1] });
  assert.equal(use.status, 200);
  const cookie = use.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/showcases/artist/link/use', { t: link[1] })).status, 400); // once only
  const A = { ...J, cookie };
  const me = await (await fetch(`${B}/api/showcases/artist/me`, { headers: A })).json();
  assert.deepEqual(me.acts.map((a) => a.slug), ['justyna']);

  // her wall: she sees the waiting note, shows it, and adds her YouTube and Instagram posts
  const mine = await (await fetch(`${B}/api/showcases/${date}/act/justyna/wall`, { headers: A })).json();
  assert.equal(mine.items[0].status, 'pending');
  await post(`/api/showcases/${date}/act/justyna/wall/${mine.items[0].id}`, { status: 'shown' }, A);
  assert.equal((await post(`/api/showcases/${date}/act/justyna/wall/post`, { url: 'https://www.youtube.com/watch?v=Z_c4NlhkWdY' }, A)).status, 201);
  assert.equal((await post(`/api/showcases/${date}/act/justyna/wall/post`, { url: 'https://www.instagram.com/p/C1a2b3c4d5E/?igsh=x', caption: 'Rehearsal!' }, A)).status, 201);
  assert.equal((await post(`/api/showcases/${date}/act/justyna/wall/post`, { url: 'https://evil.example/x' }, A)).status, 400);
  // but not on someone else's wall, and not without signing in
  assert.equal((await post(`/api/showcases/${date}/act/ariff-a-b/wall/post`, { url: 'https://youtu.be/Z_c4NlhkWdY' }, A)).status, 403);
  assert.equal((await post(`/api/showcases/${date}/act/justyna/wall/post`, { url: 'https://youtu.be/Z_c4NlhkWdY' })).status, 403);

  // the public wall shows the note and the posts
  const page = await (await fetch(`${B}/sunday-showcases/${date}/justyna`)).text();
  assert.match(page, /<blockquote>See you Sunday!<\/blockquote><figcaption>Sam<\/figcaption>/);
  assert.match(page, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/Z_c4NlhkWdY"/);
  assert.match(page, /src="https:\/\/www\.instagram\.com\/p\/C1a2b3c4d5E\/embed"/);
  assert.match((await fetch(`${B}/`)).headers.get('content-security-policy'), /frame-src [^;]*https:\/\/www\.instagram\.com/);
  // the sign-in pages are there (and not taken for an act)
  assert.equal((await fetch(`${B}/sunday-showcases/artist`)).status, 200);
  assert.match(await (await fetch(`${B}/sunday-showcases/artist/sign-in?t=x`)).text(), /Signing you in/);
});

test('showcase.tam.tv: the microsite promotes the next showcase, shows the way in, and gathers the crew', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-ssx-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off', PIN_MODERATION: 'off', SITE_URL: 'https://www.tam.tv', INDEXING: 'on' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const H = { 'x-staff-token': ADMIN, 'content-type': 'application/json' };
  const { date } = app.ctx.content.showcases.next;
  if (date < app.ctx.today()) return;
  const post = (p, b, h = { 'content-type': 'application/json' }) => fetch(B + p, { method: 'POST', headers: h, body: JSON.stringify(b) });
  await post(`/api/showcases/${date}`, { count: 6, acts: [{ name: 'Justyna', vibe: 'pop', photo: '/img/showcases/justyna.jpg' }] }, H);
  await post(`/api/showcases/${date}/act/justyna/wall`, { name: 'Sam', message: 'See you Sunday!' });
  const SH = { 'x-forwarded-host': 'showcase.tam.tv' }; // as Railway passes the address on

  // the microsite on its own address, indexable, with its own canonical
  const r = await fetch(`${B}/`, { headers: SH });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-robots-tag'), null);
  const page = await r.text();
  assert.match(page, /<link rel="canonical" href="https:\/\/showcase\.tam\.tv\/">/);
  assert.match(page, /Your stage starts here\./);
  assert.match(page, /id="line-up"[\s\S]*data-carousel/); // the next showcase
  assert.match(page, /How to get on the line-up/);
  assert.match(page, /Where it can lead/);
  assert.match(page, /<blockquote>See you Sunday!<\/blockquote>/); // the walls
  assert.match(page, /Who's played the showcase[\s\S]*Justyna/); // everyone who's played
  assert.match(page, /id="crew"/);
  // every other page is on www.tam.tv
  const away = await fetch(`${B}/sunday-showcases/${date}/justyna?x=1`, { headers: SH, redirect: 'manual' });
  assert.equal(away.status, 302);
  assert.equal(away.headers.get('location'), `https://www.tam.tv/sunday-showcases/${date}/justyna?x=1`);
  assert.match(await (await fetch(`${B}/sitemap.xml`, { headers: SH })).text(), /<loc>https:\/\/showcase\.tam\.tv\/<\/loc>/);
  assert.match(await (await fetch(`${B}/robots.txt`, { headers: SH })).text(), /Sitemap: https:\/\/showcase\.tam\.tv\/sitemap\.xml/);
  // www.tam.tv's home is still its own
  assert.doesNotMatch(await (await fetch(`${B}/`, { headers: { 'x-forwarded-host': 'www.tam.tv' } })).text(), /Your stage starts here/);

  // joining the crew: consent needed; staff get the list
  assert.equal((await post('/api/showcases/crew', { name: 'Sam', email: 'sam@example.com', role: 'fan' })).status, 400);
  assert.equal((await post('/api/showcases/crew', { name: 'Sam', email: 'sam@example.com', role: 'fan', consent: true })).status, 201);
  assert.equal((await post('/api/showcases/crew', { name: 'Sam B', email: 'SAM@example.com', role: 'musician', consent: true })).status, 201); // same person, updated
  assert.equal((await fetch(`${B}/api/showcases/crew.csv`)).status, 401);
  const csv = await (await fetch(`${B}/api/showcases/crew.csv`, { headers: H })).text();
  assert.equal(csv.trim().split('\n').length, 2);
  assert.match(csv, /"Sam B","sam@example\.com","musician"/);
});

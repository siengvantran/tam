import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'tam-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_TOKEN = 'test-token';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createApp } = await import('../src/app.js');
const { loadContent, validate, queries, londonISO } = await import('../src/lib/content.js');
const { artwork, logo, daypart } = await import('../src/lib/brand.js');

const NOW = new Date('2026-10-08T20:30:00Z');
const c = loadContent();
const q = queries(c, NOW);

let server;
let base;
before(async () => {
  server = createServer(createApp({ content: c, clock: () => NOW }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });

const get = (p, opts) => fetch(base + p, { redirect: 'manual', ...opts });
const form = (p, data, headers = {}) => fetch(base + p, {
  method: 'POST', redirect: 'manual', body: new URLSearchParams(data), headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
});
const ldOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];

test('every URL of the old www.tam.tv still answers', async () => {
  for (const { path: p } of c.legacy) {
    const res = await get(p);
    if (p === '/home') {
      assert.equal(res.status, 301, p);
      assert.equal(res.headers.get('location'), '/');
    } else {
      assert.equal(res.status, 200, p);
    }
  }
  // Old artist URLs keep their exact slugs.
  for (const p of ['/artists/danagillespie', '/artists/hans-theessink', '/artists/dino-baptiste', '/locations/elephant-castle', '/tv', '/whats-on']) {
    assert.equal((await get(p)).status, 200, p);
  }
});

test('hub pages render with structured data', async () => {
  const pages = ['/', '/whats-on', '/artists', '/archive', '/series', '/genres', '/locations', '/tv', '/listen', '/stories', '/about', '/submit', '/privacy',
    ...q.years().map((y) => `/archive/${y}`), ...c.series.slice(0, 5).map((s) => `/series/${s.slug}`), ...c.venues.map((v) => `/locations/${v.slug}`),
    ...q.genres().map((g) => `/genres/${g}`), ...c.videos.slice(0, 3).map((v) => `/tv/${v.slug}`), ...c.stories.map((s) => `/stories/${s.slug}`)];
  for (const p of pages) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    const html = await res.text();
    assert.match(html, /<title>[^<]+<\/title>/, p);
    assert.match(html, /application\/ld\+json/, p);
    assert.ok(res.headers.get('content-security-policy'), p);
  }
});

test('moved URLs redirect permanently', async () => {
  for (const [from, to] of [['/watch', '/tv'], ['/festival', '/whats-on'], ['/events', '/whats-on']]) {
    const res = await get(from);
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('location'), to);
  }
});

test('the archive holds the Eventbrite history', () => {
  assert.ok(c.events.length > 1500, `${c.events.length} events`);
  assert.ok(c.artists.filter((a) => a.appearances).length > 250);
  const dana = q.artist('danagillespie');
  assert.ok(dana.legend);
  assert.ok(dana.appearances >= 40);
  assert.ok(q.eventsFor('danagillespie').every((e) => /Dana/i.test(e.title)), 'every Dana night names her');
  assert.equal(q.artist('david-gray').note.includes('not the singer-songwriter'), true);
});

test('an artist page is a full record of their nights', async () => {
  const html = await (await get('/artists/dino-baptiste')).text();
  const a = q.artist('dino-baptiste');
  assert.match(html, new RegExp(`${a.appearances} nights at TAM`));
  assert.match(html, /Shared the bill with/);
  assert.match(html, /data-demand/);
  const artist = ldOf(html).find((n) => n['@type'] === 'MusicGroup');
  assert.equal(artist.name, 'Dino Baptiste');
  assert.ok(artist.performerIn.length > 0);
});

test('a past night page links its performers, venue and series', async () => {
  const e = q.past().find((x) => x.performers.length && x.series && x.venue !== 'elsewhere');
  const html = await (await get(`/events/${e.slug}`)).text();
  for (const p of e.performers) assert.ok(html.includes(`/artists/${p}"`), p);
  assert.ok(html.includes(`/locations/${e.venue}"`));
  assert.ok(html.includes(`/series/${e.series}"`));
  assert.match(html, /I was there/);
  const ev = ldOf(html).find((n) => n['@type'] === 'MusicEvent');
  assert.equal(ev.startDate, e.start);
  assert.equal(ev.location['@type'], 'MusicVenue');
});

test('discovery endpoints cover the whole archive', async () => {
  const sitemap = await (await get('/sitemap.xml')).text();
  for (const p of ['/artists/danagillespie', '/locations/smithfield', '/nft/holly-penfield', `/events/${c.events[0].slug}`, '/archive/2023']) {
    assert.ok(sitemap.includes(`${p}</loc>`), p);
  }
  assert.ok(!sitemap.includes('/home</loc>'));
  const llms = await (await get('/llms.txt')).text();
  assert.match(llms, /^# TAM/);
  assert.match(llms, /Dana Gillespie\]\([^)]+\): cult legend/);
  const graph = await (await get('/graph.json')).json();
  assert.ok(graph['@graph'].filter((n) => n['@type'] === 'MusicEvent').length > 1500);
});

test('calendar export for an upcoming night', async () => {
  const e = q.upcoming()[0];
  const res = await get(`/events/${e.slug}.ics`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /BEGIN:VEVENT/);
  assert.ok(body.includes(e.url.replace(/[,;]/g, (m) => `\\${m}`)));
});

test('London times carry the right offset', () => {
  assert.equal(londonISO('2023-07-01', '19:00'), '2023-07-01T19:00:00+01:00');
  assert.equal(londonISO('2023-01-15', '19:00'), '2023-01-15T19:00:00+00:00');
});

test('"Bring them back" and "I was there" are counted', async () => {
  const send = (data) => form('/demand', data, { accept: 'application/json' });
  let res = await send({ type: 'bring-back', target: 'dino-baptiste' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).count, 1);
  // The same person pressing again the same day isn't double-counted.
  res = await send({ type: 'bring-back', target: 'dino-baptiste' });
  assert.equal((await res.json()).count, 1);
  // Emails need consent.
  res = await send({ type: 'bring-back', target: 'danagillespie', email: 'fan@example.com' });
  assert.equal(res.status, 422);
  res = await send({ type: 'bring-back', target: 'danagillespie', email: 'fan@example.com', consent: 'on' });
  assert.equal(res.status, 200);
  // Unknown targets are refused.
  assert.equal((await send({ type: 'was-there', target: 'no-such-night' })).status, 422);
  // Without JS: redirect back to the page.
  res = await form('/demand', { type: 'was-there', target: q.past()[0].slug, back: `/events/${q.past()[0].slug}` });
  assert.equal(res.status, 303);
  const rows = readFileSync(path.join(dataDir, 'demand.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].email, 'fan@example.com');
  assert.match(await (await get('/artists/dino-baptiste')).text(), /1<\/strong> person wants them back/);
});

test('static files cannot escape public/', async () => {
  const status = (p) => new Promise((resolve) => {
    const u = new URL(base);
    request({ host: u.hostname, port: u.port, path: p }, (res) => { res.resume(); resolve(res.statusCode); }).end();
  });
  assert.equal(await status('/css/..%2f..%2fpackage.json'), 404);
  assert.equal(await status('/css/../../package.json'), 404);
});

test('Play TAM submission validates, then stores', async () => {
  const bad = await form('/submit', { name: '', email: 'nope' });
  assert.equal(bad.status, 422);
  assert.match(await bad.text(), /aria-invalid="true"/);
  const good = await form('/submit', {
    name: 'Sam', email: 'Sam@Example.com', act: 'Sam & the Tides', proposal: 'A night of tidal blues with two support acts.',
    link1: 'https://example.com/sam', link2: 'javascript:alert(1)', privacy: 'on', newsletter: 'on',
  });
  assert.equal(good.status, 303);
  const rows = readFileSync(path.join(dataDir, 'submissions.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).email, 'sam@example.com');
  assert.deepEqual(rows.at(-1).links, ['https://example.com/sam']);
});

test('newsletter requires explicit consent', async () => {
  assert.equal((await form('/signup', { email: 'a@b.co' })).status, 422);
  assert.equal((await form('/signup', { email: 'a@b.co', consent: 'on' })).status, 200);
});

test('analytics are only stored with consent', async () => {
  const send = (cookie) => fetch(`${base}/api/track`, { method: 'POST', body: JSON.stringify({ type: 'view', path: '/x' }), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
  assert.equal((await send()).status, 204);
  assert.throws(() => readFileSync(path.join(dataDir, 'events.jsonl')));
  assert.equal((await send('tam_consent=granted; tam_vid=abc')).status, 204);
  assert.match(readFileSync(path.join(dataDir, 'events.jsonl'), 'utf8'), /"visitor":"abc"/);
});

test('production agent is token-protected and reports when AI is off', async () => {
  const call = (token) => fetch(`${base}/api/agent/production`, { method: 'POST', body: JSON.stringify({ artist: 'dino-baptiste' }), headers: { 'content-type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) } });
  assert.equal((await call()).status, 401);
  assert.equal((await call('wrong')).status, 401);
  const res = await call('test-token');
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
});

test('every name gets its own coloured vinyl; legends get Legend Edition', async () => {
  const { pressing, COLOURWAYS, PRESSINGS } = await import('../src/lib/vinyl.js');
  assert.deepEqual(pressing('Dino Baptiste'), pressing('Dino Baptiste'));
  const seen = new Set(Array.from({ length: 2000 }, (_, i) => pressing(`Artist ${i}`).title));
  assert.equal(seen.size, COLOURWAYS.length * PRESSINGS.length);
  assert.equal(artwork('Dino Baptiste'), artwork('Dino Baptiste'));
  assert.notEqual(artwork('Dino Baptiste'), artwork('Harry Whitty'));
  assert.match(artwork('<script>'), /&lt;SCRIPT&gt;/);
  assert.match(await (await get('/art/danagillespie.svg')).text(), /Legend Edition/);
  assert.match(await (await get('/artists/danagillespie')).text(), /chip-legend/);
});

test('the logo is always the original artwork', async () => {
  const html = await (await get('/')).text();
  assert.match(html, /src="\/img\/tam-logo-640\.png"/);
  assert.match(html, /src="\/img\/tam-mark-96\.png"/);
  for (const f of ['tam-logo.png', 'tam-mark.png', 'tam-wordmark.png', 'favicon-48.png', 'og.jpg']) {
    assert.equal((await get(`/img/${f}`)).status, 200, f);
  }
  assert.match(logo('mark', { width: 40 }), /width="40" height="40"/);
});

test('archived photos are served locally, not hotlinked', async () => {
  const withImages = c.legacy.filter((p) => p.images.length);
  assert.ok(withImages.length > 10);
  for (const p of withImages) for (const src of p.images) assert.match(src, /^\/img\/archive\/[0-9a-f]{16}\.webp$/);
  assert.equal((await get(withImages[0].images[0])).status, 200);
});

test('the TAM 108 fall with lyrics only where publishable', async () => {
  const songs = await (await get('/chorus.json')).json();
  assert.equal(songs.length, 108);
  const broken = structuredClone({ ...c, index: undefined });
  broken.chorus.songs[0].chorus = ['a line'];
  broken.chorus.songs[0].publicDomain = false;
  assert.throws(() => validate(broken), /not marked publicDomain or licensed/);
});

test('content validation catches broken references', () => {
  const broken = structuredClone({ ...c, index: undefined });
  broken.events[0].performers = ['nobody'];
  assert.throws(() => validate(broken), /unknown performer "nobody"/);
});

test('London time sets the daypart', () => {
  assert.equal(daypart(6), 'dawn');
  assert.equal(daypart(12), 'day');
  assert.equal(daypart(19), 'dusk');
  assert.equal(daypart(23), 'night');
});

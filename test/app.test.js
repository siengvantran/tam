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
const { loadContent, validate } = await import('../src/lib/content.js');
const { artwork, logo, daypart } = await import('../src/lib/brand.js');

let server;
let base;
before(async () => {
  server = createServer(createApp({ clock: () => new Date('2026-10-08T20:30:00Z') }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });

const get = (p, opts) => fetch(base + p, opts);
const form = (p, data, headers = {}) => fetch(base + p, {
  method: 'POST', redirect: 'manual', body: new URLSearchParams(data), headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
});

test('every public page renders', async () => {
  const c = loadContent();
  const pages = ['/', '/festival', '/artists', '/watch', '/listen', '/stories', '/about', '/submit', '/privacy', '/studio',
    ...c.artists.map((a) => `/artists/${a.slug}`), ...c.events.map((e) => `/events/${e.slug}`),
    ...c.videos.map((v) => `/watch/${v.slug}`), ...c.stories.map((s) => `/stories/${s.slug}`)];
  for (const p of pages) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    const html = await res.text();
    assert.match(html, /<title>[^<]+<\/title>/, p);
    assert.match(html, /application\/ld\+json/, p);
    assert.ok(res.headers.get('content-security-policy'), p);
  }
});

test('unknown pages 404 with generated artwork', async () => {
  const res = await get('/no-such-page');
  assert.equal(res.status, 404);
  assert.match(await res.text(), /class="tam-art"/);
});

test('artist page carries MusicGroup structured data linked to events', async () => {
  const html = await (await get('/artists/the-night-ferries')).text();
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const artist = ld['@graph'].find((n) => n['@type'] === 'MusicGroup');
  assert.equal(artist.name, 'The Night Ferries');
  assert.ok(artist.performerIn.length > 0);
});

test('discovery endpoints', async () => {
  const sitemap = await (await get('/sitemap.xml')).text();
  assert.match(sitemap, /\/artists\/ada-okoro/);
  const llms = await (await get('/llms.txt')).text();
  assert.match(llms, /^# TAM/);
  const graph = await (await get('/graph.json')).json();
  assert.ok(graph['@graph'].some((n) => n['@type'] === 'MusicEvent'));
  const robots = await (await get('/robots.txt')).text();
  assert.match(robots, /Sitemap:/);
});

test('calendar export', async () => {
  const res = await get('/events/emerging-artist-night-2026-10-24.ics');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /BEGIN:VEVENT/);
  assert.match(body, /DTSTART:20261024T180000Z/);
});

test('static files cannot escape public/', async () => {
  const status = await new Promise((resolve) => {
    request(`${base}/css/..%2f..%2fpackage.json`, (res) => { res.resume(); resolve(res.statusCode); }).end();
  });
  assert.equal(status, 404);
  const raw = await new Promise((resolve) => {
    const u = new URL(base);
    request({ host: u.hostname, port: u.port, path: '/css/../../package.json' }, (res) => { res.resume(); resolve(res.statusCode); }).end();
  });
  assert.equal(raw, 404);
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
  assert.match(readFileSync(path.join(dataDir, 'signups.jsonl'), 'utf8'), /sam@example.com/);
});

test('honeypot submissions are dropped silently', async () => {
  const res = await form('/submit', { website: 'spam', name: 'x' });
  assert.equal(res.status, 303);
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

test('consent banner only shows until a choice is made', async () => {
  assert.match(await (await get('/')).text(), /class="consent"/);
  assert.doesNotMatch(await (await get('/', { headers: { cookie: 'tam_consent=denied' } })).text(), /class="consent"/);
});

test('production agent is token-protected and reports when AI is off', async () => {
  const call = (token) => fetch(`${base}/api/agent/production`, { method: 'POST', body: JSON.stringify({ artist: 'ada-okoro' }), headers: { 'content-type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) } });
  assert.equal((await call()).status, 401);
  assert.equal((await call('wrong')).status, 401);
  const res = await call('test-token');
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
});

test('artwork is deterministic and distinct', () => {
  assert.equal(artwork('Ada Okoro'), artwork('Ada Okoro'));
  assert.notEqual(artwork('Ada Okoro'), artwork('Marlowe Grey'));
  assert.match(artwork('<script>'), /&lt;SCRIPT&gt;/);
});

test('the logo is always the original artwork', async () => {
  const html = await (await get('/')).text();
  assert.match(html, /src="\/img\/tam-logo-640\.png"/);
  assert.match(html, /src="\/img\/tam-mark-96\.png"/);
  for (const f of ['tam-logo.png', 'tam-logo-640.png', 'tam-mark.png', 'tam-mark-96.png', 'tam-wordmark.png', 'tam-wordmark-160.png', 'favicon-48.png', 'apple-touch-icon.png', 'og.jpg']) {
    const res = await get(`/img/${f}`);
    assert.equal(res.status, 200, f);
  }
  assert.match(logo('mark', { width: 40 }), /width="40" height="40"/);
});

test('the TAM 108 fall with lyrics only where publishable', async () => {
  const songs = await (await get('/chorus.json')).json();
  assert.equal(songs.length, 108);
  const c = loadContent();
  for (const s of c.chorus.songs) if (s.chorus.length) assert.ok(s.publicDomain || s.licensed, s.title);
  const broken = structuredClone(c);
  broken.chorus.songs[0].chorus = ['a line'];
  broken.chorus.songs[0].publicDomain = false;
  assert.throws(() => validate(broken), /not marked publicDomain or licensed/);
});

test('London time sets the daypart', () => {
  assert.equal(daypart(6), 'dawn');
  assert.equal(daypart(12), 'day');
  assert.equal(daypart(19), 'dusk');
  assert.equal(daypart(23), 'night');
});

test('content validation catches broken references', () => {
  const c = loadContent();
  const broken = structuredClone(c);
  broken.events[0].artists.push('nobody');
  assert.throws(() => validate(broken), /unknown artist "nobody"/);
});

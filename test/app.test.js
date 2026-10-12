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
const { createStripe } = await import('../src/lib/stripe.js');
const { createHmac } = await import('node:crypto');

const NOW = new Date('2026-10-08T20:30:00Z');
const c = loadContent();
const q = queries(c, NOW);

// A stand-in for YouTube's channel feed.
const FEED = `<feed><entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Brand New &amp; Live at TAM</title><published>2026-10-01T10:00:00+00:00</published></entry>
<entry><yt:videoId>${c.videos[0].youtubeId}</yt:videoId><title>${c.videos[0].title}</title><published>2026-09-01T10:00:00+00:00</published></entry></feed>`;
const tvFetcher = async () => ({ ok: true, text: async () => FEED });

// A stand-in for Stripe's API, so the real client (and its request format) is tested.
const stripeSessions = new Map();
const stripeFetch = async (url, opts) => {
  if (opts.method === 'POST' && url.endsWith('/checkout/sessions')) {
    const f = new URLSearchParams(opts.body);
    const s = {
      id: `cs_test_${stripeSessions.size + 1}`, url: `https://checkout.stripe.com/c/pay/cs_test_${stripeSessions.size + 1}`,
      metadata: { order: f.get('metadata[order]') }, amount_total: Number(f.get('line_items[0][quantity]')) * Number(f.get('line_items[0][price_data][unit_amount]')),
      currency: f.get('line_items[0][price_data][currency]'), payment_status: 'unpaid',
    };
    stripeSessions.set(s.id, s);
    return { ok: true, json: async () => s };
  }
  const id = decodeURIComponent(url.split('/').pop());
  return stripeSessions.has(id) ? { ok: true, json: async () => stripeSessions.get(id) } : { ok: false, status: 404, json: async () => ({ error: { message: 'No such session' } }) };
};
const stripe = createStripe({ secretKey: 'sk_test_x', webhookSecret: 'whsec_test', fetcher: stripeFetch });

let server;
let base;
before(async () => {
  server = createServer(createApp({ content: c, clock: () => NOW, tvFetcher, stripe, dataDir }));
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
  const pages = ['/', '/whats-on', '/artists', '/archive', '/series', '/genres', '/locations', '/tv', '/academy', '/listen', '/stories', '/about', '/submit', '/privacy',
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
});

test('an artist page is a full record of their nights', async () => {
  const html = await (await get('/artists/dino-baptiste')).text();
  for (const e of q.eventsFor('dino-baptiste').filter((x) => q.isPast(x)).slice(0, 5)) assert.ok(html.includes(`/events/${e.slug}"`), e.slug);
  assert.match(html, /Nights at TAM/);
  assert.match(html, /some nights may be missing/);
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

// ---------------------------------------------------------------- feedback round

test('no unverifiable totals are published', async () => {
  const home = await (await get('/')).text();
  for (const phrase of [/nights of live music/, /named artists/, /London venues/, /regular nights<\/dt>/, /seven days a week/i, /Daytime in London/, /twice a month/i]) {
    assert.doesNotMatch(home, phrase);
  }
  const artistsPage = await (await get('/artists')).text();
  assert.doesNotMatch(artistsPage, /Most-played/);
  assert.doesNotMatch(await (await get('/archive')).text(), /\d+ nights/);
  assert.doesNotMatch(await (await get('/whats-on')).text(), /seven days a week|noticeboard/i);
  assert.doesNotMatch(await (await get('/llms.txt')).text(), /\d+ nights/);
});

test('Hans Theessink is not listed as having played TAM, but his old URL still works', async () => {
  assert.equal(q.artist('hans-theessink'), undefined);
  assert.doesNotMatch(await (await get('/artists')).text(), /Hans Theessink/);
  const res = await get('/artists/hans-theessink');
  assert.equal(res.status, 200);
  assert.doesNotMatch(await res.text(), /Bring them back/);
});

test('About is rewritten: academy, no food claim, no Mercato history, no logo claims', async () => {
  const about = await (await get('/about')).text();
  assert.match(about, /TAM Academy/);
  assert.doesNotMatch(about, /food/i);
  assert.doesNotMatch(about, /Andrea Rasca/);
  assert.doesNotMatch(about, /two Ms|TAM 108|keeps London time/);
  assert.match(await (await get('/academy')).text(), /Dana Gillespie/);
});

test('past regular nights and venues are not presented as current', async () => {
  const current = q.currentSeries().map((s) => s.name);
  const series = await (await get('/series')).text();
  for (const s of c.series.filter((x) => !current.includes(x.name))) assert.ok(!series.includes(`>${s.name}</a>`), s.name);
  const old = c.venues.find((v) => !q.isCurrentVenue(v.slug));
  if (old) assert.match(await (await get(`/locations/${old.slug}`)).text(), /doesn’t currently run nights here/);
});

test('TAM TV is live from the YouTube feed, with the archive as fallback', async () => {
  const html = await (await get('/tv')).text();
  assert.match(html, /Brand New &amp; Live at TAM/);
  assert.ok(html.indexOf('Brand New') < html.indexOf(c.videos[1].title), 'newest first');
  assert.match(html, /youtube\.com\/@TAM88/);
  // YouTube down: the archive is shown instead.
  const offline = createApp({ content: c, clock: () => NOW, tvFetcher: async () => { throw new Error('offline'); }, stripe, dataDir });
  const srv = createServer(offline);
  await new Promise((r) => srv.listen(0, r));
  const page = await (await fetch(`http://127.0.0.1:${srv.address().port}/tv`)).text();
  srv.close();
  assert.ok(page.includes(c.videos[0].title.replace(/&/g, '&amp;')));
});

// ---------------------------------------------------------------- ticketing

const staff = async () => {
  const res = await form('/box-office/login', { token: 'test-token' });
  assert.equal(res.status, 303);
  return res.headers.get('set-cookie').split(';')[0];
};

test('box office needs the token', async () => {
  assert.equal((await get('/box-office/e/x')).status, 401);
  assert.equal((await form('/box-office/login', { token: 'nope' })).status, 401);
  const cookie = await staff();
  assert.match(cookie, /^tam_bo=[0-9a-f]{64}$/);
  assert.equal((await get('/box-office', { headers: { cookie } })).status, 200);
  // Posts from other sites are refused.
  assert.equal((await form('/box-office/checkin', { code: 'x' }, { cookie, origin: 'https://evil.example' })).status, 403);
});

test('free tickets: book, capacity, ticket page, check-in, guest list', async () => {
  const cookie = await staff();
  const e = q.upcoming()[0];
  // Before sales open, the night links to Eventbrite.
  assert.match(await (await get(`/events/${e.slug}`)).text(), /Tickets on Eventbrite/);
  let res = await form(`/box-office/e/${e.slug}/config`, { open: 'on', capacity: '3', type0_name: 'General admission', type0_price: '0' }, { cookie });
  assert.equal(res.headers.get('location'), `/box-office/e/${e.slug}?msg=saved`);
  const page = await (await get(`/events/${e.slug}`)).text();
  assert.match(page, /Book tickets/);
  assert.doesNotMatch(page, /Tickets on Eventbrite/);

  const book = (qty, name = 'Ada', email = 'ada@example.com') => form(`/events/${e.slug}/book`, { type: 'general-admission', qty: String(qty), name, email, terms: 'on' });
  assert.equal((await form(`/events/${e.slug}/book`, { type: 'general-admission', qty: '1', name: 'Ada', email: 'ada@example.com' })).status, 422, 'needs privacy tick');
  res = await book(2);
  assert.equal(res.status, 303);
  const ticketUrl = res.headers.get('location');
  assert.match(ticketUrl, /^\/tickets\/TAM-[A-Z0-9]{5}-[A-Z0-9]{5}\?booked$/);
  const ticket = await (await get(ticketUrl)).text();
  assert.match(ticket, /<svg[^>]+viewBox/);
  assert.match(ticket, /2 × General admission/);

  res = await book(2, 'Bo', 'bo@example.com');
  assert.equal(res.status, 422);
  assert.match(await res.text(), /Only 1 left/);
  assert.equal((await book(1, '=cmd()', 'eve@example.com')).status, 303);
  res = await book(1, 'Late', 'late@example.com');
  assert.match(await res.text(), /Sold out/);

  const code = ticketUrl.split('/')[2].split('?')[0];
  res = await form('/box-office/checkin', { code }, { cookie });
  assert.match(res.headers.get('location'), new RegExp(`\\?in=${code}`));
  res = await form('/box-office/checkin', { code }, { cookie });
  assert.match(res.headers.get('location'), /why=done/);
  assert.match(await (await get(`/tickets/${code}`)).text(), /Checked in<\/dt><dd>2 of 2/);

  const csv = await (await get(`/box-office/e/${e.slug}.csv`, { headers: { cookie } })).text();
  assert.match(csv, /^name,email,code/);
  assert.match(csv, /Ada,ada@example.com/);
  assert.match(csv, /'=cmd\(\)/, 'spreadsheet formulas are neutralised');
  assert.equal((await get(`/box-office/e/${e.slug}.csv`)).status, 401);
});

test('paid tickets go through Stripe and are confirmed on return or by webhook', async () => {
  const cookie = await staff();
  const e = q.upcoming()[1];
  await form(`/box-office/e/${e.slug}/config`, { open: 'on', type0_name: 'Advance', type0_price: '12.50', type0_capacity: '50' }, { cookie });
  let res = await form(`/events/${e.slug}/book`, { type: 'advance', qty: '2', name: 'Sam', email: 'sam@example.com', terms: 'on' });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /^https:\/\/checkout\.stripe\.com\//);
  const session = [...stripeSessions.values()].at(-1);
  assert.equal(session.amount_total, 2500);
  assert.equal(session.currency, 'gbp');
  const code = [...(await (await get(`/box-office/e/${e.slug}`, { headers: { cookie } })).text()).matchAll(/TAM-[A-Z0-9]{5}-[A-Z0-9]{5}/g)].at(-1)[0];

  // Not paid yet: no QR code.
  let page = await (await get(`/tickets/${code}?session_id=${session.id}`)).text();
  assert.match(page, /Waiting for payment/);
  // Paid: confirmed on return.
  session.payment_status = 'paid';
  page = await (await get(`/tickets/${code}?session_id=${session.id}`)).text();
  assert.match(page, /Payment received/);
  assert.match(page, /<svg[^>]+viewBox/);

  // A second order, confirmed by a signed webhook instead.
  res = await form(`/events/${e.slug}/book`, { type: 'advance', qty: '1', name: 'Kim', email: 'kim@example.com', terms: 'on' });
  const s2 = [...stripeSessions.values()].at(-1);
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { ...s2, payment_status: 'paid' } } });
  const t = Math.floor(NOW.getTime() / 1000);
  const sig = createHmac('sha256', 'whsec_test').update(`${t}.${payload}`).digest('hex');
  const hook = (signature) => fetch(`${base}/api/stripe/webhook`, { method: 'POST', body: payload, headers: { 'content-type': 'application/json', 'stripe-signature': signature } });
  assert.equal((await hook(`t=${t},v1=${'0'.repeat(64)}`)).status, 400, 'forged signature refused');
  assert.equal((await hook(`t=${t},v1=${sig}`)).status, 200);
  const list = await (await get(`/box-office/e/${e.slug}`, { headers: { cookie } })).text();
  assert.match(list, /Kim<\/strong>[\s\S]*?<td>paid<\/td>/);
});

test('paid tickets are hidden when Stripe is not set up', async () => {
  const noPay = createApp({ content: c, clock: () => NOW, tvFetcher, stripe: createStripe({ secretKey: '' }), dataDir });
  const srv = createServer(noPay);
  await new Promise((r) => srv.listen(0, r));
  const e = q.upcoming()[1];
  const html = await (await fetch(`http://127.0.0.1:${srv.address().port}/events/${e.slug}`)).text();
  srv.close();
  assert.doesNotMatch(html, /Book tickets/);
  assert.match(html, /Tickets on Eventbrite/);
});

test('venue pages drop the old "7 days a week" and opening hours', async () => {
  for (const p of ['/locations', '/locations/elephant-castle']) {
    const html = await (await get(p)).text();
    assert.doesNotMatch(html, /7 days a week|Opening Times|Andrea Rasca/i, p);
  }
});

test('artists TAM asked to remove are gone everywhere', async () => {
  const rx = /mark banks|samuel virgo|stuffy and the fuses|david gray/i;
  for (const slug of ['mark-banks', 'samuel-virgo', 'stuffy-and-the-fuses', 'david-gray']) {
    assert.equal(q.artist(slug), undefined, slug);
    const res = await get(`/artists/${slug}`);
    assert.equal(res.status, 410, slug);
    assert.doesNotMatch(await res.text(), rx);
  }
  assert.ok(!c.events.some((e) => rx.test(e.title)), 'no nights name them');
  // A removed night's old URL is gone too.
  const old = c.removed.size && [...c.removed].find((p) => p.startsWith('/events/'));
  assert.equal((await get(old)).status, 410);
  for (const p of ['/artists', '/sitemap.xml', '/llms.txt', '/graph.json', '/archive/2022', '/archive/2023']) {
    assert.doesNotMatch(await (await get(p)).text(), rx, p);
  }
});

test('the Best Christmas Ever: Dana Gillespie’s show opens with the Golden Hour for the juniors', async () => {
  const slug = 'dana-gillespie-the-best-christmas-ever-2026-12-16';
  const e = q.event(slug);
  assert.equal(e.start, '2026-12-16T19:00:00+00:00');
  assert.equal(e.festival, 'tam-christmas-festival');
  assert.deepEqual(e.performers, ['danagillespie', 'the-london-blues-band']);
  const html = await (await get(`/events/${slug}`)).text();
  assert.match(html, /The Golden Hour/);
  assert.match(html, /href="\/the-best-christmas-ever">TAM Christmas Festival/);
  assert.doesNotMatch(html, /Tickets on Eventbrite|href=""/, 'a TAM-only night has no Eventbrite link');
  assert.match(html, /Book early, pay less/);
  const ev = ldOf(html).find((n) => n['@type'] === 'MusicEvent');
  assert.ok(ev.superEvent.some((s) => s['@type'] === 'Festival'));
  // Juniors: it shows on the Academy page too.
  assert.match(await (await get('/academy')).text(), new RegExp(slug));
});

test('the Christmas festival landing page lists its shows and plays the song', async () => {
  const res = await get('/the-best-christmas-ever');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /youtube-nocookie\.com\/embed\/PJLdrC-1tZw/);
  assert.match(html, /\/events\/dana-gillespie-the-best-christmas-ever-2026-12-16/);
  assert.match(html, /Christmas at TAM before/, 'Dana’s earlier Christmas nights are listed');
  assert.match(html, /Christmas party one to remember/, 'the old page’s text is kept for search');
  const fest = ldOf(html).find((n) => n['@type'] === 'Festival');
  assert.equal(fest.name, 'TAM Christmas Festival');
  assert.ok(fest.subEvent.length >= 1);
  // Promoted from the home and What's on pages while it has shows coming up.
  for (const p of ['/', '/whats-on']) assert.match(await (await get(p)).text(), /href="\/the-best-christmas-ever"/, p);
});

test('festivals are validated', () => {
  assert.throws(() => validate({ ...c, events: [...c.events, { ...c.events[0], slug: 'x-1', festival: 'nope' }] }), /unknown festival "nope"/);
});

test('Christmas tickets: the price steps up by date or when a tier sells out, £30 the week before', async () => {
  const slug = 'dana-gillespie-the-best-christmas-ever-2026-12-16';
  const { createBoxOffice } = await import('../src/lib/tickets.js');
  const dir = mkdtempSync(path.join(tmpdir(), 'tam-ladder-'));
  let t = Date.parse('2026-10-12T12:00:00Z');
  const office = createBoxOffice({ dataDir: dir, now: () => t, schedules: { [slug]: q.event(slug).pricing } });
  const price = () => office.offer(slug, { paymentsEnabled: true })?.types[0].price;
  assert.equal(price(), 1500, 'Early Bird');
  assert.equal(office.offer(slug, { paymentsEnabled: false }), null, 'paid tickets wait for Stripe');
  // The first 50 go at the Early Bird price; then it's Advent, even in October.
  const book = (qty) => office.book({ event: slug, typeId: 'ticket', qty, name: 'A', email: 'a@example.com' }, { paymentsEnabled: true });
  for (let i = 0; i < 6; i++) assert.ok(book(8).order);
  assert.match(book(3).error, /Only 2 left at the Early Bird price/);
  const last = book(2).order;
  assert.equal(last.total, 3000);
  assert.equal(last.typeName, 'Christmas ticket (Early Bird)');
  assert.equal(price(), 2000, 'Advent once the Early Birds are gone');
  // By date.
  t = Date.parse('2026-11-29T23:59:00Z'); assert.equal(price(), 2000);
  t = Date.parse('2026-11-30T00:00:00Z'); assert.equal(price(), 2500, 'Last Orders');
  t = Date.parse('2026-12-09T00:00:00Z'); assert.equal(price(), 3000, 'the week before: door price');
  t = Date.parse('2026-12-16T18:00:00Z'); assert.equal(price(), 3000);
  // Staff can still close sales.
  await office.setConfig(slug, { open: false, capacity: null });
  assert.equal(office.offer(slug, { paymentsEnabled: true }), null);
  await office.flush();
  rmSync(dir, { recursive: true, force: true });
});

test('the Christmas show page shows the price ladder and its offers', async () => {
  const slug = 'dana-gillespie-the-best-christmas-ever-2026-12-16';
  const html = await (await get(`/events/${slug}`)).text();
  assert.match(html, /aria-current="true">\s*<span class="ladder-name">Early Bird<\/span>\s*<span class="ladder-price">£15/);
  assert.match(html, /save <strong>£15<\/strong> on the door price/);
  assert.match(html, /\d+ left at this price/);
  assert.match(html, /Christmas ticket <span class="chip">Early Bird price/);
  const offers = ldOf(html).find((n) => n['@type'] === 'MusicEvent').offers;
  assert.deepEqual(offers.map((o) => o.price), ['15.00', '20.00', '25.00', '30.00']);
  assert.equal(offers[3].validFrom, '2026-12-09T00:00:00+00:00');
  // The box office shows the schedule and what each step has sold.
  const bo = await (await get(`/box-office/e/${slug}`, { headers: { cookie: await staff() } })).text();
  assert.match(bo, /sells on a price schedule/);
  assert.match(bo, /On the door: £30/);
});

test('price schedules are validated', () => {
  const e = q.event('dana-gillespie-the-best-christmas-ever-2026-12-16');
  const bad = { ...e, slug: 'x-2', pricing: { tiers: [{ id: 'a', price: 10.5 }, { id: 'a', price: 1000 }] } };
  assert.throws(() => validate({ ...c, events: [...c.events, bad] }), /whole pence|unique id|never ends/);
});

test('the Christmas show sells itself: highlights about Dana and the band, every link works', async () => {
  const slug = 'dana-gillespie-the-best-christmas-ever-2026-12-16';
  const html = await (await get(`/events/${slug}`)).text();
  assert.match(html, /Why you’ll want to be there/);
  for (const x of q.event(slug).highlights) {
    assert.ok(html.includes(x.title.replace(/&/g, '&amp;')), x.title);
    for (const [, href] of x.links || []) assert.equal((await get(href)).status, 200, href);
  }
  assert.match(html, /Andy Warhol/);
  assert.match(html, /href="#book">Book now at £15/);
});

test('tech nights: a landing page for sponsors, seeded with 21 crypto communities', async () => {
  const res = await get('/tech-nights');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.equal(c.techNights.communities.length, 21);
  for (const x of c.techNights.communities) assert.ok(html.includes(`id="c-${x.slug}"`), x.slug);
  assert.match(html, /21 crypto communities/);
  assert.match(html, /not sponsors or partners of TAM/);
  assert.match(html, /Networkverse- NFT &amp; Web3/, 'past tech nights from the archive');
  const list = ldOf(html).find((n) => n['@type'] === 'ItemList');
  assert.equal(list.itemListElement.length, 21);
  assert.match(await (await get('/sitemap.xml')).text(), /\/tech-nights</);
});

test('tech nights: "I’d come" votes put the most wanted communities first', async () => {
  const vote = (target) => form('/demand', { type: 'want-community', target }, { accept: 'application/json', 'user-agent': `voter-${Math.random()}` });
  assert.equal((await vote('algorand')).status, 200);
  assert.equal((await vote('nope')).status, 422);
  const html = await (await get('/tech-nights')).text();
  assert.ok(html.indexOf('id="c-algorand"') < html.indexOf('id="c-bitcoin"'), 'the voted community moves up');
  assert.match(html, /<strong>1<\/strong> person wants this at TAM/);
});

test('tech nights: sponsor enquiries are validated and stored', async () => {
  let res = await form('/tech-nights', { name: 'Ada', email: 'bad' });
  assert.equal(res.status, 422);
  assert.match(await res.text(), /We need a valid email/);
  res = await form('/tech-nights', { name: 'Ada', email: 'ada@example.com', organisation: 'Example Labs', community: 'solana', format: 'Demo nights', message: 'A demo night for London builders, with drinks after.', privacy: 'on' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/tech-nights?thanks#enquire');
  const rows = readFileSync(path.join(dataDir, 'tech-enquiries.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).organisation, 'Example Labs');
  assert.equal(rows.at(-1).community, 'solana');
  // Linked from a community card, the form comes pre-filled.
  assert.match(await (await get('/tech-nights?community=base')).text(), /<option value="base" selected>/);
});

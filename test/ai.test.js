// What AI assistants and search see: venue facts, opening hours, prices and tickets left.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

test('tam.tv can be read by AI: venue, opening hours, what’s on, prices and tickets left', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-ai-'));
  const app = await createApp({ env: { DATA_DIR: dir, SITE_URL: 'https://www.tam.tv', INDEXING: 'on', EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const get = (p) => fetch(B + p, { headers: { 'x-forwarded-host': 'www.tam.tv' } });
  const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

  // the venue: address, hours with Monday closed, how to book and hire
  const home = await (await get('/')).text();
  const venue = ld(home).find((x) => [].concat(x['@type']).includes('MusicVenue'));
  assert.equal(venue.address.postalCode, 'SE1 6DR');
  const hours = venue.openingHoursSpecification;
  const monday = hours.find((h) => [].concat(h.dayOfWeek).includes('https://schema.org/Monday'));
  assert.deepEqual([monday.opens, monday.closes], ['00:00', '00:00']); // closed
  assert.ok(hours.some((h) => [].concat(h.dayOfWeek).includes('https://schema.org/Friday') && h.closes === '01:00'));
  assert.ok(venue.potentialAction.some((a) => a['@type'] === 'ReserveAction'));
  assert.ok(venue.event.length > 0);
  assert.match(home, /<link rel="alternate" type="text\/plain" href="\/llms\.txt"/);

  // "Find TAM" shows the hours to people too
  const findUs = await (await get('/locations/elephant-castle')).text();
  assert.match(findUs, /Opening times/);
  assert.match(findUs, /Monday<\/b><span>Closed/);
  assert.ok(ld(findUs).some((x) => x.openingHoursSpecification));

  // a night sold by TAM's box office: price, availability, tickets left
  const own = (n) => !app.ctx.content.canonicalElsewhere.has(`/events/${n.slug}`); // festival nights' data lives on christmas.tam.tv
  const night = app.ctx.content.nights.find((n) => n.sale && n.sale.capacity && n.date >= app.ctx.today() && own(n));
  assert.ok(night, 'a box-office night on tam.tv');
  const ev = ld(await (await get(`/events/${night.slug}`)).text()).find((x) => x['@type'] === 'MusicEvent');
  assert.equal(ev.location.address.postalCode, 'SE1 6DR');
  assert.equal(ev.remainingAttendeeCapacity, night.sale.capacity);
  assert.ok(ev.offers.every((o) => o.priceCurrency === 'GBP' && /schema\.org\/(InStock|LimitedAvailability)/.test(o.availability)));

  // What's on: a list for search, and data for apps
  assert.ok(ld(await (await get('/whats-on')).text()).some((x) => x['@type'] === 'ItemList' && x.itemListElement.length > 0));
  const data = await (await get('/whats-on.json')).json();
  assert.ok(data.venue.openingTimes.some((x) => /^Monday: Closed/.test(x)));
  const j = data.nights.find((n) => n.page.endsWith(night.slug));
  assert.equal(j.ticketsLeft, night.sale.capacity);
  assert.equal(j.soldBy, 'TAM box office (tam.tv)');
  assert.match(j.book, /#book$/);

  // llms.txt: the plain-language guide
  const llms = await (await get('/llms.txt')).text();
  assert.match(llms, /^# TAM, Temple of Art and Music/);
  assert.match(llms, /closed on Mondays/);
  assert.match(llms, /whats-on\.json/);
  assert.match(llms, /great-british-blues-jam/);

  // robots.txt welcomes AI crawlers to the public site only
  const robots = await (await get('/robots.txt')).text();
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.match(robots, new RegExp(`User-agent: ${bot}`));
  assert.match(robots, /Disallow: \/shows/);
  assert.match(robots, /Disallow: \/api\//);

  // the Blues Jam Saturdays are in the page itself, not only drawn by script
  const blues = await (await get('/great-british-blues-jam')).text();
  assert.match(blues, /<b>Host:<\/b>/);
  assert.ok(ld(blues).find((x) => x['@type'] === 'EventSeries').subEvent.length >= 6);
});

test('a night sold on another TAM site (immersive.tam.tv) is listed, linked there, and points search there', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-imm-'));
  const app = await createApp({ env: { DATA_DIR: dir, EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const n = app.ctx.content.nightBy.get('immersive-creator-huddle-17-2026-11-16');
  if (!n || n.date < app.ctx.today()) return;
  const page = await (await fetch(`${B}/events/${n.slug}`)).text();
  assert.match(page, /<link rel="canonical" href="https:\/\/immersive\.tam\.tv\/">/);
  assert.match(page, /href="https:\/\/immersive\.tam\.tv\/#tickets"[^>]*>Tickets on immersive\.tam\.tv · £5–£10 ↗/);
  const wo = await (await fetch(`${B}/whats-on`)).text();
  assert.match(wo, /Immersive Creator Huddle 17/);
  assert.doesNotMatch(wo, /Immersive Creator Huddle 17[\s\S]{0,800}?Tickets on Eventbrite/);
});

test('the header links to the Great British Blues Jam', async (t) => {
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-nav-')), EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const page = await (await fetch(`http://127.0.0.1:${app.server.address().port}/whats-on`)).text();
  assert.match(page, /<nav class="nav" id="nav"[\s\S]*<a href="\/great-british-blues-jam#jam" class="blues-link">Blues Jam<\/a>[\s\S]*<\/nav>/);
});

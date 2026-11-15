// Live at TAM: the big screen and self check-in, on a JOM night.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

test('the big screen and self check-in: TAM × JOM, counts by act, follow and pledge', async (t) => {
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-live-')), ADMIN_TOKEN: 'admin-token-for-tests', EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.cfg.siteUrl = B;
  const slug = 'jom-sessions-2026-2026-11-15';
  if (!app.ctx.content.nightBy.has(slug)) {
    app.ctx.content.nightBy.set(slug, { slug, date: '2026-11-15', title: 'TAM x JOM Sessions 2026', weekday: 'Sunday', day: 15, month: 'November', doors: '12:00', ends: '19:30', start: '2026-11-15T12:00:00.000Z', end: '2026-11-15T19:30:00.000Z', lineup: [], artists: [] });
  }
  const q = `?night=${slug}`;
  const post = (p, body) => fetch(`${B}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  // the projector page: TAM × JOM, the check-in QR, JOM's partners
  const screen = await (await fetch(`${B}/screen${q}`)).text();
  assert.match(screen, /class="lv-screen lv-jom"/);
  assert.match(screen, /\/img\/jom\/jom-logo\.png/);
  assert.match(screen, /Scan to check(&nbsp;| )in/);
  assert.match(screen, /\/live\/qr\.svg\?u=/);
  assert.match(screen, /JOM Youth Music[\s\S]*BBC Make A Difference Awards[\s\S]*Finalist 2023/);
  const qr = await fetch(`${B}/live/qr.svg?u=${encodeURIComponent(`${B}/checkin`)}`);
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /svg/);
  assert.equal((await fetch(`${B}/live/qr.svg?u=${encodeURIComponent('https://evil.example/x')}`)).status, 400);

  // the phone: no ticket, no name; how many and who for
  const page = await (await fetch(`${B}/checkin${q}`)).text();
  assert.match(page, /You’re at TAM x JOM Sessions 2026/);
  assert.match(page, /<option value="yellowhammer">Yellowhammer/);
  const a = await post('/api/live/checkin', { night: slug, id: 'phone-one-0123456789', n: 4, act: 'yellowhammer' });
  assert.equal(a.status, 200);
  assert.equal(a.body.people, 4);
  await post('/api/live/checkin', { night: slug, id: 'phone-two-0123456789', n: 2, act: 'dis-band' });
  const again = await post('/api/live/checkin', { night: slug, id: 'phone-one-0123456789', n: 5, act: 'yellowhammer' }); // the same phone updates, not adds
  assert.equal(again.body.again, true);
  assert.equal(again.body.people, 7);
  assert.deepEqual(again.body.crowd.map((x) => [x.slug, x.here]), [['yellowhammer', 5], ['dis-band', 2]]);
  const st = await (await fetch(`${B}/api/live${q}`)).json();
  assert.equal(st.acts.find((x) => x.slug === 'yellowhammer').here, 5);

  // follow the act (consent), and nothing personal on the screen's data
  assert.match((await post('/api/live/follow', { night: slug, act: 'yellowhammer', email: 'gran@x.test' })).body.error, /Tick the box/);
  assert.equal((await post('/api/live/follow', { night: slug, act: 'yellowhammer', email: 'gran@x.test', consent: true })).status, 201);
  assert.doesNotMatch(JSON.stringify(await (await fetch(`${B}/api/live${q}`)).json()), /gran@x\.test/);
  assert.equal((await fetch(`${B}/api/live/follows.csv`)).status, 401);
  assert.match(await (await fetch(`${B}/api/live/follows.csv`, { headers: { 'x-staff-token': 'admin-token-for-tests' } })).text(), /Yellowhammer","gran@x\.test/);
});

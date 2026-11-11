// TAM Sunday Showcases: the call-out for artists, via the open mic circuit.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

test('Sunday Showcases: the circuit, live dates, and a register-of-interest that lands as an enquiry', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-sc-'));
  const app = await createApp({ env: { DATA_DIR: dir, EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;

  const res = await fetch(`${B}/sunday-showcases`);
  assert.equal(res.status, 200);
  const page = await res.text();
  assert.match(page, /TAM Sunday Showcases/);
  for (const name of ['TAM Open Mic', 'The Original Singers Club', 'The Great British Blues Jam', 'Junior Open Mic / JOM', 'Open nights']) assert.ok(page.includes(name.replace('&', '&amp;')), name);
  assert.match(page, /href="\/great-british-blues-jam#jam"/);
  assert.match(page, /id="sc-form"/);
  // each night sits under its own regular: JOM isn't listed as TAM Open Mic
  const card = (name) => page.split('<article class="sc-night">').find((c) => c.includes(`<h3>${name}</h3>`));
  assert.doesNotMatch(card('TAM Open Mic'), />Sunday /); // the open mic is on Wednesdays; JOM's Sunday goes under JOM
  assert.match(card('Junior Open Mic / JOM'), />Sunday /);

  const old = await fetch(`${B}/showcases`, { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/sunday-showcases');

  // the musician pathway, the sitemap and the AI guide all point here
  assert.ok(app.ctx.content.pathways.some((p) => (p.steps || []).some((s) => s.link === '/sunday-showcases')));
  assert.match(await (await fetch(`${B}/sitemap.xml`)).text(), /\/sunday-showcases/);
  assert.match(await (await fetch(`${B}/llms.txt`)).text(), /sunday-showcases/);

  const post = await fetch(`${B}/api/enquiries`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'perform', pathway: 'showcase', name: 'Test Act', email: 'act@example.com', company: 'The Testers', message: 'Sunday Showcase: register of interest\nOpen night: I’ve played TAM Open Mic' }) });
  assert.equal(post.status, 201);
  const e = app.ctx.db.enquiries.find((x) => x.email === 'act@example.com');
  assert.equal(e.kind, 'perform');
  assert.equal(e.pathway, 'showcase');
});

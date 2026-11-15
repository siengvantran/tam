// The Analogue Room in a frame: /analogue-room/play may be framed by
// immersive.tam.tv (and TAM itself) only; every other page stays unframeable.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

test('the room can be framed by immersive.tam.tv, and nothing else changes', async (t) => {
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-roomem-')), EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;

  const play = await fetch(`${B}/analogue-room/play`);
  assert.equal(play.status, 200);
  assert.equal(play.headers.get('x-frame-options'), null);
  assert.match(play.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/immersive\.tam\.tv$/);
  const body = await play.text();
  assert.match(body, /<base target="_blank">/);
  assert.match(body, /The Analogue Room/);
  assert.match(body, /\/js\/room-embed\.js/);
  assert.doesNotMatch(body, /class="top|<footer/);

  // the full page, and the rest of the site, still refuse frames
  const full = await fetch(`${B}/analogue-room`);
  assert.equal(full.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.doesNotMatch(full.headers.get('content-security-policy'), /frame-ancestors/);
});

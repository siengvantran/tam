// JOM: the audience shares moments from the session (messages, photos,
// videos) and pledges for acts; TAM checks every moment before it shows.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';
const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64')}`;
const MP4 = Buffer.concat([Buffer.from('000000186674797069736f6d', 'hex'), Buffer.alloc(4000, 1)]);

test('the audience shares JOM moments and pledges; TAM checks each moment first', async (t) => {
  const app = await createApp({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-jmo-')), ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off' } });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  const staff = { 'x-staff-token': ADMIN };
  const call = async (p, { method = 'GET', body, raw, type, headers = {} } = {}) => {
    const r = await fetch(`${B}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(type ? { 'content-type': type } : {}), ...headers }, body: raw || (body ? JSON.stringify(body) : undefined) });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
  };

  // the page, on www and on jom.tam.tv
  const pg = await call('/jom/moments?act=dis-band');
  assert.equal(pg.status, 200);
  assert.match(pg.body, /Share your JOM day/);
  assert.match(pg.body, /<option value="dis-band" selected>/);
  assert.equal((await call('/moments', { headers: { 'x-forwarded-host': 'jom.tam.tv' } })).status, 200);
  assert.match((await call('/jom')).body, /Share your JOM day[\s\S]*Share a moment/);

  // the checks: consent, something to share, no contact details
  assert.match((await call('/api/jom/moments', { method: 'POST', body: { message: 'Amazing!' } })).body.error, /Tick the box/);
  assert.match((await call('/api/jom/moments', { method: 'POST', body: { consent: true } })).body.error, /Write a message/);
  assert.match((await call('/api/jom/moments', { method: 'POST', body: { message: 'call me 07700 900123', consent: true } })).body.error, /phone numbers/);
  assert.equal((await call('/api/jom/moments/video?act=dis-band', { method: 'POST', raw: MP4, type: 'video/mp4' })).status, 400); // no consent

  // a message, a photo and a video
  assert.equal((await call('/api/jom/moments', { method: 'POST', body: { act: 'dis-band', message: 'DIS Band were brilliant!', name: 'Gran', consent: true } })).body.status, 'pending');
  await call('/api/jom/moments', { method: 'POST', body: { act: 'dis-band', photo: PNG, message: 'Front row', consent: true } });
  const v = await call('/api/jom/moments/video?act=colette&message=Her%20first%20song&consent=yes', { method: 'POST', raw: MP4, type: 'video/mp4' });
  assert.equal(v.status, 201, JSON.stringify(v.body));

  // nothing shows until TAM checks it
  assert.equal((await call('/api/jom/moments')).body.moments.length, 0);
  assert.doesNotMatch((await call('/jom/dis-band')).body, /DIS Band were brilliant/);
  assert.equal((await call('/api/jom/manage')).status, 401);
  const m = (await call('/api/jom/manage', { headers: staff })).body;
  assert.equal(m.moments.length, 3);
  const byMsg = (s) => m.moments.find((x) => x.message === s);
  await call(`/api/jom/manage/moments/${byMsg('DIS Band were brilliant!').id}`, { method: 'POST', headers: staff, body: { status: 'shown' } });
  await call(`/api/jom/manage/moments/${byMsg('Front row').id}`, { method: 'POST', headers: staff, body: { status: 'shown' } });
  const vid = byMsg('Her first song');
  await call(`/api/jom/manage/moments/${vid.id}`, { method: 'POST', headers: staff, body: { status: 'removed' } });
  assert.equal((await fetch(`${B}${vid.src}`)).status, 404); // removed: its video is deleted

  // shown: on the act's page, the hub and /moments
  const act = (await call('/jom/dis-band')).body;
  assert.match(act, /Moments for DIS Band[\s\S]*DIS Band were brilliant![\s\S]*Gran/);
  assert.match(act, /<img src="\/uploads\/jom-moment-/);
  assert.match((await call('/jom')).body, /DIS Band were brilliant!/);
  assert.equal((await call('/api/jom/moments?act=dis-band')).body.moments.length, 2);
  assert.doesNotMatch((await call('/jom/colette')).body, /Her first song/);
});

// The Sunday Showcase on the night: the projector, the staff controller, reactions and headline pledges.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';
const DATE = '2026-12-27';

test('big screen: staff pick the act, phones react and pledge, the screen shows counts only', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-ssc-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off' }, now: () => Date.parse('2026-12-27T19:00:00Z') });
  await new Promise((r) => app.listen(0, r));
  t.after(() => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }));
  const B = `http://127.0.0.1:${app.server.address().port}`;
  let ip = 0;
  const call = async (p, { method = 'GET', body, staff } = {}) => {
    const res = await fetch(B + p, { method, headers: { 'x-forwarded-for': `10.9.0.${ip++ % 250}`, ...(body ? { 'content-type': 'application/json' } : {}), ...(staff ? { 'x-staff-token': ADMIN } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
  app.ctx.db.showcases = { [DATE]: { count: 2, acts: [
    { slug: 'jo-waves', name: 'Jo Waves', plays: 'Folk', photo: '/img/og.jpg', links: ['https://www.instagram.com/jowaves/'], email: 'jo@example.com' },
    { slug: 'the-reds', name: 'The Reds', plays: 'Rock', links: [] }] } };

  // the projector and the controller pages
  const screen = await call(`/sunday-showcases/screen?date=${DATE}`);
  assert.equal(screen.status, 200);
  assert.match(screen.body, /data-date="2026-12-27"/);
  assert.match(screen.body, /Jo Waves[\s\S]*The Reds/);
  assert.match(screen.body, /noindex/);
  assert.equal((await call(`/sunday-showcases/control?date=${DATE}`)).status, 200);

  // nobody on yet: the screen shows the line-up
  let live = await call(`/api/showcases/${DATE}/live`);
  assert.equal(live.body.current, null);
  assert.deepEqual(live.body.acts.map((a) => a.name), ['Jo Waves', 'The Reds']);
  assert.ok(!JSON.stringify(live.body).includes('jo@example.com')); // never anyone's email

  // only staff can change the screen
  assert.equal((await call(`/api/showcases/${DATE}/live`, { method: 'POST', body: { current: 'jo-waves' } })).status, 401);
  assert.equal((await call(`/api/showcases/${DATE}/live`, { method: 'POST', body: { current: 'nobody' }, staff: true })).status, 400);
  assert.equal((await call(`/api/showcases/${DATE}/live`, { method: 'POST', body: { current: 'jo-waves' }, staff: true })).status, 200);
  live = await call(`/api/showcases/${DATE}/live`);
  assert.equal(live.body.current.name, 'Jo Waves');
  assert.equal(live.body.current.instagram, 'https://www.instagram.com/jowaves/');

  // reactions from phones: counted, and in the feed for the screen to float up
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/react`, { method: 'POST', body: { emoji: '🔥' } })).status, 200);
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/react`, { method: 'POST', body: { emoji: '❤️' } })).status, 200);
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/react`, { method: 'POST', body: { emoji: '<script>' } })).status, 400);
  live = await call(`/api/showcases/${DATE}/live?after=0`);
  assert.deepEqual(live.body.current.reacts, { '🔥': 1, '❤️': 1 });
  assert.deepEqual(live.body.feed.map((x) => x.emoji), ['🔥', '❤️']);
  assert.equal((await call(`/api/showcases/${DATE}/live?after=${live.body.last}`)).body.feed.length, 0);

  // pledges for their own headline show: consent needed, one per email, tickets counted
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/pledge`, { method: 'POST', body: { name: 'Sam', email: 'sam@example.com', qty: 2 } })).status, 400);
  let p = await call(`/api/showcases/${DATE}/act/jo-waves/pledge`, { method: 'POST', body: { name: 'Sam', email: 'sam@example.com', qty: 2, consent: true } });
  assert.equal(p.body.tickets, 2);
  p = await call(`/api/showcases/${DATE}/act/jo-waves/pledge`, { method: 'POST', body: { name: 'Sam', email: 'SAM@example.com', qty: 3, consent: true } });
  assert.equal(p.body.again, true);
  assert.equal(p.body.tickets, 3);
  live = await call(`/api/showcases/${DATE}/live`);
  assert.equal(live.body.current.pledged, 3);
  assert.ok(!JSON.stringify(live.body).includes('sam@example.com'));
  // staff download the pledges to email when tickets are on sale
  assert.equal((await call(`/api/showcases/${DATE}/pledges.csv`)).status, 401);
  assert.match((await call(`/api/showcases/${DATE}/pledges.csv`, { staff: true })).body, /"jo-waves","Sam","sam@example.com","3"/);

  // the act's page: reactions, Instagram and the pledge form
  const page = (await call(`/sunday-showcases/${DATE}/jo-waves`)).body;
  assert.match(page, /data-react="\/api\/showcases\/2026-12-27\/act\/jo-waves\/react"/);
  assert.match(page, /Follow Jo Waves on Instagram/);
  assert.match(page, /data-pledge=/);

  // rock reactions and the TAM logo
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/react`, { method: 'POST', body: { emoji: '🤘' } })).status, 200);
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/react`, { method: 'POST', body: { emoji: 'tam' } })).status, 200);
  assert.match(page, /data-emoji="tam"/);

  // by default a message goes straight up on the screen
  const b0 = (await call(`/api/showcases/${DATE}/live`)).body.last;
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/wall`, { method: 'POST', body: { name: 'Kim', message: 'Straight up!' } })).status, 201);
  assert.deepEqual((await call(`/api/showcases/${DATE}/live?after=${b0}`)).body.feed.map((x) => x.message), ['Straight up!']);
  // staff switch on "check first": then a message and a photo wait for an OK
  assert.equal((await call(`/api/showcases/${DATE}/live/settings`, { method: 'POST', body: { checkFirst: true } })).status, 401);
  await call(`/api/showcases/${DATE}/live/settings`, { method: 'POST', body: { checkFirst: true }, staff: true });
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/wall`, { method: 'POST', body: { name: 'Ali', message: 'What a voice!' } })).status, 201);
  const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64')}`;
  assert.equal((await call(`/api/showcases/${DATE}/act/jo-waves/react/photo`, { method: 'POST', body: { image: PNG } })).status, 201);
  assert.equal((await call(`/api/showcases/${DATE}/live/queue`)).status, 401);
  const queue = (await call(`/api/showcases/${DATE}/live/queue`, { staff: true })).body.items;
  assert.deepEqual(queue.map((q) => q.kind), ['note', 'photo']);
  const before = (await call(`/api/showcases/${DATE}/live`)).body.last;
  assert.equal((await call(`/api/showcases/${DATE}/live/queue/${queue[0].id}`, { method: 'POST', body: { show: true } })).status, 401);
  await call(`/api/showcases/${DATE}/live/queue/${queue[0].id}`, { method: 'POST', body: { show: true }, staff: true });
  await call(`/api/showcases/${DATE}/live/queue/${queue[1].id}`, { method: 'POST', body: { show: false }, staff: true });
  const feed = (await call(`/api/showcases/${DATE}/live?after=${before}`)).body.feed;
  assert.deepEqual(feed.map((x) => [x.kind, x.message]), [['note', 'What a voice!']]); // the hidden photo never reaches the screen
  assert.equal((await call(`/api/showcases/${DATE}/live/queue`, { staff: true })).body.items.length, 0);
  // the message stays on the act's wall
  assert.ok((await call(`/api/showcases/${DATE}/act/jo-waves/wall`)).body.items.some((w) => w.message === 'What a voice!'));

  // back to the line-up between acts
  await call(`/api/showcases/${DATE}/live`, { method: 'POST', body: { current: null }, staff: true });
  assert.equal((await call(`/api/showcases/${DATE}/live`)).body.current, null);
});

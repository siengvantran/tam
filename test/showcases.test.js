// TAM Sunday Showcases: the call-out for artists, via the open mic circuit.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-token-for-tests';

test('Sunday Showcases: the circuit, live dates, and a register-of-interest that lands as an enquiry', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamtv-sc-'));
  const app = await createApp({ env: { DATA_DIR: dir, ADMIN_TOKEN: ADMIN, EVENTBRITE_SYNC: 'off' } });
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

  // this week's showcase: a tree with six wrapped presents, to be announced until staff name the acts
  const date = app.ctx.content.showcases.next.date;
  if (date >= app.ctx.today()) {
    assert.equal((page.match(/class="sc-g /g) || []).length, 6);
    assert.equal((page.match(/To be announced/g) || []).length, 6);
    assert.equal((await fetch(`${B}/api/showcases/manage`)).status, 401);
    const H = { 'x-staff-token': ADMIN, 'content-type': 'application/json' };
    const set = await fetch(`${B}/api/showcases/${date}`, { method: 'POST', headers: H,
      body: JSON.stringify({ count: 6, acts: [{ name: 'The Lanterns', plays: 'Soul trio', link: 'instagram.com/thelanterns' }, {}, { name: '<b>Ruby</b>' }] }) });
    assert.equal(set.status, 200);
    const after = await (await fetch(`${B}/sunday-showcases`)).text();
    assert.match(after, /<h3>The Lanterns<\/h3>/);
    assert.match(await (await fetch(`${B}/sunday-showcases/${date}/the-lanterns`)).text(), /href="https:\/\/instagram\.com\/thelanterns"/);
    assert.match(after, /&lt;b&gt;Ruby/);
    assert.equal((after.match(/To be announced/g) || []).length, 8); // 4 presents + 4 carousel slides
    // the home page shows the same line-up carousel, pointing to the showcases page for the tree
    const home = await (await fetch(`${B}/`)).text();
    assert.match(home, /id="line-up"[\s\S]*data-carousel/);
    assert.match(home, /href="\/sunday-showcases#this-sunday">Unwrap the tree/);
    // the line-up carousel: one slide per act, tapping one unwraps its present
    assert.match(after, /id="line-up"[\s\S]*data-carousel/);
    assert.equal((after.match(/<figure class="fx-slide/g) || []).length, 6);
    assert.match(after, new RegExp(`href="/sunday-showcases/${date}/the-lanterns" tabindex="-1"`));
    // photos (site paths only), several links named by where they go, a bio in paragraphs
    const full = await fetch(`${B}/api/showcases/${date}`, { method: 'POST', headers: H, body: JSON.stringify({ count: 6, acts: [
      { name: 'The Lanterns', plays: 'Soul trio', photo: '/img/showcases/justyna.jpg', links: ['youtu.be/abc', 'https://www.instagram.com/thelanterns/'], blurb: 'One.\n\nTwo.' },
      { name: 'Bad Photo', photo: 'javascript:alert(1)' }, { name: '<b>Ruby</b>' }] }) });
    const fj = await full.json();
    assert.deepEqual(fj.acts[0].links.map((k) => k.label), ['YouTube', 'Instagram']);
    assert.equal(fj.acts[1].photo, '');
    const main = await (await fetch(`${B}/sunday-showcases`)).text();
    assert.match(main, /class="sc-pic" src="\/img\/showcases\/justyna\.jpg"/);
    assert.match(main, /src="\/img\/christmas\/shard-tree-tip\.png"/); // the Shard tree behind the presents

    // each act has its own page: hero, story, links, invites, the Christmas vote
    const actUrl = `${B}/sunday-showcases/${date}/the-lanterns`;
    const ap = await (await fetch(actUrl)).text();
    assert.match(ap, /<h1 class="va-name">The Lanterns<\/h1>/);
    assert.match(ap, /<p>One\.<\/p><p>Two\.<\/p>/);
    assert.match(ap, /href="https:\/\/youtu\.be\/abc"/);
    assert.match(ap, /class="sc-actpage vibe-stage/);
    assert.match(ap, /href="https:\/\/wa\.me\/\?text=Come%20and%20see%20The%20Lanterns/);
    assert.match(ap, /Christmas Showcase Special/);
    assert.equal((await fetch(`${B}/sunday-showcases/${date}/nobody`)).status, 404);

    // the vote: one per browser
    const want = (id) => fetch(`${B}/api/showcases/${date}/act/the-lanterns/want`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).then((r) => r.json());
    assert.equal((await want('browser-aaaaaaaaaaaaaaaa')).count, 1);
    assert.equal((await want('browser-aaaaaaaaaaaaaaaa')).already, true);
    assert.equal((await want('browser-bbbbbbbbbbbbbbbb')).count, 2);
    assert.match(await (await fetch(actUrl)).text(), /2 people want to see The Lanterns at Christmas/);

    // where they're from: a star on the map; no flags, their vibe instead
    const geo = await (await fetch(`${B}/api/showcases/${date}`, { method: 'POST', headers: H, body: JSON.stringify({ count: 6, acts: [
      { name: 'The Lanterns', from: 'my, gb, xx', vibe: 'riot' }, { name: 'Bad Vibe', vibe: 'evil' }] }) })).json();
    assert.deepEqual(geo.acts[0].from, ['MY', 'GB']);
    assert.equal(geo.acts[1].vibe, 'stage');

    // socials as Follow tiles with their @handle, and press (https links only)
    const soc = await (await fetch(`${B}/api/showcases/${date}`, { method: 'POST', headers: H, body: JSON.stringify({ count: 6, acts: [
      { name: 'The Lanterns', from: 'MY', vibe: 'riot', links: ['https://www.instagram.com/the_lanterns/'],
        press: [{ title: 'A headline', source: 'The Paper', url: 'https://paper.example/story', note: 'One line.' }, { title: 'Bad', url: 'javascript:alert(1)' }] }] }) })).json();
    assert.equal(soc.acts[0].press.length, 1);
    const sp = await (await fetch(actUrl)).text();
    assert.match(sp, /<span class="va-net">Instagram<\/span><b>@the_lanterns<\/b>/);
    assert.match(sp, /<span class="va-src">The Paper<\/span><b>A headline ↗<\/b><\/a><p>One line\.<\/p>/);

    // the invite card: "Sunday Showcase × TAM", the Sunday Showcase mark, a picture to choose (the hero by default)
    const ic = await (await fetch(actUrl)).text();
    assert.match(ic, /class="va-card" data-card data-name="The Lanterns"/);
    assert.match(ic, /<span class="ss-title">[\s\S]*Showcase[\s\S]*class="ss-x">×[\s\S]*TAM<\/span>/);
    assert.match(ic, /src="\/img\/sunday-showcase-mark\.svg"/);
    assert.equal((await fetch(`${B}/img/sunday-showcase-mark.svg`)).status, 200);
    const gp = await (await fetch(actUrl)).text();
    assert.match(gp, /vibe-riot/);
    assert.doesNotMatch(gp, /flags\//);
    assert.match(gp, /<span class="va-vibe vibe-riot" title="Riot"><i aria-hidden="true">✶<\/i><b>Riot<\/b><\/span>/);
    assert.match(gp, /From Malaysia to TAM/);
    assert.match(await (await fetch(`${B}/sunday-showcases`)).text(), /class="sc-fx-vibe vibe-riot"/);
    assert.equal((await fetch(`${B}/api/showcases/photo`, { method: 'POST', body: '{}' })).status, 401);
    // staff upload a photo: it's stored and comes back as a site path
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const upr = await fetch(`${B}/api/showcases/photo`, { method: 'POST', headers: H, body: JSON.stringify({ image: png }) });
    assert.equal(upr.status, 200);
    const up = await upr.json();
    assert.match(up.photo, /^\/uploads\//);
    assert.equal((await fetch(B + up.photo)).status, 200);
    const pub = await (await fetch(`${B}/api/showcases`)).json();
    assert.equal(pub.acts[0].name, 'The Lanterns');
    assert.equal(pub.count, 6);
    // videos and more photos on a profile: site files only
    const vid = await (await fetch(`${B}/api/showcases/${date}`, { method: 'POST', headers: H, body: JSON.stringify({ count: 6, acts: [{ name: 'Trio',
      media: [{ src: '/img/showcases/waris-albakri-1.mp4', poster: '/img/showcases/waris-albakri-1-poster.jpg' }, { src: '/img/showcases/waris-albakri-banjo.jpg' }, { src: 'https://evil.example/x.mp4' }] }] }) })).json();
    assert.deepEqual(vid.acts[0].media.map((m) => m.type), ['video', 'image']);
    // on the act's own page, its photos and clips are a carousel
    assert.match(await (await fetch(`${B}/sunday-showcases/${date}/trio`)).text(), /data-carousel[\s\S]*<source src="\/img\/showcases\/waris-albakri-1\.mp4" type="video\/mp4">/);
    // Listen: no song yet, so their own live clip plays, and the page hears it
    const tp = await (await fetch(`${B}/sunday-showcases/${date}/trio`)).text();
    assert.match(tp, /<section class="section va-listen" id="listen"/);
    assert.match(tp, /<video src="\/img\/showcases\/waris-albakri-1\.mp4"[^>]*data-hear/);
    assert.doesNotMatch(tp, /id="syn"/); // no Tamalume bar without a song
    // with more than one picture, the invite card lets you choose: the first (hero) is chosen to start
    assert.match(await (await fetch(`${B}/sunday-showcases/${date}/trio`)).text(), /<input type="radio" name="card-pic" value="\/img\/showcases\/waris-albakri-1-poster\.jpg" checked>/);
    // a YouTube song: any link form is read down to its id; the Tamalume bar plays it, the page pulses
    const sg = await (await fetch(`${B}/api/showcases/${date}`, { method: 'POST', headers: H, body: JSON.stringify({ count: 6, acts: [
      { name: 'Trio', song: { url: 'https://www.youtube.com/watch?v=Z_c4NlhkWdY&t=3s', title: 'Black & Blue', bpm: 96 } }, { name: 'Bad Song', song: 'https://evil.example/x' }] }) })).json();
    assert.deepEqual(sg.acts[0].song, { youtubeId: 'Z_c4NlhkWdY', title: 'Black & Blue', bpm: 96 });
    assert.equal(sg.acts[1].song, undefined);
    const sp2 = await (await fetch(`${B}/sunday-showcases/${date}/trio`)).text();
    assert.match(sp2, /class="va-video" data-youtube="Z_c4NlhkWdY"/);
    assert.match(sp2, /<aside class="syn" id="syn"[^>]*data-youtube="Z_c4NlhkWdY"/);
    assert.match(sp2, /class="sc-actpage vibe-stage has-song"/);

    // staff add a later showcase; the page keeps showing the next one, and moves on when it's removed
    const later = new Date(Date.parse(date) + 7 * 864e5).toISOString().slice(0, 10);
    assert.equal((await fetch(`${B}/api/showcases/${later}`, { method: 'POST', headers: H, body: JSON.stringify({ count: 4, night: 'not-a-night' }) })).status, 400);
    assert.equal((await fetch(`${B}/api/showcases/${later}`, { method: 'POST', headers: H, body: JSON.stringify({ count: 4, night: '' }) })).status, 200);
    const m = await (await fetch(`${B}/api/showcases/manage`, { headers: H })).json();
    assert.deepEqual(m.showcases.map((x) => [x.date, x.count]), [[date, 6], [later, 4]]);
    assert.equal((await fetch(`${B}/api/showcases/2020-01-05`, { method: 'POST', headers: H, body: '{}' })).status, 400); // been
    assert.equal((await fetch(`${B}/api/showcases/${date}/remove`, { method: 'POST', headers: H, body: '{}' })).status, 200);
    const now = await (await fetch(`${B}/api/showcases`)).json();
    assert.equal(now.date, later);
    assert.equal(now.count, 4);
    assert.equal(now.night, null);
  }
});

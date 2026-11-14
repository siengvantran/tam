// The Analogue Room's page: /analogue-room (short link /room). The briefing is
// in the page itself; the locks are drawn by /js/room.js, which asks
// /api/room whether each move is right (src/domain/room.js).

import { html } from './html.js';
import { html as respond, redirect } from '../lib/http.js';
import { layout } from './layout.js';
import { RULES, HALF } from '../domain/club.js';

function page(ctx, room) {
  const r = room.today();
  const pts = RULES.room.pts;
  return layout(ctx, {
    title: 'The Analogue Room: a new escape room every day', path: '/analogue-room', scripts: ['/js/room.js'],
    description: `A daily escape room built from the day’s news and set in TAM’s future. Open the doors for ${pts} TAM Club points.`,
    body: html`<section class="section ar"><div class="wrap narrow">
      <div class="label">TAM · a new room every morning</div>
      <h1 class="chrome gold">The Analogue Room</h1>
      <p class="ar-note">The news in this room is real and sourced. The future it is set in is fiction.</p>
      ${r ? html`<p class="ar-setting">${r.setting}</p>
      <div class="ar-briefing">${r.briefing.map((p) => html`<p>${p}</p>`)}</div>
      <p class="ar-points">Open the doors and <a href="/club">TAM Club</a> members bank <b>+${pts} points</b>, once a day. ${HALF} points is a drink on the house.</p>
      <div id="room" data-room><p class="muted">Unlocking the gatehouse…</p></div>
      <noscript><p class="muted">The locks need JavaScript switched on.</p></noscript>`
    : html`<p class="lede">The gatehouse is quiet today. A new room opens tomorrow morning.</p>`}
    </div></section>`,
  });
}

// Today's room on the home page. Artists (the musician pathway) get their own words.
export function roomTile(ctx, pathway) {
  const r = ctx.room && ctx.room.today();
  if (!r) return '';
  const artist = Boolean(pathway && pathway.slug === 'musician');
  return html`<section class="section ar-home"><div class="wrap"><div class="ar-tile" data-room-tile data-aud="${artist ? 'artist' : 'public'}">
    <div class="label">Today’s escape room · ${r.label}</div>
    <h2 class="chrome gold">The Analogue Room</h2>
    <p class="lede">${artist
    ? 'In TAM’s future the set is played once, by people, and never copied. You keep the gate. Four locks stand between you and tonight’s show.'
    : 'A new escape room every morning, built from the day’s real news and set in TAM’s future. Four locks stand between you and tonight’s show.'}</p>
    <p class="ar-teaser">${r.briefing[0]}</p>
    <div class="ctas"><a class="btn hot" href="/analogue-room" data-room-cta>Play today’s room</a><span class="ar-pts">+${RULES.room.pts} <a href="/club">TAM Club</a> points, once a day</span></div>
  </div></div></section>`;
}

// For the team: where players come from and which invitation opens doors (last 30 days).
function statsPage(ctx, room) {
  const rows = room.totals().sort((a, b) => b.shown - a.shown || b.open - a.open);
  const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '');
  const by = (key) => Object.entries(rows.reduce((o, x) => { const t = o[x[key]] || (o[x[key]] = { shown: 0, click: 0, start: 0, open: 0, points: 0 }); for (const k of Object.keys(t)) t[k] += x[k]; return o; }, {})).sort((a, b) => b[1].shown - a[1].shown || b[1].open - a[1].open);
  const table = (head, list) => html`<div class="table-wrap"><table class="ar-stats"><thead><tr>${head.map((h) => html`<th>${h}</th>`)}<th>Shown</th><th>Followed</th><th>Started</th><th>Doors opened</th><th>Banked points</th><th>Doors per showing</th></tr></thead>
    <tbody>${list.map(([cells, x]) => html`<tr>${cells.map((c) => html`<td>${c}</td>`)}<td>${x.shown}</td><td>${x.click}</td><td>${x.start}</td><td>${x.open}</td><td>${x.points}</td><td>${pct(x.open, x.shown)}</td></tr>`)}</tbody></table></div>`;
  return layout(ctx, {
    title: 'The Analogue Room: who plays', path: '/analogue-room/stats', noindex: true, ambient: null, bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap"><div class="label">Last 30 days · totals only</div><h1 class="chrome">Who plays the room</h1>
      ${rows.length ? html`<h2>Where they came from</h2>${table(['Source'], by('src').map(([k, x]) => [[k], x]))}
      <h2>Artists and the public</h2>${table(['Audience'], by('aud').map(([k, x]) => [[k], x]))}
      <h2>Every invitation</h2>${table(['Audience', 'Source', 'Invitation'], rows.map((x) => [[x.aud, x.src, x.variant], x]))}
      <p class="small muted">“home” is the tile on the home page; “none” is someone who came straight to the room. One visitor in five sees an invitation at random so the counts keep learning.</p>`
    : html`<p class="lede">Nothing counted yet.</p>`}</div></section>`,
  });
}

export function routes(r, ctx, room) {
  r.get('/analogue-room/stats', (req, res) => (ctx.isAdmin(req) ? respond(res, statsPage(ctx, room)) : redirect(res, '/shows')));
  r.get('/analogue-room', (req, res) => respond(res, page(ctx, room)));
  r.get('/room', (req, res) => redirect(res, '/analogue-room'));
}

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

export function routes(r, ctx, room) {
  r.get('/analogue-room', (req, res) => respond(res, page(ctx, room)));
  r.get('/room', (req, res) => redirect(res, '/analogue-room'));
}

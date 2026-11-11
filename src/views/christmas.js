// Christmas on the home page: from 1 November until the festival ends, the
// front of tam.tv snows, shows The Best Christmas Ever's Shard tree with a
// holographic 3D TAM star on top, plays the festival's song (the video and
// the Tamalume player), and the page pulses with its beat (public/js/xmas.js).

import { html } from './html.js';
import { dateParts } from '../lib/content.js';

// The Christmas festival, while it's the season: from homeFrom (default 1 November) to its last night.
export function christmasNow(ctx) {
  const f = ctx.content.festivals.find((x) => x.theme === 'christmas' && x.dates);
  if (!f) return null;
  const from = f.homeFrom || `${f.dates.from.slice(0, 4)}-11-01`;
  const today = ctx.today();
  return today >= from && today <= f.dates.to ? f : null;
}

// Twinkling lights on the tree: [left %, top %, colour, delay s]. Placed inside its outline.
const LIGHTS = [[50, 8, 'w', 0], [47, 18, 'r', .6], [54, 24, 'g', 1.1], [44, 31, 'w', .3], [57, 35, 'r', 1.6], [40, 42, 'g', .9], [52, 45, 'w', 2.1], [61, 50, 'w', .2],
  [36, 55, 'r', 1.3], [48, 58, 'g', .5], [65, 62, 'r', 1.8], [31, 67, 'w', .7], [55, 68, 'w', 1.4], [42, 74, 'r', .1], [70, 76, 'g', 1.0], [26, 80, 'g', 1.7],
  [50, 82, 'w', .4], [62, 86, 'r', 2.2], [20, 90, 'w', .8], [38, 92, 'g', 1.5], [76, 92, 'w', .25], [56, 95, 'r', 1.2]];

export function christmasHero(ctx, f) {
  const d1 = dateParts(f.dates.from), d2 = dateParts(f.dates.to);
  const href = f.home && f.home.url ? f.home.url : f.path;
  return html`<section class="xm-hero" aria-labelledby="xm-title">
  <div class="xm-snow" aria-hidden="true"></div><div class="xm-snow xm-snow2" aria-hidden="true"></div>
  <div class="wrap xm-in">
    <div class="xm-copy">
      <div class="xm-kicker">✦ TAM presents ✦</div>
      <h2 id="xm-title" class="xm-lockup">${f.lockup ? html`<img src="${f.lockup}" alt="${f.name}" width="900">` : f.name}</h2>
      <p class="xm-dates">${d1.day} – ${d2.day} ${d2.month} ${d2.year} · ${(ctx.content.venueBy.get(f.venue) || {}).name || 'TAM'}</p>
      <p class="xm-lede">${f.lede}</p>
      <div class="ctas"><a class="btn hot" href="${href}">Get Christmas tickets</a><a class="btn ghost" href="#song">▶ Play the song</a></div>
      <p class="xm-hint small">Press play and the whole page dances to the song.</p>
    </div>
    <div class="xm-tree" aria-hidden="true">
      <div class="xm-star">
        <div class="xm-rays"></div>
        <div class="xm-holo">${Array.from({ length: 9 }, (_, i) => html`<img src="/img/christmas/tam-logo-gold.png" alt="" style="--z:${i - 4}">`)}<div class="xm-sheen"></div></div>
      </div>
      <div class="xm-body"><img class="xm-shard" src="/img/christmas/shard-tree-tip.png" alt="" width="720" height="1272">
      ${LIGHTS.map(([x, y, c, dl]) => html`<span class="xm-light ${c}" style="left:${x}%;top:${y}%;animation-delay:${dl}s"></span>`)}</div>
      <div class="xm-glow"></div>
    </div>
  </div>
</section>`;
}

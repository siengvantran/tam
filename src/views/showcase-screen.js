// The Sunday Showcase on the night (src/domain/showcases.js, "the big screen"):
//   /sunday-showcases/screen   the projector: whoever is on, with a QR to their page,
//                              reactions from phones floating up, and headline pledges
//   /sunday-showcases/control  staff, on a phone: pick who's on, in running order
// The screen shows names, photos and counts only: nothing about anyone in the room.

import { html } from './html.js';
import { html as respond } from '../lib/http.js';
import { layout } from './layout.js';

const PATH = '/sunday-showcases';
const FONTS = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;600;700&display=swap';

export function routes(r, ctx, showcase) {
  const dateOf = (url) => { const d = url.searchParams.get('date'); return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : (showcase.next() || {}).date || ''; };

  r.get(`${PATH}/screen`, (req, res, { url }) => {
    const date = dateOf(url);
    const l = date ? showcase.lineup(date) : null;
    const site = `https://${ctx.cfg.showcaseHost}`;
    const control = `${ctx.cfg.siteUrl}${PATH}/control`;
    respond(res, `<!doctype html>${html`<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sunday Showcase · on the big screen</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#06040a">
<link rel="icon" type="image/png" href="/img/favicon-48.png"><link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="/css/site.css"></head>
<body class="ssc-screen" data-date="${date}" data-site="${site}" data-base="${ctx.cfg.siteUrl}">
<div class="ssc-bg" id="ssc-bg" aria-hidden="true"></div>
<canvas class="ssc-viz" id="ssc-viz" aria-hidden="true"></canvas>
<header class="ssc-top"><img src="/img/tam-logo-640.png" alt="TAM" class="ssc-tam"><div><div class="ssc-k">Temple of Art &amp; Music</div><div class="ssc-t">Sunday Showcase${l ? html` · ${l.when.replace(/ \d{4}$/, '')}` : ''}</div></div></header>
<main class="ssc-stage">
  <section class="ssc-act" id="ssc-act" hidden>
    <figure class="ssc-photo"><img id="ssc-img" alt=""></figure>
    <div class="ssc-info">
      <div class="ssc-now"><span class="ssc-dot"></span>On stage now · act <b id="ssc-n"></b></div>
      <h1 id="ssc-name"></h1><p class="ssc-plays" id="ssc-plays"></p>
      <div class="ssc-qr"><img id="ssc-qr" alt="QR code for the act's page"><div><b>Scan me</b><span>Follow on Instagram, send a reaction to the screen, and pledge to see them headline TAM</span><small id="ssc-url"></small></div></div>
      <div class="ssc-stats"><div><b id="ssc-reacts">0</b><span>reactions</span></div><div><b id="ssc-pledged">0</b><span>tickets pledged for their own show</span></div></div>
    </div>
  </section>
  <section class="ssc-idle" id="ssc-idle">
    <h1>Tonight’s line-up</h1>
    <ol class="ssc-lineup" id="ssc-lineup">${l ? l.acts.filter((a) => !a.tba).map((a) => html`<li><img src="${a.photo || '/img/christmas/tam-logo-gold.png'}" alt=""><b>${a.name}</b></li>`) : ''}</ol>
    <div class="ssc-qr big"><img src="/live/qr.svg?u=${encodeURIComponent(`${ctx.cfg.siteUrl}${PATH}`)}" alt="QR code for the Sunday Showcase"><div><b>Meet every act</b><span>${ctx.cfg.showcaseHost}</span></div></div>
  </section>
</main>
<div class="ssc-float" id="ssc-float" aria-hidden="true"></div>
<aside class="ssc-note" id="ssc-note" hidden><p></p><b></b></aside>
<button type="button" class="ssc-mic" id="ssc-mic">🎤 Click to let the TAM logo hear the music</button>
<p class="ssc-hint" id="ssc-hint" hidden></p>
<p class="ssc-keys">→ next act · ← back · L line-up · M mic · F full screen</p>
<a class="ssc-ctl" href="${control}" aria-label="Staff: control the screen"><img src="/live/qr.svg?u=${encodeURIComponent(control)}" alt=""><span>Staff: scan to run the screen</span></a>
<script type="module" src="/js/showcase-screen.js"></script>
</body></html>`}`);
  });

  r.get(`${PATH}/control`, (req, res, { url }) => {
    const date = dateOf(url);
    respond(res, layout(ctx, {
      title: 'Run the big screen', path: `${PATH}/control`, noindex: true, ambient: null, scripts: ['/js/showcase-control.js'], bodyClass: 'staff ssc-control',
      body: html`<section class="section"><div class="wrap narrow">
  <div class="label">Sunday Showcase · staff</div><h1>Run the big screen</h1>
  <p class="muted">Open <a href="${PATH}/screen" target="_blank">${ctx.cfg.siteUrl.replace(/^https?:\/\//, '')}${PATH}/screen</a> on the projector. Tap an act to put them on screen; tap <b>Line-up</b> between acts. On a computer (the sound desk), the arrow keys work too: → next act, ← back, L line-up.</p>
  <div id="ctl" data-date="${date}" hidden>
    <div class="row-btn ctl-nav"><button class="btn ghost" type="button" data-step="-1">‹ Back</button><button class="btn ghost" type="button" data-off>Line-up</button><button class="btn hot" type="button" data-step="1">Next act ›</button></div>
    <ol class="plain ctl-acts" id="ctl-acts"></ol>
    <p class="small muted" role="status" id="ctl-msg"></p>
    <h2 class="h3">Waiting for your OK <small class="muted" id="ctl-qn"></small></h2>
    <p class="small muted">Photos and messages from the audience show here first. <b>Show</b> puts them on the big screen (and keeps a message on the act’s wall); <b>Hide</b> drops them.</p>
    <ol class="plain ctl-queue" id="ctl-queue"></ol>
    <p class="small"><a href="/api/showcases/${date}/pledges.csv">Download tonight’s pledges (CSV)</a>: who wants a ticket to each act’s own show, to email when it’s on sale.</p>
  </div>
  <form id="ctl-login" class="stack" hidden><p>Sign in with your TAM staff email: we’ll send you a link.</p>
    <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
    <input type="hidden" name="next" value="${PATH}/control"><button class="btn hot" type="submit">Email me a link</button><p class="err" role="status"></p></form>
</div></section>`,
    }));
  });
}

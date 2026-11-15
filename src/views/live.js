// Live at TAM (src/domain/live.js): /screen for the projector, /checkin for
// phones, and the QR codes they share. On a JOM night it's TAM × JOM.

import { html, jsonData } from './html.js';
import { html as respond, send } from '../lib/http.js';
import { layout } from './layout.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display&family=Inter:wght@400;600;700&display=swap';

export function routes(r, ctx, live, qr) {
  const isJom = (n) => Boolean(n && ctx.jom && ctx.jom.forNight(n.slug));

  // a QR for one of our own pages (never anyone else's address)
  r.get('/live/qr.svg', (req, res, { url }) => {
    const u = String(url.searchParams.get('u') || '');
    const ok = /^https:\/\/(www\.)?tam\.tv\//.test(u) || u.startsWith(`${ctx.cfg.siteUrl}/`) || u.startsWith(`https://${ctx.cfg.jomHost}/`);
    if (!ok || u.length > 300) return send(res, 400, 'Not one of our pages.');
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
    res.end(qr.toSvg(u, { margin: 2 }));
  });

  // the projector: no site chrome
  r.get('/screen', (req, res, { url }) => {
    const n = live.nightFor(url.searchParams.get('night'));
    const jom = isJom(n);
    const J = (ctx.jom && ctx.jom.J) || {};
    const partners = jom ? (J.partners || []) : [];
    const checkin = `${ctx.cfg.siteUrl}/checkin`;
    respond(res, `<!doctype html>${html`<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${n ? n.title : 'TAM'} · on the big screen</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#06040a">
<link rel="icon" type="image/png" href="/img/favicon-48.png"><link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="/css/site.css"></head>
<body class="lv-screen${jom ? ' lv-jom' : ''}" data-night="${n ? n.slug : ''}">
<div class="lv-bg" aria-hidden="true"></div>
<div class="lv-band">
<header class="lv-top">
  <div class="lv-lockup"><img src="/img/tam-logo-640.png" alt="TAM" class="lv-tam">${jom ? html`<span class="lv-x">×</span><img src="/img/jom/jom-logo.png" alt="JOM" class="lv-jomlogo">` : ''}</div>
  <div class="lv-title"><div class="lv-kicker">${n ? `${n.weekday} ${n.day} ${n.month} · ${n.doors} to ${n.ends}` : 'Temple of Art and Music'}</div><h1>${n ? n.title : 'TAM'}</h1>
    ${partners.length ? html`<div class="lv-partners"><span class="lv-k">With</span>${partners.map((p) => html`<span class="lv-partner">${p.logo ? html`<img src="${p.logo}" alt="">` : ''}<b>${p.name}</b>${p.note ? html`<small>${p.note}</small>` : ''}</span>`)}</div>` : ''}</div>
  <div class="lv-count"><b id="lv-people">0</b><span>here today</span></div>
</header>
<main class="lv-main">
  <section class="lv-checkin"><div class="lv-qr"><img src="/live/qr.svg?u=${encodeURIComponent(checkin)}" alt="QR code: check in at tam.tv/checkin"></div>
    <div><h2>Scan to check&nbsp;in</h2><p class="lv-url">tam.tv/checkin</p><p class="lv-why">Who did you come to see? Help them win <b>the biggest crowd</b>.</p></div></section>
  <section class="lv-spot" id="lv-spot" aria-live="polite"><p class="lv-wait">The acts are on their way…</p></section>
</main>
<div class="lv-crowd" id="lv-crowd"><span class="lv-k">Biggest crowds</span><span class="lv-crowd-list">Check in to put your act on the board</span></div>
</div>
<p class="lv-hint">F full screen · B whole screen when the stage is clear</p>
<script type="module" src="/js/live-screen.js"></script></body></html>`}`, 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  });

  // the phone: check in, then follow and back the act
  r.get('/checkin', (req, res, { url }) => {
    const n = live.nightFor(url.searchParams.get('night'));
    const jom = isJom(n);
    const acts = live.actsFor(n);
    respond(res, layout(ctx, {
      title: n ? `Check in: ${n.title}` : 'Check in', path: '/checkin', noindex: true, ambient: 'stars', scripts: ['/js/live.js'], bodyClass: `lv-phone${jom ? ' lv-jom' : ''}`,
      body: html`<section class="section"><div class="wrap narrow">
      ${n ? html`<div class="lv-lockup small"><img src="/img/tam-logo-640.png" alt="TAM" class="lv-tam">${jom ? html`<span class="lv-x">×</span><img src="/img/jom/jom-logo.png" alt="JOM" class="lv-jomlogo">` : ''}</div>
      <div class="label">${n.weekday} ${n.day} ${n.month} · ${n.doors} to ${n.ends}</div><h1 class="chrome gold">You’re at ${n.title}</h1>
      <form class="formbox lv-form" id="lv-checkin" data-night="${n.slug}">
        <fieldset class="lv-n"><legend>How many of you?</legend><div class="lv-stepper"><button type="button" data-step="-1" aria-label="One fewer">−</button><output name="n">1</output><button type="button" data-step="1" aria-label="One more">+</button></div>
          <p class="small muted">Everyone counts: parents, grandparents, friends.</p></fieldset>
        ${acts.length ? html`<label class="field"><span>Who have you come to see?</span><select name="act"><option value="">Everyone!</option>${acts.map((a) => html`<option value="${a.slug}">${a.name}${a.group ? ` · ${a.group}` : ''}</option>`)}</select></label>` : ''}
        <button class="btn hot lv-go" type="submit">Check in</button><p class="err" role="status" aria-live="polite"></p>
        <p class="small muted">No ticket or name needed. We count how many are here, and who for: that’s all.</p></form>
      <div id="lv-done" hidden></div>
      ${jsonData('lv-acts', acts.map(({ slug, name, href, photo, jom: j }) => ({ slug, name, href, photo, jom: Boolean(j) })))}`
      : html`<h1 class="chrome gold">Check in</h1><p>There’s no TAM night on right now. <a href="/whats-on">See what’s on</a>.</p>`}
      </div></section>`,
    }), 200, { 'Cache-Control': 'no-store' });
  });
}

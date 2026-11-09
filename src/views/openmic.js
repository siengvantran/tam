// Open mic pages: the hub, the Tuesday and Sunday nights, and JOM
// (src/domain/openmic.js has the data).

import { html } from './html.js';
import { html as respond, redirect } from '../lib/http.js';
import { layout, nightCard, nightHref, times } from './layout.js';
import { HUB, JOM, SERIES, seriesBy } from '../domain/openmic.js';
import { placeLd } from './ai.js';

const SITE_FONTS = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Caveat:wght@600&family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap';
const nextLine = (n) => (n ? `Next: ${n.weekday} ${n.day} ${n.month}${n.timesTbc ? '' : ` · ${n.doors}`}` : 'Dates announced soon');

function hub(ctx, om, d) {
  const desc = 'Open mic at TAM, Elephant & Castle: the International Open Mic on Tuesdays, Singers on Sundays and the Junior Open Mic for young performers. Dates, tickets and how to get on stage.';
  const all = ctx.content.upcoming(ctx.today()).filter((n) => SERIES.some((s) => s.match(n))).slice(0, 9);
  return layout(ctx, {
    title: 'Open Mic', path: HUB, description: desc,
    jsonLd: { '@context': 'https://schema.org', '@type': 'EventSeries', name: 'Open Mic at TAM', description: desc, url: `${ctx.cfg.siteUrl}${HUB}`, location: placeLd(ctx),
      organizer: { '@type': 'Organization', name: 'TAM, Temple of Art and Music', url: ctx.cfg.siteUrl } },
    body: html`<section class="hero om-hero"><div class="wrap om-hero-in">
  <div><div class="label">Three ways onto the stage</div>
    <h1 class="om-title">Open <em>Mic</em></h1>
    <p class="lede">Bring a song, a voice or an instrument. TAM runs three open mics, each with its own room and its own crowd. Pick your door.</p></div>
  <img class="om-logo" src="/img/tam-logo-640.png" alt="TAM · Temple of Art and Music" width="320" height="320">
</div></section>
<section class="section om-doors-sec"><div class="wrap"><div class="om-doors">
  ${SERIES.map((s) => { const next = om.nightsFor(s.slug, 1)[0]; return html`<a class="om-door om-${s.tone}" href="${s.path}">
    <span class="om-day">${s.short}</span>
    <span class="label">${s.rhythm}</span>
    <h2>${s.name}</h2>
    <p>${s.blurb}</p>
    <span class="om-next">${nextLine(next)}</span>
    <span class="om-go"><b>${s.host}</b><i>Enter →</i></span>
  </a>`; })}
</div></div></section>
<section class="section" id="dates"><div class="wrap"><div class="head"><h2>Coming up</h2><a class="more" href="/whats-on">Everything that’s on →</a></div>
  ${all.length ? html`<div class="nights-grid">${all.map((n) => nightCard(ctx, n, d.tickets.nightAvailability(n)))}</div>` : html`<p class="muted">The next open mic dates are announced soon. <a href="/whats-on">See what’s on</a>.</p>`}
  <p class="small muted">Tickets are booked through TAM’s own box office, on each night’s page.</p>
</div></section>`,
  });
}

function seriesPage(ctx, om, d, s) {
  const nights = om.nightsFor(s.slug, 12);
  const desc = `${s.name} at TAM, Elephant & Castle. ${s.rhythm}. ${s.blurb}`;
  return layout(ctx, {
    title: s.name, path: s.path, description: desc,
    jsonLd: { '@context': 'https://schema.org', '@type': 'EventSeries', name: s.name, description: desc, url: `${ctx.cfg.siteUrl}${s.path}`, location: placeLd(ctx),
      organizer: { '@type': 'Organization', name: 'TAM, Temple of Art and Music', url: ctx.cfg.siteUrl },
      subEvent: nights.map((n) => ({ '@type': 'MusicEvent', name: n.title, startDate: n.start, location: placeLd(ctx), url: `${ctx.cfg.siteUrl}${nightHref(n)}` })) },
    body: html`<section class="hero om-hero"><div class="wrap om-hero-in om-${s.tone}">
  <div><a class="label" href="${HUB}">← Open Mic at TAM</a>
    <h1 class="om-title om-title-s">${s.name}</h1>
    <div class="label om-rhythm">${s.rhythm} · ${s.host}</div>
    <p class="lede">${s.blurb}</p>
    <div class="ctas">${nights[0] ? html`<a class="btn hot" href="${nightHref(nights[0])}">${nextLine(nights[0]).replace('Next: ', 'Book ')}</a>` : ''}<a class="btn ghost" href="#dates">All dates</a></div></div>
  <img class="om-logo" src="/img/tam-logo-640.png" alt="TAM · Temple of Art and Music" width="320" height="320">
</div></section>
<section class="section" id="dates"><div class="wrap"><div class="head"><h2>Dates and tickets</h2></div>
  ${nights.length ? html`<div class="nights-grid">${nights.map((n) => nightCard(ctx, n, d.tickets.nightAvailability(n)))}</div>`
    : html`<p class="muted">The next dates are announced soon. <a href="/whats-on">See what’s on at TAM</a>.</p>`}
  <p class="small muted">Tickets are booked through TAM’s own box office, on each night’s page.</p>
</div></section>
<section class="section"><div class="wrap"><div class="head"><h2>More open mics</h2></div><div class="om-doors">
  ${SERIES.filter((x) => x.slug !== s.slug).map((x) => html`<a class="om-door om-${x.tone} om-small" href="${x.path}"><span class="label">${x.rhythm}</span><h2>${x.name}</h2><p>${x.blurb}</p><span class="om-go"><b>${x.host}</b><i>Enter →</i></span></a>`)}
</div></div></section>`,
  });
}

// JOM is an app, not a page: one screen, swiped in four directions. It keeps the
// site's logo, type and colours but not its header and footer.
function jom(ctx, om) {
  const s = seriesBy.get('jom');
  const next = om.nightsFor('jom', 1)[0];
  const desc = 'Junior Open Mic at TAM, Elephant & Castle: the young artists who play it, one screen each. Follow the ones you like and cheer them on.';
  const live = om.liveArtists();
  const noindex = !ctx.cfg.indexing;
  return `<!doctype html>${html`<html lang="en-GB" data-theme="tam"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>JOM · Junior Open Mic · ${ctx.content.site.name}</title><meta name="description" content="${desc}"><link rel="canonical" href="${ctx.cfg.siteUrl}${JOM}">
${noindex ? html`<meta name="robots" content="noindex, nofollow">` : ''}<meta name="theme-color" content="#0b0709">
<meta property="og:title" content="JOM · Junior Open Mic at TAM"><meta property="og:description" content="${desc}"><meta property="og:image" content="${ctx.cfg.siteUrl}/img/og.jpg"><meta property="og:url" content="${ctx.cfg.siteUrl}${JOM}">
<link rel="icon" type="image/png" href="/img/favicon-48.png"><link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${SITE_FONTS}"><link rel="stylesheet" href="/css/site.css"></head>
<body class="jom-body">
<div id="jom" class="jom" data-next="${next ? nextLine(next) : ''}" data-next-href="${next ? nightHref(next) : ''}">
  <header class="jom-top">
    <a class="jom-brand" href="/" aria-label="TAM home"><img src="/img/tam-mark-96.png" alt="" width="34" height="34"></a>
    <span class="jom-word">JOM</span><span class="jom-sub">Junior Open Mic</span>
    <span class="jom-pos" id="jom-pos" aria-live="polite"></span>
    <a class="jom-hub" href="${HUB}">Open Mic</a>
  </header>
  <div class="jom-view" id="jom-view">
    <div class="jom-track" id="jom-track">
      <section class="jom-panel jom-scroll" id="jom-p-back" aria-label="Backstage"><div class="jom-pad" id="jom-back"></div></section>
      <section class="jom-panel jom-scroll" id="jom-p-line" aria-label="Lineup"><div class="jom-pad" id="jom-line"></div></section>
      <section class="jom-panel" id="jom-p-spot" aria-label="Spotlight"><div class="jom-vtrack" id="jom-vtrack">
        <article class="jom-card jom-house"><div><p class="label">Temple of Art &amp; Music · Elephant &amp; Castle</p><h1 class="jom-big">Junior <em>Open Mic</em></h1></div>
          <p class="jom-lede">The young artists of TAM, one screen each. Find someone you like, follow them, and cheer them on.</p>
          <noscript><p>${live.length ? `On the lineup: ${live.map((a) => a.name).join(', ')}.` : ''} This page needs JavaScript to show the artists.</p></noscript></article>
      </div></section>
      <section class="jom-panel jom-scroll" id="jom-p-prof" aria-label="Profile"><div id="jom-prof"></div></section>
    </div>
    <div class="jom-toast" id="jom-toast" role="status" hidden></div>
  </div>
  <nav class="jom-tabs" aria-label="Sections">
    <button type="button" data-col="0">Backstage</button><button type="button" data-col="1">Lineup</button><button type="button" data-col="2">Spotlight</button><button type="button" data-col="3">Profile</button>
  </nav>
</div>
<script type="module" src="/js/jom.js"></script></body></html>`}`;
}

function manage(ctx) {
  return layout(ctx, {
    title: 'JOM: the desk', path: `${JOM}/manage`, noindex: true, ambient: null, scripts: ['/js/jom-manage.js'], bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap">
    <div class="label">TAM back office</div><h1 class="chrome gold">Junior Open Mic</h1>
    <p><a class="btn ghost small" href="${JOM}" target="_blank" rel="noopener">Open JOM ↗</a> <a class="btn ghost small" href="${HUB}" target="_blank" rel="noopener">Open Mic ↗</a> <a class="btn ghost small" href="/shows">Shows</a></p>
    <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Sign in at <a href="/shows">/shows</a> with your work email, then come back here.</p></div>
    <div id="jom-manage" hidden></div></div></section>`,
  });
}

export function routes(r, ctx, om, d) {
  r.get(HUB, (req, res) => respond(res, hub(ctx, om, d)));
  r.get('/openmic', (req, res) => redirect(res, HUB, 301));
  for (const s of SERIES) if (s.slug !== 'jom') r.get(s.path, (req, res) => respond(res, seriesPage(ctx, om, d, s)));
  r.get(JOM, (req, res) => respond(res, jom(ctx, om)));
  r.get('/junior-open-mic', (req, res) => redirect(res, JOM, 301));
  r.get(`${JOM}/manage`, (req, res) => respond(res, manage(ctx)));
}

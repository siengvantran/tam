// The Great British Blues Jam pages (src/domain/blues.js has the data).

import { html } from './html.js';
import { html as respond, redirect } from '../lib/http.js';
import { layout } from './layout.js';
import { PATH } from '../domain/blues.js';
import { placeLd } from './ai.js';
import { londonToUtc } from '../lib/content.js';

// Old-school blues type: wood-type gig-poster capitals (Ultra), juke-joint display (Rye),
// a typed sign-up sheet (Special Elite) and 1920s race-record print (Old Standard TT).
const FONTS = 'https://fonts.googleapis.com/css2?family=Ultra&family=Rye&family=Special+Elite&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600&display=swap';
const BLUES_FONTS = 'https://fonts.googleapis.com/css2?family=Ultra&family=Rye&family=Special+Elite&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&display=swap';

function page(ctx, blues) {
  const first = blues.publicNight(blues.jamDay());
  const desc = 'The Great British Blues Jam at TAM, Elephant & Castle: every Saturday afternoon. A host, a house band, and a stage for anyone who plays. Sign up to jam, and leave a note on the Great British Blues Wall.';
  return layout(ctx, {
    title: 'The Great British Blues Jam', path: PATH, description: desc, scripts: ['/js/blues.js'], og: '/img/og.jpg', bodyClass: 'blues', ambient: null, fonts: BLUES_FONTS,
    jsonLd: { '@context': 'https://schema.org', '@type': 'EventSeries', name: 'The Great British Blues Jam', description: desc, url: `${ctx.cfg.siteUrl}${PATH}`,
      location: placeLd(ctx), organizer: { '@type': 'Organization', name: 'TAM, Temple of Art and Music', url: ctx.cfg.siteUrl },
      subEvent: blues.saturdays().map((d) => blues.publicNight(d)).map((n) => ({ '@type': 'MusicEvent', name: 'The Great British Blues Jam', startDate: londonToUtc(n.date, n.start),
        eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: placeLd(ctx), url: `${ctx.cfg.siteUrl}${PATH}`,
        ...(n.host ? { performer: [{ '@type': 'Person', name: n.host }, ...n.band.map((b) => ({ '@type': 'Person', name: b.name }))] } : {}),
        ...(n.tickets ? { offers: { '@type': 'Offer', url: n.tickets, priceCurrency: 'GBP', availability: 'https://schema.org/InStock', ...(n.price !== null ? { price: (n.price / 100).toFixed(2) } : {}) } } : {}) })) },
    body: html`<section class="hero bj-hero"><div class="wrap bj-hero-in"><div class="bj-poster">
  <div class="bj-kicker">★ Every Saturday · ${first.start === '16:00' ? '4 o’clock' : first.start} ★</div>
  <div class="bj-pre">The Temple of Art &amp; Music presents</div>
  <h1 class="bj-title"><span>The Great British</span> <b>Blues Jam</b></h1>
  <div class="bj-rule"><span>Live</span><span>Loud</span><span>Low-down</span></div>
  <p class="bj-lede">A host, a house band, and the stage for anyone who plays. Bring your guitar, your harp, your voice: put your name down for a Saturday and the host will call you up.</p>
  <div class="ctas"><a class="btn hot" href="#jam">Sign up to jam</a><a class="btn ghost" href="#wall">The Great British Blues Wall</a>${first.tickets ? html`<a class="btn ghost" href="${first.tickets}" target="_blank" rel="noopener">Tickets ↗</a>` : ''}</div>
  <noscript><p>Next: ${first.when}${first.host ? ` · hosted by ${first.host}` : ''}.</p></noscript></div>
  <div class="bj-78" aria-hidden="true"><div class="bj-78-label"><small>TAM Records</small><b>Saturday Blues</b><i>The Great British Blues Jam</i><small>78 RPM · Elephant &amp; Castle</small></div></div>
</div></section>
<section class="section" id="jam"><div class="wrap"><div class="head"><h2 class="chrome">Saturdays</h2><p class="muted">Each week’s host and house band, and who’s down to jam. Put your name down for any Saturday.</p></div>
  <div id="bj-nights" class="bj-nights" aria-live="polite">${blues.saturdays().map((d) => blues.publicNight(d)).map((n, i) => html`<article class="bj-night${i === 0 ? ' next' : ''}">
    <header><div class="label">${n.start}</div><h3>${n.when}</h3></header>
    <p><b>Host:</b> ${n.host || 'announced soon'}. <b>House band:</b> ${n.band.length ? n.band.map((b) => `${b.name}${b.instrument ? ` (${b.instrument})` : ''}`).join(', ') : 'announced soon'}.</p>
    ${n.note ? html`<p class="bj-note">${n.note}</p>` : ''}
    <p>${n.jammers.length ? `${n.jammers.length} signed up to jam: ${n.jammers.map((j) => `${j.name} (${j.instrument})`).join(', ')}.` : 'Nobody has signed up to jam yet.'} ${n.open ? `${n.spotsLeft} jam spots left.` : 'Sign-ups are closed.'}${n.tickets ? html` <a href="${n.tickets}">Tickets</a>.` : ''}</p>
  </article>`)}</div></div></section>
<section class="section" id="wall"><div class="wrap"><div class="head"><h2 class="chrome">The Great British Blues Wall</h2><p class="muted">Shout-outs, setlists, who blew you away. Leave a note for the jam.</p></div>
  <form class="formbox bj-wall-form" id="bj-wall-form"><div class="fields"><label class="field"><span>Your name</span><input name="name" maxlength="40" required autocomplete="name"></label>
    <label class="field bj-msg"><span>Your message</span><textarea name="message" maxlength="200" rows="2" required placeholder="That harmonica solo last week…"></textarea></label></div>
    <button class="btn hot" type="submit">Put it on the wall</button><p class="err" role="status" aria-live="polite"></p></form>
  <div class="bj-wall" id="bj-wall"></div>
  <p class="small muted">Up on the big screen at TAM during the jam. <a href="${PATH}/screen">The screen</a></p></div></section>`,
  });
}

// For the projector: no site chrome, just the jam.
function screen(ctx) {
  return `<!doctype html>${html`<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Great British Blues Jam · TAM</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#050304">
<link rel="icon" type="image/png" href="/img/favicon-48.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="/css/site.css"></head>
<body class="bj-screen">
<canvas id="bj-rings" aria-hidden="true"></canvas>
<header class="bj-s-title"><div class="bj-s-kicker" id="s-date">Saturday · TAM</div><h1><span>The Great British</span> Blues Jam</h1><p id="s-host"></p></header>
<main class="bj-s-stage"><img id="bj-logo" src="/img/tam-logo-640.png" alt="TAM · Temple of Art and Music"></main>
<aside class="bj-s-side"><div class="bj-s-now" id="s-now" hidden><div class="bj-s-k">On stage now</div><b id="s-now-name"></b><span id="s-now-inst"></span></div>
  <div class="bj-s-k">Up next</div><ol id="s-next"></ol><div class="bj-s-k">House band</div><ul id="s-band"></ul></aside>
<footer class="bj-s-foot"><div class="bj-s-wall" id="s-wall"><span>The Great British Blues Wall</span></div>
  <div class="bj-s-qr"><img src="${PATH}/qr.svg" alt="" width="110" height="110"><span>Jam with us<br><b id="s-url">tam.tv/blues</b></span></div></footer>
<div class="bj-s-start" id="bj-start"><h2>The Great British Blues Jam</h2><p>The TAM logo pulses to the music in the room.</p>
  <button class="btn hot" type="button" data-start="mic">Start with the microphone</button><button class="btn ghost" type="button" data-start="auto">Start without (steady shuffle beat)</button>
  <p class="small">Keys: F full screen · M microphone · A steady beat · Space tap the tempo · H hide the lists</p></div>
<script type="module" src="/js/blues-screen.js"></script></body></html>`}`;
}

function manage(ctx) {
  return layout(ctx, {
    title: 'Blues Jam: run it', path: `${PATH}/manage`, noindex: true, ambient: null, scripts: ['/js/blues-manage.js'], bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap">
    <div class="label">TAM back office</div><h1 class="chrome gold">The Great British Blues Jam</h1>
    <p><a class="btn ghost small" href="${PATH}/screen" target="_blank" rel="noopener">Open the big screen ↗</a> <a class="btn ghost small" href="${PATH}" target="_blank" rel="noopener">Public page ↗</a> <a class="btn ghost small" href="/shows">Shows</a></p>
    <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Sign in at <a href="/shows">/shows</a> with your work email, then come back here.</p></div>
    <div id="bj-manage" hidden></div></div></section>`,
  });
}

export function routes(r, ctx, blues, qr) {
  r.get(PATH, (req, res) => respond(res, page(ctx, blues)));
  r.get('/blues', (req, res) => redirect(res, PATH, 301));
  r.get('/blues-jam', (req, res) => redirect(res, PATH, 301));
  r.get(`${PATH}/screen`, (req, res) => respond(res, screen(ctx), 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }));
  r.get('/blues/screen', (req, res) => redirect(res, `${PATH}/screen`, 302));
  r.get(`${PATH}/manage`, (req, res) => respond(res, manage(ctx)));
  r.get(`${PATH}/qr.svg`, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    res.end(qr.toSvg(`${ctx.cfg.siteUrl}/blues#jam`, { dark: '#0b0709', light: '#f6ecd8' }));
  });
}


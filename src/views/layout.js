// The page shell and the pieces pages share.

import { html, raw, jsonData } from './html.js';
import { pounds } from '../../shared/pricing.js';
import { dateParts } from '../lib/content.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Audiowide&family=Bungee+Inline&family=Caveat:wght@600&family=Monoton&family=Outfit:wght@400;500;700&family=Shrikhand&display=swap';

export function layout(ctx, {
  title, description, path = '/', theme = 'tam', body, og, scripts = [], noindex = false, jsonLd = null,
  ambient = 'stars', song = null, festival = null, data = null, bodyClass = '',
}) {
  const { site } = ctx.content;
  const url = `${ctx.cfg.siteUrl}${path}`;
  const image = og ? (og.startsWith('http') ? og : `${ctx.cfg.siteUrl}${og}`) : `${ctx.cfg.siteUrl}/img/og.jpg`;
  const fullTitle = title ? `${title} · ${site.name}` : `${site.name} · ${site.tagline}`;
  const desc = description || site.description;
  const mods = new Set(['/js/site.js', ...scripts]);
  if (song) mods.add('/js/tamalume.js');
  return '<!doctype html>' + html`
<html lang="en-GB" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
${noindex ? raw('<meta name="robots" content="noindex, nofollow">') : ''}
<meta property="og:site_name" content="${site.name}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title || site.name}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b0709">
<link rel="icon" type="image/png" href="/img/favicon-48.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/css/site.css">
${jsonLd ? raw(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`) : ''}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${header(ctx, festival)}
<main id="main">${body}</main>
${footer(ctx)}
${ambient ? html`<canvas class="ambient" id="ambient" data-kind="${ambient}" aria-hidden="true"></canvas>` : ''}
${song ? tamalumeBar(ctx, song) : ''}
${data ? jsonData('page-data', data) : ''}
${[...mods].map((s) => html`<script type="module" src="${s}"></script>`)}
</body>
</html>`;
}

function header(ctx, festival) {
  const { festivals } = ctx.content;
  const fest = festival || festivals.find((f) => f.dates && f.dates.to >= ctx.today()) || festivals[0];
  return html`<header class="top">
  <div class="wrap">
    <a class="brand" href="/"><img src="/img/tam-mark-96.png" alt="" width="36" height="36"><span>TAM<b>.TV</b></span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav class="nav" id="nav" aria-label="Main">
      <a href="/whats-on">What's on</a>
      ${fest ? html`<a href="${fest.path}" class="fest-link">${fest.name}</a>` : ''}
      <a href="/artists">Artists</a>
      <a href="/tv">TAM TV</a>
      <a href="/archive">Archive</a>
      <a href="/locations/elephant-castle">Find us</a>
    </nav>
    <a class="btn hot small" href="/whats-on#book">Tickets</a>
  </div>
</header>`;
}

function footer(ctx) {
  const { site, venueBy } = ctx.content;
  const v = venueBy.get(site.defaultVenue);
  return html`<footer class="foot">
  <div class="wrap">
    <div>
      <img src="/img/tam-logo-640.png" alt="TAM · Temple of Art and Music" width="120" height="120" class="foot-logo">
      <p class="addr">${v ? v.name : 'TAM'}<br>${v ? v.place : ''}<br>${v ? v.address : ''}</p>
    </div>
    <nav aria-label="More">
      <a href="/whats-on">What's on</a><a href="/festivals">Festivals</a><a href="/artists">Artists</a><a href="/tv">TAM TV</a>
      <a href="/archive">Archive</a><a href="/private-parties">Private parties</a><a href="/about">About</a><a href="/verify">Verify a certificate</a><a href="/privacy">Privacy</a>
    </nav>
    <nav aria-label="Elsewhere">
      ${Object.entries(site.socials || {}).filter(([, u]) => u).map(([k, u]) => html`<a href="${u}" rel="noopener" target="_blank">${k[0].toUpperCase() + k.slice(1)} ↗</a>`)}
    </nav>
  </div>
  <p class="wrap small">${site.legalName} · ${site.tagline}</p>
</footer>`;
}

export function tamalumeBar(ctx, song) {
  const a = song.artist ? ctx.content.artistBy.get(song.artist) : null;
  return html`<aside class="syn" id="syn" aria-label="Tamalume music player" data-youtube="${song.youtubeId}">
  <button class="syn-play" id="syn-play" type="button" aria-label="Play" aria-pressed="false">
    <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>
    <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>
  </button>
  <div class="syn-meta"><div class="syn-title">Tamalume<sup>™</sup></div><div class="syn-now" id="syn-now">${song.title}${a ? ` · ${a.name}` : ''}</div></div>
  <canvas class="syn-bars" id="syn-bars" width="192" height="64" aria-hidden="true"></canvas>
  <div class="syn-note" id="syn-note" title="The note you're hearing and the colour it makes"><i></i><span>See the sound</span></div>
  <label class="sr" for="syn-src">Sound source</label>
  <select id="syn-src"><option value="song">Theme song</option><option value="file">Your track…</option><option value="mic">Live mic</option></select>
  <input type="file" id="syn-file" accept="audio/*" hidden>
  <div class="syn-yt" id="syn-yt" aria-hidden="true"></div>
</aside>`;
}

export function ticker(items) {
  const row = items.map((t) => html`<span>${t} ✦</span>`);
  return html`<div class="ticker" aria-hidden="true"><div class="row">${row}${row}</div></div>`;
}

export const when = (n) => `${n.weekday} ${n.day} ${n.month}`;
export const times = (n) => (n.timesTbc ? 'Times announced soon' : `Doors ${n.doors}${n.ends ? ` · until ${n.ends}` : ''}`);

export function nightCard(ctx, n, avail) {
  const f = n.festival ? ctx.content.festivalBy.get(n.festival) : null;
  const from = avail && avail.from;
  return html`<article class="night-card${n.festival ? ` fest-${n.festival}` : ''}">
  <a href="/events/${n.slug}">
    <div class="nc-date"><b>${n.day}</b><span>${n.month.slice(0, 3)}</span><small>${n.weekday.slice(0, 3)}</small></div>
    <div class="nc-body">
      ${f ? html`<div class="label">${f.name}</div>` : ''}
      <h3>${n.label && n.label !== n.title ? n.label : n.title}</h3>
      <p class="muted">${times(n)}</p>
      ${n.sale ? html`<p class="price">${from !== null && from !== undefined ? `${n.sale.mode === 'own' ? 'From ' : ''}${pounds(from)}` : 'Sold out'}</p>` : html`<p class="price muted">${n.url ? 'Tickets on Eventbrite' : 'Tickets soon'}</p>`}
    </div>
  </a>
</article>`;
}

// A month calendar for a festival's run; tap a night to book it.
export function festivalCalendar(ctx, f) {
  const nights = ctx.content.nightsFor(f.slug);
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const closed = new Set(f.closed || []);
  const months = [...new Set(nights.map((n) => n.date.slice(0, 7)))];
  return months.map((ym) => {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(html`<td></td>`);
    for (let d = 1; d <= days; d++) {
      const iso = `${ym}-${String(d).padStart(2, '0')}`;
      const n = byDate.get(iso);
      const p = dateParts(iso);
      if (n) {
        const cls = ['on', (f.pricing.special || []).includes(iso) || n.handmade ? 'edge' : '', p.dow === 0 || p.dow >= 5 ? 'wk' : ''].filter(Boolean).join(' ');
        cells.push(html`<td class="${cls}"><a href="/events/${n.slug}" data-night="${n.slug}" aria-label="${p.weekday} ${d} ${p.month}: ${n.label || 'festival night'}">${d}${n.handmade ? '★' : ''}</a></td>`);
      } else {
        cells.push(html`<td class="${closed.has(iso) ? 'closed' : ''}" aria-label="${p.weekday} ${d} ${p.month}${closed.has(iso) ? ': closed' : ''}">${d}</td>`);
      }
    }
    while (cells.length % 7) cells.push(html`<td></td>`);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(html`<tr>${cells.slice(i, i + 7)}</tr>`);
    return html`<table class="cal"><caption class="label">${dateParts(`${ym}-01`).month} ${y}</caption>
<thead><tr>${['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((d) => html`<th scope="col">${d}</th>`)}</tr></thead><tbody>${rows}</tbody></table>`;
  });
}

export const artistChip = (a, via) => html`<a class="chip artist-chip" href="/artists/${a.slug}${via ? `?via=${via}` : ''}">${a.photo ? html`<img src="${a.photo}" alt="" loading="lazy">` : ''}<span>${a.name}</span></a>`;

export function youtubeThumb(v) {
  return html`<a class="yt" href="https://www.youtube.com/watch?v=${v.youtubeId}" data-yt="${v.youtubeId}" target="_blank" rel="noopener">
  <img src="https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg" alt="" loading="lazy"><span>${v.title}</span></a>`;
}

// The page shell and the pieces pages share.

import { html, raw, jsonData } from './html.js';
import { pounds } from '../../shared/pricing.js';
import { dateParts } from '../lib/content.js';

// Type in the music-legacy tradition: a high-contrast serif from record sleeves and
// concert bills, condensed capitals from jazz labels and gig posters, a clean sans to read.
const FONTS = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Caveat:wght@600&family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap';

export function layout(ctx, {
  title, description, path = '/', theme = 'tam', body, og, scripts = [], noindex = false, jsonLd = null,
  ambient = 'stars', song = null, festival = null, data = null, bodyClass = '', pathway = null, fonts = '', canonical = null,
}) {
  const { site } = ctx.content;
  const elsewhere = ctx.content.canonicalElsewhere.get(path);
  const url = canonical || elsewhere || `${ctx.cfg.siteUrl}${path}`; // canonical: a page on another TAM address (e.g. showcase.tam.tv)
  if (elsewhere) jsonLd = null; // the event listing belongs to the canonical page, not this copy
  if (!ctx.cfg.indexing) noindex = true;
  const image = og ? (og.startsWith('http') ? og : `${ctx.cfg.siteUrl}${og}`) : `${ctx.cfg.siteUrl}/img/og.jpg`;
  const fullTitle = title ? `${title} · ${site.name}` : `${site.name} · ${site.tagline}`;
  const desc = description || site.description;
  const mods = new Set(['/js/site.js', ...(ctx.cfg.gaId ? ['/js/consent.js'] : []), ...scripts]);
  if (String(body).includes('data-carousel')) mods.add('/js/carousel.js'); // the featured show's carousel
  const ask = !bodyClass.includes('staff') && !/^\/(ticket|pay)\//.test(path);
  if (ask) { mods.add('/js/concierge.js'); mods.add('/js/instrument.js'); mods.add('/js/club.js'); mods.add('/js/room-invite.js'); } // club.js: the footer sign-up and your card's points
  if (song) mods.add('/js/tamalume.js');
  return '<!doctype html>' + html`
<html lang="en-GB" data-theme="${theme}"${ctx.cfg.gaId ? html` data-ga="${ctx.cfg.gaId}"` : ''}>
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
<link rel="stylesheet" href="${FONTS}">${fonts ? html`<link rel="stylesheet" href="${fonts}">` : ''}
<link rel="stylesheet" href="/css/site.css">
<link rel="alternate" type="application/json" href="/whats-on.json" title="What’s on at TAM (data)">
<link rel="alternate" type="text/calendar" href="/calendar.ics" title="TAM calendar">
<link rel="alternate" type="text/plain" href="/llms.txt" title="TAM for AI assistants">
${jsonLd ? raw(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`) : ''}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${header(ctx, festival, pathway)}
${friday(ctx) && isFriday(ctx) && (!festival || path === '/') && !bodyClass.includes('staff') ? fridayRibbon(ctx) : ''}
<main id="main">${body}</main>
${footer(ctx)}
${ambient ? html`<canvas class="ambient" id="ambient" data-kind="${ambient}" aria-hidden="true"></canvas>` : ''}
${song ? tamalumeBar(ctx, song) : ''}
${ask ? askDrawer(ctx, pathway) : ''}
${data ? jsonData('page-data', data) : ''}
${[...mods].map((s) => html`<script type="module" src="${s}"></script>`)}
</body>
</html>`;
}

// Old-site pages staff have reconnected to the navigation (src/domain/legacy-links.js).
const navLinks = (ctx, place) => (ctx.links ? ctx.links.navLinks(place) : []);
// Where a link may point: old-only pages that aren't reconnected fall back.
export const linkTo = (ctx, href, fallback) => (!ctx.links || ctx.links.linkable(href) ? href : fallback);

// Friday Night Live (friday.tam.tv), TAM's own site for its Fridays. On a Friday
// (London time) the site lights it up: a glowing header link and a ribbon on every page.
export const friday = (ctx) => ctx.content.site.friday || null;
export const isFriday = (ctx) => new Date(`${ctx.today()}T12:00:00Z`).getUTCDay() === 5;
const fridayUrl = (ctx, where) => `${friday(ctx).url}/?utm_source=tam.tv&utm_medium=referral&utm_campaign=${where}`;
export { fridayUrl };

function fridayRibbon(ctx) {
  const f = friday(ctx);
  return html`<a class="fri-ribbon" href="${fridayUrl(ctx, 'ribbon')}" target="_blank" rel="noopener"><span class="fri-dot" aria-hidden="true"></span>
  <b>It's Friday.</b> <span>${f.name} ${f.by}: find your Friday tonight</span> <span class="fri-go">friday.tam.tv ↗</span></a>`;
}

// The Friday Night Live tile for listings: always there, lit on a Friday.
export function fridayTile(ctx) {
  const f = friday(ctx);
  if (!f) return '';
  const lit = isFriday(ctx);
  return html`<a class="fri-tile${lit ? ' lit' : ''}" href="${fridayUrl(ctx, 'listing')}" target="_blank" rel="noopener">
  <div class="fri-word"><b>FRIDAY NIGHT</b><b class="fri-live">LIVE</b><small>${f.by}</small></div>
  <div><div class="label">${lit ? 'Tonight · every Friday' : 'Every Friday'}</div><h3>${f.tagline}</h3><p class="muted">${f.blurb}</p><span class="fri-go">friday.tam.tv ↗</span></div>
</a>`;
}

function header(ctx, festival, pathway) {
  const { festivals } = ctx.content;
  const fest = festival || festivals.find((f) => f.dates && f.dates.to >= ctx.today()) || festivals[0];
  return html`<header class="top">
  <div class="wrap">
    <a class="brand" href="/"><img src="/img/tam-mark-96.png" alt="" width="36" height="36"><span>TAM<b>.TV</b></span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav class="nav" id="nav" aria-label="Main">
      <a href="/whats-on">What's on</a>
      ${friday(ctx) ? html`<a class="fri-link${isFriday(ctx) ? ' lit' : ''}" href="${fridayUrl(ctx, 'nav')}" target="_blank" rel="noopener" title="${friday(ctx).name} ${friday(ctx).by} · friday.tam.tv">Fridays</a>` : ''}
      <a href="${BLUES_JAM}" class="blues-link">Blues Jam</a>
      ${fest ? html`<a href="${fest.path}" class="fest-link">${fest.name}</a>` : ''}
      <a href="/artists">Artists</a>
      <a href="/tv">TAM TV</a>
      <a href="/archive">Archive</a>
      <a href="/locations/elephant-castle">Find us</a>
      ${navLinks(ctx, 'header').map((l) => html`<a href="${l.path}">${l.label}</a>`)}
    </nav>
    ${pathway ? html`<a class="for-you" href="/for/${pathway.slug}" title="Your pathway"><img class="neon-ico" src="/img/neon/${pathway.icon}.svg" alt="" width="22" height="22"> For you</a>` : html`<a class="for-you" href="/for">Who are you?</a>`}
    <button class="play-site" id="play-site" type="button" aria-pressed="false" title="Turn the site into an instrument: hover to play, click for chords, or use the A–K keys"><span class="ps-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="ps-label">Play</span></button>
    <a class="btn hot small" href="/whats-on#book">Tickets</a>
  </div>
</header>`;
}

// The TAM Club sign-up at the foot of every page (src/views/club.js, public/js/club.js).
const clubStrip = () => html`<div class="wrap cl-strip"><div><b>The TAM list</b> <span>What’s on, picked for you, and points toward <b>a drink on us</b>.</span> <a href="/club">How it works</a></div>
  <form class="cl-join compact" data-club-join data-source="footer"><label class="field"><span class="sr">Email</span><input name="email" type="email" autocomplete="email" placeholder="Your email" required></label>
  <label class="check"><input type="checkbox" name="consent" required> Yes, email me about TAM. Unsubscribe any time.</label><button class="btn hot" type="submit">Join</button><p class="err" role="status" aria-live="polite"></p></form></div>`;

function footer(ctx) {
  const { site, venueBy } = ctx.content;
  const v = venueBy.get(site.defaultVenue);
  return html`<footer class="foot">
  ${clubStrip()}
  <div class="wrap foot-grid">
    <div>
      <img src="/img/tam-logo-640.png" alt="TAM · Temple of Art and Music" width="120" height="120" class="foot-logo">
      <p class="addr">${v ? v.name : 'TAM'}<br>${v ? v.place : ''}<br>${v ? v.address : ''}</p>
    </div>
    <nav aria-label="More">
      <a href="/whats-on">What's on</a><a href="/festivals">Festivals</a><a href="/artists">Artists</a><a href="/tv">TAM TV</a>
      <a href="/archive">Archive</a><a href="/club">TAM Club</a><a href="/newsletter">Newsletter</a><a href="${BLUES_JAM}">The Great British Blues Jam</a>${navLinks(ctx, 'footer').map((l) => html`<a href="${l.path}">${l.label}</a>`)}<a href="/verify">Verify a certificate</a><a href="/privacy">Privacy</a>${ctx.cfg.gaId ? html`<a href="/privacy#analytics" data-cookie-choices>Cookie choices</a>` : ''}
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
export const times = (n) => (n.timesTbc ? 'Times announced soon' : n.source === 'eventbrite' ? `Starts ${n.doors}` : `Doors ${n.doors}${n.ends ? ` · until ${n.ends}` : ''}`);
// What a night costs on Eventbrite, from the live listing.
// Where a night's tickets are sold when it isn't TAM's box office: Eventbrite, or another site (e.g. immersive.tam.tv).
export const ticketSite = (url) => { try { const h = new URL(url).hostname.replace(/^www\./, ''); return /eventbrite\./.test(h) ? 'Eventbrite' : h; } catch { return 'Eventbrite'; } };
export const listingPrice = (l) => (!l ? '' : l.soldOut ? 'Sold out' : l.free ? 'Free entry' : Number.isFinite(l.from) ? `From ${pounds(l.from)}` : l.priceText || 'Tickets on Eventbrite');
// One Eventbrite ticket type's price and state, for lists.
export const ticketPrice = (t) => (t.kind === 'free' ? 'Free' : t.kind === 'donation' ? 'Pay what you like' : pounds(t.price));
export const ticketState = (t, now = Date.now()) => (t.status === 'AVAILABLE' ? '' : t.status === 'NOT_YET_ON_SALE' ? 'Not on sale yet'
  : t.salesEnd && Date.parse(t.salesEnd) < now ? 'Sales ended' : 'Sold out');

// The Great British Blues Jam has its own page (hosts, house band, sign-up to jam): its nights link there.
export const BLUES_JAM = '/great-british-blues-jam#jam';
export const isBluesJam = (x) => /blues jam/i.test(String(x && (x.title || x.name) || x || ''));
export const nightHref = (n) => (isBluesJam(n.title) && !n.festival ? BLUES_JAM : `/events/${n.slug}`);

export function nightCard(ctx, n, avail) {
  const f = n.festival ? ctx.content.festivalBy.get(n.festival) : null;
  const from = avail && avail.from;
  const fri = !f && n.weekday === 'Friday' && friday(ctx);
  const tonight = fri && n.date === ctx.today();
  return html`<article class="night-card${n.festival ? ` fest-${n.festival}` : ''}${fri ? ' fri' : ''}${tonight ? ' lit' : ''}">
  <a href="${nightHref(n)}">
    <div class="nc-date"><b>${n.day}</b><span>${n.month.slice(0, 3)}</span><small>${n.weekday.slice(0, 3)}</small></div>
    <div class="nc-body">
      ${f ? html`<div class="label">${f.name}</div>` : fri ? html`<div class="label fri-label">${tonight ? 'Tonight · ' : ''}${fri.name}</div>` : ''}
      <h3>${n.label && n.label !== n.title ? n.label : n.title}</h3>
      <p class="muted">${times(n)}</p>
      ${n.sale ? html`<p class="price">${from === 0 ? 'Free tickets' : from !== null && from !== undefined ? `${n.sale.mode === 'own' ? 'From ' : ''}${pounds(from)}` : 'Sold out'}</p>` : html`<p class="price${n.eventbrite && !n.eventbrite.soldOut ? '' : ' muted'}">${n.eventbrite ? listingPrice(n.eventbrite) : n.url ? (n.priceText || `Tickets on ${ticketSite(n.url)}`) : n.source === 'schedule' ? 'Details →' : 'Tickets soon'}</p>`}
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

// The Ask TAM drawer: opened from the floating button on every public page.
export function askDrawer(ctx, pathway) {
  const qs = pathway ? pathway.questions : ['What’s on this weekend?', 'I’m a musician: how do I play here?', 'Can I hire the venue for a party?', 'Christmas party for 12?'];
  return html`<button class="ask-fab" type="button" id="ask-open" aria-controls="ask-drawer" aria-expanded="false"><img src="/img/neon/ask-tam.svg" alt="" width="36" height="36"> Ask TAM</button>
<aside class="ask-drawer" id="ask-drawer" aria-label="Ask TAM" hidden>
  <div class="ask-head"><div><img class="ask-avatar" src="/img/neon/ask-tam.svg" alt="" width="40" height="40"><span><b>Ask TAM</b><small>Your guide to nights, gigs, hire and parties</small></span></div><button type="button" class="ask-x" id="ask-close" aria-label="Close">×</button></div>
  ${chatPanel(qs, pathway)}
</aside>`;
}

export function chatPanel(questions, pathway, { id = 'drawer', placeholder = 'Ask about nights, playing here, hire or parties…' } = {}) {
  return html`<div class="chat" data-chat="${id}" data-pathway="${pathway ? pathway.slug : ''}">
  <div class="chat-log" aria-live="polite"></div>
  <div class="chat-suggest">${questions.map((q) => html`<button type="button" class="chip" data-ask="${q}">${q}</button>`)}</div>
  <form class="chat-form"><label class="sr" for="chat-in-${id}">Your question</label><textarea id="chat-in-${id}" rows="1" maxlength="1000" placeholder="${placeholder}"></textarea><button class="btn hot small" type="submit">Ask</button></form>
  <p class="chat-foot"><button type="button" class="linkish" data-chat-clear>Start over</button> · Answers come from TAM’s listings. Check details on the booking page. <a href="/privacy">Privacy</a></p>
</div>`;
}

// The heading over an inline Ask TAM panel, with its avatar.
export const askTitle = (sub) => html`<div class="ask-title"><img class="ask-avatar" src="/img/neon/ask-tam.svg" alt="" width="44" height="44"><div><div class="label">Ask TAM</div><small>${sub}</small></div></div>`;

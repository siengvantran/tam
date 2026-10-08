import { h, raw, fmtDate, fmtTime } from './lib/html.js';
import { logo, artwork, archiveRings, londonTime, daypart } from './lib/brand.js';
import { pressing } from './lib/vinyl.js';
import { GENRE_NAMES } from './lib/content.js';
import {
  organization, artistLD, eventLD, videoLD, storyLD, venueLD, seriesLD, itemList, jsonLdTag, paths,
} from './lib/seo.js';

const NAV = [
  ['/whats-on', 'What’s on'],
  ['/artists', 'Artists'],
  ['/archive', 'Archive'],
  ['/tv', 'TV'],
  ['/locations', 'Locations'],
  ['/about', 'About'],
];

const DAYPART_LINE = {
  dawn: 'Dawn in London. The room is quiet; the archive is open.',
  day: 'Daytime in London. Dig through six years of nights.',
  dusk: 'Doors soon. Evening light at TAM.',
  night: 'Night in London. This is when TAM happens.',
};

const num = (n) => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const day = (e, opts) => fmtDate(e.start, opts);
const longDay = (e) => fmtDate(e.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = (e) => fmtDate(e.start, { day: 'numeric', month: 'short', year: 'numeric' });
const monthName = (m) => new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 1)));

const pressedOn = (name, legend = false) => {
  const p = pressing(name);
  return h`<p class="pressed center"><span class="eyebrow">Pressed on</span><strong>${p.colourway.name}</strong> ${p.style.toLowerCase()} vinyl${legend ? h`, <strong>Legend Edition</strong> with a gold-foil label` : ''}<br><span class="muted">${p.colourway.note}</span></p>`;
};

const legendBadge = (a) => (a?.legend ? h`<span class="chip chip-legend">Cult legend</span>` : '');
const isLegendNight = (ctx, e) => e.performers.some((p) => ctx.q.artist(p)?.legend);

// ---------------------------------------------------------------- layout

export function layout(ctx, { title, description, path = '/', body, ld = [], noindex = false, ogType = 'website', image }) {
  const { site } = ctx.c;
  const fullTitle = title ? `${title} — ${site.name}` : `${site.name} — ${site.tagline}`;
  const desc = description || site.description;
  const url = `${site.url}${path}`;
  const current = (href) => path === href || path.startsWith(`${href}/`);
  return `<!doctype html>${h`<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
${noindex ? raw('<meta name="robots" content="noindex">') : ''}
<meta property="og:site_name" content="${site.name}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image || `${site.url}/img/og.jpg`}">
${image ? '' : raw('<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">')}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b0907">
<link rel="icon" href="/img/favicon-48.png" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/site.css">
${raw(jsonLdTag(organization(site), ...ld))}
<script src="/js/tam.js" defer></script>
</head>
<body data-daypart="${daypart(londonTime(ctx.now).hour)}">
<canvas class="chorus-rain" data-chorus aria-hidden="true"></canvas>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="TAM.TV home">${raw(logo('mark', { width: 40, alt: '' }))}${raw(logo('wordmark', { width: 92, alt: 'TAM' }))}<span class="brand-tv">.TV</span></a>
  <button class="nav-toggle" aria-expanded="false" aria-controls="nav">Menu</button>
  <nav id="nav" class="site-nav" aria-label="Main">
    ${NAV.map(([href, label]) => h`<a href="${href}"${current(href) ? raw(' aria-current="page"') : ''}>${label}</a>`)}
    <a class="btn btn-small" href="/submit">Play TAM</a>
  </nav>
</header>
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="footer-grid">
    <div>
      <p class="big-idea">${site.bigIdea}</p>
      <p class="muted">${site.legalName} · London since 2020</p>
      <p class="footer-links">${ctx.c.venues.map((v) => h`<a href="${paths.venue(v.slug)}">${v.name}</a>`)}</p>
    </div>
    ${signupForm(ctx)}
    <div>
      <h2 class="eyebrow">Explore</h2>
      <ul class="plain">
        <li><a href="/archive">The archive, by year</a></li>
        <li><a href="/series">Regular nights</a></li>
        <li><a href="/genres">Genres</a></li>
        <li><a href="/stories">Stories</a> · <a href="/listen">Listen</a></li>
        ${Object.entries(site.socials).filter(([, v]) => v).map(([k, v]) => h`<li><a href="${v}" rel="me noopener">${k[0].toUpperCase() + k.slice(1)}</a></li>`)}
      </ul>
      <p><button class="link-button" data-chorus-toggle aria-pressed="false">Pause the falling choruses</button></p>
      <p><a href="/privacy">Privacy &amp; cookies</a> · <a href="/llms.txt">llms.txt</a> · <a href="/graph.json">Knowledge graph</a></p>
    </div>
  </div>
</footer>
${ctx.consent ? '' : consentBanner()}
</body></html>`}`;
}

function consentBanner() {
  return h`<div class="consent" role="dialog" aria-live="polite" aria-label="Cookie choices">
  <p>TAM uses one first-party cookie to remember this choice. With your OK we also record anonymous page views so we can see which artists and nights people care about. No advertising trackers.</p>
  <div class="consent-actions">
    <button class="btn btn-small" data-consent="granted">Allow analytics</button>
    <button class="btn btn-small btn-ghost" data-consent="denied">No thanks</button>
    <a href="/privacy">Details</a>
  </div>
</div>`;
}

function signupForm(ctx, { compact = true } = {}) {
  return h`<form class="signup"${compact ? raw(' id="footer-signup"') : ''} method="post" action="/signup">
  <h2 class="eyebrow">The TAM list</h2>
  <p class="muted">New nights, artists and films. Roughly twice a month.</p>
  <label class="sr" for="signup-email-${compact ? 'f' : 'p'}">Email</label>
  <div class="inline-field">
    <input id="signup-email-${compact ? 'f' : 'p'}" type="email" name="email" required placeholder="you@example.com" autocomplete="email">
    <button class="btn btn-small" type="submit">Join</button>
  </div>
  <label class="check"><input type="checkbox" name="consent" required> I’d like emails from TAM. Unsubscribe any time.</label>
  <input type="hidden" name="from" value="${ctx.path}">
</form>`;
}

// ---------------------------------------------------------------- pieces

const section = (title, body, { href, id, more = 'See all →' } = {}) => h`<section class="section"${id ? raw(` id="${id}"`) : ''}>
  <div class="section-head"><h2>${title}</h2>${href ? h`<a href="${href}">${more}</a>` : ''}</div>
  ${body}
</section>`;

const eventArt = (ctx, e, size) => (e.image
  ? h`<img src="${e.image}" alt="" loading="lazy" decoding="async">`
  : raw(artwork(e.slug, { size, label: false, legend: isLegendNight(ctx, e) })));

const performerLinks = (ctx, e) => e.performers.map((s, i) => {
  const a = ctx.q.artist(s);
  return a ? h`${i ? ', ' : ''}<a href="${paths.artist(s)}">${a.name}</a>` : '';
});

const eventCard = (ctx, e) => h`<article class="card event-card">
  <a class="card-art card-photo" href="${paths.event(e.slug)}" tabindex="-1" aria-hidden="true">${eventArt(ctx, e, 160)}</a>
  <div class="card-body">
    <p class="eyebrow">${ctx.q.venue(e.venue)?.name || e.venueName || ''}</p>
    <h3><a href="${paths.event(e.slug)}">${e.title}</a></h3>
    <p class="meta"><time datetime="${e.start}">${day(e)} · ${fmtTime(e.start)}</time>${e.free ? ' · Free' : ''}</p>
    ${e.performers.length ? h`<p class="meta">${performerLinks(ctx, e)}</p>` : ''}
  </div>
</article>`;

const eventRow = (ctx, e, { showYear = true } = {}) => h`<li class="event-row">
  <time datetime="${e.start}">${fmtDate(e.start, showYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' })}</time>
  <span><a href="${paths.event(e.slug)}">${e.title}</a>${e.performers.length ? h` <span class="meta">— ${performerLinks(ctx, e)}</span>` : ''}</span>
  <span class="meta">${ctx.q.venue(e.venue)?.name || e.venueName || ''}</span>
</li>`;

const eventList = (ctx, list, opts) => h`<ul class="plain event-list">${list.map((e) => eventRow(ctx, e, opts))}</ul>`;

const artistCard = (a) => h`<article class="card artist-card">
  <a href="${paths.artist(a.slug)}" class="card-art">${raw(artwork(a.name, { size: 200, legend: a.legend }))}</a>
  <div class="card-body">
    <h3><a href="${paths.artist(a.slug)}">${a.name}</a> ${legendBadge(a)}</h3>
    <p class="meta">${a.appearances ? plural(a.appearances, 'night') + ' at TAM' : 'From the TAM archive'}${a.genres.length ? ` · ${a.genres.map((g) => GENRE_NAMES[g] || g).join(', ')}` : ''}</p>
  </div>
</article>`;

const videoCard = (v) => h`<article class="card video-card">
  <a href="${paths.video(v.slug)}" class="card-art video-thumb">
    <img src="https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
    <span class="play" aria-hidden="true">▶</span>
  </a>
  <div class="card-body">
    <p class="eyebrow">${v.show ? 'Globetrotting With Gillespie' : 'TAM TV'}</p>
    <h3><a href="${paths.video(v.slug)}">${v.title}</a></h3>
  </div>
</article>`;

const storyCard = (s) => h`<article class="card story-card">
  <div class="card-body">
    <p class="eyebrow">${s.pillar} · <time datetime="${s.published}">${fmtDate(s.published, { day: 'numeric', month: 'short', year: 'numeric' })}</time></p>
    <h3><a href="${paths.story(s.slug)}">${s.title}</a></h3>
    <p>${s.dek}</p>
  </div>
</article>`;

const chipLinks = (items) => h`<p class="chips">${items.map(([href, label, count]) => h`<a class="chip chip-link" href="${href}">${label}${count != null ? h` <span>${num(count)}</span>` : ''}</a>`)}</p>`;

const statRow = (items) => h`<dl class="stats">${items.map(([n, label]) => h`<div><dt>${label}</dt><dd>${n}</dd></div>`)}</dl>`;

// The "data" buttons. Work without JS (POST + redirect); tam.js upgrades them.
const DEMAND_DONE = {
  'bring-back': ['wants them back at TAM', 'want them back at TAM'],
  'was-there': ['was there', 'were there'],
};
const demandForm = (ctx, { type, target, count, label, ask }) => h`<form class="demand" method="post" action="/demand" data-demand>
  <input type="hidden" name="type" value="${type}">
  <input type="hidden" name="target" value="${target}">
  <input type="hidden" name="back" value="${ctx.path}">
  <p class="demand-count" data-demand-count>${count ? h`<strong>${num(count)}</strong> ${count === 1 ? `person ${DEMAND_DONE[type][0]}` : `people ${DEMAND_DONE[type][1]}`}` : ask}</p>
  <div class="inline-field">
    <label class="sr" for="d-${type}">Email (optional)</label>
    <input id="d-${type}" type="email" name="email" placeholder="Email me when it happens (optional)" autocomplete="email">
    <button class="btn btn-small" type="submit">${label}</button>
  </div>
  <label class="check demand-consent"><input type="checkbox" name="consent"> If I leave my email, TAM can contact me about this.</label>
</form>`;

// Legacy (old tam.tv) content blocks, with list items grouped.
function blocksHtml(blocks, { skipFirstHeading = true } = {}) {
  const out = [];
  let list = null;
  blocks.forEach((b, i) => {
    if (b.type === 'li') { (list ||= []).push(b.text); return; }
    if (list) { out.push(h`<ul>${list.map((t) => h`<li>${t}</li>`)}</ul>`); list = null; }
    if (b.type === 'h1' && skipFirstHeading && i === 0) return;
    if (/^h[1-4]$/.test(b.type)) out.push(h`<h${raw(b.type === 'h1' ? '2' : String(Math.min(4, Number(b.type[1]) + 1)))}>${b.text}</h${raw(b.type === 'h1' ? '2' : String(Math.min(4, Number(b.type[1]) + 1)))}>`);
    else out.push(h`<p>${b.text}</p>`);
  });
  if (list) out.push(h`<ul>${list.map((t) => h`<li>${t}</li>`)}</ul>`);
  return out;
}

const legacyImages = (images, alt) => (images.length ? h`<div class="gallery">${images.slice(0, 24).map((src) => h`<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`)}</div>` : '');

const embed = (id, title) => h`<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;

// ---------------------------------------------------------------- home

export function home(ctx) {
  const { c, q } = ctx;
  const upcoming = q.upcoming();
  const next = upcoming[0];
  const s = q.stats();
  const t = londonTime(ctx.now);
  const part = daypart(t.hour);
  const mmdd = fmtDate(ctx.now.toISOString(), { month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
  const onThisDay = q.past().filter((e) => e.date.slice(5) === mmdd).slice(0, 6);
  const legends = c.artists.filter((a) => a.legend && (a.appearances || a.legacyPath)).sort((a, b) => b.appearances - a.appearances);
  const regulars = c.artists.filter((a) => !a.legend).slice(0, 8);

  const body = h`
<section class="hero">
  <div class="hero-mark"><div class="logo-frame"><div class="halo" aria-hidden="true"></div><div class="logo-backing" aria-hidden="true"></div>${raw(logo('full', { width: 520, eager: true }))}</div></div>
  <div class="hero-copy">
    <p class="eyebrow">Temple of Art and Music · London</p>
    <h1>Live music.<br>Emerging artists.<br>Cult legends.</h1>
    <p class="lede">${num(s.nights)} nights. ${num(s.artists)} artists. ${s.venues} London venues. Since ${s.since}. Every one of them is here, and the next one is coming up.</p>
    <p class="clock" data-clock><span data-clock-time>${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}</span> London · <span data-clock-line>${DAYPART_LINE[part]}</span></p>
    ${next ? h`<div class="next-up">
      <p class="eyebrow">Next at TAM</p>
      <p class="next-title"><a href="${paths.event(next.slug)}">${next.title}</a></p>
      <p class="countdown" data-countdown="${next.start}">${longDay(next)} · ${fmtTime(next.start)}</p>
    </div>` : ''}
    <p class="cta-row"><a class="btn" href="/whats-on">What’s on</a> <a class="btn btn-ghost" href="/archive">Explore the archive</a></p>
  </div>
</section>

${statRow([[num(s.nights), 'nights of live music'], [num(s.artists), 'named artists'], [s.venues, 'London venues'], [c.series.length, 'regular nights']])}

${upcoming.length ? section('Coming up', h`<div class="grid grid-3">${upcoming.slice(0, 6).map((e) => eventCard(ctx, e))}</div>`, { href: '/whats-on' }) : ''}

${onThisDay.length ? section(`On this day at TAM · ${fmtDate(ctx.now.toISOString(), { day: 'numeric', month: 'long' })}`, eventList(ctx, onThisDay), { href: '/archive', more: 'The whole archive →' }) : ''}

${legends.length ? section('Cult legends who played TAM', h`<div class="grid grid-4">${legends.slice(0, 8).map(artistCard)}</div>`, { href: '/artists#legends' }) : ''}
${section('The TAM regulars', h`<div class="grid grid-4">${regulars.map(artistCard)}</div>`, { href: '/artists', more: `All ${num(c.artists.length)} artists →` })}
${c.videos.length ? section('TAM TV', h`<div class="grid grid-3">${c.videos.slice(0, 3).map(videoCard)}</div>`, { href: '/tv' }) : ''}

<section class="section split">
  <div>${raw(archiveRings(q.archiveByYear()))}</div>
  <div>
    <h2>Six years, six rings</h2>
    <p>Each ring around the TAM mark is a year of nights; its length is how many happened. Every one has a page: who played, where, and who else shared the bill.</p>
    ${chipLinks(q.years().map((y) => [paths.year(y), y, q.eventsInYear(y).length]))}
  </div>
</section>

<section class="section play-tam">
  <div>
    <h2>Play TAM</h2>
    <p>Whether it’s your first gig or your thirtieth year on the road, TAM doesn’t just put artists on stage. It helps build their audience: a live room, a filmed set, a permanent page on TAM.TV and the TAM community.</p>
  </div>
  <a class="btn" href="/submit">Propose a night</a>
</section>`;
  return layout(ctx, { path: '/', body, ld: [itemList(c.site, 'Coming up at TAM', upcoming.map((e) => paths.event(e.slug)))] });
}

// ---------------------------------------------------------------- what's on

export function whatsOn(ctx) {
  const { q } = ctx;
  const upcoming = q.upcoming();
  const legacy = q.legacy('/whats-on');
  const byDay = new Map();
  for (const e of upcoming) {
    const k = longDay(e);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const body = h`
<header class="page-head">
  <p class="eyebrow">What’s on</p>
  <h1>Live music, seven days a week.</h1>
  <p class="lede">Every upcoming night at TAM, across London. Tickets are on Eventbrite.</p>
</header>
${upcoming.length ? [...byDay].map(([d, list]) => section(d, h`<div class="grid grid-3">${list.map((e) => eventCard(ctx, e))}</div>`)) : h`<p>New dates are on the way. <a href="#footer-signup">Join the list</a> to hear first.</p>`}
${section('Regular nights', chipLinks(ctx.c.series.map((s) => [paths.series(s.slug), s.name, s.count])), { href: '/series' })}
${legacy?.blocks.length ? section('From the TAM noticeboard', h`<div class="prose narrow-left">${blocksHtml(legacy.blocks)}</div>`) : ''}`;
  return layout(ctx, {
    title: 'What’s on', description: 'Upcoming live music at the Temple of Art and Music (TAM) in London: blues jams, jazz, soul, open mics, karaoke and gigs, seven days a week.', path: '/whats-on', body,
    ld: [itemList(ctx.c.site, 'What’s on at TAM', upcoming.map((e) => paths.event(e.slug))), ...upcoming.slice(0, 30).map((e) => eventLD(ctx.c.site, e, q))],
  });
}

// ---------------------------------------------------------------- events

export function eventPage(ctx, e, { counts }) {
  const { q } = ctx;
  const past = q.isPast(e);
  const venue = q.venue(e.venue);
  const series = e.series && q.series(e.series);
  const lineup = e.performers.map(q.artist).filter(Boolean);
  const sameSeries = series ? q.eventsInSeries(series.slug).filter((x) => x.slug !== e.slug) : [];
  const nearby = sameSeries.filter((x) => Math.abs(Date.parse(x.start) - Date.parse(e.start)) < 120 * 864e5).slice(0, 6);
  const alsoBy = lineup.flatMap((a) => q.eventsFor(a.slug)).filter((x, i, arr) => x.slug !== e.slug && arr.indexOf(x) === i).slice(-8).reverse();
  const there = counts.get(`was-there:${e.slug}`) || 0;
  const body = h`
<article class="detail">
  <div class="detail-art${e.image ? ' detail-photo' : ''}">${eventArt(ctx, e, 360)}</div>
  <div class="detail-copy">
    <p class="eyebrow">${series ? h`<a href="${paths.series(series.slug)}">${series.name}</a>` : 'TAM'}${past ? ' · From the archive' : ''}</p>
    <h1>${e.title}</h1>
    <p class="meta big"><time datetime="${e.start}">${longDay(e)}</time> · ${fmtTime(e.start)}</p>
    <p class="meta">${venue ? h`<a href="${paths.venue(venue.slug)}">${venue.name}</a>, ${venue.address}` : e.venueName}${e.free ? ' · Free entry' : ''}</p>
    ${past ? '' : h`<p class="countdown" data-countdown="${e.start}"></p>`}
    <p class="cta-row">
      ${past ? h`<a class="btn btn-ghost" href="${e.url}" rel="noopener">The original listing</a>` : h`<a class="btn" href="${e.url}" rel="noopener">Tickets on Eventbrite</a> <a class="btn btn-ghost" href="${paths.event(e.slug)}.ics">Add to calendar</a>`}
    </p>
    ${lineup.length ? h`<h2>On the bill</h2><ul class="plain lineup">${lineup.map((a) => h`<li><a href="${paths.artist(a.slug)}">${a.name}</a> ${legendBadge(a)} <span class="meta">${plural(a.appearances, 'night')} at TAM</span></li>`)}</ul>` : ''}
    ${e.genres.length ? chipLinks(e.genres.filter((g) => GENRE_NAMES[g]).map((g) => [paths.genre(g), GENRE_NAMES[g]])) : ''}
    ${past ? demandForm(ctx, { type: 'was-there', target: e.slug, count: there, label: 'I was there', ask: 'Were you there? Add yourself to the night.' }) : ''}
  </div>
</article>
${nearby.length ? section(`More ${series.name}`, eventList(ctx, nearby), { href: paths.series(series.slug) }) : ''}
${alsoBy.length ? section(lineup.length === 1 ? `More from ${lineup[0].name}` : 'More from these artists', eventList(ctx, alsoBy)) : ''}`;
  return layout(ctx, {
    title: `${e.title} · ${shortDay(e)}`,
    description: `${e.title} at ${venue?.name || 'TAM'}, London on ${longDay(e)}.${lineup.length ? ` With ${lineup.map((a) => a.name).join(', ')}.` : ''}`,
    path: paths.event(e.slug), body, ld: [eventLD(ctx.c.site, e, q)], image: e.image || undefined,
  });
}

// ---------------------------------------------------------------- artists

export function artists(ctx) {
  const { c } = ctx;
  const legends = c.artists.filter((a) => a.legend);
  const top = c.artists.filter((a) => !a.legend && a.appearances).slice(0, 12);
  const az = [...c.artists].sort((a, b) => a.name.replace(/^The /i, '').localeCompare(b.name.replace(/^The /i, ''), 'en'));
  const letters = [...new Set(az.map((a) => a.name.replace(/^The /i, '')[0].toUpperCase()))];
  const body = h`
<header class="page-head">
  <p class="eyebrow">Artists</p>
  <h1>Everyone who has played TAM.</h1>
  <p class="lede">${num(c.artists.length)} artists, from first gigs to cult legends. Every one has a permanent page, their nights at TAM, who they’ve shared a bill with, and their own coloured vinyl.</p>
</header>
${legends.length ? section('Cult legends', h`<div class="grid grid-4">${legends.map(artistCard)}</div>`, { id: 'legends' }) : ''}
${section('Most-played', h`<div class="grid grid-4">${top.map(artistCard)}</div>`)}
${section('A–Z', h`<p class="az-index">${letters.map((l) => h`<a href="#az-${l}">${l}</a>`)}</p>
<div class="az">${letters.map((l) => h`<div class="az-group" id="az-${l}"><h3>${l}</h3><ul class="plain">${az.filter((a) => a.name.replace(/^The /i, '')[0].toUpperCase() === l).map((a) => h`<li><a href="${paths.artist(a.slug)}">${a.name}</a> <span class="meta">${a.appearances || ''}</span></li>`)}</ul></div>`)}</div>`, { id: 'a-z' })}`;
  return layout(ctx, {
    title: 'Artists', description: `All ${c.artists.length} artists who have played the Temple of Art and Music in London, from emerging artists to cult legends like Dana Gillespie.`, path: '/artists', body,
    ld: [itemList(c.site, 'Artists who have played TAM', c.artists.map((a) => paths.artist(a.slug)))],
  });
}

export function artistPage(ctx, a, { counts }) {
  const { q, c } = ctx;
  const nights = q.eventsFor(a.slug);
  const upcoming = nights.filter((e) => !q.isPast(e));
  const past = nights.filter((e) => q.isPast(e)).reverse();
  const videos = q.videosFor(a.slug);
  const stories = q.storiesFor({ artist: a.slug });
  const withThem = q.playedWith(a.slug).filter((x) => x.artist);
  const subpages = a.legacyPath ? c.legacy.filter((p) => p.path.startsWith(`${a.legacyPath}/`)) : [];
  const venues = a.venues?.map(q.venue).filter(Boolean) || [];
  const byYear = new Map();
  for (const e of past) {
    const y = e.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(e);
  }
  const want = counts.get(`bring-back:${a.slug}`) || 0;
  const summary = a.appearances
    ? `${a.name} has played ${plural(a.appearances, 'night')} at the Temple of Art and Music${a.first ? `, from ${fmtDate(a.first, { month: 'long', year: 'numeric' })}` : ''}${a.last && a.last !== a.first ? ` to ${fmtDate(a.last, { month: 'long', year: 'numeric' })}` : ''}.`
    : `${a.name} is part of the TAM story.`;
  const body = h`
<article class="detail">
  <div class="detail-art">${raw(artwork(a.name, { size: 360, legend: a.legend }))}${pressedOn(a.name, a.legend)}<p class="meta center"><a href="/art/${a.slug}.svg" download>Download the record (SVG)</a></p></div>
  <div class="detail-copy">
    <p class="eyebrow">${a.genres.map((g) => GENRE_NAMES[g] || g).join(' · ') || 'Artist'} ${legendBadge(a)}</p>
    <h1>${a.name}</h1>
    ${a.note ? h`<p class="meta">${a.note}</p>` : ''}
    <p class="lede">${summary}</p>
    ${a.appearances ? statRow([[num(a.appearances), 'nights at TAM'], [venues.length, venues.length === 1 ? 'venue' : 'venues'], [a.first?.slice(0, 4) || '—', 'first played']]) : ''}
    ${a.bio.length ? h`<div class="prose bio">${a.bio.slice(0, 2).map((p) => h`<p>${p}</p>`)}${a.bio.length > 2 ? h`<details><summary>More from the TAM archive</summary>${a.bio.slice(2, 40).map((p) => h`<p>${p}</p>`)}</details>` : ''}</div>` : ''}
    ${upcoming.length ? h`<h2>Next at TAM</h2>${eventList(ctx, upcoming)}` : ''}
    ${demandForm(ctx, { type: 'bring-back', target: a.slug, count: want, label: 'Bring them back', ask: upcoming.length ? `Want more ${a.name} at TAM? Say so, and we’ll tell you when there’s a new date.` : `Want ${a.name} back at TAM? Say so, and we’ll tell you when it happens.` })}
  </div>
</article>
${a.images.length ? section('From the TAM archive', legacyImages(a.images, a.name)) : ''}
${videos.length ? section('On TAM TV', h`<div class="grid grid-3">${videos.map(videoCard)}</div>`) : ''}
${past.length ? section(`${plural(past.length, 'night')} at TAM`, [...byYear].map(([y, list]) => h`<h3 class="year-head"><a href="${paths.year(y)}">${y}</a></h3>${eventList(ctx, list, { showYear: false })}`)) : ''}
${withThem.length ? section('Shared the bill with', h`<div class="grid grid-4">${withThem.map((x) => artistCard(x.artist))}</div>`) : ''}
${subpages.length ? section('More about ' + a.name, h`<ul class="plain link-list">${subpages.map((p) => h`<li><a href="${p.path}">${p.title}</a></li>`)}</ul>`) : ''}
${stories.length ? section('Stories', h`<div class="grid grid-3">${stories.map(storyCard)}</div>`) : ''}
${venues.length ? section('Where they played', chipLinks(venues.map((v) => [paths.venue(v.slug), v.name, q.eventsFor(a.slug).filter((e) => e.venue === v.slug).length]))) : ''}`;
  return layout(ctx, {
    title: `${a.name}${a.appearances ? ' at TAM' : ''}`,
    description: `${summary} ${a.note || ''} Every night, who they played with, and what’s next.`.trim(),
    path: paths.artist(a.slug), body, ld: [artistLD(c.site, a, q)], ogType: 'profile',
  });
}

// ---------------------------------------------------------------- archive

export function archive(ctx) {
  const { q, c } = ctx;
  const s = q.stats();
  const years = q.years();
  const body = h`
<header class="page-head">
  <p class="eyebrow">The archive</p>
  <h1>Every night at TAM, since ${s.since}.</h1>
  <p class="lede">${num(s.nights)} nights across ${s.venues} London venues. Who played, where, and who else was on the bill. Were you there? Add yourself to the night.</p>
</header>
<section class="section split">
  <div>${raw(archiveRings(q.archiveByYear()))}</div>
  <div>${years.map((y) => h`<p class="year-line"><a href="${paths.year(y)}"><strong>${y}</strong></a> <span class="meta">${plural(q.eventsInYear(y).length, 'night')} · ${new Set(q.eventsInYear(y).flatMap((e) => e.performers)).size} artists</span></p>`)}</div>
</section>
${section('Regular nights', chipLinks(c.series.map((x) => [paths.series(x.slug), x.name, x.count])), { href: '/series' })}
${section('Genres', chipLinks(q.genres().map((g) => [paths.genre(g), GENRE_NAMES[g], q.eventsInGenre(g).length])), { href: '/genres' })}
${section('Venues', chipLinks(c.venues.map((v) => [paths.venue(v.slug), v.name, q.eventsAtVenue(v.slug).length])), { href: '/locations' })}`;
  return layout(ctx, { title: 'The archive', description: `Every live music night at the Temple of Art and Music (TAM), London, since ${s.since}: ${num(s.nights)} nights, ${num(s.artists)} artists.`, path: '/archive', body });
}

export function archiveYear(ctx, year) {
  const { q } = ctx;
  const list = q.eventsInYear(year);
  const months = new Map();
  for (const e of list) {
    const m = Number(e.date.slice(5, 7));
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(e);
  }
  const years = q.years();
  const i = years.indexOf(String(year));
  const counts = new Map();
  for (const e of list) for (const p of e.performers) counts.set(p, (counts.get(p) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => q.artist(s)).filter(Boolean);
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/archive">The archive</a></p>
  <h1>TAM in ${year}</h1>
  <p class="lede">${plural(list.length, 'night')} of live music, ${counts.size} named artists.</p>
  <p class="cta-row">${years[i - 1] ? h`<a class="btn btn-ghost btn-small" href="${paths.year(years[i - 1])}">← ${years[i - 1]}</a>` : ''} ${years[i + 1] ? h`<a class="btn btn-ghost btn-small" href="${paths.year(years[i + 1])}">${years[i + 1]} →</a>` : ''}</p>
</header>
${top.length ? section(`The artists of ${year}`, h`<div class="grid grid-4">${top.map(artistCard)}</div>`) : ''}
${[...months].map(([m, l]) => section(`${monthName(m)} ${year}`, eventList(ctx, l, { showYear: false })))}`;
  return layout(ctx, { title: `TAM in ${year}`, description: `All ${list.length} live music nights at the Temple of Art and Music in London in ${year}, month by month, with every artist on the bill.`, path: paths.year(year), body });
}

export function seriesIndex(ctx) {
  const body = h`
<header class="page-head">
  <p class="eyebrow">Regular nights</p>
  <h1>The nights that keep coming back.</h1>
</header>
<div class="grid grid-3">${ctx.c.series.map((s) => h`<article class="card"><div class="card-body">
  <p class="eyebrow">${s.first.slice(0, 4)}–${s.last.slice(0, 4)}</p>
  <h3><a href="${paths.series(s.slug)}">${s.name}</a></h3>
  <p class="meta">${plural(s.count, 'night')}</p>
</div></article>`)}</div>`;
  return layout(ctx, { title: 'Regular nights', description: 'The regular nights at TAM London: the Great British Blues Jam, Singers @ Sunday Spot, Word of Mouth Fusion Jazz, open mics, karaoke and more.', path: '/series', body });
}

export function seriesPage(ctx, s) {
  const { q } = ctx;
  const list = q.eventsInSeries(s.slug);
  const upcoming = list.filter((e) => !q.isPast(e));
  const past = list.filter((e) => q.isPast(e)).reverse();
  const counts = new Map();
  for (const e of list) for (const p of e.performers) counts.set(p, (counts.get(p) || 0) + 1);
  const regulars = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([x]) => q.artist(x)).filter(Boolean);
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/series">Regular nights</a></p>
  <h1>${s.name}</h1>
  <p class="lede">${plural(s.count, 'night')} at TAM since ${fmtDate(s.first, { month: 'long', year: 'numeric' })}.</p>
</header>
${upcoming.length ? section('Next up', h`<div class="grid grid-3">${upcoming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${regulars.length ? section('Regulars', h`<div class="grid grid-4">${regulars.map(artistCard)}</div>`) : ''}
${section('Every night', eventList(ctx, past))}`;
  return layout(ctx, { title: `${s.name} at TAM`, description: `${s.name} at the Temple of Art and Music, London: ${s.count} nights since ${s.first.slice(0, 4)}, with every date and artist.`, path: paths.series(s.slug), body, ld: [seriesLD(ctx.c.site, s)] });
}

export function genresIndex(ctx) {
  const { q } = ctx;
  const body = h`
<header class="page-head"><p class="eyebrow">Genres</p><h1>What TAM sounds like.</h1></header>
<div class="grid grid-3">${q.genres().map((g) => h`<article class="card"><div class="card-body">
  <h3><a href="${paths.genre(g)}">${GENRE_NAMES[g]}</a></h3>
  <p class="meta">${plural(q.eventsInGenre(g).length, 'night')} · ${plural(q.artistsInGenre(g).length, 'artist')}</p>
</div></article>`)}</div>`;
  return layout(ctx, { title: 'Genres', path: '/genres', body });
}

export function genrePage(ctx, g) {
  const { q } = ctx;
  const nights = q.eventsInGenre(g);
  const upcoming = nights.filter((e) => !q.isPast(e));
  const artistsHere = q.artistsInGenre(g).slice(0, 24);
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/genres">Genres</a></p>
  <h1>${GENRE_NAMES[g]} at TAM</h1>
  <p class="lede">${plural(nights.length, 'night')} of ${GENRE_NAMES[g].toLowerCase()} in London since ${nights[0]?.date.slice(0, 4)}.</p>
</header>
${upcoming.length ? section('Coming up', h`<div class="grid grid-3">${upcoming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${artistsHere.length ? section('Artists', h`<div class="grid grid-4">${artistsHere.map(artistCard)}</div>`) : ''}
${section('Recent nights', eventList(ctx, nights.filter((e) => q.isPast(e)).reverse().slice(0, 60)))}`;
  return layout(ctx, { title: `${GENRE_NAMES[g]} in London at TAM`, description: `Live ${GENRE_NAMES[g].toLowerCase()} in London at the Temple of Art and Music: upcoming nights, ${nights.length} past nights and the artists who play them.`, path: paths.genre(g), body });
}

// ---------------------------------------------------------------- locations

export function locations(ctx) {
  const { q, c } = ctx;
  const legacy = q.legacy('/locations');
  const body = h`
<header class="page-head">
  <p class="eyebrow">Locations</p>
  <h1>Where TAM happens.</h1>
  <p class="lede">TAM began as a place. Since 2020 it has played ${c.venues.length} rooms across London, and taken its artists further, from Vienna to Austin.</p>
</header>
<div class="grid grid-3">${c.venues.map((v) => {
    const n = q.eventsAtVenue(v.slug).length;
    return h`<article class="card"><div class="card-body">
  <p class="eyebrow">${v.place}</p>
  <h3><a href="${paths.venue(v.slug)}">${v.name}</a></h3>
  <p class="meta">${v.address}</p>
  <p class="meta">${plural(n, 'night')}</p>
</div></article>`;
  })}</div>
${legacy?.blocks.length ? section('From the TAM archive', h`<div class="prose narrow-left">${blocksHtml(legacy.blocks)}</div>`) : ''}
${section('Further afield', h`<ul class="plain link-list">${c.legacy.filter((p) => p.path.startsWith('/locations/austria')).map((p) => h`<li><a href="${p.path}">${p.title}</a></li>`)}</ul>`)}`;
  return layout(ctx, { title: 'Locations', description: 'TAM venues in London: Elephant & Castle, Canary Wharf, Smithfield, Dalston and Mayfair.', path: '/locations', body, ld: c.venues.map((v) => venueLD(c.site, v)) });
}

export function venuePage(ctx, v) {
  const { q, c } = ctx;
  const legacy = v.legacy ? q.legacy(v.legacy) : null;
  const nights = q.eventsAtVenue(v.slug);
  const upcoming = nights.filter((e) => !q.isPast(e));
  const counts = new Map();
  for (const e of nights) for (const p of e.performers) counts.set(p, (counts.get(p) || 0) + 1);
  const regulars = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([x]) => q.artist(x)).filter(Boolean);
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/locations">Locations</a> · ${v.place}</p>
  <h1>${v.name}</h1>
  <p class="lede">${v.address}. ${plural(nights.length, 'night')} of live music since ${nights[0]?.date.slice(0, 4) || '—'}.</p>
</header>
${legacy ? h`<section class="section split">
  <div class="prose">${blocksHtml(legacy.blocks)}</div>
  <div>${legacyImages(legacy.images, v.name)}</div>
</section>` : ''}
${upcoming.length ? section('Coming up here', h`<div class="grid grid-3">${upcoming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${regulars.length ? section(`Regulars at ${v.name}`, h`<div class="grid grid-4">${regulars.map(artistCard)}</div>`) : ''}
${section('Recent nights', eventList(ctx, nights.filter((e) => q.isPast(e)).reverse().slice(0, 40)))}`;
  return layout(ctx, { title: `${v.name}, London`, description: `Live music at ${v.name} (${v.place}), ${v.address}. What’s on, the regulars and ${nights.length} nights of history.`, path: paths.venue(v.slug), body, ld: [venueLD(c.site, v)] });
}

// ---------------------------------------------------------------- TV

export function tv(ctx) {
  const { c, q } = ctx;
  const legacy = q.legacy('/tv');
  const shows = c.videos.filter((v) => v.show);
  const others = c.videos.filter((v) => !v.show);
  const body = h`
<header class="page-head">
  <p class="eyebrow">TAM TV</p>
  <h1>Watch the best of live music at TAM.</h1>
  <p class="lede">Performances, birthdays, SXSW, Eurovision parties and Dana Gillespie’s chat show. <a href="${c.site.socials.youtube}" rel="noopener">Subscribe on YouTube</a>.</p>
</header>
${others.length ? section('Performances', h`<div class="grid grid-3">${others.map(videoCard)}</div>`) : ''}
${shows.length ? section('Globetrotting With Gillespie', h`<div class="grid grid-3">${shows.map(videoCard)}</div>`) : ''}
${legacy?.blocks.length ? section('About TAM TV', h`<div class="prose narrow-left">${blocksHtml(legacy.blocks)}</div>`) : ''}`;
  return layout(ctx, { title: 'TAM TV', description: 'TAM TV: live performances from the Temple of Art and Music in London, and Globetrotting With Gillespie, Dana Gillespie’s show with guests like Nick Mason, Sir Tim Rice and Marc Almond.', path: '/tv', body, ld: c.videos.map((v) => videoLD(c.site, v, q)) });
}

export function videoPage(ctx, v) {
  const { q, c } = ctx;
  const people = v.artists.map(q.artist).filter(Boolean);
  const more = c.videos.filter((x) => x.slug !== v.slug && (x.show === v.show || x.artists.some((a) => v.artists.includes(a)))).slice(0, 6);
  const body = h`
<article class="video-detail">
  ${embed(v.youtubeId, v.title)}
  <div class="detail-copy narrow">
    <p class="eyebrow">${v.show ? 'Globetrotting With Gillespie' : 'TAM TV'}</p>
    <h1>${v.title}</h1>
    <p class="cta-row">${people.map((a) => h`<a class="btn btn-ghost btn-small" href="${paths.artist(a.slug)}">${a.name}</a>`)} <a class="btn btn-ghost btn-small" href="https://www.youtube.com/watch?v=${v.youtubeId}" rel="noopener">Watch on YouTube</a></p>
  </div>
</article>
${more.length ? section('More to watch', h`<div class="grid grid-3">${more.map(videoCard)}</div>`, { href: '/tv' }) : ''}`;
  return layout(ctx, { title: v.title, description: `${v.title}, on TAM TV from the Temple of Art and Music, London.`, path: paths.video(v.slug), body, ld: [videoLD(c.site, v, q)], ogType: 'video.other', image: `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` });
}

// ---------------------------------------------------------------- legacy pages

export function legacyPage(ctx, p) {
  const { c, q } = ctx;
  const children = c.legacy.filter((x) => x.path.startsWith(`${p.path}/`) && !x.path.slice(p.path.length + 1).includes('/'));
  const parentPath = p.path.split('/').slice(0, -1).join('/');
  const parent = parentPath ? (q.legacy(parentPath) || (parentPath.startsWith('/artists/') ? { path: parentPath, title: q.artist(parentPath.split('/')[2])?.name } : null)) : null;
  const tamVideos = new Set(c.videos.map((v) => v.youtubeId));
  const body = h`
<article class="legacy">
  <header class="page-head narrow">
    ${parent?.title ? h`<p class="eyebrow"><a href="${parent.path}">${parent.title}</a></p>` : h`<p class="eyebrow">From the TAM archive</p>`}
    <h1>${p.title}</h1>
    ${p.description ? h`<p class="lede">${p.description}</p>` : ''}
  </header>
  <div class="prose narrow">${blocksHtml(p.blocks.filter((b) => b.text !== p.description))}</div>
  ${p.youtube.length ? h`<div class="narrow videos">${p.youtube.map((id) => {
    const v = c.videos.find((x) => x.youtubeId === id);
    return tamVideos.has(id) ? h`<p><a href="${paths.video(v.slug)}">▶ ${v.title}</a></p>${embed(id, v.title)}` : embed(id, p.title);
  })}</div>` : ''}
  ${p.images.length ? h`<div class="narrow">${legacyImages(p.images, p.title)}</div>` : ''}
  ${children.length ? h`<div class="narrow"><h2>More</h2><ul class="plain link-list">${children.map((x) => h`<li><a href="${x.path}">${x.title}</a></li>`)}</ul></div>` : ''}
  ${p.external.length ? h`<div class="narrow"><h2>Links</h2><ul class="plain link-list">${p.external.slice(0, 20).map((u) => h`<li><a href="${u}" rel="noopener nofollow">${u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}</a></li>`)}</ul></div>` : ''}
</article>`;
  return layout(ctx, { title: p.title, description: p.description || p.blocks.find((b) => b.type === 'p')?.text.slice(0, 155), path: p.path, body });
}

// ---------------------------------------------------------------- the rest

export function listen(ctx) {
  const body = h`
<header class="page-head">
  <p class="eyebrow">Listen</p>
  <h1>Sessions, playlists and TAM Radio.</h1>
</header>
<div class="grid grid-3">${ctx.c.listen.map((l) => h`<article class="card"><div class="card-body">
  <p class="eyebrow">${l.kind}</p><h3>${l.url ? h`<a href="${l.url}" rel="noopener">${l.title}</a>` : l.title}</h3><p>${l.summary}</p>
</div></article>`)}</div>`;
  return layout(ctx, { title: 'Listen', path: '/listen', body });
}

export function stories(ctx) {
  const body = h`
<header class="page-head">
  <p class="eyebrow">Stories</p>
  <h1>Real. Immediate. Human.</h1>
  <p class="lede">The people, music and projects around TAM, documented while it’s happening.</p>
</header>
<div class="grid grid-3">${ctx.c.stories.map(storyCard)}</div>`;
  return layout(ctx, { title: 'Stories', path: '/stories', body });
}

export function storyPage(ctx, s) {
  const { q } = ctx;
  const people = (s.related?.artists || []).map(q.artist).filter(Boolean);
  const body = h`
<article class="story">
  <header class="page-head narrow">
    <p class="eyebrow">${s.pillar} · <time datetime="${s.published}">${fmtDate(s.published, { day: 'numeric', month: 'long', year: 'numeric' })}</time></p>
    <h1>${s.title}</h1>
    <p class="lede">${s.dek}</p>
  </header>
  <div class="prose narrow">${s.body.map((p) => h`<p>${p}</p>`)}</div>
</article>
${people.length ? section('In this story', h`<div class="grid grid-4">${people.map(artistCard)}</div>`) : ''}`;
  return layout(ctx, { title: s.title, description: s.dek, path: paths.story(s.slug), body, ld: [storyLD(ctx.c.site, s)], ogType: 'article' });
}

export function about(ctx) {
  const { q } = ctx;
  const legacy = q.legacy('/about');
  const s = q.stats();
  const body = h`
<header class="page-head">
  <p class="eyebrow">About TAM</p>
  <h1>TAM isn’t leaving the venue. It’s leaving the limitations of the venue behind.</h1>
  <p class="lede">Since ${s.since}, the Temple of Art and Music has put on ${num(s.nights)} nights of live music in ${s.venues} London rooms, with ${num(s.artists)} named artists, from first gigs to cult legends. TAM.TV keeps every one of them, and makes TAM location-independent while keeping the live night at its heart.</p>
</header>
${legacy?.blocks.length ? h`<section class="section split">
  <div class="prose">${blocksHtml(legacy.blocks)}</div>
  <div>${legacyImages(legacy.images, 'TAM')}</div>
</section>` : ''}
<section class="section split">
  <div class="logo-demo"><div class="logo-frame"><div class="halo" aria-hidden="true"></div><div class="logo-backing" aria-hidden="true"></div>${raw(logo('full', { width: 380 }))}</div></div>
  <div>
    <h2>The Temple of Art and Music</h2>
    <p>The TAM mark is four letters sharing one circle: T, A and two Ms. It appears on TAM.TV exactly as drawn, and never altered.</p>
    <ul>
      <li><strong>The light around it keeps London time.</strong> The halo behind the logo and the gold of the site move from rose-gold dawn to bright day, amber dusk and a slow-breathing night.</li>
      <li><strong>The TAM 108 fall behind every page.</strong> 108 songs drop down the background: their titles, and for songs in the public domain their choruses.</li>
      <li><strong>Every artist, night and film gets its own coloured vinyl</strong>, pressed from its name in one of 24 rare colourways. Cult legends get a gold-foil Legend Edition.</li>
    </ul>
  </div>
</section>
${section('More from the TAM archive', h`<ul class="plain link-list">${ctx.c.legacy.filter((p) => /^\/(about\/|private-parties|singers|made-in-london|karaoke|festivals|tom|nft|eao|the-best-christmas-ever|dana-and-the-tam)/.test(p.path)).map((p) => h`<li><a href="${p.path}">${p.title}</a></li>`)}</ul>`)}`;
  return layout(ctx, { title: 'About', description: `The Temple of Art and Music: ${num(s.nights)} nights of live music in London since ${s.since}, and the move from a venue to a live music and media network.`, path: '/about', body });
}

export function submit(ctx, { values = {}, errors = {}, done = false } = {}) {
  const err = (k) => (errors[k] ? h`<span class="error" id="err-${k}">${errors[k]}</span>` : '');
  const v = (k) => values[k] ?? '';
  const aria = (k) => raw(errors[k] ? ` aria-invalid="true" aria-describedby="err-${k}"` : '');
  const body = done
    ? h`<header class="page-head narrow"><p class="eyebrow">Play TAM</p><h1>Thank you. We’ve got it.</h1>
      <p class="lede">Every proposal is read by a person. If it’s a fit for TAM we’ll be in touch by email.</p>
      <p><a class="btn" href="/whats-on">See what’s on</a></p></header>`
    : h`
<header class="page-head narrow">
  <p class="eyebrow">Play TAM</p>
  <h1>Want to play TAM?</h1>
  <p class="lede">Tell us about you and the night you’d put on. Selected artists get a live audience, a permanent page on TAM.TV and the TAM community behind them.</p>
</header>
<form class="form narrow" method="post" action="/submit" novalidate>
  ${Object.keys(errors).length ? h`<p class="error-summary" role="alert">Please fix the highlighted fields.</p>` : ''}
  <div class="field"><label for="name">Your name</label><input id="name" name="name" value="${v('name')}" required autocomplete="name"${aria('name')}>${err('name')}</div>
  <div class="field"><label for="email">Email</label><input id="email" type="email" name="email" value="${v('email')}" required autocomplete="email"${aria('email')}>${err('email')}</div>
  <div class="field"><label for="act">Artist / act name</label><input id="act" name="act" value="${v('act')}" required${aria('act')}>${err('act')}</div>
  <div class="field-row">
    <div class="field"><label for="genre">Genre</label><input id="genre" name="genre" value="${v('genre')}"></div>
    <div class="field"><label for="location">Based in</label><input id="location" name="location" value="${v('location')}"></div>
  </div>
  <div class="field"><label for="strand">Which kind of night?</label>
    <select id="strand" name="strand"><option value="">Not sure yet / my own night</option>${ctx.c.series.map((s) => h`<option value="${s.slug}"${v('strand') === s.slug ? raw(' selected') : ''}>${s.name}</option>`)}</select></div>
  <fieldset class="field"><legend>Links to your music or video</legend>
    <input name="link1" type="url" placeholder="https://" value="${(values.links || [])[0] || v('link1')}"${aria('link1')}>
    <input name="link2" type="url" placeholder="https://" value="${(values.links || [])[1] || ''}">
    <input name="link3" type="url" placeholder="https://" value="${(values.links || [])[2] || ''}">
    ${err('link1')}
  </fieldset>
  <div class="field"><label for="proposal">The night you’d put on</label><textarea id="proposal" name="proposal" rows="6" required${aria('proposal')}>${v('proposal')}</textarea>${err('proposal')}</div>
  <label class="check"><input type="checkbox" name="newsletter"${values.newsletter ? raw(' checked') : ''}> Also add me to the TAM list.</label>
  <label class="check"><input type="checkbox" name="privacy" required${aria('privacy')}> I’ve read the <a href="/privacy">privacy notice</a>.</label>${err('privacy')}
  <div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
  <button class="btn" type="submit">Send proposal</button>
</form>`;
  return layout(ctx, { title: 'Play TAM', description: 'Propose a night at TAM.', path: '/submit', body });
}

export function signupResult(ctx, { ok, errors = {} }) {
  const body = ok
    ? h`<header class="page-head narrow"><p class="eyebrow">The TAM list</p><h1>You’re on the list.</h1><p class="lede">See you at the next one.</p><p><a class="btn" href="/whats-on">What’s on</a></p></header>`
    : h`<header class="page-head narrow"><p class="eyebrow">The TAM list</p><h1>Almost.</h1><p class="lede">${Object.values(errors).join(' ')}</p></header>${signupForm(ctx, { compact: false })}`;
  return layout(ctx, { title: 'Newsletter', path: '/signup', body, noindex: true });
}

export function demandResult(ctx, { ok, errors = {}, back }) {
  const body = h`<header class="page-head narrow"><p class="eyebrow">Thank you</p><h1>${ok ? 'Counted.' : 'Almost.'}</h1>
    <p class="lede">${ok ? 'Every one of these tells TAM who to book next.' : Object.values(errors).join(' ')}</p>
    <p><a class="btn" href="${back || '/'}">Back</a></p></header>`;
  return layout(ctx, { title: 'Thank you', path: '/demand', body, noindex: true });
}

export function privacy(ctx) {
  const body = h`
<header class="page-head narrow"><p class="eyebrow">Privacy &amp; cookies</p><h1>Plain-English privacy.</h1></header>
<div class="prose narrow">
  <p>TAM.TV is run by ${ctx.c.site.legalName}. We follow UK GDPR and PECR. This page will be replaced by a reviewed privacy notice before launch.</p>
  <h2>Cookies</h2>
  <p><strong>tam_consent</strong> remembers whether you allowed analytics (12 months). It is strictly necessary to respect your choice.</p>
  <p>If you allow analytics we record anonymous page views and which artists, nights and stories are viewed, against a random visitor ID stored in the <strong>tam_vid</strong> cookie. We do not use third-party advertising or tracking cookies. If you decline, nothing is recorded. You can change your mind with the button below.</p>
  <p><button class="btn btn-small" data-consent="denied">Withdraw analytics consent</button> <button class="btn btn-small btn-ghost" data-consent="granted">Allow analytics</button></p>
  <h2>“Bring them back” and “I was there”</h2>
  <p>When you press one of these we record the press, which artist or night it was for, and the time. Totals are shown publicly. If you also give your email and tick the box, we keep it to tell you about that artist or night; it is never shown or shared.</p>
  <h2>Newsletter and submissions</h2>
  <p>If you join the list or send a Play TAM proposal, we keep what you give us to reply to you and, if you ask, to send you TAM news. Email us to see, correct or delete your data.</p>
  <h2>Embedded content</h2>
  <p>Films are embedded with YouTube’s privacy-enhanced mode (youtube-nocookie.com). Event images come from Eventbrite, and archive photos from the old tam.tv.</p>
</div>`;
  return layout(ctx, { title: 'Privacy', path: '/privacy', body });
}

export function studio(ctx, { aiEnabled }) {
  const body = h`
<header class="page-head narrow">
  <p class="eyebrow">TAM Studio · Production Agent</p>
  <h1>Turn one night into a content package.</h1>
  <p class="lede">Pick an artist and a night, add your notes, and the Production Agent drafts the profile, captions for each platform, SEO metadata, clip ideas, interview questions and story angles. Always edit before publishing.</p>
  ${aiEnabled ? '' : h`<p class="error-summary">AI is off: set <code>ANTHROPIC_API_KEY</code> and <code>ADMIN_TOKEN</code> on the server to enable the Production Agent.</p>`}
</header>
<form class="form narrow" data-studio>
  <div class="field"><label for="token">Studio token</label><input id="token" name="token" type="password" autocomplete="current-password" required></div>
  <div class="field-row">
    <div class="field"><label for="artist">Artist</label><select id="artist" name="artist">${ctx.c.artists.map((a) => h`<option value="${a.slug}">${a.name}</option>`)}</select></div>
    <div class="field"><label for="event">Night</label><select id="event" name="event"><option value="">—</option>${ctx.q.upcoming().concat(ctx.q.past().slice(0, 60)).map((e) => h`<option value="${e.slug}">${e.title} · ${shortDay(e)}</option>`)}</select></div>
  </div>
  <div class="field"><label for="notes">Notes from the night</label><textarea id="notes" name="notes" rows="7" placeholder="Set list highlights, crowd moments, what they said on stage, standout songs…"></textarea></div>
  <button class="btn" type="submit"${aiEnabled ? '' : raw(' disabled')}>Generate package</button>
</form>
<section class="narrow studio-out" data-studio-out aria-live="polite"></section>`;
  return layout(ctx, { title: 'Studio', path: '/studio', body, noindex: true });
}

export function notFound(ctx) {
  const body = h`<header class="page-head narrow center">
  ${raw(artwork(ctx.path, { size: 220, label: false }))}
  <h1>Nothing playing here.</h1>
  <p class="lede">That page doesn’t exist. This record was pressed from the address you tried, so at least you got some art.</p>
  <p><a class="btn" href="/">Back to TAM.TV</a> <a class="btn btn-ghost" href="/archive">Search the archive</a></p>
</header>`;
  return layout(ctx, { title: 'Not found', path: ctx.path, body, noindex: true });
}


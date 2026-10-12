import { h, raw, fmtDate, fmtTime } from './lib/html.js';
import { logo, artwork, londonTime, daypart } from './lib/brand.js';
import { pressing } from './lib/vinyl.js';
import { GENRE_NAMES } from './lib/content.js';
import {
  organization, artistLD, eventLD, festivalLD, videoLD, storyLD, venueLD, seriesLD, itemList, jsonLdTag, paths,
} from './lib/seo.js';

const NAV = [
  ['/whats-on', 'What’s on'],
  ['/artists', 'Artists'],
  ['/tv', 'TV'],
  ['/academy', 'Academy'],
  ['/archive', 'Archive'],
  ['/about', 'About'],
];

const num = (n) => Number(n).toLocaleString('en-GB');
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
${path.startsWith('/box-office') || path.startsWith('/tickets') ? '' : raw('<canvas class="chorus-rain" data-chorus aria-hidden="true"></canvas>')}
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
      <p class="muted">${site.legalName} · ${site.locality}</p>
      <p class="footer-links">${ctx.q.currentVenues().map((v) => h`<a href="${paths.venue(v.slug)}">${v.name}</a>`)} <a href="/locations">Find us</a></p>
    </div>
    ${signupForm(ctx)}
    <div>
      <h2 class="eyebrow">Explore</h2>
      <ul class="plain">
        <li><a href="/whats-on">What’s on</a></li>
        <li><a href="/archive">The archive</a></li>
        <li><a href="/academy">The TAM Academy</a></li>
        <li><a href="/tech-nights">Tech nights</a></li>
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
  <p class="muted">Hear about new nights and artists first.</p>
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
    ${a.genres.length ? h`<p class="meta">${a.genres.map((g) => GENRE_NAMES[g] || g).join(' · ')}</p>` : ''}
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

const chipLinks = (items) => h`<p class="chips">${items.map(([href, label]) => h`<a class="chip chip-link" href="${href}">${label}</a>`)}</p>`;


// The "data" buttons. Work without JS (POST + redirect); tam.js upgrades them.
const DEMAND_DONE = {
  'bring-back': ['wants them back at TAM', 'want them back at TAM'],
  'was-there': ['was there', 'were there'],
  'want-community': ['wants this at TAM', 'want this at TAM'],
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

// The old site's venue text, minus what's out of date: opening hours (now in
// site.json), "7 days a week", the recurring-events list (What's on covers
// it) and the Mercato history.
function venueBlocks(blocks) {
  const out = [];
  let skipping = false;
  for (const b of blocks) {
    if (/^h[1-4]$/.test(b.type)) skipping = /opening times|recurring events/i.test(b.text);
    if (skipping) continue;
    if (/7 days a week|seven days a week|Mercato Metropolitano, which|Andrea/i.test(b.text)) continue;
    out.push(b);
  }
  return out;
}

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

// Festivals with shows coming up get a band on the home and What's on pages.
const festivalBands = (ctx) => ctx.c.festivals.filter((f) => ctx.q.eventsInFestival(f.slug).some((e) => !ctx.q.isPast(e))).map((f) => h`<section class="section play-tam festival-band">
  <div>
    <p class="eyebrow">${f.name}</p>
    <h2>${f.title}</h2>
    <p>${f.lede}</p>
  </div>
  <a class="btn" href="${f.path}">See the shows</a>
</section>`);

// ---------------------------------------------------------------- home

export function home(ctx) {
  const { c, q } = ctx;
  const upcoming = q.upcoming();
  const next = upcoming[0];
  const mmdd = fmtDate(ctx.now.toISOString(), { month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
  const onThisDay = q.past().filter((e) => e.date.slice(5) === mmdd).slice(0, 6);
  const legends = c.artists.filter((a) => a.legend && a.appearances).sort((a, b) => b.appearances - a.appearances);
  const regulars = c.artists.filter((a) => !a.legend).slice(0, 8);

  const body = h`
<section class="hero">
  <div class="hero-mark"><div class="logo-frame"><div class="halo" aria-hidden="true"></div><div class="logo-backing" aria-hidden="true"></div>${raw(logo('full', { width: 520, eager: true }))}</div></div>
  <div class="hero-copy">
    <p class="eyebrow">Temple of Art and Music · ${c.site.locality}</p>
    <h1>Live music.<br>Emerging artists.<br>Cult legends.</h1>
    <p class="lede">A home for artists at every stage, from first gigs to cult legends, and a place where they pass on what they know to the next generation.</p>
    ${next ? h`<div class="next-up">
      <p class="eyebrow">Next at TAM</p>
      <p class="next-title"><a href="${paths.event(next.slug)}">${next.title}</a></p>
      <p class="countdown" data-countdown="${next.start}">${longDay(next)} · ${fmtTime(next.start)}</p>
    </div>` : ''}
    <p class="cta-row"><a class="btn" href="/whats-on">What’s on</a> <a class="btn btn-ghost" href="/academy">The TAM Academy</a></p>
  </div>
</section>

${festivalBands(ctx)}
${upcoming.length ? section('Coming up', h`<div class="grid grid-3">${upcoming.slice(0, 6).map((e) => eventCard(ctx, e))}</div>`, { href: '/whats-on' }) : ''}

<section class="section play-tam academy-band">
  <div>
    <p class="eyebrow">The TAM Academy</p>
    <h2>Passing it on.</h2>
    <p>Dana Gillespie and the musicians around TAM sharing what they’ve learned with the next generation of artists.</p>
  </div>
  <a class="btn" href="/academy">Find out more</a>
</section>

${legends.length ? section('Cult legends who have played TAM', h`<div class="grid grid-4">${legends.slice(0, 8).map(artistCard)}</div>`, { href: '/artists#legends' }) : ''}
${section('Regulars', h`<div class="grid grid-4">${regulars.map(artistCard)}</div>`, { href: '/artists', more: 'All artists →' })}
${(ctx.tv || []).length ? section('Latest on TAM TV', h`<div class="grid grid-3">${ctx.tv.slice(0, 3).map(tvCard)}</div>`, { href: '/tv' }) : ''}
${onThisDay.length ? section(`On this day at TAM · ${fmtDate(ctx.now.toISOString(), { day: 'numeric', month: 'long' })}`, eventList(ctx, onThisDay), { href: '/archive', more: 'The archive →' }) : ''}

<section class="section play-tam">
  <div>
    <h2>Play TAM</h2>
    <p>Whether it’s your first gig or your thirtieth year on the road, tell us about the night you’d put on.</p>
  </div>
  <a class="btn" href="/submit">Propose a night</a>
</section>`;
  return layout(ctx, { path: '/', body, ld: [itemList(c.site, 'Coming up at TAM', upcoming.map((e) => paths.event(e.slug)))] });
}

// ---------------------------------------------------------------- what's on

export function whatsOn(ctx) {
  const { q } = ctx;
  const upcoming = q.upcoming();
  const byDay = new Map();
  for (const e of upcoming) {
    const k = longDay(e);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const current = q.currentSeries();
  const body = h`
<header class="page-head">
  <p class="eyebrow">What’s on</p>
  <h1>What’s on at TAM.</h1>
  <p class="lede">Live music, open mics and karaoke at TAM. Book here where tickets are on sale, or on Eventbrite.</p>
</header>
${festivalBands(ctx)}
${upcoming.length ? [...byDay].map(([d, list]) => section(d, h`<div class="grid grid-3">${list.map((e) => eventCard(ctx, e))}</div>`)) : h`<p>New dates are on the way. <a href="#footer-signup">Join the list</a> to hear first.</p>`}
${current.length ? section('Regular nights', chipLinks(current.map((s) => [paths.series(s.slug), s.name]))) : ''}`;
  return layout(ctx, {
    title: 'What’s on', description: 'What’s on at the Temple of Art and Music (TAM), Elephant & Castle, London: live music, blues jams, open mics and karaoke. Book tickets.', path: '/whats-on', body,
    ld: [itemList(ctx.c.site, 'What’s on at TAM', upcoming.map((e) => paths.event(e.slug))), ...upcoming.slice(0, 30).map((e) => eventLD(ctx.c.site, e, q))],
  });
}

// ---------------------------------------------------------------- events

export function eventPage(ctx, e, { counts, ticketing, ladder }) {
  const { q } = ctx;
  const past = q.isPast(e);
  const venue = q.venue(e.venue);
  const series = e.series && q.series(e.series);
  const festival = e.festival && q.festival(e.festival);
  const festivalMore = festival ? q.eventsInFestival(festival.slug).filter((x) => x.slug !== e.slug && !q.isPast(x)) : [];
  const lineup = e.performers.map(q.artist).filter(Boolean);
  const sameSeries = series ? q.eventsInSeries(series.slug).filter((x) => x.slug !== e.slug) : [];
  const nearby = sameSeries.filter((x) => Math.abs(Date.parse(x.start) - Date.parse(e.start)) < 120 * 864e5).slice(0, 6);
  const alsoBy = lineup.flatMap((a) => q.eventsFor(a.slug)).filter((x, i, arr) => x.slug !== e.slug && arr.indexOf(x) === i).slice(-8).reverse();
  const there = counts.get(`was-there:${e.slug}`) || 0;
  const body = h`
<article class="detail">
  <div class="detail-art${e.image ? ' detail-photo' : ''}">${eventArt(ctx, e, 360)}</div>
  <div class="detail-copy">
    <p class="eyebrow">${festival ? h`<a href="${festival.path}">${festival.name}</a>` : series ? h`<a href="${paths.series(series.slug)}">${series.name}</a>` : 'TAM'}${past ? ' · From the archive' : ''}</p>
    <h1>${e.title}</h1>
    <p class="meta big"><time datetime="${e.start}">${longDay(e)}</time> · ${fmtTime(e.start)}</p>
    <p class="meta">${venue ? h`<a href="${paths.venue(venue.slug)}">${venue.name}</a>, ${venue.address}` : e.venueName}</p>
    ${e.summary ? h`<p class="lede">${e.summary}</p>` : ''}
    ${past ? '' : h`<p class="countdown" data-countdown="${e.start}"></p>`}
    ${past ? '' : raw(ticketing || '')}
    <p class="cta-row">
      ${past ? (e.url ? h`<a class="btn btn-ghost" href="${e.url}" rel="noopener">The original listing</a>` : '') : h`${ticketing ? '' : e.url ? h`<a class="btn" href="${e.url}" rel="noopener">Tickets on Eventbrite</a> ` : h`<a class="btn" href="#footer-signup">Tickets soon: join the list</a> `}<a class="btn btn-ghost" href="${paths.event(e.slug)}.ics">Add to calendar</a>`}
    </p>
    ${ladder ? priceLadder(ladder) : ''}
    ${e.programme?.length ? h`<h2>The night</h2><ol class="plain programme">${e.programme.map((x) => h`<li><span class="programme-time">${x.time}</span><div><h3>${x.title}</h3><p>${x.text}</p></div></li>`)}</ol>` : ''}
    ${lineup.length ? h`<h2>On the bill</h2><ul class="plain lineup">${lineup.map((a) => h`<li><a href="${paths.artist(a.slug)}">${a.name}</a> ${legendBadge(a)}</li>`)}</ul>` : ''}
    ${e.genres.length ? chipLinks(e.genres.filter((g) => GENRE_NAMES[g]).map((g) => [paths.genre(g), GENRE_NAMES[g]])) : ''}
    ${past ? demandForm(ctx, { type: 'was-there', target: e.slug, count: there, label: 'I was there', ask: 'Were you there? Add yourself to the night.' }) : ''}
  </div>
</article>
${e.highlights?.length && !past ? h`<section class="section highlights" aria-labelledby="hl-h">
  <div class="section-head"><h2 id="hl-h">Why you’ll want to be there</h2></div>
  <div class="grid grid-3">${e.highlights.map((x, i) => h`<article class="card highlight"><div class="card-body">
    <p class="highlight-n">${String(i + 1).padStart(2, '0')}</p>
    <h3>${x.title}</h3>
    <p>${x.text}</p>
    ${x.links?.length ? h`<p class="meta">${x.links.map(([label, href], j) => h`${j ? ' · ' : ''}<a href="${href}">${label}</a>`)}</p>` : ''}
  </div></article>`)}</div>
  <p class="cta-row highlights-cta">${ticketing ? h`<a class="btn" href="#book">${ladder?.current ? `Book now at ${money(ladder.current.price)}` : 'Book tickets'}</a>` : ladder ? h`<a class="btn" href="#ladder-h">See ticket prices</a>` : ''}${ladder?.current && ladder.door != null && ladder.door > ladder.current.price ? h` <span class="meta">Save ${money(ladder.door - ladder.current.price)} on the door price by booking now.</span>` : ''}</p>
</section>` : ''}
${festival ? section(`The ${festival.name}`, h`${festivalMore.length ? eventList(ctx, festivalMore) : h`<p>${e.title} is part of the ${festival.name}. <a href="${festival.path}">See every show and play “${festival.song?.title || festival.title}”.</a></p>`}`, { href: festival.path, more: `${festival.title} →` }) : ''}
${nearby.length ? section(`More ${series.name}`, eventList(ctx, nearby), { href: paths.series(series.slug) }) : ''}
${alsoBy.length ? section(lineup.length === 1 ? `More from ${lineup[0].name}` : 'More from these artists', eventList(ctx, alsoBy)) : ''}`;
  return layout(ctx, {
    title: `${e.title} · ${shortDay(e)}`,
    description: `${e.title} at ${venue?.name || 'TAM'}, London on ${longDay(e)}.${lineup.length ? ` With ${lineup.map((a) => a.name).join(', ')}.` : ''}`,
    path: paths.event(e.slug), body, ld: [eventLD(ctx.c.site, e, q)], image: e.image || undefined,
  });
}

// A night's price schedule: every step, where it is now, and what booking now saves.
function priceLadder(l) {
  const cur = l.current;
  const save = cur && l.door != null ? l.door - cur.price : 0;
  return h`<section class="price-ladder" aria-labelledby="ladder-h">
  <h2 id="ladder-h">Book early, pay less</h2>
  <p>The price goes up as Christmas gets closer${l.door != null ? h`, to ${money(l.door)} in the final week and on the door` : ''}.</p>
  <ol class="plain ladder">${l.tiers.map((t) => h`<li class="is-${t.state}"${t.state === 'now' ? raw(' aria-current="true"') : ''}>
    <span class="ladder-name">${t.name}</span>
    <span class="ladder-price">${money(t.price)}</span>
    <span class="ladder-note">${t.note || ''}${t.state === 'gone' ? h` · <strong>${t.why === 'sold out' ? 'Sold out' : 'Ended'}</strong>` : ''}${t.state === 'now' ? h` · <strong>On sale now${t.left != null ? h`: ${t.left} left at this price` : ''}</strong>` : ''}</span>
  </li>`)}</ol>
  ${cur && save > 0 ? h`<p class="ladder-push">Book now at <strong>${money(cur.price)}</strong> and save <strong>${money(save)}</strong> on the door price.${l.next && cur.until ? h` Goes up to ${money(l.next.price)}${cur.limit != null ? ' when these sell out, or' : ''} at midnight on ${fmtDate(new Date(Date.parse(cur.until) - 1).toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}: <span class="countdown" data-countdown="${cur.until}"></span>` : ''}</p>` : ''}
</section>`;
}

// ---------------------------------------------------------------- artists

const SOURCE_NOTE = 'Nights are taken from TAM’s Eventbrite listings, so some nights may be missing.';

export function artists(ctx) {
  const { c } = ctx;
  const legends = c.artists.filter((a) => a.legend);
  const az = [...c.artists].sort((a, b) => a.name.replace(/^The /i, '').localeCompare(b.name.replace(/^The /i, ''), 'en'));
  const letters = [...new Set(az.map((a) => a.name.replace(/^The /i, '')[0].toUpperCase()))];
  const body = h`
<header class="page-head">
  <p class="eyebrow">Artists</p>
  <h1>Artists who have played TAM.</h1>
  <p class="lede">From first gigs to cult legends. Every artist has a page with their nights at TAM and who they’ve shared a bill with.</p>
</header>
${legends.length ? section('Cult legends', h`<div class="grid grid-4">${legends.map(artistCard)}</div>`, { id: 'legends' }) : ''}
${section('A–Z', h`<p class="az-index">${letters.map((l) => h`<a href="#az-${l}">${l}</a>`)}</p>
<div class="az">${letters.map((l) => h`<div class="az-group" id="az-${l}"><h3>${l}</h3><ul class="plain">${az.filter((a) => a.name.replace(/^The /i, '')[0].toUpperCase() === l).map((a) => h`<li><a href="${paths.artist(a.slug)}">${a.name}</a></li>`)}</ul></div>`)}</div>
<p class="muted small">${SOURCE_NOTE}</p>`, { id: 'a-z' })}`;
  return layout(ctx, {
    title: 'Artists', description: 'Artists who have played the Temple of Art and Music in London, from emerging artists to cult legends like Dana Gillespie.', path: '/artists', body,
    ld: [itemList(c.site, 'Artists who have played TAM', c.artists.map((a) => paths.artist(a.slug)))],
  });
}

export function artistPage(ctx, a, { counts }) {
  const { q, c } = ctx;
  const nights = q.eventsFor(a.slug);
  const upcoming = nights.filter((e) => !q.isPast(e));
  const past = nights.filter((e) => q.isPast(e)).reverse();
  const videos = (ctx.tv || []).filter((v) => v.title.toLowerCase().includes(a.name.toLowerCase()) || (v.artists || []).includes(a.slug));
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
  const body = h`
<article class="detail">
  <div class="detail-art">${raw(artwork(a.name, { size: 360, legend: a.legend }))}${pressedOn(a.name, a.legend)}</div>
  <div class="detail-copy">
    <p class="eyebrow">${a.genres.map((g) => GENRE_NAMES[g] || g).join(' · ') || 'Artist'} ${legendBadge(a)}</p>
    <h1>${a.name}</h1>
    ${a.note ? h`<p class="meta">${a.note}</p>` : ''}
    ${a.bio.length ? h`<div class="prose bio">${a.bio.slice(0, 2).map((p) => h`<p>${p}</p>`)}${a.bio.length > 2 ? h`<details><summary>More from the TAM archive</summary>${a.bio.slice(2, 40).map((p) => h`<p>${p}</p>`)}</details>` : ''}</div>` : ''}
    ${upcoming.length ? h`<h2>Next at TAM</h2>${eventList(ctx, upcoming)}` : ''}
    ${demandForm(ctx, { type: 'bring-back', target: a.slug, count: want, label: 'Bring them back', ask: upcoming.length ? `Want more ${a.name} at TAM? Say so, and we’ll tell you when there’s a new date.` : `Want ${a.name} back at TAM? Say so, and we’ll tell you when it happens.` })}
  </div>
</article>
${a.images.length ? section('From the TAM archive', legacyImages(a.images, a.name)) : ''}
${videos.length ? section('On TAM TV', h`<div class="grid grid-3">${videos.slice(0, 6).map(tvCard)}</div>`, { href: '/tv' }) : ''}
${past.length ? section('Nights at TAM', h`${[...byYear].map(([y, list]) => h`<h3 class="year-head"><a href="${paths.year(y)}">${y}</a></h3>${eventList(ctx, list, { showYear: false })}`)}<p class="muted small">${SOURCE_NOTE}</p>`) : ''}
${withThem.length ? section('Shared the bill with', h`<div class="grid grid-4">${withThem.map((x) => artistCard(x.artist))}</div>`) : ''}
${subpages.length ? section('More about ' + a.name, h`<ul class="plain link-list">${subpages.map((p) => h`<li><a href="${p.path}">${p.title}</a></li>`)}</ul>`) : ''}
${stories.length ? section('Stories', h`<div class="grid grid-3">${stories.map(storyCard)}</div>`) : ''}
${venues.length ? section('Where they played', chipLinks(venues.map((v) => [paths.venue(v.slug), v.name]))) : ''}`;
  return layout(ctx, {
    title: `${a.name} at TAM`,
    description: `${a.name} at the Temple of Art and Music, London. ${a.note || ''} Their nights at TAM, who they played with, and what’s next.`.replace(/\s+/g, ' '),
    path: paths.artist(a.slug), body, ld: [artistLD(c.site, a, q)], ogType: 'profile',
  });
}

// ---------------------------------------------------------------- archive

export function archive(ctx) {
  const { q } = ctx;
  const body = h`
<header class="page-head">
  <p class="eyebrow">The archive</p>
  <h1>Past nights at TAM.</h1>
  <p class="lede">Who played, where and when. Were you there? Add yourself to the night.</p>
  <p class="muted">${SOURCE_NOTE}</p>
</header>
${section('By year', chipLinks(q.years().slice().reverse().map((y) => [paths.year(y), y])))}
${section('Recent nights', eventList(ctx, q.past().slice(0, 30)))}`;
  return layout(ctx, { title: 'The archive', description: 'Past live music nights at the Temple of Art and Music (TAM), London: who played, where and when.', path: '/archive', body });
}

export function archiveYear(ctx, year) {
  const { q } = ctx;
  const list = q.eventsInYear(year).filter((e) => q.isPast(e));
  const months = new Map();
  for (const e of list) {
    const m = Number(e.date.slice(5, 7));
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(e);
  }
  const years = q.years();
  const i = years.indexOf(String(year));
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/archive">The archive</a></p>
  <h1>TAM in ${year}</h1>
  <p class="muted">${SOURCE_NOTE}</p>
  <p class="cta-row">${years[i - 1] ? h`<a class="btn btn-ghost btn-small" href="${paths.year(years[i - 1])}">← ${years[i - 1]}</a>` : ''} ${years[i + 1] ? h`<a class="btn btn-ghost btn-small" href="${paths.year(years[i + 1])}">${years[i + 1]} →</a>` : ''}</p>
</header>
${[...months].map(([m, l]) => section(`${monthName(m)} ${year}`, eventList(ctx, l, { showYear: false })))}`;
  return layout(ctx, { title: `TAM in ${year}`, description: `Live music nights at the Temple of Art and Music in London in ${year}, month by month, with the artists on the bill.`, path: paths.year(year), body });
}

export function seriesIndex(ctx) {
  const current = ctx.q.currentSeries();
  const body = h`
<header class="page-head">
  <p class="eyebrow">Regular nights</p>
  <h1>Regular nights at TAM.</h1>
</header>
${current.length ? h`<div class="grid grid-3">${current.map((s) => h`<article class="card"><div class="card-body">
  <h3><a href="${paths.series(s.slug)}">${s.name}</a></h3>
  <p class="meta">Next: ${longDay(ctx.q.eventsInSeries(s.slug).find((e) => !ctx.q.isPast(e)))}</p>
</div></article>`)}</div>` : h`<p>See <a href="/whats-on">what’s on</a>.</p>`}`;
  return layout(ctx, { title: 'Regular nights', description: 'Regular nights at TAM, Elephant & Castle, London.', path: '/series', body });
}

export function seriesPage(ctx, s) {
  const { q } = ctx;
  const list = q.eventsInSeries(s.slug);
  const upcoming = list.filter((e) => !q.isPast(e));
  const past = list.filter((e) => q.isPast(e)).reverse();
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/series">Regular nights</a></p>
  <h1>${s.name}</h1>
  ${upcoming.length ? '' : h`<p class="lede">This night isn’t running at the moment. Here’s its history at TAM.</p>`}
</header>
${upcoming.length ? section('Next up', h`<div class="grid grid-3">${upcoming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${past.length ? section('Past nights', h`${eventList(ctx, past.slice(0, 60))}<p class="muted small">${SOURCE_NOTE}</p>`) : ''}`;
  return layout(ctx, { title: `${s.name} at TAM`, description: `${s.name} at the Temple of Art and Music, London.`, path: paths.series(s.slug), body, ld: [seriesLD(ctx.c.site, s)] });
}

export function genresIndex(ctx) {
  const { q } = ctx;
  const body = h`
<header class="page-head"><p class="eyebrow">Genres</p><h1>What TAM sounds like.</h1></header>
${chipLinks(q.genres().map((g) => [paths.genre(g), GENRE_NAMES[g]]))}`;
  return layout(ctx, { title: 'Genres', path: '/genres', body });
}

export function genrePage(ctx, g) {
  const { q } = ctx;
  const nights = q.eventsInGenre(g);
  const upcoming = nights.filter((e) => !q.isPast(e));
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/genres">Genres</a></p>
  <h1>${GENRE_NAMES[g]} at TAM</h1>
</header>
${upcoming.length ? section('Coming up', h`<div class="grid grid-3">${upcoming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${section('Recent nights', eventList(ctx, nights.filter((e) => q.isPast(e)).reverse().slice(0, 40)))}`;
  return layout(ctx, { title: `${GENRE_NAMES[g]} in London at TAM`, description: `Live ${GENRE_NAMES[g].toLowerCase()} in London at the Temple of Art and Music.`, path: paths.genre(g), body });
}

// ---------------------------------------------------------------- locations

export function locations(ctx) {
  const { q, c } = ctx;
  const current = q.currentVenues();
  const before = c.venues.filter((v) => !current.includes(v));
  const home = q.venue('elephant-castle');
  const homeLegacy = home?.legacy ? q.legacy(home.legacy) : null;
  const body = h`
<header class="page-head">
  <p class="eyebrow">Find us</p>
  <h1>${current.length === 1 ? current[0].name : 'Where TAM is'}</h1>
  ${current.length === 1 ? h`<p class="lede">${current[0].address}</p>` : ''}
</header>
${current.length > 1 ? h`<div class="grid grid-3">${current.map((v) => h`<article class="card"><div class="card-body"><h3><a href="${paths.venue(v.slug)}">${v.name}</a></h3><p class="meta">${v.address}</p></div></article>`)}</div>` : ''}
${c.site.hours?.length ? section('Opening times', h`<ul class="plain hours">${c.site.hours.map((l) => h`<li>${l}</li>`)}</ul>`) : ''}
${homeLegacy && current.includes(home) ? h`<section class="section"><div class="prose narrow-left">${blocksHtml(venueBlocks(homeLegacy.blocks))}</div><p><a class="btn btn-ghost" href="${paths.venue(home.slug)}">More about ${home.name}</a></p></section>` : ''}
${before.length ? section('Where TAM has been', h`<ul class="plain link-list">${before.map((v) => h`<li><a href="${paths.venue(v.slug)}">${v.name}</a> <span class="meta">${v.place}</span></li>`)}</ul>`) : ''}
${section('Beyond London', h`<ul class="plain link-list">${c.legacy.filter((p) => p.path.startsWith('/locations/austria')).map((p) => h`<li><a href="${p.path}">${p.title}</a></li>`)}</ul>`)}`;
  return layout(ctx, { title: 'Find us', description: `Find TAM, the Temple of Art and Music: ${home?.address || 'London'}.`, path: '/locations', body, ld: current.map((v) => venueLD(c.site, v)) });
}

export function venuePage(ctx, v) {
  const { q, c } = ctx;
  const legacy = v.legacy ? q.legacy(v.legacy) : null;
  const nights = q.eventsAtVenue(v.slug);
  const upcoming = nights.filter((e) => !q.isPast(e));
  const current = upcoming.length > 0;
  const body = h`
<header class="page-head">
  <p class="eyebrow"><a href="/locations">Find us</a> · ${v.place}</p>
  <h1>${v.name}</h1>
  <p class="lede">${v.address}.${current ? '' : ' TAM doesn’t currently run nights here; this is the history.'}</p>
</header>
${legacy ? h`<section class="section split">
  <div class="prose">${current && c.site.hours?.length ? h`<h2>Opening times</h2><ul class="plain hours">${c.site.hours.map((l) => h`<li>${l}</li>`)}</ul>` : ''}${blocksHtml(venueBlocks(legacy.blocks))}</div>
  <div>${legacyImages(legacy.images, v.name)}</div>
</section>` : ''}
${upcoming.length ? section('Coming up here', h`<div class="grid grid-3">${upcoming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${section(current ? 'Recent nights' : 'Nights at TAM here', h`${eventList(ctx, nights.filter((e) => q.isPast(e)).reverse().slice(0, 40))}<p class="muted small">${SOURCE_NOTE}</p>`)}`;
  return layout(ctx, { title: `${v.name}, London`, description: `${v.name} (${v.place}), ${v.address}.`, path: paths.venue(v.slug), body, ld: [venueLD(c.site, v)] });
}

// ---------------------------------------------------------------- TV

const tvCard = (v) => h`<article class="card video-card">
  <a href="https://www.youtube.com/watch?v=${v.youtubeId}" class="card-art video-thumb" rel="noopener" data-play="${v.youtubeId}" data-title="${v.title}">
    <img src="https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
    <span class="play" aria-hidden="true">▶</span>
  </a>
  <div class="card-body">
    <p class="eyebrow">${v.published ? fmtDate(v.published, { day: 'numeric', month: 'short', year: 'numeric' }) : 'TAM TV'}</p>
    <h3>${v.title}</h3>
  </div>
</article>`;

export function tv(ctx) {
  const { c } = ctx;
  const list = ctx.tv || [];
  const [latest, ...rest] = list;
  const channel = c.site.socials.youtube;
  const body = h`
<header class="page-head">
  <p class="eyebrow">TAM TV</p>
  <h1>TAM TV</h1>
  <p class="lede">The latest from TAM’s YouTube channel, updated as new films go up.</p>
  <p class="cta-row"><a class="btn" href="${channel}?sub_confirmation=1" rel="noopener">Subscribe on YouTube</a> <a class="btn btn-ghost" href="${channel}/videos" rel="noopener">All videos on YouTube</a></p>
</header>
${latest ? h`<section class="section tv-latest">
  <div class="player" data-player>${embed(latest.youtubeId, latest.title)}</div>
  <h2 data-player-title>${latest.title}</h2>
</section>` : ''}
${rest.length ? section('More from TAM TV', h`<div class="grid grid-3">${rest.map(tvCard)}</div>`, { href: `${channel}/videos`, more: 'Everything on YouTube →' }) : ''}`;
  return layout(ctx, { title: 'TAM TV', description: 'TAM TV: live performances and films from the Temple of Art and Music in London, straight from TAM’s YouTube channel.', path: '/tv', body, ld: list.slice(0, 15).map((v) => videoLD(c.site, { ...v, slug: v.slug || v.youtubeId, artists: v.artists || [] }, ctx.q)) });
}

export function videoPage(ctx, v) {
  const { q, c } = ctx;
  const people = v.artists.map(q.artist).filter(Boolean);
  const body = h`
<article class="video-detail">
  ${embed(v.youtubeId, v.title)}
  <div class="detail-copy narrow">
    <p class="eyebrow"><a href="/tv">TAM TV</a></p>
    <h1>${v.title}</h1>
    <p class="cta-row">${people.map((a) => h`<a class="btn btn-ghost btn-small" href="${paths.artist(a.slug)}">${a.name}</a>`)} <a class="btn btn-ghost btn-small" href="https://www.youtube.com/watch?v=${v.youtubeId}" rel="noopener">Watch on YouTube</a></p>
  </div>
</article>
${section('More from TAM TV', h`<div class="grid grid-3">${(ctx.tv || []).filter((x) => x.youtubeId !== v.youtubeId).slice(0, 6).map(tvCard)}</div>`, { href: '/tv' })}`;
  return layout(ctx, { title: v.title, description: `${v.title}, on TAM TV from the Temple of Art and Music, London.`, path: paths.video(v.slug), body, ld: [videoLD(c.site, v, q)], ogType: 'video.other', image: `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` });
}

// ---------------------------------------------------------------- festivals

// A festival's landing page. Its shows come from the events that name it, so
// adding a show is one more entry in content/events.json.
export function festivalPage(ctx, f, legacy) {
  const { q } = ctx;
  const shows = q.eventsInFestival(f.slug);
  const coming = shows.filter((e) => !q.isPast(e));
  const rx = f.pastPattern ? new RegExp(f.pastPattern, 'i') : null;
  const before = rx ? q.past().filter((e) => e.festival !== f.slug && rx.test(e.title)) : [];
  const singer = f.song?.artist && q.artist(f.song.artist);
  const body = h`
<header class="page-head festival-head">
  <p class="eyebrow">${f.name}${f.season ? ` · ${f.season}` : ''}</p>
  <h1>${f.title}</h1>
  <p class="lede">${f.lede}</p>
  <p class="cta-row">${coming.length ? h`<a class="btn" href="#shows">See the shows</a> ` : ''}<a class="btn btn-ghost" href="#footer-signup">Hear about new shows</a></p>
</header>
${f.song ? h`<section class="section festival-song">
  <div class="festival-song-copy">
    <p class="eyebrow">Now playing</p>
    <h2>${f.song.title}</h2>
    ${singer ? h`<p>By <a href="${paths.artist(singer.slug)}">${singer.name}</a>.</p>` : ''}
    <p><a class="btn btn-ghost btn-small" href="https://www.youtube.com/watch?v=${f.song.youtubeId}" rel="noopener">Listen on YouTube</a></p>
  </div>
  ${embed(f.song.youtubeId, `${f.song.title}${singer ? ` by ${singer.name}` : ''}`)}
</section>` : ''}
<section class="section" id="shows">
  <div class="section-head"><h2>The shows</h2></div>
  ${coming.length ? h`<div class="grid grid-3">${coming.map((e) => eventCard(ctx, e))}</div>` : ''}
  <p class="meta">${coming.length ? 'More Christmas shows will be added here as they’re announced.' : 'Shows will be announced here.'} <a href="#footer-signup">Join the list</a> to hear first.</p>
</section>
${before.length ? section('Christmas at TAM before', h`${eventList(ctx, before)}<p class="meta">${SOURCE_NOTE}</p>`) : ''}
${legacy ? section('Christmas parties at TAM', h`<div class="prose narrow">${blocksHtml(legacy.blocks)}</div>`) : ''}`;
  return layout(ctx, {
    title: `${f.title}: the ${f.name}`,
    description: `${f.name} at the Temple of Art and Music (TAM), Elephant & Castle, London. ${coming.length ? `Shows: ${coming.map((e) => e.title).join('; ')}.` : ''}`.trim(),
    path: f.path, body,
    ld: [festivalLD(ctx.c.site, f, shows), ...coming.map((e) => eventLD(ctx.c.site, e, q))],
  });
}

// ---------------------------------------------------------------- tech nights

// One-tap "I'd come" vote for a community: no email, counted like "Bring them back".
const voteForm = (ctx, x, count) => h`<form class="demand demand-compact" method="post" action="/demand" data-demand>
  <input type="hidden" name="type" value="want-community"><input type="hidden" name="target" value="${x.slug}"><input type="hidden" name="back" value="${ctx.path}">
  <p class="demand-count" data-demand-count data-one="person wants this at TAM" data-many="people want this at TAM">${count ? h`<strong>${num(count)}</strong> ${count === 1 ? 'person wants' : 'people want'} this at TAM` : 'Want this at TAM?'}</p>
  <button class="btn btn-small btn-ghost" type="submit">I’d come</button>
</form>`;

export function techNights(ctx, { counts, sent = false, values = {}, errors = {} }) {
  const { c, q } = ctx;
  const t = c.techNights;
  const votes = (x) => counts.get(`want-community:${x.slug}`) || 0;
  // Most wanted first; ties keep the seeded order.
  const communities = t.communities.map((x, i) => ({ x, i, n: votes(x) })).sort((a, b) => b.n - a.n || a.i - b.i);
  const tech = q.techEvents();
  const coming = tech.filter((e) => !q.isPast(e));
  const before = tech.filter((e) => q.isPast(e)).reverse();
  const err = (k) => (errors[k] ? h`<span class="error" id="te-err-${k}">${errors[k]}</span>` : '');
  const v = (k) => values[k] ?? '';
  const aria = (k) => raw(errors[k] ? ` aria-invalid="true" aria-describedby="te-err-${k}"` : '');
  const opt = (k, val, label) => h`<option value="${val}"${v(k) === val ? raw(' selected') : ''}>${label}</option>`;
  const body = h`
<header class="page-head tech-head">
  <p class="eyebrow">${t.name}</p>
  <h1>${t.title}</h1>
  <p class="lede">${t.lede}</p>
  <p class="cta-row"><a class="btn" href="#enquire">Host a night at TAM</a> <a class="btn btn-ghost" href="#communities">The communities</a></p>
  <p class="chips">${t.sponsors.map((x) => h`<span class="chip">${x}</span>`)}</p>
</header>
${coming.length ? section('Coming up', h`<div class="grid grid-3">${coming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${section('The nights', h`<div class="grid grid-4">${t.formats.map((f) => h`<article class="card"><div class="card-body"><h3>${f.title}</h3><p>${f.text}</p></div></article>`)}</div>`)}
${section('What you get', h`<div class="grid grid-4">${t.offer.map((f) => h`<article class="card"><div class="card-body"><h3>${f.title}</h3><p>${f.text}</p></div></article>`)}</div>`)}
<section class="section" id="communities">
  <div class="section-head"><h2>${t.communities.length} crypto communities we’d love to host</h2></div>
  <p class="lede-small">Some of the biggest communities in crypto. Tap <strong>I’d come</strong> on the ones you want to see at TAM. The most wanted rise to the top, and that’s who TAM approaches first.</p>
  <div class="grid grid-3 communities">${communities.map(({ x, n }) => h`<article class="card community" id="c-${x.slug}"><div class="card-body">
    <p class="eyebrow">${x.kind}</p>
    <h3>${x.name}</h3>
    <p>${x.text}</p>
    <p class="meta"><a href="${x.url}" rel="noopener nofollow">Official site</a> · <a href="?community=${x.slug}#enquire">Bring ${x.name} to TAM</a></p>
    ${voteForm(ctx, x, n)}
  </div></article>`)}</div>
  <p class="meta">These communities are listed because people might want to meet them here. They are not sponsors or partners of TAM unless a night says so. Names and trademarks belong to their owners.</p>
</section>
${before.length ? section('Tech nights at TAM before', h`${eventList(ctx, before)}<p class="meta">${SOURCE_NOTE}</p>`) : ''}
<section class="section" id="enquire">
  <div class="section-head"><h2>Host a night at TAM</h2></div>
  ${sent ? h`<p class="notice" role="status">Thank you. We’ve got it, and a person will reply by email.</p>` : h`
  <form class="form narrow" method="post" action="${t.path}#enquire" novalidate>
    ${Object.keys(errors).length ? h`<p class="error-summary" role="alert">Please fix the highlighted fields.</p>` : ''}
    <p>For sponsors, foundations, companies and community organisers. Tell us about the night and we’ll come back with dates.</p>
    <div class="field-row">
      <div class="field"><label for="te-name">Your name</label><input id="te-name" name="name" value="${v('name')}" required autocomplete="name"${aria('name')}>${err('name')}</div>
      <div class="field"><label for="te-email">Email</label><input id="te-email" type="email" name="email" value="${v('email')}" required autocomplete="email"${aria('email')}>${err('email')}</div>
    </div>
    <div class="field-row">
      <div class="field"><label for="te-org">Company or community</label><input id="te-org" name="organisation" value="${v('organisation')}" required autocomplete="organization"${aria('organisation')}>${err('organisation')}</div>
      <div class="field"><label for="te-community">Ecosystem</label><select id="te-community" name="community">${opt('community', '', 'Not crypto / not listed')}${t.communities.map((x) => opt('community', x.slug, x.name))}${opt('community', 'other', 'Another chain')}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="te-format">Kind of night</label><select id="te-format" name="format">${opt('format', '', 'Not sure yet')}${t.formats.map((f) => opt('format', f.title, f.title))}</select></div>
      <div class="field"><label for="te-when">When</label><input id="te-when" name="when" value="${v('when')}" placeholder="e.g. February 2027"></div>
      <div class="field"><label for="te-guests">Expected guests</label><select id="te-guests" name="guests">${opt('guests', '', 'Not sure')}${['Up to 50', '50 to 100', 'Over 100'].map((g) => opt('guests', g, g))}</select></div>
    </div>
    <div class="field"><label for="te-message">The night</label><textarea id="te-message" name="message" rows="5" required${aria('message')}>${v('message')}</textarea>${err('message')}</div>
    <label class="check"><input type="checkbox" name="newsletter"${values.newsletter ? raw(' checked') : ''}> Tell me about tech nights at TAM.</label>
    <label class="check"><input type="checkbox" name="privacy" required${aria('privacy')}> I’ve read the <a href="/privacy">privacy notice</a>.</label>${err('privacy')}
    <div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
    <button class="btn" type="submit">Send enquiry</button>
  </form>`}
</section>`;
  return layout(ctx, {
    title: t.name,
    description: 'Tech nights at the Temple of Art and Music, London: meetups, demo nights and build nights for AI companies, blockchains and crypto communities, with live music to finish.',
    path: t.path, body,
    ld: [
      { '@type': 'ItemList', name: 'Crypto communities TAM would like to host', itemListElement: communities.map(({ x }, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Organization', name: x.name, url: x.url } })) },
      ...coming.map((e) => eventLD(c.site, e, q)),
    ],
  });
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

const ACADEMY_RX = /academy|junior|youth|young (?:talent|artists|bloods)|in the loop/i;

export function about(ctx) {
  const body = h`
<header class="page-head narrow">
  <p class="eyebrow">About TAM</p>
  <h1>The Temple of Art and Music</h1>
</header>
<section class="section split">
  <div class="prose">
    <p class="lede">TAM is a home for live music in Elephant &amp; Castle, London.</p>
    <p>We are committed to nurturing new artists and musicians, while also relaunching those who don’t get the exposure they deserve. Ticket and bar sales help to support our artists.</p>
    <p>Looking ahead, TAM is putting more into the <a href="/academy">TAM Academy</a>, where Dana Gillespie passes on what she has learned to younger generations of artists.</p>
    <p class="cta-row"><a class="btn" href="/whats-on">What’s on</a> <a class="btn btn-ghost" href="/locations">Find us</a></p>
  </div>
  <div class="logo-demo"><div class="logo-frame"><div class="halo" aria-hidden="true"></div><div class="logo-backing" aria-hidden="true"></div>${raw(logo('full', { width: 380 }))}</div></div>
</section>
${section('From the TAM archive', h`<ul class="plain link-list">${ctx.c.legacy.filter((p) => /^\/(about\/|private-parties|singers|made-in-london|karaoke|tom|dana-and-the-tam|the-best-christmas-ever)/.test(p.path)).map((p) => h`<li><a href="${p.path}">${p.title}</a></li>`)}</ul>`)}`;
  return layout(ctx, { title: 'About', description: 'The Temple of Art and Music (TAM): a home for live music in Elephant & Castle, London, nurturing new artists and relaunching those who deserve more exposure.', path: '/about', body });
}

export function academy(ctx) {
  const { q, c } = ctx;
  const upcoming = q.upcoming().filter((e) => e.academy || ACADEMY_RX.test(e.title) || e.series === 'junior-open-mic' || e.series === 'tam-summer-academy');
  const past = q.past().filter((e) => ACADEMY_RX.test(e.title) || e.series === 'junior-open-mic' || e.series === 'tam-summer-academy').slice(0, 20);
  const pages = c.legacy.filter((p) => p.path.startsWith('/tom') || p.path === '/whats-on/junior-open-mic');
  const dana = q.artist('danagillespie');
  const body = h`
<header class="page-head narrow">
  <p class="eyebrow">The TAM Academy</p>
  <h1>Passing it on.</h1>
  <p class="lede">At the TAM Academy, Dana Gillespie and the musicians around TAM share what they have learned with the next generation of artists.</p>
  <p class="cta-row"><a class="btn" href="#footer-signup">Hear about Academy dates</a> ${dana ? h`<a class="btn btn-ghost" href="${paths.artist(dana.slug)}">About Dana Gillespie</a>` : ''}</p>
</header>
${upcoming.length ? section('Coming up', h`<div class="grid grid-3">${upcoming.map((e) => eventCard(ctx, e))}</div>`) : ''}
${pages.length ? section('From the TAM Open Music Academy', h`<ul class="plain link-list">${pages.map((p) => h`<li><a href="${p.path}">${p.title}</a></li>`)}</ul>`) : ''}
${past.length ? section('Past Academy and young-artist nights', eventList(ctx, past)) : ''}`;
  return layout(ctx, { title: 'The TAM Academy', description: 'The TAM Academy: Dana Gillespie and the musicians around the Temple of Art and Music passing on what they have learned to the next generation of artists.', path: '/academy', body });
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
  <h2>Tickets</h2>
  <p>When you book, we keep your name, email and booking so we can admit you and contact you about that night. Card payments are handled by Stripe; TAM never sees your card details.</p>
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

export function gone(ctx) {
  const body = h`<header class="page-head narrow center">
  <h1>This page has been removed.</h1>
  <p><a class="btn" href="/whats-on">What’s on</a> <a class="btn btn-ghost" href="/artists">Artists</a></p>
</header>`;
  return layout(ctx, { title: 'Removed', path: ctx.path, body, noindex: true });
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


// ---------------------------------------------------------------- tickets

const money = (pence) => (pence === 0 ? 'Free' : `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`);

// The booking form shown on an upcoming night that's on sale at TAM.
export function ticketForm(ctx, e, offer, { error, values = {} } = {}) {
  if (offer.soldOut) return h`<div class="tickets"><h2>Tickets</h2><p class="sold-out">Sold out.</p></div>`;
  const firstAvailable = offer.types.find((t) => t.left > 0);
  const checked = values.type || firstAvailable?.id;
  return h`<form class="tickets" method="post" action="${paths.event(e.slug)}/book" id="book">
  <h2>Book tickets</h2>
  ${error ? h`<p class="error-summary" role="alert">${error}</p>` : ''}
  <fieldset class="field ticket-types"><legend>Ticket</legend>
    ${offer.types.map((t) => h`<label class="ticket-type${t.left <= 0 ? ' is-out' : ''}">
      <input type="radio" name="type" value="${t.id}"${t.id === checked ? raw(' checked') : ''}${t.left <= 0 ? raw(' disabled') : ''} required>
      <span class="tt-name">${t.name}${t.tierName ? h` <span class="chip">${t.tierName} price</span>` : ''}</span>
      <span class="tt-price">${money(t.price)}</span>
      <span class="meta">${t.left <= 0 ? 'Sold out' : t.tierLeft != null && t.tierLeft <= 20 ? `${t.tierLeft} left at this price` : t.left <= 20 ? `${t.left} left` : ''}</span>
    </label>`)}
  </fieldset>
  <div class="field-row">
    <div class="field"><label for="t-qty">How many</label><select id="t-qty" name="qty">${Array.from({ length: 8 }, (_, i) => i + 1).map((n) => h`<option${String(n) === String(values.qty || 1) ? raw(' selected') : ''}>${n}</option>`)}</select></div>
    <div class="field"><label for="t-name">Name for the door</label><input id="t-name" name="name" required autocomplete="name" value="${values.name || ''}"></div>
  </div>
  <div class="field"><label for="t-email">Email</label><input id="t-email" type="email" name="email" required autocomplete="email" value="${values.email || ''}"></div>
  <label class="check"><input type="checkbox" name="marketing"${values.marketing ? raw(' checked') : ''}> Tell me about other nights at TAM.</label>
  <label class="check"><input type="checkbox" name="terms" required> I’ve read the <a href="/privacy">privacy notice</a>.</label>
  <button class="btn" type="submit">Continue</button>
  <p class="muted small">Paid tickets are paid securely on Stripe. Your ticket and QR code appear straight after.</p>
</form>`;
}

export function ticketPage(ctx, o, e, { qr, message, paymentsEnabled }) {
  const v = e && ctx.q.venue(e.venue);
  const ok = o.status === 'paid' || o.status === 'confirmed';
  const pending = o.status === 'pending';
  const body = h`
<article class="ticket-page narrow">
  <header class="page-head">
    <p class="eyebrow">${ok ? 'Your ticket' : pending ? 'Almost there' : 'Booking'}</p>
    <h1>${e ? e.title : 'TAM'}</h1>
    ${e ? h`<p class="meta big">${longDay(e)} · ${fmtTime(e.start)}</p><p class="meta">${v ? `${v.name}, ${v.address}` : e.venueName || ''}</p>` : ''}
  </header>
  ${message ? h`<p class="notice" role="status">${message}</p>` : ''}
  <div class="ticket${ok ? '' : ' is-pending'}">
    <div class="ticket-qr">${ok ? raw(qr) : h`<p>${pending ? 'Waiting for payment' : `This booking is ${o.status}.`}</p>`}</div>
    <dl class="ticket-facts">
      <div><dt>Name</dt><dd>${o.name}</dd></div>
      <div><dt>Ticket</dt><dd>${o.qty} × ${o.typeName}</dd></div>
      <div><dt>Total</dt><dd>${money(o.total)}</dd></div>
      <div><dt>Code</dt><dd class="code">${o.code}</dd></div>
      ${o.checkedIn ? h`<div><dt>Checked in</dt><dd>${o.checkedIn} of ${o.qty}</dd></div>` : ''}
    </dl>
  </div>
  ${ok ? h`<p>Show this QR code (or the code above) at the door. Bookmark this page, or save it to your phone: it’s your ticket.</p>
  <p class="cta-row">${e ? h`<a class="btn btn-ghost" href="${paths.event(e.slug)}.ics">Add to calendar</a>` : ''} <button class="btn btn-ghost" type="button" data-print>Print</button></p>` : ''}
  ${pending && paymentsEnabled ? h`<form method="post" action="/tickets/${o.code}/pay"><button class="btn" type="submit">Pay ${money(o.total)}</button></form><p class="muted small">Tickets are held for 30 minutes.</p>` : ''}
</article>`;
  return layout(ctx, { title: 'Your ticket', path: `/tickets/${o.code}`, body, noindex: true });
}

// ---- box office (staff only)

const boLayout = (ctx, title, body) => layout(ctx, { title: `Box office · ${title}`, path: '/box-office', body: h`<div class="box-office">${body}</div>`, noindex: true });

export function boxOfficeLogin(ctx, { error } = {}) {
  return boLayout(ctx, 'Sign in', h`<header class="page-head narrow"><p class="eyebrow">TAM box office</p><h1>Sign in</h1></header>
<form class="form narrow" method="post" action="/box-office/login">
  ${error ? h`<p class="error-summary" role="alert">${error}</p>` : ''}
  <div class="field"><label for="bo-token">Box office token</label><input id="bo-token" name="token" type="password" required autocomplete="current-password"></div>
  <button class="btn" type="submit">Sign in</button>
</form>`);
}

export function boxOfficeHome(ctx, { office, paymentsEnabled, error }) {
  const upcoming = ctx.q.upcoming();
  return boLayout(ctx, 'Nights', h`<header class="page-head"><p class="eyebrow">TAM box office</p><h1>Upcoming nights</h1>
  ${error ? h`<p class="error-summary" role="alert">${error}</p>` : ''}
  ${paymentsEnabled ? '' : h`<p class="notice">Card payments are off: set <code>STRIPE_SECRET_KEY</code> (and <code>STRIPE_WEBHOOK_SECRET</code>) to sell paid tickets. Free tickets work now.</p>`}
  <form class="inline-field checkin-form" method="post" action="/box-office/checkin"><label class="sr" for="ci">Ticket code</label><input id="ci" name="code" placeholder="Check in a ticket code, e.g. TAM-ABCDE-FGHJK" autocomplete="off"><input type="hidden" name="back" value="/box-office"><button class="btn btn-small" type="submit">Check in</button></form>
</header>
<table class="bo-table"><thead><tr><th>Night</th><th>Tickets</th><th>Booked</th><th></th></tr></thead><tbody>
${upcoming.map((e) => {
    const cfg = office.config(e.slug);
    return h`<tr><td><strong>${e.title}</strong><br><span class="meta">${longDay(e)} · ${fmtTime(e.start)}</span></td>
    <td>${cfg?.open ? h`<span class="chip chip-on">On sale at TAM</span>` : cfg ? h`<span class="chip">Closed</span>` : h`<span class="meta">Eventbrite only</span>`}</td>
    <td>${cfg ? office.taken(e.slug) : '—'}</td>
    <td><a class="btn btn-small btn-ghost" href="/box-office/e/${e.slug}">Manage</a></td></tr>`;
  })}
</tbody></table>`);
}

export function boxOfficeEvent(ctx, e, { office, paymentsEnabled, message, error }) {
  const cfg = office.config(e.slug) || { open: false, capacity: null, types: [{ id: 'ga', name: 'General admission', price: 0, capacity: null }] };
  const rows = [...cfg.types, ...Array.from({ length: Math.max(0, 4 - cfg.types.length) }, () => ({ id: '', name: '', price: '', capacity: null }))];
  const orders = office.ordersFor(e.slug);
  const admitted = orders.reduce((n, o) => n + (o.checkedIn || 0), 0);
  return boLayout(ctx, e.title, h`<header class="page-head"><p class="eyebrow"><a href="/box-office">Box office</a></p><h1>${e.title}</h1>
  <p class="meta big">${longDay(e)} · ${fmtTime(e.start)} · <a href="${paths.event(e.slug)}">public page</a></p>
  ${message ? h`<p class="notice" role="status">${message}</p>` : ''}${error ? h`<p class="error-summary" role="alert">${error}</p>` : ''}
</header>
<section class="section split">
<form class="form" method="post" action="/box-office/e/${e.slug}/config">
  <h2>Ticket sales</h2>
  <label class="check"><input type="checkbox" name="open"${cfg.open ? raw(' checked') : ''}> On sale on TAM.TV (replaces the Eventbrite button on the night’s page)</label>
  <div class="field"><label for="cap">Room capacity (all ticket types, optional)</label><input id="cap" name="capacity" inputmode="numeric" value="${cfg.capacity ?? ''}"></div>
  ${cfg.scheduled ? h`<p class="meta">This night sells on a price schedule (set in <code>content/events.json</code>):</p>
  <table class="bo-table"><thead><tr><th>Price</th><th></th><th>Sold</th><th></th></tr></thead><tbody>${office.ladder(e.slug).tiers.map((t) => h`<tr class="${t.state === 'gone' ? 'is-dead' : ''}"><td><strong>${t.name}</strong><br><span class="meta">${t.note || ''}</span></td><td>${money(t.price)}</td><td>${office.taken(e.slug, 'ticket', t.id)}${t.limit != null ? ` / ${t.limit}` : ''}</td><td>${t.state === 'now' ? 'Selling now' : t.state === 'gone' ? t.why : ''}</td></tr>`)}</tbody></table>
  ${office.ladder(e.slug).door != null ? h`<p class="meta">On the door: ${money(office.ladder(e.slug).door)}.</p>` : ''}` : h`<table class="bo-types"><thead><tr><th>Ticket type</th><th>Price £</th><th>Limit</th></tr></thead><tbody>
  ${rows.map((t, i) => h`<tr><td><input name="type${i}_name" value="${t.name}" placeholder="${i ? '' : 'General admission'}"><input type="hidden" name="type${i}_id" value="${t.id}"></td><td><input name="type${i}_price" inputmode="decimal" value="${t.price === '' ? '' : (t.price / 100).toFixed(2)}" placeholder="0"></td><td><input name="type${i}_capacity" inputmode="numeric" value="${t.capacity ?? ''}"></td></tr>`)}
  </tbody></table>`}
  ${paymentsEnabled ? '' : h`<p class="muted small">Paid types stay hidden from the public until Stripe is set up.</p>`}
  <button class="btn" type="submit">Save</button>
</form>
<div>
  <h2>At the door</h2>
  <p class="meta">${office.taken(e.slug)} booked · ${admitted} checked in</p>
  <form class="inline-field checkin-form" method="post" action="/box-office/checkin"><label class="sr" for="ci2">Ticket code</label><input id="ci2" name="code" placeholder="TAM-ABCDE-FGHJK" autocomplete="off" autofocus><input type="hidden" name="back" value="/box-office/e/${e.slug}"><button class="btn btn-small" type="submit">Check in</button></form>
  <p><a href="/box-office/e/${e.slug}.csv">Download guest list (CSV)</a></p>
</div>
</section>
${section('Bookings', orders.length ? h`<table class="bo-table"><thead><tr><th>Name</th><th>Tickets</th><th>Status</th><th>In</th><th></th></tr></thead><tbody>
${orders.slice().reverse().map((o) => h`<tr class="${office.isLive(o) ? '' : 'is-dead'}"><td><strong>${o.name}</strong><br><span class="meta">${o.email} · ${o.code}</span></td><td>${o.qty} × ${o.typeName}<br><span class="meta">${money(o.total)}</span></td><td>${office.isLive(o) || o.status !== 'pending' ? o.status : 'expired'}</td><td>${o.checkedIn}/${o.qty}</td>
<td>${(o.status === 'paid' || o.status === 'confirmed') && o.checkedIn < o.qty ? h`<form method="post" action="/box-office/checkin"><input type="hidden" name="code" value="${o.code}"><input type="hidden" name="back" value="/box-office/e/${e.slug}"><button class="btn btn-small" type="submit">Check in</button></form>` : ''}
${o.status !== 'cancelled' ? h`<form method="post" action="/box-office/orders/${o.id}/cancel" data-confirm="Cancel this booking? Refund any payment in Stripe separately."><input type="hidden" name="back" value="/box-office/e/${e.slug}"><button class="link-button" type="submit">Cancel</button></form>` : ''}</td></tr>`)}
</tbody></table>` : h`<p class="muted">No bookings yet.</p>`)}`);
}

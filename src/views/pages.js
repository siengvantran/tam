// Public pages.

import { html, raw } from './html.js';
import { html as respond, redirect, fail } from '../lib/http.js';
import { pounds } from '../../shared/pricing.js';
import { longDate, dateParts } from '../lib/content.js';
import { serveIcs } from './seo.js';
import { venueLd, placeLd, availability } from './ai.js';
import { pathwayOf, pathwayTiles } from './pathways.js';
import { layout, ticker, nightCard, when, times, artistChip, youtubeThumb, chatPanel, askTitle, listingPrice, ticketPrice, ticketState, fridayTile, friday, fridayUrl } from './layout.js';
import {
  bookingData, bookingSection, datesSection, programmeSection, charitySection, teamTablesSection,
  wallSection, sponsorSection, songSection, visitSection, countdown,
} from './sections.js';

const page = (ctx, opts) => layout(ctx, opts);
const themeOf = (f) => (f && f.theme) || 'tam';
const ambientOf = (f) => (f && f.features.ambient) || 'stars';
const songOf = (ctx, f) => (f && f.features.tamalume && f.song) || null;
const featureScripts = (f) => (f ? ['/js/festival.js', ...(f.features.cards || f.song ? ['/js/song.js'] : [])] : []);

// Schema.org offers from a night's Eventbrite ticket types (pay-what-you-like ones carry no price).
function ebOffers(l) {
  const avail = (t) => (t.status === 'AVAILABLE' ? 'https://schema.org/InStock' : t.status === 'NOT_YET_ON_SALE' ? 'https://schema.org/PreOrder' : 'https://schema.org/SoldOut');
  const priced = (l.tickets || []).filter((t) => t.kind !== 'donation');
  if (!priced.length) return [{ '@type': 'Offer', url: l.url, priceCurrency: 'GBP', ...(l.free ? { price: '0' } : {}), availability: l.soldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' }];
  return priced.map((t) => ({ '@type': 'Offer', name: t.name, url: l.url, price: (t.price / 100).toFixed(2), priceCurrency: 'GBP', availability: avail(t), ...(t.salesEnd ? { validThrough: t.salesEnd } : {}) }));
}

// The ticket types a night sells on Eventbrite, as Eventbrite's checkout lists them.
const ebTickets = (n) => {
  const l = n.eventbrite;
  if (!l || !l.tickets || !l.tickets.length) return '';
  const fees = l.tickets.some((t) => t.fee);
  return html`<section class="section" id="tickets"><div class="wrap"><div class="head"><h2 class="chrome">Tickets</h2>
  <p class="muted">${l.free ? 'Free to come: reserve a place on Eventbrite. ' : ''}${fees ? 'Paid tickets carry Eventbrite’s booking fee.' : ''}</p></div>
  <ul class="eb-tickets">${l.tickets.map((t) => { const st = ticketState(t); return html`<li class="${st ? 'off' : ''}"><div><b>${t.name}</b>${t.about ? html`<p class="small muted">${t.about}</p>` : ''}</div>
    <div class="eb-price"><b>${ticketPrice(t)}</b>${t.fee ? html`<span class="small muted">+ ${pounds(t.fee)} fee</span>` : ''}${st ? html`<span class="small tag">${st}</span>` : ''}</div></li>`; })}</ul>
  <p><a class="btn hot" href="${l.url}" target="_blank" rel="noopener">${l.soldOut ? 'Sold out · join the waitlist on Eventbrite ↗' : l.free ? 'Reserve on Eventbrite ↗' : 'Book on Eventbrite ↗'}</a></p></div></section>`;
};

function eventLd(ctx, n, d) {
  const v = ctx.content.venueBy.get(n.venue);
  const av = d ? availability(ctx, d, n) : null;
  const stock = av ? (av.soldOut ? 'https://schema.org/SoldOut' : av.left !== null && av.left <= 10 ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock') : 'https://schema.org/InStock';
  const offers = n.sale ? (n.sale.mode === 'own' ? n.sale.tickets : n.sale.mode === 'schedule' ? n.sale.tiers : [{ name: 'Ticket', price: n.sale.price }])
    .map((t) => ({ '@type': 'Offer', name: t.name, price: (t.price / 100).toFixed(2), priceCurrency: 'GBP', url: `${ctx.cfg.siteUrl}/events/${n.slug}#book`, availability: stock,
      ...(av && av.left !== null ? { inventoryLevel: { '@type': 'QuantitativeValue', value: av.left } } : {}), seller: { '@type': 'Organization', name: 'TAM, Temple of Art and Music' }, ...(t.until ? { validThrough: t.until } : {}) }))
    : n.eventbrite && n.eventbrite.url ? ebOffers(n.eventbrite) : undefined;
  return {
    '@context': 'https://schema.org', '@type': 'MusicEvent', name: n.title, startDate: n.start, endDate: n.end,
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: v ? placeLd(ctx) : undefined, image: n.image && n.image.startsWith('http') ? n.image : `${ctx.cfg.siteUrl}${n.image}`,
    url: `${ctx.cfg.siteUrl}/events/${n.slug}`, description: n.summary || undefined, offers,
    ...(n.timesTbc ? {} : { doorTime: n.start }),
    ...(av && av.free ? { isAccessibleForFree: true } : {}),
    ...(av && av.left !== null ? { remainingAttendeeCapacity: av.left } : {}), ...(av && av.capacity ? { maximumAttendeeCapacity: av.capacity } : {}),
    performer: [...n.artists.map((s) => ({ '@type': 'PerformingGroup', name: ctx.content.artistBy.get(s).name })), ...(n.lineup || []).map((x) => ({ '@type': 'Person', name: x.name }))],
    organizer: { '@type': 'Organization', name: ctx.content.site.legalName, url: ctx.cfg.siteUrl },
  };
}

export function routes(r, ctx, d) {
  const c = ctx.content;

  r.get('/', (req, res) => respond(res, home(ctx, d, req)));
  r.get('/home', (req, res) => redirect(res, '/', 301));
  r.get('/whats-on', (req, res) => respond(res, whatsOn(ctx, d)));
  r.get('/festivals', (req, res) => respond(res, festivalsIndex(ctx)));
  for (const f of c.festivals) {
    r.get(f.path, (req, res) => respond(res, festivalPage(ctx, d, f)));
    r.get(`/festivals/${f.slug}`, (req, res) => redirect(res, f.path, 301));
  }
  r.get('/events/:slug', (req, res, { params, url }) => {
    if (params.slug.endsWith('.ics')) return serveIcs(ctx, res, params.slug.slice(0, -4));
    const n = c.nightBy.get(params.slug);
    if (n) return respond(res, eventPage(ctx, d, n, url));
    const past = c.pastBy.get(params.slug);
    if (past) return redirect(res, `/archive/night/${past.slug}`, 301);
    throw fail(404, 'We couldn’t find that night.');
  });
  r.get('/artists', (req, res) => respond(res, artistsIndex(ctx)));
  r.get('/artists/:slug', (req, res, { params }) => {
    const a = c.artistBy.get(params.slug);
    if (!a) {
      const old = c.legacyBy.get(`/artists/${params.slug}`);
      if (old) return legacyPage(req, res, ctx, old);
      throw fail(404, 'We couldn’t find that artist.');
    }
    d.community.track(`artist:${a.slug}`, req);
    respond(res, artistPage(ctx, a));
  });
  r.get('/archive', (req, res) => respond(res, archiveIndex(ctx)));
  r.get('/archive/:year', (req, res, { params }) => {
    if (!/^\d{4}$/.test(params.year)) throw fail(404, 'No such year.');
    respond(res, archiveYear(ctx, params.year));
  });
  r.get('/archive/night/:slug', (req, res, { params }) => {
    const e = c.pastBy.get(params.slug);
    if (!e) throw fail(404, 'We couldn’t find that night.');
    respond(res, archiveNight(ctx, e));
  });
  r.get('/tv', (req, res) => respond(res, tv(ctx)));
  r.get('/card/:id', (req, res, { params }) => {
    const card = ctx.db.cards.find((x) => x.id === params.id);
    if (!card) throw fail(404, 'We couldn’t find that card.');
    respond(res, cardPage(ctx, card));
  });
  r.get('/invite/:id', (req, res, { params, url }) => {
    const inv = c.inviteBy.get(params.id);
    if (!inv) throw fail(404, 'We couldn’t find that invitation.');
    d.community.track(`invite:${inv.id}`, req);
    respond(res, invitePage(ctx, d, inv, url));
  });
  r.get('/ticket/:ref', (req, res, { params, url }) => {
    const b = ctx.db.bookings.find((x) => x.id === params.ref);
    if (!b || !d.tickets.keyOk(b.id, url.searchParams.get('k'))) throw fail(404, 'We couldn’t find that ticket. Check the link in your email.');
    respond(res, ticketPage(ctx, d, b, req), 200, { 'Cache-Control': 'no-store' });
  });
  r.get('/ticket/:ref/qr.svg', (req, res, { params, url }) => {
    const b = ctx.db.bookings.find((x) => x.id === params.ref);
    if (!b || !d.tickets.keyOk(b.id, url.searchParams.get('k'))) throw fail(404, 'Not found.');
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    res.end(d.qr.toSvg(`${ctx.cfg.siteUrl}${d.tickets.ticketPath(b)}`));
  });
  r.get('/pay/:ref', async (req, res, { params, url }) => {
    const b = ctx.db.bookings.find((x) => x.id === params.ref);
    if (!b || !d.tickets.keyOk(b.id, url.searchParams.get('k'))) throw fail(404, 'We couldn’t find that booking.');
    if (b.status === 'paid') return redirect(res, d.tickets.ticketPath(b));
    if (b.status !== 'reserved' || !ctx.stripe.enabled) throw fail(409, 'This booking can’t be paid online. Get in touch with us.');
    redirect(res, await d.tickets.startCheckout(req, b).then(async (u) => { await ctx.save(); return u; }));
  });
  for (const col of c.collections) {
    r.get(`/collections/${col.slug}`, (req, res) => respond(res, collectionPage(ctx, d, col)));
  }
  r.get('/verify', (req, res) => respond(res, verifyPage(ctx)));
  r.get('/privacy', (req, res) => respond(res, privacy(ctx)));
  const unfollow = (req, res, { url }) => {
    const a = d.community.unfollow(url.searchParams.get('t') || '');
    respond(res, page(ctx, { title: 'Unsubscribed', noindex: true, path: '/unfollow', body: html`<section class="section"><div class="wrap narrow">
      <h1 class="chrome">${a ? 'You’re unsubscribed' : 'Link not recognised'}</h1>
      <p>${a ? `You won’t get any more emails about ${a.name}.` : 'That unsubscribe link isn’t valid. If you keep getting emails, reply to one and we’ll take you off.'}</p></div></section>` }));
  };
  r.get('/unfollow', unfollow);
  r.post('/unfollow', unfollow); // List-Unsubscribe one-click
}

// ---------------- home: tailored to who the visitor is ----------------
function home(ctx, d, req) {
  const c = ctx.content;
  const p = pathwayOf(ctx, req);
  const up = c.upcoming(ctx.today());
  const next = up[0];
  const fest = c.festivals.find((f) => f.dates && f.dates.to >= ctx.today());
  const legends = c.artists.filter((a) => a.legend).slice(0, 12);
  const md = ctx.today().slice(5);
  const onThisDay = c.past.filter((e) => e.date.slice(5) === md).slice(0, 4);
  const avail = (n) => d.tickets.nightAvailability(n);
  const forYou = p ? c.nightsForPathway(p, ctx.today()).slice(0, 4) : [];
  const S = {
    forYou: p && forYou.length ? html`<section class="section"><div class="wrap"><div class="head"><div><div class="label">${p.who}</div><h2 class="chrome gold">Picked for you</h2></div><a class="more" href="/for/${p.slug}">Your TAM →</a></div>
      <div class="nights-grid">${forYou.map((n) => nightCard(ctx, n, avail(n)))}</div></div></section>` : '',
    steps: p ? html`<section class="section"><div class="wrap"><div class="head"><div><div class="label">${p.who}</div><h2 class="chrome">${p.title}</h2></div><a class="more" href="/for/${p.slug}">Everything for you →</a></div>
      <div class="steps">${p.steps.slice(0, 4).map((s, i) => html`<a class="step-card" href="${s.link.startsWith('#') ? `/for/${p.slug}${s.link}` : s.link}"><span class="step-n">${i + 1}</span><h3>${s.title}</h3><p>${s.text}</p><span class="more">${s.label} →</span></a>`)}</div></div></section>` : '',
    fest: fest ? html`<section class="section fest-banner theme-${fest.theme}"><div class="wrap fb-in">
      <div>${fest.lockup ? html`<img class="lockup" src="${fest.lockup}" alt="${fest.name}">` : html`<h2 class="chrome gold">${fest.name}</h2>`}
        <p class="label">${fest.season}</p><p>${fest.lede}</p>
        <div class="ctas"><a class="btn hot" href="${fest.path}">Explore the festival</a><a class="btn ghost" href="${fest.path}#book">Get tickets</a></div></div>
      ${fest.heroArt ? html`<img class="fb-art" src="${fest.heroArt}" alt="" loading="lazy">` : ''}</div></section>` : '',
    upcoming: html`<section class="section"><div class="wrap">
      <div class="head"><h2 class="chrome">Coming up</h2><a class="more" href="/whats-on">Everything on →</a></div>
      ${up.length ? html`<div class="nights-grid">${up.slice(0, 8).map((n) => nightCard(ctx, n, avail(n)))}</div>` : html`<p class="muted">New nights are announced soon.</p>`}</div></section>`,
    legends: legends.length ? html`<section class="section"><div class="wrap">
      <div class="head"><div><div class="label">They played TAM</div><h2 class="chrome gold">Cult legends</h2></div><a class="more" href="/artists">All artists →</a></div>
      <div class="chips">${legends.map((a) => artistChip(a))}</div></div></section>` : '',
    tv: html`<section class="section"><div class="wrap"><div class="head"><h2 class="chrome red">TAM TV</h2><a class="more" href="/tv">All films →</a></div>
      <div class="yt-grid">${c.videos.slice(0, 3).map(youtubeThumb)}</div></div></section>`,
    onThisDay: onThisDay.length ? html`<section class="section"><div class="wrap"><div class="head"><h2 class="chrome">On this day at TAM</h2></div>
      <ul class="plain">${onThisDay.map((e) => html`<li><a href="/archive/night/${e.slug}">${e.title}</a> <span class="muted">· ${e.year}</span></li>`)}</ul>
      <p class="small muted">From TAM's Eventbrite listings, which miss some nights.</p></div></section>` : '',
    visit: visitSection(ctx),
  };
  const ORDER = {
    'live-music': ['forYou', 'fest', 'upcoming', 'legends', 'tv', 'onThisDay', 'visit'],
    musician: ['steps', 'forYou', 'tv', 'legends', 'upcoming', 'visit'],
    'venue-hire': ['steps', 'tv', 'upcoming', 'visit'],
    party: ['steps', 'forYou', 'fest', 'upcoming', 'visit'],
    brand: ['steps', 'fest', 'tv', 'legends', 'visit'],
  }[p && p.slug] || ['fest', 'upcoming', 'legends', 'tv', 'onThisDay', 'visit'];
  const questions = p ? p.questions : ['What’s on this weekend?', 'I’m a musician: how do I play here?', 'Can I hire the venue?', 'Christmas party for 12?'];
  return page(ctx, {
    path: '/', ambient: 'stars', song: c.site.song, og: '/img/og.jpg', pathway: p,
    jsonLd: venueLd(ctx), // address, opening hours (Mondays closed), how to book: for search and AI assistants
    body: html`
<section class="hero home-hero" aria-labelledby="hero-title">
  <div class="wrap">
    <div class="hero-copy">
      <div class="label">Temple of Art and Music · Elephant &amp; Castle</div>
      <h1 id="hero-title" class="chrome gold">${p ? html`Welcome back.<br>${p.title}` : html`What brings you to TAM?`}</h1>
      <p class="lede">${p ? p.promise : html`Live music six nights a week, a stage for new artists and cult legends, and a room you can make your own. Tell us who you are, or just ask.`}</p>
      ${next ? html`<p class="next">Next at TAM: <a href="/events/${next.slug}"><b>${next.label || next.title}</b> · ${when(next)}</a></p>${countdown(next)}` : ''}
    </div>
    <div class="home-ask">${askTitle('Your guide to nights, gigs, hire and parties')}${chatPanel(questions, p, { id: 'home', placeholder: 'e.g. Something bluesy on a Friday, under £20' })}</div>
  </div>
  <div class="wrap">${pathwayTiles(ctx, p)}${p ? html`<p class="small"><button type="button" class="linkish" data-forget-path>Not you? Choose again</button></p>` : ''}</div>
</section>
${ticker(c.site.ticker || [])}
${ORDER.map((k) => S[k])}`,
  });
}

// ---------------- what's on ----------------
function whatsOn(ctx, d) {
  const c = ctx.content;
  const up = c.upcoming(ctx.today());
  const months = [...new Set(up.map((n) => `${n.month} ${n.year}`))];
  return page(ctx, {
    title: 'What’s on', path: '/whats-on', scripts: ['/js/festival.js'],
    jsonLd: { '@context': 'https://schema.org', '@type': 'ItemList', name: 'What’s on at TAM', numberOfItems: up.length,
      itemListElement: up.slice(0, 60).map((n, i) => ({ '@type': 'ListItem', position: i + 1, item: eventLd(ctx, n, d) })) },
    description: 'Upcoming nights at the Temple of Art and Music, Elephant & Castle: live music, festivals and tickets.',
    data: { booking: bookingData(ctx, up, null) },
    body: html`<section class="section"><div class="wrap">
  <div class="label">Temple of Art and Music</div><h1 class="chrome gold">What’s on</h1>
  ${fridayTile(ctx)}
  ${up.length ? months.map((m) => html`<h2 class="month">${m}</h2><div class="nights-grid">${up.filter((n) => `${n.month} ${n.year}` === m).map((n) => nightCard(ctx, n, d.tickets.nightAvailability(n)))}</div>`)
    : html`<p>New nights are announced soon. <a href="/archive">See past nights</a>.</p>`}
</div></section>
${bookingSection(ctx, { nights: up, festival: null, heading: 'Book any night', intro: 'Every night sold here is sold by TAM itself.' })}`,
  });
}

function festivalsIndex(ctx) {
  const c = ctx.content;
  const old = c.legacyBy.get('/festivals');
  return page(ctx, {
    title: 'Festivals', path: '/festivals',
    body: html`<section class="section"><div class="wrap"><h1 class="chrome gold">Festivals</h1>
  <div class="fest-list">${c.festivals.map((f) => html`<a class="fest-tile theme-${f.theme}" href="${f.path}">${f.lockup ? html`<img src="${f.lockup}" alt="${f.name}">` : html`<h2>${f.name}</h2>`}<p class="label">${f.season}</p><p>${f.lede}</p></a>`)}</div>
  ${old ? legacyBlocks(old) : ''}</div></section>`,
  });
}

// ---------------- a festival ----------------
function festivalPage(ctx, d, f) {
  const c = ctx.content;
  const nights = c.nightsFor(f.slug);
  const opening = nights[0];
  const nav = [['#programme', 'Programme', f.programme], ['#book', 'Tickets', 1], ['#teams', 'Team Tables', f.features.teamTables], ['#wall', 'Party Wall', f.features.partyWall], ['#sponsor', 'Sponsor', f.features.sponsorship], ['#visit', 'Visit', 1]].filter((x) => x[2]);
  const past = c.pastForFestival(f).slice(0, 24);
  const collection = f.collection ? c.collectionBy.get(f.collection) : null;
  return page(ctx, {
    title: f.name, path: f.path, theme: themeOf(f), ambient: ambientOf(f), song: songOf(ctx, f), festival: f, og: f.og,
    description: `${f.name}: ${f.lede}`, scripts: featureScripts(f),
    data: { booking: bookingData(ctx, nights, f), festival: festivalClient(ctx, f) },
    jsonLd: { '@context': 'https://schema.org', '@type': 'Festival', name: f.name, startDate: f.dates?.from, endDate: f.dates?.to, url: `${ctx.cfg.siteUrl}${f.path}`, subEvent: nights.filter((n) => n.handmade).map((n) => eventLd(ctx, n, d)) },
    body: html`
<nav class="subnav" aria-label="Sections"><div class="wrap">${nav.map(([h, t]) => html`<a href="${h}">${t}</a>`)}</div></nav>
<section class="hero fest-hero" aria-labelledby="hero-title">
  <div class="wrap">
    <div class="hero-copy">
      <div class="label">${f.label || f.season}</div>
      <h1 id="hero-title" class="flush">${f.lockup ? html`<img class="lockup" src="${f.lockup}" alt="${f.name}">` : html`<span class="chrome gold mega">${f.name}</span>`}</h1>
      ${f.dates ? html`<div class="meta"><span>${dateParts(f.dates.from).day} – ${dateParts(f.dates.to).day} ${dateParts(f.dates.to).month.toUpperCase()} ${dateParts(f.dates.to).year}</span><span>${nights.filter((n) => n.sale).length} NIGHTS</span><span>${(c.venueBy.get(f.venue)?.name || 'TAM').toUpperCase()}</span></div>` : ''}
      <p class="lede">${f.lede}</p>
      <div class="ctas"><a class="btn hot" href="#book">Get tickets</a>${f.song ? html`<a class="btn ghost" href="#song">Hear the song</a>` : ''}</div>
      ${f.features.countdown && opening ? countdown(opening, { link: `${opening.label || opening.title} · ${when(opening)} →` }) : ''}
      ${f.home ? html`<p class="fest-home">The festival’s home is <a href="${f.home.url}">${f.home.url.replace('https://', '')}</a>: <a href="${f.home.next}">get first news of next Christmas</a>, or see <a href="${f.home.past}">every Christmas at TAM</a>.</p>` : ''}
    </div>
    ${f.heroArt ? html`<div class="tree" aria-hidden="true"><img src="${f.heroArt}" alt="" width="720" height="1490"><span class="glint" style="left:48%;top:12%"></span><span class="glint" style="left:30%;top:56%;animation-delay:.9s"></span><span class="glint" style="left:64%;top:40%;animation-delay:1.5s"></span></div>` : ''}
  </div>
</section>
${f.ticker ? ticker(f.ticker) : ''}
${songSection(ctx, f)}
${programmeSection(f)}
${nights.some((n) => n.handmade) ? html`<section class="section"><div class="wrap"><div class="head"><h2 class="chrome gold">Headline nights</h2></div>
  <div class="nights-grid">${nights.filter((n) => n.handmade).map((n) => nightCard(ctx, n, d.tickets.nightAvailability(n)))}</div></div></section>` : ''}
${f.dates ? datesSection(ctx, f) : ''}
${charitySection(f)}
${bookingSection(ctx, { nights, festival: f, intro: priceIntro(f) })}
${teamTablesSection(f)}
${wallSection(f)}
${sponsorSection(ctx, f)}
${collection ? html`<section class="section"><div class="wrap narrow"><div class="label">Signed and numbered</div><h2 class="chrome gold">${collection.name}</h2><p>${collection.blurb}</p><a class="btn hot" href="/collections/${collection.slug}">See the collection</a></div></section>` : ''}
${past.length ? html`<section class="section"><div class="wrap"><div class="head"><h2 class="chrome">${f.claims ? 'Past Decembers at TAM' : 'Before at TAM'}</h2></div>
  <ul class="plain cols">${past.map((e) => html`<li><a href="/archive/night/${e.slug}">${e.title}</a> <span class="muted">· ${e.year}</span></li>`)}</ul>
  <p class="small muted">From TAM's schedule and Eventbrite listings.</p></div></section>` : ''}
${c.legacyBy.get(f.path) ? html`<section class="section"><div class="wrap narrow legacy"><h2 class="label">From the old TAM site</h2>${legacyBlocks(c.legacyBy.get(f.path))}</div></section>` : ''}
${visitSection(ctx, f.venue)}`,
  });
}

function priceIntro(f) {
  const p = f.pricing || {};
  const bits = [];
  if (p.flat) bits.push(`Most nights are just ${pounds(p.flat.price)} a ticket.`);
  if ((p.groupTiers || []).length) bits.push('On standard-priced nights, groups pay less per head');
  if ((p.packs || []).length) bits[bits.length - 1] += ` and ${p.packs.map((x) => x.name.toLowerCase()).join(', ')}s are cheaper still.`;
  else if ((p.groupTiers || []).length) bits[bits.length - 1] += '.';
  return bits.join(' ');
}

// What the festival scripts need in the browser.
function festivalClient(ctx, f) {
  const story = f.song && f.song.stories ? ctx.content.storyBy.get(f.song.stories) : null;
  return {
    slug: f.slug, path: f.path, features: f.features, song: f.song || null, cards: f.cards || null,
    stories: story ? story.id : null, // loaded on demand from /api/stories/:id
    polaroids: f.cards && f.cards.polaroids ? ctx.content.polaroids : [],
  };
}

// ---------------- a night ----------------
function eventPage(ctx, d, n, url) {
  const c = ctx.content;
  const f = n.festival ? c.festivalBy.get(n.festival) : null;
  const v = c.venueBy.get(n.venue);
  const artists = n.artists.map((s) => c.artistBy.get(s));
  const via = url.searchParams.get('via') || '';
  const invites = f && f.features.invites ? c.invites.filter((i) => i.event === n.slug) : [];
  const isPast = n.end <= new Date(ctx.now()).toISOString();
  const col = n.collection ? c.collectionBy.get(n.collection) : null;
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(n.title)}&dates=${n.timesTbc ? `${n.date.replace(/-/g, '')}/${n.date.replace(/-/g, '')}` : `${n.start.replace(/[-:]/g, '').slice(0, 15)}Z/${n.end.replace(/[-:]/g, '').slice(0, 15)}Z`}&location=${encodeURIComponent(v ? `${v.name}, ${v.address}` : 'TAM')}&details=${encodeURIComponent(`${ctx.cfg.siteUrl}/events/${n.slug}`)}`;
  return page(ctx, {
    title: `${n.title} · ${when(n)}`, path: `/events/${n.slug}`, theme: themeOf(f), ambient: ambientOf(f), song: songOf(ctx, f), festival: f,
    og: n.image, description: n.summary || `${n.title} at TAM, ${longDate(n.date)}.`, jsonLd: eventLd(ctx, n, d),
    scripts: ['/js/festival.js'],
    data: { booking: { ...bookingData(ctx, [n], f), preselect: n.slug, via }, festival: f ? { slug: f.slug, features: f.features, song: f.song ? { bpm: f.song.bpm, bars: f.song.bars } : null } : null, night: n.slug },
    body: html`
<section class="hero ev-hero"><div class="wrap ev-in">
  <div class="hero-copy">
    ${f ? html`<a class="label" href="${f.path}">${f.name}</a>` : html`<div class="label">Temple of Art and Music</div>`}
    <h1 class="chrome gold">${n.title}</h1>
    ${n.presenters ? html`<p class="presenters">${n.presenters}</p>` : ''}
    <div class="meta"><span>${longDate(n.date).toUpperCase()}</span><span>${times(n).toUpperCase()}</span><span>${(v ? v.name : 'TAM').toUpperCase()}</span></div>
    ${n.summary ? html`<p class="lede">${n.summary}</p>` : ''}
    <div class="ctas">${!isPast && n.sale ? html`<a class="btn hot" href="#book">Get tickets</a>` : n.url ? html`<a class="btn hot" href="${n.url}" target="_blank" rel="noopener">${n.eventbrite && n.eventbrite.soldOut ? 'Sold out · join the waitlist on Eventbrite ↗' : n.eventbrite && n.eventbrite.free ? 'Free entry · reserve on Eventbrite ↗' : `Tickets on Eventbrite${n.eventbrite && Number.isFinite(n.eventbrite.from) ? ` · from ${pounds(n.eventbrite.from)}` : ''} ↗`}</a>${n.eventbrite && n.eventbrite.tickets && n.eventbrite.tickets.length ? html`<a class="btn ghost" href="#tickets">Ticket types</a>` : ''}` : ''}
      ${!f && n.weekday === 'Friday' && friday(ctx) ? html`<a class="btn ghost fri-btn" href="${fridayUrl(ctx, 'event')}" target="_blank" rel="noopener">On ${friday(ctx).name} ↗</a>` : ''}
      ${/blues jam/i.test(n.title) ? html`<a class="btn ghost" href="/great-british-blues-jam#jam">Sign up to jam →</a>` : ''}
      <a class="btn ghost" href="${gcal}" target="_blank" rel="noopener">Add to Google Calendar</a><a class="btn ghost" href="/events/${n.slug}.ics">Apple / Outlook (.ics)</a></div>
    ${f && f.features.countdown && !isPast ? countdown(n) : ''}
  </div>
  ${n.image ? html`<img class="ev-art" src="${n.image}" alt="" loading="lazy">` : ''}
</div></section>
${!isPast ? ebTickets(n) : ''}
${n.description ? html`<section class="section"><div class="wrap narrow prose">${n.description.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div></section>` : ''}
${!artists.length && ((n.lineup || []).length || n.lineupHidden) ? html`<section class="section" id="lineup"><div class="wrap"><div class="head"><h2 class="chrome">The line-up</h2></div>
  <ul class="show-lineup">${(n.lineup || []).map((x) => html`<li><b>${x.name}</b>${x.role ? html`<span class="muted">${x.role}</span>` : ''}</li>`)}${n.lineupHidden ? html`<li class="soon"><b>+ ${n.lineupHidden} to be revealed</b><span class="muted">Watch this space</span></li>` : ''}</ul></div></section>` : ''}
${artists.length ? html`<section class="section" id="lineup"><div class="wrap"><div class="head"><h2 class="chrome">The line-up</h2></div>
  <div class="lineup">${artists.map((a) => html`<article class="artist-card">${a.photo ? html`<img src="${a.photo}" alt="" loading="lazy">` : ''}<h3><a href="/artists/${a.slug}">${a.name}</a></h3>${a.role ? html`<p class="muted">${a.role}</p>` : ''}
    ${invites.some((i) => i.id === a.invite || i.artist === a.slug) ? html`<button class="btn ghost small" type="button" data-invite="${(invites.find((i) => i.id === a.invite) || invites.find((i) => i.artist === a.slug)).id}">Invite a friend</button>` : ''}</article>`)}</div></div></section>` : ''}
${(n.programme || []).length ? html`<section class="section" id="programme"><div class="wrap narrow"><h2 class="chrome">On the night</h2>
  <ol class="schedule">${n.programme.map((x) => html`<li><b>${x.time || '✦'}</b><span>${x.url ? html`<a href="${x.url}" target="_blank" rel="noopener">${x.title}</a>` : x.title}${x.host ? ` · hosted by ${x.host}` : ''}${x.eventbrite ? html` <span class="muted">· ${listingPrice(x.eventbrite)} on Eventbrite</span>` : ''}</span></li>`)}</ol></div></section>` : ''}
${n.schedule.length ? html`<section class="section" id="running-order"><div class="wrap narrow"><h2 class="chrome">Running order</h2>
  <ol class="schedule">${n.schedule.map(([t, s]) => html`<li><b>${t}</b><span>${s}</span></li>`)}</ol></div></section>` : ''}
${invites.length && !isPast ? html`<section class="section" id="invite"><div class="wrap"><div class="head"><div><div class="label">Bring someone</div><h2 class="chrome red">Invite a friend</h2></div><p class="intro">Send a personal invitation card. It opens with your note and a link to tickets.</p></div>
  <div class="invite-grid">${invites.slice(0, 24).map((i) => html`<button class="invite-tile" type="button" data-invite="${i.id}"><img src="${i.photo}" alt="" loading="lazy"><span>${i.fan ? `Invite ${i.fan}` : i.name}</span></button>`)}</div></div></section>` : ''}
${!isPast ? bookingSection(ctx, { nights: [n], festival: f, single: true, heading: n.sale && n.sale.mode === 'own' ? 'Tickets' : `Book ${when(n)}` }) : ''}
${f && !isPast ? teamTablesSection(f, { night: n.slug }) : ''}
${col ? html`<section class="section"><div class="wrap narrow"><div class="label">Signed and numbered</div><h2 class="chrome gold">${col.name}</h2><p>${col.blurb}</p><a class="btn hot" href="/collections/${col.slug}">See the collection</a></div></section>` : ''}
${isPast ? html`<section class="section"><div class="wrap narrow"><h2 class="chrome">Were you there?</h2><button class="btn hot" type="button" data-demand="was-there" data-target="${n.slug}">I was there</button></div></section>` : ''}
${visitSection(ctx, n.venue)}
<dialog class="invite-dialog" id="invite-dialog"><form method="dialog" class="formbox" id="invite-form">
  <h3>Send an invitation</h3>
  <div class="fields"><label class="field"><span>To</span><input name="to" maxlength="40"></label><label class="field"><span>From</span><input name="from" maxlength="40"></label>
  <label class="field full"><span>A note (optional)</span><input name="m" maxlength="140"></label></div>
  <div class="card-link"><input id="invite-link" readonly aria-label="Invitation link"><button class="btn ghost" type="button" data-copy="#invite-link">Copy</button></div>
  <div class="row-btn"><a class="btn hot" id="invite-wa" target="_blank" rel="noopener">WhatsApp</a><button class="btn ghost" type="button" id="invite-share" hidden>Share</button><button class="btn ghost" value="close">Close</button></div>
</form></dialog>`,
  });
}

// ---------------- artists ----------------
function artistsIndex(ctx) {
  const c = ctx.content;
  const legends = c.artists.filter((a) => a.legend);
  const letters = [...new Set(c.artists.map((a) => a.name[0].toUpperCase()))].sort();
  return page(ctx, {
    title: 'Artists', path: '/artists', description: 'Everyone who has played the Temple of Art and Music: cult legends, regulars and the next wave.',
    body: html`<section class="section"><div class="wrap">
  <h1 class="chrome gold">Artists</h1>
  <h2 class="label">Cult legends</h2><div class="chips">${legends.map((a) => artistChip(a))}</div>
  <nav class="az" aria-label="A to Z">${letters.map((l) => html`<a href="#l-${l}">${l}</a>`)}</nav>
  ${letters.map((l) => html`<h2 class="month" id="l-${l}">${l}</h2><ul class="plain cols">${c.artists.filter((a) => a.name[0].toUpperCase() === l).map((a) => html`<li><a href="/artists/${a.slug}">${a.name}</a>${a.legend ? html` <span class="badge">Cult legend</span>` : ''}</li>`)}</ul>`)}
  <p class="small muted">Artists are matched to TAM's Eventbrite listings, which miss some nights.</p>
</div></section>`,
  });
}

function artistPage(ctx, a) {
  const c = ctx.content;
  const { upcoming, past } = c.artistNights(a.slug);
  const old = c.legacyBy.get(`/artists/${a.slug}`);
  const films = c.videosFor(a.slug);
  return page(ctx, {
    title: a.name, path: `/artists/${a.slug}`, og: a.photo || '/img/og.jpg', scripts: ['/js/festival.js'],
    description: a.bio[0] || `${a.name} at the Temple of Art and Music.`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'MusicGroup', name: a.name, url: `${ctx.cfg.siteUrl}/artists/${a.slug}`, image: a.photo ? `${ctx.cfg.siteUrl}${a.photo}` : undefined,
      ...(a.bio[0] ? { description: a.bio[0] } : {}), ...(a.links.length ? { sameAs: a.links.filter((l) => /^https?:/.test(l.url)).map((l) => l.url).filter((u, i, all) => all.indexOf(u) === i) } : {}) },
    body: html`<section class="section artist-hero"><div class="wrap ev-in">
  <div>
    <div class="label">${a.role || 'Artist at TAM'}</div>
    <h1 class="chrome gold">${a.name}</h1>
    ${a.legend ? html`<p><span class="badge">Cult legend</span></p>` : ''}
    ${a.bio.map((p) => html`<p>${p}</p>`)}
    ${a.links.length ? html`<p>${a.links.map((l) => html`<a class="btn ghost small" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a> `)}</p>` : ''}
  </div>
  ${a.photo ? html`<img class="ev-art" src="${a.photo}" alt="${a.name}">` : ''}
</div></section>
${(a.gallery || []).length ? html`<section class="section"><div class="wrap"><div class="artist-gallery">${a.gallery.map((g) => html`<figure><img src="${g.src}" alt="${g.alt}" loading="lazy"></figure>`)}</div>
  ${a.credit ? html`<p class="small muted">${a.credit}</p>` : ''}</div></section>` : ''}
${a.slug === 'mazza' ? html`<section class="section"><div class="wrap narrow"><p class="lede">Catch MAZZA hosting <a href="/great-british-blues-jam">The Great British Blues Jam</a> at TAM every Saturday from 4pm, and sign up to jam with him and the house band.</p></div></section>` : ''}
${upcoming.length ? html`<section class="section"><div class="wrap"><h2 class="chrome">Next at TAM</h2><div class="nights-grid">${upcoming.map((n) => html`<article class="night-card"><a href="/events/${n.slug}?via=${a.slug}#book"><div class="nc-date"><b>${n.day}</b><span>${n.month.slice(0, 3)}</span></div><div class="nc-body"><h3>${n.title}</h3><p class="muted">${times(n)}</p><p class="price">Book →</p></div></a></article>`)}</div></div></section>` : ''}
<section class="section"><div class="wrap narrow">
  <form class="formbox" id="follow-form" data-artist="${a.slug}" novalidate>
    <h3>Follow ${a.name}</h3><p>Get an email when ${a.name} plays TAM. No spam, unsubscribe in one click.</p>
    <div class="fields"><label class="field"><span>Name</span><input name="name" maxlength="80" autocomplete="name"></label><label class="field"><span>Email</span><input name="email" type="email" required maxlength="200" autocomplete="email"></label>
    <label class="check full"><input type="checkbox" name="consent"> Yes, email me about ${a.name}’s gigs and news from TAM. <a href="/privacy">Privacy</a></label></div>
    <button class="btn hot" type="submit">Follow</button><p class="err" role="status" aria-live="polite"></p>
  </form>
  ${!upcoming.length ? html`<p><button class="btn ghost" type="button" data-demand="bring-back" data-target="${a.slug}">Bring ${a.name} back to TAM</button></p>` : ''}
</div></section>
${films.length ? html`<section class="section"><div class="wrap"><h2 class="chrome red">On TAM TV</h2><div class="yt-grid">${films.map(youtubeThumb)}</div></div></section>` : ''}
${past.length ? html`<section class="section"><div class="wrap"><h2 class="chrome">Nights at TAM</h2>
  <ul class="plain cols">${past.map((e) => html`<li><a href="/archive/night/${e.slug}">${e.title}</a> <span class="muted">· ${e.day} ${e.month.slice(0, 3)} ${e.year}</span></li>`)}</ul>
  <p class="small muted">From TAM's Eventbrite listings, which miss some nights.</p></div></section>` : ''}
${old ? html`<section class="section"><div class="wrap narrow"><h2 class="label">From the old TAM site</h2>${legacyBlocks(old)}</div></section>` : ''}`,
  });
}

// ---------------- archive ----------------
function archiveIndex(ctx) {
  const years = [...new Set(ctx.content.past.map((e) => e.year))].sort((a, b) => b - a);
  return page(ctx, {
    title: 'Archive', path: '/archive', description: 'Past nights at the Temple of Art and Music, from TAM’s Eventbrite listings.',
    body: html`<section class="section"><div class="wrap"><h1 class="chrome gold">The archive</h1>
  <p>Past nights at TAM, year by year. They come from TAM's Eventbrite listings, which miss some nights.</p>
  <div class="year-grid">${years.map((y) => html`<a class="year" href="/archive/${y}">${y}</a>`)}</div></div></section>`,
  });
}
function archiveYear(ctx, year) {
  const list = ctx.content.past.filter((e) => String(e.year) === year);
  if (!list.length) throw fail(404, 'No nights that year.');
  const months = [...new Set(list.map((e) => e.month))];
  return page(ctx, {
    title: `${year} at TAM`, path: `/archive/${year}`,
    body: html`<section class="section"><div class="wrap"><a class="label" href="/archive">The archive</a><h1 class="chrome gold">${year}</h1>
  ${months.map((m) => html`<h2 class="month">${m}</h2><ul class="plain">${list.filter((e) => e.month === m).map((e) => html`<li><span class="muted">${e.day} ·</span> <a href="/archive/night/${e.slug}">${e.title}</a></li>`)}</ul>`)}</div></section>`,
  });
}
function archiveNight(ctx, e) {
  const c = ctx.content;
  const v = c.venueBy.get(e.venue);
  return page(ctx, {
    title: `${e.title} · ${e.day} ${e.month} ${e.year}`, path: `/archive/night/${e.slug}`, scripts: ['/js/festival.js'],
    body: html`<section class="section"><div class="wrap ev-in"><div>
  <a class="label" href="/archive/${e.year}">${e.year} at TAM</a><h1 class="chrome gold">${e.title}</h1>
  <div class="meta"><span>${longDate(e.date).toUpperCase()}</span>${e.time ? html`<span>${e.time}</span>` : ''}<span>${(v ? v.name : 'TAM').toUpperCase()}</span></div>
  ${(e.performers || []).length ? html`<div class="chips">${e.performers.map((s) => c.artistBy.get(s)).filter(Boolean).map((a) => artistChip(a))}</div>` : ''}
  <p><button class="btn hot" type="button" data-demand="was-there" data-target="${e.slug}">I was there</button> ${e.url ? html`<a class="btn ghost" href="${e.url}" target="_blank" rel="noopener">On Eventbrite ↗</a>` : ''}</p>
  </div>${e.image ? html`<img class="ev-art" src="${e.image}" alt="" loading="lazy">` : ''}</div></section>`,
  });
}

function tv(ctx) {
  const { videos, site } = ctx.content;
  return page(ctx, {
    title: 'TAM TV', path: '/tv', description: 'Films from the Temple of Art and Music: live performances, interviews and shows.', scripts: ['/js/festival.js'],
    body: html`<section class="section"><div class="wrap"><h1 class="chrome red">TAM TV</h1>
  <p>Live from the room. More on <a href="${site.socials.youtube}" target="_blank" rel="noopener">TAM's YouTube channel ↗</a>.</p>
  <div class="yt-grid">${videos.map(youtubeThumb)}</div></div></section>`,
  });
}

// ---------------- cards and invitations ----------------
function cardPage(ctx, card) {
  const c = ctx.content;
  const f = c.festivalBy.get(card.festival);
  const greeting = card.to ? `For ${card.to}` : `A card from ${f.name}`;
  return page(ctx, {
    title: card.from ? `${card.from} sent you a card` : greeting, path: `/card/${card.id}`, noindex: true, theme: themeOf(f), ambient: ambientOf(f),
    description: `${card.from || 'Someone'} made you a card from ${f.song ? `“${f.song.title}”` : f.name}. Open it.`,
    og: (card.polaroids[0] && c.polaroids.find((p) => p.id === card.polaroids[0])?.src) || card.photos[0] || f.og,
    scripts: ['/js/song.js'], data: { festival: festivalClient(ctx, f), card },
    body: html`<section class="section card-view"><div class="wrap narrow">
  <button class="envelope" type="button" id="envelope" aria-label="Open the card"><span class="env-to">${greeting}</span><span class="env-seal">TAM</span><span class="env-tap">Tap to open</span></button>
  <div class="card-inside" id="card-inside" hidden>
    <div class="vid" id="vidbox" data-youtube="${f.song ? f.song.youtubeId : ''}"><div class="xvideo"><div id="trailer-player"></div></div><div class="storybook" id="storybook" aria-live="polite"></div><div class="fx-layer" id="fx-layer" aria-hidden="true"></div></div>
    <div class="card-msg"><p class="hand">${card.text || f.cards?.placeholder || ''}</p>${card.from ? html`<p class="hand from">— ${card.from}</p>` : ''}</div>
    <div class="ctas"><a class="btn hot" href="${f.path}#book">Come to ${f.name}</a><a class="btn ghost" href="${f.path}#song">Make your own card</a></div>
  </div>
</div></section>`,
  });
}

function invitePage(ctx, d, inv, url) {
  const c = ctx.content;
  const n = c.nightBy.get(inv.event);
  const f = n.festival ? c.festivalBy.get(n.festival) : null;
  const to = (url.searchParams.get('to') || '').slice(0, 40), from = (url.searchParams.get('from') || '').slice(0, 40), m = (url.searchParams.get('m') || '').slice(0, 140);
  const avail = d.tickets.nightAvailability(n);
  return page(ctx, {
    title: `${inv.fan ? `For ${inv.fan}: ` : ''}${n.title}`, path: `/invite/${inv.id}`, theme: themeOf(f), ambient: ambientOf(f), festival: f,
    og: inv.preview || inv.photo, description: `${inv.line} ${n.title}, ${when(n)} at TAM.`,
    body: html`<section class="section invite-view"><div class="wrap narrow">
  <article class="invite-card">
    <img src="${inv.photo}" alt="" class="${inv.polaroid ? 'polaroid' : ''}">
    <div>
      ${to ? html`<p class="hand">Dear ${to},</p>` : ''}
      <div class="label">${inv.role || 'You’re invited'}</div>
      <h1 class="chrome gold">${inv.name}</h1>
      <p>${inv.line}</p>
      ${m ? html`<p class="hand">“${m}”${from ? html` — ${from}` : ''}</p>` : from ? html`<p class="hand">— ${from}</p>` : ''}
      <p class="meta"><span>${n.title.toUpperCase()}</span><span>${when(n).toUpperCase()}</span><span>${times(n).toUpperCase()}</span></p>
      <div class="ctas"><a class="btn hot" href="/events/${n.slug}?via=${inv.id}#book">Get tickets${avail.from !== null ? ` · from ${pounds(avail.from)}` : ''}</a>
        ${inv.artist ? html`<a class="btn ghost" href="/artists/${inv.artist}?via=${inv.id}">Meet ${c.artistBy.get(inv.artist).name}</a>` : ''}</div>
    </div>
  </article>
</div></section>`,
  });
}

// ---------------- tickets ----------------
function ticketPage(ctx, d, b, req) {
  const c = ctx.content;
  const n = c.nightBy.get(b.night);
  const k = d.tickets.ticketKey(b.id);
  const staff = ctx.isDoor(req);
  const status = { paid: 'Paid', reserved: ctx.stripe.enabled ? 'Reserved: pay online below' : 'Reserved: we’ll send an invoice', processing: 'Payment processing', awaiting_payment: 'Awaiting payment', cancelled: 'Cancelled' }[b.status] || b.status;
  return page(ctx, {
    title: `Ticket ${b.id}`, path: `/ticket/${b.id}`, noindex: true, ambient: null, scripts: staff ? ['/js/door.js'] : [],
    data: staff ? { door: { ref: b.id, k } } : null,
    body: html`<section class="section"><div class="wrap narrow ticket">
  ${staff ? html`<div id="door-panel" class="door-panel"></div>` : ''}
  <div class="label">Your ticket</div><h1 class="chrome gold">${n.title}</h1>
  <p class="meta"><span>${longDate(n.date).toUpperCase()}</span><span>${times(n).toUpperCase()}</span></p>
  <img class="qr" src="/ticket/${b.id}/qr.svg?k=${k}" alt="QR code for booking ${b.id}" width="260" height="260">
  <dl class="tdl"><dt>Reference</dt><dd>${b.id}</dd><dt>Name</dt><dd>${b.name}</dd><dt>Tickets</dt><dd>${b.qty} × ${b.ticketName || 'Ticket'}</dd>
    ${b.teamName ? html`<dt>Team</dt><dd>${b.teamName}</dd>` : ''}<dt>Total</dt><dd>${pounds(b.total)}${b.donation ? ` (incl. ${pounds(b.donation)} donation)` : ''}</dd><dt>Status</dt><dd>${status}</dd></dl>
  ${b.status === 'reserved' && ctx.stripe.enabled ? html`<p><a class="btn hot" href="${d.tickets.payPath(b)}">Pay now</a></p>` : ''}
  <p class="small muted">Show this page (or its QR code) at the door. Keep the link: it's your ticket.</p>
</div></section>`,
  });
}

function collectionPage(ctx, d, col) {
  const a = col.artist ? ctx.content.artistBy.get(col.artist) : null;
  const left = d.collections.left(col);
  return page(ctx, {
    title: col.name, path: `/collections/${col.slug}`, scripts: ['/js/collection.js'], data: { collection: col, left, payments: ctx.stripe.enabled ? 'card' : 'invoice' },
    description: col.blurb,
    body: html`<section class="section"><div class="wrap">
  <div class="label">${a ? a.name : 'TAM'} · signed and numbered</div><h1 class="chrome gold">${col.name}</h1><p class="lede">${col.blurb}</p>
  <form class="formbox" id="order-form" novalidate>
    <div class="books">${col.items.map((it) => html`<article class="book"><img src="${it.cover}" alt="${it.title}" loading="lazy"><div><div class="label">${it.kind || ''}</div><h3>${it.title}</h3><p class="muted">${it.publisher || ''}</p><p>${it.blurb}</p>
      <p class="price">${pounds(it.price)} · <span class="muted">${left[it.id]} of ${col.size} left</span></p>
      <label class="field"><span>Copies</span><input type="number" name="item-${it.id}" min="0" max="${col.maxEach || 4}" value="0" inputmode="numeric"></label></div></article>`)}</div>
    <fieldset class="step"><legend>Delivery</legend><label class="opt"><input type="radio" name="delivery" value="collect" checked><span>Collect at TAM<small>Free, on any night.</small></span></label>
      <label class="opt"><input type="radio" name="delivery" value="post"><span>UK post<small>${pounds(col.postage || 0)} per order.</small></span></label></fieldset>
    <div class="fields"><label class="field"><span>Name</span><input name="name" required maxlength="80" autocomplete="name"></label><label class="field"><span>Email</span><input name="email" type="email" required maxlength="200" autocomplete="email"></label>
      <label class="field"><span>Phone (optional)</span><input name="phone" maxlength="30" autocomplete="tel"></label><label class="field"><span>Signed to (optional)</span><input name="signedTo" maxlength="40"></label>
      <label class="field full" id="addr-field" hidden><span>Postal address</span><textarea name="address" maxlength="300" autocomplete="street-address"></textarea></label></div>
    <div class="total"><span>Total</span><b id="o-total">£0</b></div>
    <button class="btn hot" type="submit">Order</button><p class="err" role="status" aria-live="polite"></p>
  </form><div id="order" class="ok" hidden></div>
  <p class="small"><a href="/verify">Check a certificate code →</a></p>
</div></section>`,
  });
}

function verifyPage(ctx) {
  return page(ctx, {
    title: 'Verify a certificate', path: '/verify', scripts: ['/js/collection.js'],
    body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome gold">Verify a certificate</h1>
  <p>Every numbered copy in a TAM verified collection has a certificate code. Enter it to check the copy is genuine.</p>
  <form class="formbox" id="verify-form"><label class="field"><span>Certificate code</span><input name="code" required autocapitalize="characters" placeholder="D108-WBAM-001-ABCD"></label>
  <button class="btn hot" type="submit">Check</button><p class="err" role="status" aria-live="polite"></p></form><div id="verify-out"></div></div></section>`,
  });
}

// ---------------- the old site ----------------
export function legacyBlocks(p) {
  const imgs = [...(p.images || [])];
  const out = [];
  let i = 0;
  for (const b of p.blocks) {
    if (b.hidden) continue; // taken down for now, kept in the content
    if (b.type === 'h1' || b.type === 'h2') out.push(html`<h2>${b.text}</h2>`);
    else if (b.type === 'h3') out.push(html`<h3>${b.text}</h3>`);
    else out.push(html`<p>${b.text}</p>`);
    if (++i % 6 === 0 && imgs.length) out.push(html`<img class="legacy-img" src="${imgs.shift()}" alt="" loading="lazy">`);
  }
  return html`${out}
${imgs.length ? html`<div class="legacy-gallery">${imgs.map((s) => html`<img src="${s}" alt="" loading="lazy">`)}</div>` : ''}
${(p.youtube || []).length ? html`<div class="yt-grid">${p.youtube.map((id) => youtubeThumb({ youtubeId: id, title: '' }))}</div>` : ''}
${(p.external || []).length ? html`<ul class="plain">${p.external.map((u) => html`<li><a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '').slice(0, 60)} ↗</a></li>`)}</ul>` : ''}`;
}

export function legacyPage(req, res, ctx, p) {
  const fest = ctx.content.festivals.find((f) => f.path === p.path);
  const venue = ctx.content.venues.find((v) => v.legacy === p.path);
  const upcoming = venue ? ctx.content.upcoming(ctx.today()).filter((n) => n.venue === venue.slug) : [];
  respond(res, page(ctx, {
    title: p.title, path: p.path, description: (p.description || '').trim().slice(0, 160), scripts: ['/js/festival.js'],
    ...(venue && venue.slug === ctx.content.site.defaultVenue ? { jsonLd: venueLd(ctx) } : {}),
    body: html`<section class="section"><div class="wrap narrow legacy">
  <h1 class="chrome gold">${p.title}</h1>
  ${fest ? html`<p><a class="btn hot" href="${fest.path}">${fest.name}</a></p>` : ''}
  ${upcoming.length ? html`<h2>Coming up here</h2><div class="nights-grid">${upcoming.slice(0, 6).map((n) => nightCard(ctx, n))}</div>` : ''}
  ${legacyBlocks(p)}
</div></section>${venue ? visitSection(ctx, venue.slug) : ''}`,
  }));
}

// ---------------- privacy and errors ----------------
function privacy(ctx) {
  return page(ctx, {
    title: 'Privacy notice', path: '/privacy',
    body: html`<section class="section"><div class="wrap narrow prose">
  <h1 class="chrome gold">Privacy notice</h1>
  <p>TAM (Temple of Art and Music), Mercato Metropolitano, 42 Newington Causeway, London SE1 6DR, runs this site and is responsible for your data.</p>
  <h2>What we collect and why</h2>
  <ul><li><b>Bookings and orders</b>: your name, email, optional company, team name and table notes, to issue and check your tickets or send your order (contract).</li>
  <li><b>Party Wall pins and sponsorship enquiries</b>: what you send us, to publish your pin or reply to you (legitimate interests).</li>
  <li><b>Following an artist</b>: your name and email, only with your consent, to tell you about that artist's gigs. Unsubscribe from any email in one click.</li>
  <li><b>Cards</b>: your message and any photos you add, so the person you send the card to can open it. Only add photos you own.</li>
  <li><b>Ask TAM</b>: the questions you type are sent to Anthropic (Claude), which answers using TAM’s listings. We keep the latest question of each conversation (not your whole chat) for up to a year to see what visitors need. If you ask Ask TAM to send an enquiry, it passes on the name, email and details you gave it (legitimate interests). Don’t type anything sensitive.</li>
  <li><b>Enquiries</b>: your name, email and what you’re planning, to reply to you (legitimate interests).</li>
  <li><b>Counts</b>: we count page and invitation visits per day (no cookies, no profiles), so artists can see how their pages are doing.</li></ul>
  <h2>Cookies and storage</h2><p>No advertising or tracking cookies. Staff who sign in get one sign-in cookie. If you pick who you are (musician, party, venue hire…) we set a preference cookie, <code>tam_path</code>, so the site can tailor itself; it holds nothing else and you can reset it with “Not you? Choose again”. Your browser remembers a few choices (for example a story theme) in its own storage.</p>
  <h2>Who processes it for us</h2><p>Railway (hosting), Stripe (card payments), Resend (email), Anthropic (Ask TAM), Eventbrite (some listings), Google Fonts and YouTube (fonts and films on the page).</p>
  <h2>How long</h2><p>Booking records for six years for accounting; follows until you unsubscribe; cards and pins until the festival's season ends, unless you ask us to remove them sooner.</p>
  <h2>Your rights</h2><p>You can ask to see, correct or delete your data, or object to how we use it. Email the box office. You can also complain to the ICO (ico.org.uk).</p>
  <p class="small muted">Review this notice with TAM before relying on it.</p>
</div></section>`,
  });
}

export function notFound(ctx) {
  return page(ctx, { title: 'Not found', noindex: true, body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome red">Lost in the music</h1><p>That page isn’t here. Try <a href="/whats-on">what’s on</a> or <a href="/archive">the archive</a>.</p></div></section>` });
}
export function errorPage(ctx, status, message) {
  return page(ctx, { title: status === 404 ? 'Not found' : 'Something went wrong', noindex: true, body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome red">${status === 404 ? 'Not found' : 'Sorry'}</h1><p>${message}</p><p><a href="/">Back to TAM.TV</a></p></div></section>` });
}

export { raw };

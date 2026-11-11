// tam.tv for AI assistants and search: Google's AI Mode, Gemini, ChatGPT,
// Claude, Perplexity and others read the site to answer "what's on at TAM
// tonight, how much is it, are tickets left, when is it open?" and, when the
// answer isn't online, may phone the venue. So the answers are here, as
// structured data and as plain text:
//
//   schema.org MusicVenue on the home page and "Find TAM" (address, opening
//     hours with Monday closed, capacity, how to book and hire)
//   schema.org MusicEvent on every night (price, tickets left, sold out)
//   /whats-on.json   every upcoming night: times, prices, tickets left, booking link
//   /llms.txt        a plain-language guide to TAM for AI assistants
//   /calendar.ics    the same nights as a calendar (src/views/seo.js)
//
// See https://support.google.com/websearch/answer/17104441 (AI Mode checking
// local availability and pricing).

import { send } from '../lib/http.js';
import { longDate } from '../lib/content.js';
import { pounds } from '../../shared/pricing.js';

const DAY = { Monday: 'https://schema.org/Monday', Tuesday: 'https://schema.org/Tuesday', Wednesday: 'https://schema.org/Wednesday', Thursday: 'https://schema.org/Thursday', Friday: 'https://schema.org/Friday', Saturday: 'https://schema.org/Saturday', Sunday: 'https://schema.org/Sunday' };

const venueOf = (ctx) => ctx.content.venueBy.get(ctx.content.site.defaultVenue) || {};

// "42 Newington Causeway, London SE1 6DR" as a schema.org PostalAddress.
export function postalAddress(v) {
  const a = String(v.address || '');
  const pc = (/[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}/i.exec(a) || [''])[0];
  return { '@type': 'PostalAddress', streetAddress: [v.place, a.replace(/,?\s*London.*$/i, '')].filter(Boolean).join(', '), addressLocality: 'London', postalCode: pc, addressCountry: 'GB' };
}

export function placeLd(ctx) {
  const v = venueOf(ctx);
  return { '@type': 'MusicVenue', name: 'TAM, Temple of Art and Music', address: postalAddress(v), ...(v.maps ? { hasMap: v.maps } : {}), url: `${ctx.cfg.siteUrl}/locations/${v.slug || 'elephant-castle'}` };
}

// What each night costs and whether tickets are left, from TAM's box office or Eventbrite.
export function availability(ctx, d, n) {
  const a = n.sale ? d.tickets.nightAvailability(n) : null;
  const l = n.eventbrite;
  const soldOut = a ? a.left === 0 : Boolean(l && l.soldOut);
  const free = a ? a.from === 0 : Boolean(l && l.free) || /free/i.test(n.priceText || '');
  const from = a && a.from !== null && a.from !== undefined ? a.from : l && Number.isFinite(l.from) ? l.from : null;
  const book = n.sale ? `${ctx.cfg.siteUrl}/events/${n.slug}#book` : (l && l.url) || n.url || `${ctx.cfg.siteUrl}/events/${n.slug}`;
  return { soldOut, free, from, left: a ? a.left : null, capacity: n.sale ? n.sale.capacity || null : null, book, soldBy: n.sale ? 'TAM box office (tam.tv)' : l || n.url ? 'Eventbrite' : null };
}

export function venueLd(ctx, { events = 10 } = {}) {
  const c = ctx.content, v = venueOf(ctx), g = v.guide || {};
  const hire = g.hire || {};
  const up = c.upcoming(ctx.today()).slice(0, events);
  return {
    '@context': 'https://schema.org', '@type': ['MusicVenue', 'BarOrPub'], '@id': `${ctx.cfg.siteUrl}/#venue`,
    name: 'TAM, Temple of Art and Music', alternateName: ['TAM', 'Temple of Art and Music', 'TAM.TV'],
    description: c.site.description, url: ctx.cfg.siteUrl, logo: `${ctx.cfg.siteUrl}/img/tam-logo-640.png`, image: `${ctx.cfg.siteUrl}/img/og.jpg`,
    address: postalAddress(v), ...(v.maps ? { hasMap: v.maps } : {}),
    containedInPlace: { '@type': 'Place', name: v.place || 'Mercato Metropolitano' },
    openingHoursSpecification: [
      ...(v.hours || []).map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days.map((x) => DAY[x]), opens: h.opens, closes: h.closes })),
      { '@type': 'OpeningHoursSpecification', dayOfWeek: DAY.Monday, opens: '00:00', closes: '00:00', description: 'Closed on Mondays, TAM’s rest day (occasionally open for special projects)' },
    ],
    maximumAttendeeCapacity: 150, currenciesAccepted: 'GBP', priceRange: 'Free–££',
    sameAs: Object.values(c.site.socials || {}).filter(Boolean),
    ...(hire.contact && /@/.test(hire.contact) ? { contactPoint: { '@type': 'ContactPoint', contactType: 'Venue hire and private events', email: (/[\w.+-]+@[\w.-]+/.exec(hire.contact) || [])[0], url: `${ctx.cfg.siteUrl}/for/venue-hire#enquire` } } : {}),
    potentialAction: [
      { '@type': 'BuyAction', name: 'Book tickets', target: `${ctx.cfg.siteUrl}/whats-on` },
      { '@type': 'ReserveAction', name: 'Hire TAM for a private event', target: `${ctx.cfg.siteUrl}/for/venue-hire#enquire` },
    ],
    event: up.map((n) => ({ '@type': 'MusicEvent', name: n.title, startDate: n.start, endDate: n.end, url: `${ctx.cfg.siteUrl}/events/${n.slug}` })),
  };
}

// Every upcoming night, for assistants and apps.
export function whatsOnJson(ctx, d) {
  const c = ctx.content, v = venueOf(ctx);
  return {
    venue: { name: 'TAM, Temple of Art and Music', address: `${v.place}, ${v.address}`, maps: v.maps, url: ctx.cfg.siteUrl,
      openingTimes: ((v.guide || {}).openingTimes || []).map(([k, t]) => `${k}: ${t}`) },
    updated: new Date(ctx.now()).toISOString(),
    nights: c.upcoming(ctx.today()).map((n) => {
      const a = availability(ctx, d, n);
      return {
        title: n.label && n.label !== n.title ? `${n.title}: ${n.label}` : n.title, date: n.date, day: longDate(n.date),
        starts: n.timesTbc ? null : n.doors, ends: n.timesTbc || !n.ends ? null : n.ends,
        summary: n.summary || null, festival: n.festival ? (c.festivalBy.get(n.festival) || {}).name || null : null,
        price: a.free ? 'Free' : a.from !== null ? `From ${pounds(a.from)}` : null, priceFromPence: a.from,
        soldOut: a.soldOut, ticketsLeft: a.left, soldBy: a.soldBy, book: a.book, page: `${ctx.cfg.siteUrl}/events/${n.slug}`,
      };
    }),
  };
}

// A plain-language guide to TAM for AI assistants (the llms.txt convention).
export function llmsTxt(ctx, d) {
  const c = ctx.content, v = venueOf(ctx), g = v.guide || {}, base = ctx.cfg.siteUrl;
  const up = c.upcoming(ctx.today()).slice(0, 14);
  const line = (n) => {
    const a = availability(ctx, d, n);
    const price = a.soldOut ? 'sold out' : a.free ? 'free' : a.from !== null ? `from ${pounds(a.from)}` : 'see page';
    return `- ${longDate(n.date)}${n.timesTbc ? '' : `, ${n.doors}`}: [${n.title}](${base}/events/${n.slug}) (${price}${a.left !== null && !a.soldOut ? `, ${a.left} tickets left` : ''})`;
  };
  return `# TAM, Temple of Art and Music

> A grassroots live music venue and art space inside ${v.place || 'Mercato Metropolitano'}, ${v.address} (Elephant & Castle, London). Live music six nights a week, Tuesday to Sunday; closed on Mondays (TAM's rest day, occasionally open for special projects). Emerging artists and cult legends, weekly jams and open mics, festivals such as The Best Christmas Ever, and a room to hire for up to 150 guests.

## Visiting
- Address: ${v.name}, ${v.place}, ${v.address}. ${g.findUs || ''}
${(v.transport || []).map(([k, t]) => `- ${k}: ${t}`).join('\n')}
- Opening times: ${(g.openingTimes || []).map(([k, t]) => `${k} ${t}`).join('; ')}. Times can change for special events: each night's page has its own times.
- Food and drink: ${g.food || ''} ${g.drinks || ''}

## Tickets and what's on
- Every upcoming night, with times, prices, tickets left and a booking link: ${base}/whats-on (page), ${base}/whats-on.json (data), ${base}/calendar.ics (calendar).
- Tickets are sold on tam.tv by TAM's own box office (pay by card) or on Eventbrite, as each night's page says. Free nights may still need a free ticket or a guest-list place.
- Coming up:
${up.map(line).join('\n')}

## Regular nights
${(g.regulars || []).map(([k, t]) => `- ${k}: ${t}`).join('\n')}
- The Great British Blues Jam, every Saturday from 4pm, hosted by MAZZA (London blues guitarist and singer-songwriter, ${base}/artists/mazza): each Saturday's host, house band and jam sign-up at ${base}/great-british-blues-jam
- Want to play? TAM's Sunday Showcases give the best acts from the open nights a full set: start on the open mic circuit (Open Mic Wednesdays, The Original Singers Club, the Blues Jam, Junior Open Mic), then register at ${base}/sunday-showcases
- Friday nights: ${base.includes('tam.tv') ? 'https://friday.tam.tv' : `${base}/whats-on`} (Friday Night Live by TAM)
- Christmas: https://christmas.tam.tv (The Best Christmas Ever, every December)

## Hire the venue
- ${(g.hire || {}).capacity || 'Up to 150 guests'}. ${(g.hire || {}).when || ''}.
- Includes: ${((g.hire || {}).includes || []).join('; ')}.
- Enquire: ${base}/for/venue-hire#enquire

## More
- Artists who have played TAM: ${base}/artists
- Past nights since 2021: ${base}/archive
- Ask TAM, the site's assistant, answers questions on every page.
`;
}

export function routes(r, ctx, d) {
  r.get('/whats-on.json', (req, res) => send(res, 200, whatsOnJson(ctx, d), { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }));
  r.get('/llms.txt', (req, res) => send(res, 200, llmsTxt(ctx, d), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=900' }));
}

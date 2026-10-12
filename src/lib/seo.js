// Search + AI discovery. Every artist, night, venue, series, film and story is
// published as schema.org JSON-LD and linked into one graph, so search engines
// and AI systems can answer: who is this artist, what did they play, where,
// when, in which genre, and who have they shared a bill with?

const abs = (site, p) => `${site.url}${p}`;
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === '' || v === null || (Array.isArray(v) && !v.length) ? undefined : v)));

export const paths = {
  artist: (s) => `/artists/${s}`,
  event: (s) => `/events/${s}`,
  video: (s) => `/tv/${s}`,
  story: (s) => `/stories/${s}`,
  series: (s) => `/series/${s}`,
  venue: (s) => `/locations/${s}`,
  year: (y) => `/archive/${y}`,
  genre: (g) => `/genres/${g}`,
};

export function organization(site) {
  return clean({
    '@type': 'Organization',
    '@id': abs(site, '/#tam'),
    name: site.legalName,
    alternateName: ['TAM', site.name, 'Temple of Art & Music'],
    url: site.url,
    logo: abs(site, '/img/tam-logo.png'),
    slogan: site.tagline,
    description: site.description,
    address: { '@type': 'PostalAddress', streetAddress: '42 Newington Causeway', addressLocality: 'London', postalCode: 'SE1 6DR', addressCountry: 'GB' },
    sameAs: Object.values(site.socials || {}).filter(Boolean),
  });
}

export function venueLD(site, v) {
  return clean({
    '@type': 'MusicVenue',
    '@id': abs(site, `${paths.venue(v.slug)}#venue`),
    name: v.name,
    url: abs(site, paths.venue(v.slug)),
    address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'London', addressCountry: 'GB' },
    containedInPlace: v.place ? { '@type': 'Place', name: v.place } : undefined,
    parentOrganization: { '@id': abs(site, '/#tam') },
  });
}

export function artistLD(site, a, q) {
  return clean({
    '@type': 'MusicGroup',
    '@id': abs(site, `${paths.artist(a.slug)}#artist`),
    name: a.name,
    url: abs(site, paths.artist(a.slug)),
    description: a.bio?.[0] || a.note || `${a.name} has played at the Temple of Art and Music, London.`,
    genre: a.genres,
    image: abs(site, `/art/${a.slug}.svg`),
    sameAs: [...Object.values(a.socials || {}), ...Object.values(a.music || {})].filter(Boolean),
    subjectOf: q.videosFor(a.slug).map((v) => ({ '@id': abs(site, `${paths.video(v.slug)}#video`) })),
    performerIn: q.eventsFor(a.slug).slice(-50).map((e) => ({ '@id': abs(site, `${paths.event(e.slug)}#event`) })),
  });
}

export function eventLD(site, e, q) {
  const v = q.venue(e.venue);
  const upcoming = !q.isPast(e);
  return clean({
    '@type': 'MusicEvent',
    '@id': abs(site, `${paths.event(e.slug)}#event`),
    name: e.title,
    url: abs(site, paths.event(e.slug)),
    startDate: e.start,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: e.image || abs(site, `/art/${e.slug}.svg`),
    location: v
      ? { '@type': 'MusicVenue', '@id': abs(site, `${paths.venue(v.slug)}#venue`), name: v.name, address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'London', addressCountry: 'GB' } }
      : { '@type': 'Place', name: e.venueName || 'London' },
    organizer: { '@id': abs(site, '/#tam') },
    superEvent: [
      e.series && { '@type': 'EventSeries', '@id': abs(site, `${paths.series(e.series)}#series`), name: q.series(e.series)?.name },
      e.festival && q.festival(e.festival) && { '@type': 'Festival', '@id': abs(site, `${q.festival(e.festival).path}#festival`), name: q.festival(e.festival).name },
    ].filter(Boolean),
    performer: e.performers.map((s) => ({ '@type': 'MusicGroup', '@id': abs(site, `${paths.artist(s)}#artist`), name: q.artist(s)?.name })),
    offers: upcoming && e.pricing
      // A price schedule: one Offer per step, each valid until the next begins.
      ? e.pricing.tiers.map((t, i) => ({
        '@type': 'Offer', name: t.name, url: abs(site, paths.event(e.slug)), price: (t.price / 100).toFixed(2), priceCurrency: 'GBP',
        validFrom: i ? e.pricing.tiers[i - 1].until : undefined, validThrough: t.until, availability: 'https://schema.org/InStock',
      }))
      : upcoming && e.url ? { '@type': 'Offer', url: e.url, availability: 'https://schema.org/InStock', ...(e.free ? { price: 0, priceCurrency: 'GBP' } : {}) } : undefined,
    sameAs: e.url || undefined,
    description: e.summary,
  });
}

// A festival is an Event whose sub-events are its shows.
export function festivalLD(site, f, events) {
  return clean({
    '@type': 'Festival',
    '@id': abs(site, `${f.path}#festival`),
    name: f.name,
    alternateName: f.title,
    url: abs(site, f.path),
    description: f.lede,
    startDate: events[0]?.start,
    endDate: events.at(-1)?.start,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    organizer: { '@id': abs(site, '/#tam') },
    subEvent: events.map((e) => ({ '@id': abs(site, `${paths.event(e.slug)}#event`) })),
  });
}

export function seriesLD(site, s) {
  return clean({
    '@type': 'EventSeries',
    '@id': abs(site, `${paths.series(s.slug)}#series`),
    name: s.name,
    url: abs(site, paths.series(s.slug)),
    startDate: s.first,
    endDate: s.last,
    organizer: { '@id': abs(site, '/#tam') },
  });
}

export function videoLD(site, v, q) {
  return clean({
    '@type': 'VideoObject',
    '@id': abs(site, `${paths.video(v.slug)}#video`),
    name: v.title,
    description: v.title,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtubeId}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.youtubeId}`,
    url: abs(site, paths.video(v.slug)),
    about: v.artists.map((a) => ({ '@id': abs(site, `${paths.artist(a)}#artist`), name: q.artist(a)?.name })),
    publisher: { '@id': abs(site, '/#tam') },
  });
}

export function storyLD(site, s) {
  return clean({
    '@type': 'Article',
    '@id': abs(site, `${paths.story(s.slug)}#article`),
    headline: s.title,
    description: s.dek,
    datePublished: s.published,
    articleSection: s.pillar,
    url: abs(site, paths.story(s.slug)),
    author: { '@type': 'Organization', name: s.author },
    publisher: { '@id': abs(site, '/#tam') },
    about: (s.related?.artists || []).map((a) => ({ '@id': abs(site, `${paths.artist(a)}#artist`) })),
  });
}

export function itemList(site, name, items) {
  return clean({
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(site, it) })),
  });
}

export function graph(c, q) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(c.site),
      ...c.venues.map((v) => venueLD(c.site, v)),
      ...c.series.map((s) => seriesLD(c.site, s)),
      ...c.artists.map((a) => artistLD(c.site, a, q)),
      ...c.events.map((e) => eventLD(c.site, e, q)),
      ...c.videos.map((v) => videoLD(c.site, v, q)),
      ...c.stories.map((s) => storyLD(c.site, s)),
    ],
  };
}

export function jsonLdTag(...nodes) {
  const body = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) })
    .replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${body}</script>`;
}

export function allPaths(c, q) {
  return [...new Set([
    '/', '/whats-on', '/artists', '/archive', '/series', '/genres', '/locations', '/tv', '/academy', '/listen', '/stories', '/about', '/submit', '/privacy',
    ...c.legacy.map((p) => p.path).filter((p) => p !== '/home'),
    ...c.artists.map((a) => paths.artist(a.slug)),
    ...c.events.map((e) => paths.event(e.slug)),
    ...c.series.map((s) => paths.series(s.slug)),
    ...c.venues.map((v) => paths.venue(v.slug)),
    ...q.years().map(paths.year),
    ...q.genres().map(paths.genre),
    ...c.videos.map((v) => paths.video(v.slug)),
    ...c.stories.map((s) => paths.story(s.slug)),
  ])];
}

export function sitemap(c, q) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + allPaths(c, q).map((u) => `  <url><loc>${abs(c.site, u)}</loc></url>`).join('\n')
    + '\n</urlset>\n';
}

export function robots(site) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /studio\n\nSitemap: ${site.url}/sitemap.xml\n`;
}

// llms.txt: a plain-language map of the site for AI assistants and crawlers.
// No totals: the archive comes from Eventbrite listings, which miss some nights.
export function llmsTxt(c, q) {
  const line = (title, p, note) => `- [${title}](${abs(c.site, p)})${note ? `: ${note}` : ''}`;
  return [
    `# ${c.site.legalName} (${c.site.name})`,
    '',
    `> ${c.site.description}`,
    '',
    'Every artist, night, regular night and venue has its own page. The archive of past nights comes from TAM\'s Eventbrite listings and may be incomplete. A machine-readable graph is at /graph.json (schema.org JSON-LD).',
    '',
    '## Find TAM',
    ...q.currentVenues().map((v) => line(v.name, paths.venue(v.slug), v.address)),
    '',
    '## Regular nights',
    ...q.currentSeries().map((x) => line(x.name, paths.series(x.slug))),
    '',
    '## Coming up',
    ...q.upcoming().map((e) => line(`${e.title} (${e.date})`, paths.event(e.slug), q.venue(e.venue)?.name)),
    '',
    '## Artists who have played TAM',
    ...c.artists.map((a) => line(a.name, paths.artist(a.slug), [a.legend ? 'cult legend' : '', a.genres.join(', '), a.note || ''].filter(Boolean).join('; '))),
    '',
    '## Archive by year',
    ...q.years().map((y) => line(y, paths.year(y))),
    '',
    '## Also',
    line('The TAM Academy', '/academy'),
    line('TAM TV', '/tv', 'films from TAM\'s YouTube channel'),
    '',
  ].join('\n');
}

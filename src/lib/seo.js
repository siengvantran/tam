// Search + AI discovery. Every artist, event, video and story is published as
// schema.org JSON-LD and linked into one graph, so search engines and AI
// systems can answer: who is this artist, what did they play, where, which
// genre, who are they connected to?

const abs = (site, p) => `${site.url}${p}`;
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === '' || v === null || (Array.isArray(v) && !v.length) ? undefined : v)));

export const paths = {
  artist: (s) => `/artists/${s}`,
  event: (s) => `/events/${s}`,
  video: (s) => `/watch/${s}`,
  story: (s) => `/stories/${s}`,
};

export function organization(site) {
  return clean({
    '@type': ['Organization', 'MusicVenue'],
    '@id': abs(site, '/#tam'),
    name: site.legalName,
    alternateName: ['TAM', site.name, 'TAM Festival'],
    url: site.url,
    logo: abs(site, '/img/tam-logo.png'),
    slogan: site.tagline,
    description: site.description,
    address: { '@type': 'PostalAddress', addressLocality: 'London', addressRegion: 'Elephant & Castle', addressCountry: 'GB' },
    sameAs: Object.values(site.socials || {}).filter(Boolean),
  });
}

export function artistLD(site, a, q) {
  return clean({
    '@type': 'MusicGroup',
    '@id': abs(site, `${paths.artist(a.slug)}#artist`),
    name: a.name,
    url: abs(site, paths.artist(a.slug)),
    description: a.bio,
    genre: a.genres,
    foundingLocation: a.location ? { '@type': 'Place', name: a.location } : undefined,
    image: abs(site, `/art/${a.slug}.svg`),
    sameAs: [...Object.values(a.socials || {}), ...Object.values(a.music || {})].filter(Boolean),
    subjectOf: q.videosFor({ artist: a.slug }).map((v) => ({ '@id': abs(site, `${paths.video(v.slug)}#video`) })),
    performerIn: q.eventsFor(a.slug).map((e) => ({ '@id': abs(site, `${paths.event(e.slug)}#event`) })),
    knows: (a.related || []).map((r) => ({ '@id': abs(site, `${paths.artist(r)}#artist`) })),
  });
}

export function eventLD(site, e, q) {
  return clean({
    '@type': 'MusicEvent',
    '@id': abs(site, `${paths.event(e.slug)}#event`),
    name: e.title,
    url: abs(site, paths.event(e.slug)),
    startDate: e.start,
    endDate: e.end,
    description: e.summary,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: abs(site, `/art/${e.slug}.svg`),
    location: {
      '@type': 'MusicVenue',
      name: e.venue.name,
      address: { '@type': 'PostalAddress', addressLocality: e.venue.region, addressRegion: e.venue.locality, addressCountry: e.venue.country },
    },
    organizer: { '@id': abs(site, '/#tam') },
    superEvent: { '@type': 'Festival', name: 'TAM Festival', url: abs(site, '/festival') },
    performer: e.artists.map((s) => ({ '@type': 'MusicGroup', '@id': abs(site, `${paths.artist(s)}#artist`), name: q.artist(s)?.name })),
    offers: e.ticketUrl ? { '@type': 'Offer', url: e.ticketUrl, availability: 'https://schema.org/InStock' } : undefined,
  });
}

export function videoLD(site, v, q) {
  return clean({
    '@type': 'VideoObject',
    '@id': abs(site, `${paths.video(v.slug)}#video`),
    name: v.title,
    description: v.summary,
    uploadDate: v.published,
    duration: v.duration,
    thumbnailUrl: v.youtubeId ? `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` : abs(site, `/art/${v.slug}.svg`),
    embedUrl: v.youtubeId ? `https://www.youtube-nocookie.com/embed/${v.youtubeId}` : undefined,
    url: abs(site, paths.video(v.slug)),
    about: v.artist ? { '@id': abs(site, `${paths.artist(v.artist)}#artist`), name: q.artist(v.artist)?.name } : undefined,
    recordedAt: v.event ? { '@id': abs(site, `${paths.event(v.event)}#event`) } : undefined,
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
    about: [
      ...(s.related?.artists || []).map((a) => ({ '@id': abs(site, `${paths.artist(a)}#artist`) })),
      ...(s.related?.events || []).map((e) => ({ '@id': abs(site, `${paths.event(e)}#event`) })),
    ],
  });
}

export function graph(c, q) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(c.site),
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

export function sitemap(c) {
  const urls = [
    '/', '/festival', '/artists', '/watch', '/listen', '/stories', '/about', '/submit',
    ...c.artists.map((a) => paths.artist(a.slug)),
    ...c.events.map((e) => paths.event(e.slug)),
    ...c.videos.map((v) => paths.video(v.slug)),
    ...c.stories.map((s) => paths.story(s.slug)),
  ];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${abs(c.site, u)}</loc></url>`).join('\n')
    + '\n</urlset>\n';
}

export function robots(site) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /studio\n\nSitemap: ${site.url}/sitemap.xml\n`;
}

// llms.txt: a plain-language map of the site for AI assistants and crawlers.
export function llmsTxt(c, q) {
  const line = (title, p, note) => `- [${title}](${abs(c.site, p)})${note ? `: ${note}` : ''}`;
  return [
    `# ${c.site.legalName} (${c.site.name})`,
    '',
    `> ${c.site.description}`,
    '',
    'TAM is a live music and media ecosystem based in Elephant & Castle, London. TAM Festival is its live programme; TAM.TV publishes performances, interviews and stories about emerging artists. A machine-readable graph of everything below is at /graph.json (schema.org JSON-LD).',
    '',
    '## Artists',
    ...c.artists.map((a) => line(a.name, paths.artist(a.slug), `${a.genres.join(', ')}; ${a.location}`)),
    '',
    '## Upcoming TAM Festival events',
    ...q.upcoming().map((e) => line(`${e.title} (${e.start.slice(0, 10)})`, paths.event(e.slug), e.summary)),
    '',
    '## Watch',
    ...c.videos.map((v) => line(v.title, paths.video(v.slug), v.kind)),
    '',
    '## Stories',
    ...c.stories.map((s) => line(s.title, paths.story(s.slug), s.dek)),
    '',
  ].join('\n');
}

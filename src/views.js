import { h, raw, fmtDate, fmtTime, fmtDuration } from './lib/html.js';
import { logo, artwork, archiveRings, londonTime, daypart } from './lib/brand.js';
import { pressing } from './lib/vinyl.js';
import { organization, artistLD, eventLD, videoLD, storyLD, jsonLdTag, paths } from './lib/seo.js';

const NAV = [
  ['/festival', 'Festival'],
  ['/artists', 'Artists'],
  ['/watch', 'Watch'],
  ['/listen', 'Listen'],
  ['/stories', 'Stories'],
  ['/about', 'About'],
];

const DAYPART_LINE = {
  dawn: 'Dawn in London. The room is quiet; the archive is open.',
  day: 'Daytime in London. Catch up on last night’s sets.',
  dusk: 'Doors soon. Evening light at TAM.',
  night: 'Night in London. This is when TAM happens.',
};

const pressedOn = (name) => {
  const p = pressing(name);
  return h`<p class="pressed center"><span class="eyebrow">Pressed on</span><strong>${p.colourway.name}</strong> ${p.style.toLowerCase()} vinyl<br><span class="muted">${p.colourway.note}</span></p>`;
};

const badge = (item) => (item?.sample ? h`<span class="chip chip-sample" title="Placeholder content — replace in /content">Sample</span>` : '');

export function layout(ctx, { title, description, path = '/', body, ld = [], noindex = false, ogType = 'website' }) {
  const { site } = ctx.c;
  const fullTitle = title ? `${title} — ${site.name}` : `${site.name} — ${site.tagline}`;
  const desc = description || site.description;
  const url = `${site.url}${path}`;
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
<meta property="og:image" content="${site.url}/img/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
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
    ${NAV.map(([href, label]) => h`<a href="${href}"${path.startsWith(href) ? raw(' aria-current="page"') : ''}>${label}</a>`)}
    <a class="btn btn-small" href="/submit">Play TAM</a>
  </nav>
</header>
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="footer-grid">
    <div>
      <p class="big-idea">${site.bigIdea}</p>
      <p class="muted">${site.legalName} · ${site.locality}</p>
    </div>
    ${signupForm(ctx)}
    <div>
      <h2 class="eyebrow">Follow</h2>
      <ul class="plain">
        ${Object.entries(site.socials).map(([k, v]) => (v ? h`<li><a href="${v}" rel="me noopener">${k}</a></li>` : h`<li class="muted">${k} — link coming</li>`))}
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
  <p>TAM uses one first-party cookie to remember this choice. With your OK we also record anonymous page views so we can see which artists and stories people care about. No advertising trackers.</p>
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
  <p class="muted">New artists, upcoming nights and films. Roughly twice a month.</p>
  <label class="sr" for="signup-email-${compact ? 'f' : 'p'}">Email</label>
  <div class="inline-field">
    <input id="signup-email-${compact ? 'f' : 'p'}" type="email" name="email" required placeholder="you@example.com" autocomplete="email">
    <button class="btn btn-small" type="submit">Join</button>
  </div>
  <label class="check"><input type="checkbox" name="consent" required> I’d like emails from TAM. Unsubscribe any time.</label>
  <input type="hidden" name="from" value="${ctx.path}">
</form>`;
}

const eventCard = (ctx, e) => {
  const q = ctx.q;
  return h`<article class="card event-card">
  <a class="card-art" href="${paths.event(e.slug)}" tabindex="-1" aria-hidden="true">${raw(artwork(e.slug, { genre: e.genre, size: 160, label: false }))}</a>
  <div class="card-body">
    <p class="eyebrow">${q.strand(e.strand)?.name} ${badge(e)}</p>
    <h3><a href="${paths.event(e.slug)}">${e.title}</a></h3>
    <p class="meta"><time datetime="${e.start}">${fmtDate(e.start)} · ${fmtTime(e.start)}</time> · ${e.venue.locality}</p>
    <p>${e.artists.map((a) => q.artist(a)?.name).join(', ')}</p>
  </div>
</article>`;
};

const artistCard = (a) => h`<article class="card artist-card">
  <a href="${paths.artist(a.slug)}" class="card-art">${raw(artwork(a.name, { genre: a.genres[0], size: 200 }))}</a>
  <div class="card-body">
    <h3><a href="${paths.artist(a.slug)}">${a.name}</a> ${badge(a)}</h3>
    <p class="meta">${a.genres.join(' · ')} — ${a.location}</p>
  </div>
</article>`;

const videoCard = (ctx, v) => h`<article class="card video-card">
  <a href="${paths.video(v.slug)}" class="card-art video-thumb">
    ${v.youtubeId ? h`<img src="https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg" alt="" loading="lazy">` : raw(artwork(v.slug, { genre: ctx.q.artist(v.artist)?.genres?.[0], size: 160, label: false }))}
    <span class="play" aria-hidden="true">▶</span>
  </a>
  <div class="card-body">
    <p class="eyebrow">${v.kind} · ${fmtDuration(v.duration)} ${badge(v)}</p>
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

const section = (title, body, { href, id } = {}) => h`<section class="section"${id ? raw(` id="${id}"`) : ''}>
  <div class="section-head"><h2>${title}</h2>${href ? h`<a href="${href}">See all →</a>` : ''}</div>
  ${body}
</section>`;

// ---------------------------------------------------------------- pages

export function home(ctx) {
  const { c, q } = ctx;
  const next = q.upcoming()[0];
  const latestVideo = c.videos[0];
  const latestArtist = c.artists[0];
  const latestStory = c.stories[0];
  const t = londonTime(ctx.now);
  const part = daypart(t.hour);
  const loop = ['Event', 'Content', 'Distribution', 'Discovery', 'Audience', 'Data', 'Next event'];

  const body = h`
<section class="hero">
  <div class="hero-mark"><div class="logo-frame"><div class="halo" aria-hidden="true"></div><div class="logo-backing" aria-hidden="true"></div>${raw(logo('full', { width: 520, eager: true }))}</div></div>
  <div class="hero-copy">
    <p class="eyebrow">TAM Festival · ${c.site.locality}</p>
    <h1>Live music.<br>Emerging artists.<br>Real stories.</h1>
    <p class="lede">TAM.TV is where the story continues: every night at TAM becomes films, interviews and artist pages that last.</p>
    <p class="clock" data-clock><span data-clock-time>${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}</span> London · <span data-clock-line>${DAYPART_LINE[part]}</span></p>
    ${next ? h`<div class="next-up">
      <p class="eyebrow">Next at TAM</p>
      <p class="next-title"><a href="${paths.event(next.slug)}">${next.title}</a> ${badge(next)}</p>
      <p class="countdown" data-countdown="${next.start}">${fmtDate(next.start)} · ${fmtTime(next.start)}</p>
    </div>` : ''}
    <p class="cta-row"><a class="btn" href="/festival">See the festival</a> <a class="btn btn-ghost" href="/submit">Play TAM</a></p>
  </div>
</section>

<section class="featured">
  ${next ? h`<a class="feature" href="${paths.event(next.slug)}"><span class="eyebrow">Next event</span><strong>${next.title}</strong><span class="meta">${fmtDate(next.start)}</span></a>` : ''}
  ${latestVideo ? h`<a class="feature" href="${paths.video(latestVideo.slug)}"><span class="eyebrow">Latest performance</span><strong>${latestVideo.title}</strong><span class="meta">${latestVideo.kind}</span></a>` : ''}
  ${latestArtist ? h`<a class="feature" href="${paths.artist(latestArtist.slug)}"><span class="eyebrow">Artist</span><strong>${latestArtist.name}</strong><span class="meta">${latestArtist.genres.join(' · ')}</span></a>` : ''}
  ${latestStory ? h`<a class="feature" href="${paths.story(latestStory.slug)}"><span class="eyebrow">Latest story</span><strong>${latestStory.title}</strong><span class="meta">${latestStory.pillar}</span></a>` : ''}
</section>

${section('Coming up', h`<div class="grid grid-3">${q.upcoming().slice(0, 3).map((e) => eventCard(ctx, e))}</div>`, { href: '/festival' })}

<section class="section loop" aria-label="The TAM loop">
  <h2>One night. A whole ecosystem.</h2>
  <ol class="loop-list">${loop.map((step, i) => h`<li style="--i:${i}">${step}</li>`)}</ol>
  <p class="muted">Every performance at TAM becomes a film, clips, an interview, photographs, a profile and a permanent artist page, and each one leads new people back to the next night.</p>
</section>

${section('Watch', h`<div class="grid grid-3">${c.videos.slice(0, 3).map((v) => videoCard(ctx, v))}</div>`, { href: '/watch' })}
${section('Artists', h`<div class="grid grid-4">${c.artists.slice(0, 4).map(artistCard)}</div>`, { href: '/artists' })}
${section('Stories', h`<div class="grid grid-3">${c.stories.slice(0, 3).map(storyCard)}</div>`, { href: '/stories' })}

<section class="section play-tam">
  <div>
    <h2>Play TAM</h2>
    <p>TAM doesn’t just put artists on stage. It helps build their audience: a live room, a filmed set, an interview, a profile on TAM.TV and distribution across our channels.</p>
  </div>
  <a class="btn" href="/submit">Propose a night</a>
</section>`;
  return layout(ctx, { path: '/', body });
}

export function festival(ctx) {
  const { c, q } = ctx;
  const body = h`
<header class="page-head">
  <p class="eyebrow">TAM Festival</p>
  <h1>The festival never really ends.</h1>
  <p class="lede">Not one weekend a year: an ongoing programme of nights in ${c.site.locality}, each one filmed and published on TAM.TV.</p>
</header>
${section('Upcoming', q.upcoming().length ? h`<div class="grid grid-3">${q.upcoming().map((e) => eventCard(ctx, e))}</div>` : h`<p>New dates are on the way. <a href="#footer-signup">Join the list</a> to hear first.</p>`)}
${section('Strands', h`<div class="grid grid-3">${c.strands.map((s) => h`<article class="card strand"><div class="card-body"><h3>${s.name}</h3><p>${s.summary}</p></div></article>`)}</div>`)}
${q.past().length ? section('Previously at TAM', h`<div class="grid grid-3">${q.past().map((e) => eventCard(ctx, e))}</div>`) : ''}`;
  return layout(ctx, { title: 'Festival', description: 'Upcoming and past TAM Festival nights in Elephant & Castle, London.', path: '/festival', body });
}

export function eventPage(ctx, e) {
  const { q } = ctx;
  const lineup = e.artists.map(q.artist).filter(Boolean);
  const videos = q.videosFor({ event: e.slug });
  const stories = q.storiesFor({ event: e.slug });
  const past = q.isPast(e);
  const body = h`
<article class="detail">
  <div class="detail-art">${raw(artwork(e.slug, { genre: e.genre, size: 360, label: false }))}</div>
  <div class="detail-copy">
    <p class="eyebrow">${q.strand(e.strand)?.name} ${badge(e)}</p>
    <h1>${e.title}</h1>
    <p class="meta big"><time datetime="${e.start}">${fmtDate(e.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</time> · ${fmtTime(e.start)}${e.end ? h`–${fmtTime(e.end)}` : ''}</p>
    <p class="meta">${e.venue.name}, ${e.venue.locality}, ${e.venue.region} · ${e.price}</p>
    <p class="lede">${e.summary}</p>
    ${past ? '' : h`<p class="countdown" data-countdown="${e.start}"></p>`}
    <p class="cta-row">
      ${!past && e.ticketUrl ? h`<a class="btn" href="${e.ticketUrl}" rel="noopener">Tickets</a>` : ''}
      ${!past ? h`<a class="btn btn-ghost" href="${paths.event(e.slug)}.ics">Add to calendar</a>` : ''}
    </p>
    <h2>Line-up</h2>
    <ul class="plain lineup">${lineup.map((a) => h`<li><a href="${paths.artist(a.slug)}">${a.name}</a> <span class="meta">${a.genres.join(' · ')}</span></li>`)}</ul>
  </div>
</article>
${videos.length ? section('From the night', h`<div class="grid grid-3">${videos.map((v) => videoCard(ctx, v))}</div>`) : ''}
${stories.length ? section('Stories', h`<div class="grid grid-3">${stories.map(storyCard)}</div>`) : ''}`;
  return layout(ctx, { title: `${e.title}, ${fmtDate(e.start, { day: 'numeric', month: 'short', year: 'numeric' })}`, description: e.summary, path: paths.event(e.slug), body, ld: [eventLD(ctx.c.site, e, q)] });
}

export function artists(ctx) {
  const body = h`
<header class="page-head">
  <p class="eyebrow">Artists</p>
  <h1>The people who passed through TAM.</h1>
  <p class="lede">Every artist gets a permanent page and their own coloured vinyl, pressed from their name in a colourway you’ve probably never seen on a record. Same name, same record, forever.</p>
</header>
<div class="grid grid-4">${ctx.c.artists.map(artistCard)}</div>`;
  return layout(ctx, { title: 'Artists', description: 'Emerging artists who have performed at TAM.', path: '/artists', body });
}

export function artistPage(ctx, a) {
  const { q } = ctx;
  const events = q.eventsFor(a.slug);
  const upcoming = events.filter((e) => !q.isPast(e));
  const past = events.filter((e) => q.isPast(e));
  const videos = q.videosFor({ artist: a.slug });
  const stories = q.storiesFor({ artist: a.slug });
  const related = (a.related || []).map(q.artist).filter(Boolean);
  const links = [...Object.entries(a.music || {}), ...Object.entries(a.socials || {})].filter(([, v]) => v);
  const body = h`
<article class="detail">
  <div class="detail-art">${raw(artwork(a.name, { genre: a.genres[0], size: 360 }))}${pressedOn(a.name)}<p class="meta center"><a href="/art/${a.slug}.svg" download>Download the record (SVG)</a></p></div>
  <div class="detail-copy">
    <p class="eyebrow">${a.genres.join(' · ')} ${badge(a)}</p>
    <h1>${a.name}</h1>
    <p class="meta big">${a.location}</p>
    <p class="lede">${a.bio}</p>
    ${links.length ? h`<p class="cta-row">${links.map(([k, v]) => h`<a class="btn btn-ghost btn-small" href="${v}" rel="noopener">${k}</a>`)}</p>` : ''}
    ${upcoming.length ? h`<h2>Next at TAM</h2><ul class="plain">${upcoming.map((e) => h`<li><a href="${paths.event(e.slug)}">${e.title}</a> <span class="meta">${fmtDate(e.start)}</span></li>`)}</ul>` : ''}
    ${past.length ? h`<h2>Played TAM</h2><ul class="plain">${past.map((e) => h`<li><a href="${paths.event(e.slug)}">${e.title}</a> <span class="meta">${fmtDate(e.start)}</span></li>`)}</ul>` : ''}
  </div>
</article>
${videos.length ? section('Watch', h`<div class="grid grid-3">${videos.map((v) => videoCard(ctx, v))}</div>`) : ''}
${stories.length ? section('Stories', h`<div class="grid grid-3">${stories.map(storyCard)}</div>`) : ''}
${related.length ? section('Connected artists', h`<div class="grid grid-4">${related.map(artistCard)}</div>`) : ''}`;
  return layout(ctx, { title: a.name, description: `${a.name}: ${a.genres.join(', ')} from ${a.location}. Performances, interviews and stories on TAM.TV.`, path: paths.artist(a.slug), body, ld: [artistLD(ctx.c.site, a, q)], ogType: 'profile' });
}

export function watch(ctx) {
  const kinds = [...new Set(ctx.c.videos.map((v) => v.kind))];
  const body = h`
<header class="page-head">
  <p class="eyebrow">Watch</p>
  <h1>Performance films, interviews and stories.</h1>
</header>
${kinds.map((k) => section(k[0].toUpperCase() + k.slice(1), h`<div class="grid grid-3">${ctx.c.videos.filter((v) => v.kind === k).map((v) => videoCard(ctx, v))}</div>`))}`;
  return layout(ctx, { title: 'Watch', description: 'Live performance films and artist interviews from TAM Festival.', path: '/watch', body });
}

export function videoPage(ctx, v) {
  const { q } = ctx;
  const artist = v.artist && q.artist(v.artist);
  const event = v.event && q.event(v.event);
  const more = ctx.c.videos.filter((x) => x.slug !== v.slug && (x.artist === v.artist || x.event === v.event)).slice(0, 3);
  const body = h`
<article class="video-detail">
  <div class="player">
    ${v.youtubeId
    ? h`<iframe src="https://www.youtube-nocookie.com/embed/${v.youtubeId}" title="${v.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
    : h`<div class="player-placeholder">${raw(artwork(v.slug, { genre: artist?.genres?.[0], size: 260, label: false }))}<p>Film coming soon</p></div>`}
  </div>
  <div class="detail-copy narrow">
    <p class="eyebrow">${v.kind} · ${fmtDuration(v.duration)} · <time datetime="${v.published}">${fmtDate(v.published, { day: 'numeric', month: 'short', year: 'numeric' })}</time> ${badge(v)}</p>
    <h1>${v.title}</h1>
    <p class="lede">${v.summary}</p>
    <p class="cta-row">
      ${artist ? h`<a class="btn btn-ghost btn-small" href="${paths.artist(artist.slug)}">${artist.name}</a>` : ''}
      ${event ? h`<a class="btn btn-ghost btn-small" href="${paths.event(event.slug)}">${event.title}, ${fmtDate(event.start, { day: 'numeric', month: 'short' })}</a>` : ''}
    </p>
  </div>
</article>
${more.length ? section('More like this', h`<div class="grid grid-3">${more.map((x) => videoCard(ctx, x))}</div>`) : ''}`;
  return layout(ctx, { title: v.title, description: v.summary, path: paths.video(v.slug), body, ld: [videoLD(ctx.c.site, v, q)], ogType: 'video.other' });
}

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
  const pillars = [...new Set(ctx.c.stories.map((s) => s.pillar))];
  const body = h`
<header class="page-head">
  <p class="eyebrow">Stories</p>
  <h1>Real. Immediate. Human.</h1>
  <p class="lede">The people, music and projects around TAM, documented while it’s happening.</p>
</header>
<p class="chips">${pillars.map((p) => h`<span class="chip">${p}</span>`)}</p>
<div class="grid grid-3">${ctx.c.stories.map(storyCard)}</div>`;
  return layout(ctx, { title: 'Stories', path: '/stories', body });
}

export function storyPage(ctx, s) {
  const { q } = ctx;
  const artists = (s.related?.artists || []).map(q.artist).filter(Boolean);
  const events = (s.related?.events || []).map(q.event).filter(Boolean);
  const body = h`
<article class="story">
  <header class="page-head narrow">
    <p class="eyebrow">${s.pillar} · <time datetime="${s.published}">${fmtDate(s.published, { day: 'numeric', month: 'long', year: 'numeric' })}</time></p>
    <h1>${s.title}</h1>
    <p class="lede">${s.dek}</p>
  </header>
  <div class="prose narrow">${s.body.map((p) => h`<p>${p}</p>`)}</div>
</article>
${artists.length ? section('Artists in this story', h`<div class="grid grid-4">${artists.map(artistCard)}</div>`) : ''}
${events.length ? section('Events', h`<div class="grid grid-3">${events.map((e) => eventCard(ctx, e))}</div>`) : ''}`;
  return layout(ctx, { title: s.title, description: s.dek, path: paths.story(s.slug), body, ld: [storyLD(ctx.c.site, s)], ogType: 'article' });
}

export function about(ctx) {
  const pillars = [
    ['Live', 'Concerts, festivals, showcases and collaborations.'],
    ['TV', 'Performance films, interviews, documentaries and backstage.'],
    ['Radio', 'Sessions, conversations and playlists.'],
    ['Magazine', 'Stories about artists, people and projects.'],
    ['Social', 'Clips everywhere, every one pointing home to TAM.TV.'],
    ['Community', 'An audience that helps decide what happens next.'],
    ['Data', 'Learning which artists, genres and nights people respond to.'],
    ['AI', 'Helping discover, organise, distribute and eventually programme.'],
  ];
  const body = h`
<header class="page-head">
  <p class="eyebrow">About TAM</p>
  <h1>TAM isn’t leaving the venue. It’s leaving the limitations of the venue behind.</h1>
  <p class="lede">For six years TAM, the Temple of Art and Music, has been a home for live music in ${ctx.c.site.locality}: artists, musicians, audiences and the stories between them. TAM.TV makes all of that location-independent, while keeping the live night at its heart.</p>
</header>

<section class="section split">
  <div>${raw(archiveRings(ctx.q.archiveByYear()))}</div>
  <div>
    <h2>Six years, six rings</h2>
    <p>Each ring around the mark is a year of TAM. Its length is how much of that year is in the archive: performances, films, photographs, interviews and stories. The rings grow as the archive is rebuilt, so the logo itself shows how much of TAM’s history has been saved.</p>
    <p class="muted">Add legacy material per year in <code>content/archive.json</code>.</p>
  </div>
</section>

<section class="section">
  <h2>One ecosystem, many ways in</h2>
  <div class="grid grid-4">${pillars.map(([t, d]) => h`<article class="card pillar"><div class="card-body"><h3>${t}</h3><p>${d}</p></div></article>`)}</div>
</section>

<section class="section split">
  <div class="logo-demo"><div class="logo-frame"><div class="halo" aria-hidden="true"></div><div class="logo-backing" aria-hidden="true"></div>${raw(logo('full', { width: 380 }))}</div></div>
  <div>
    <h2>The Temple of Art and Music</h2>
    <p>The TAM mark is four letters sharing one circle: T, A and two Ms. It appears on TAM.TV exactly as drawn, and never altered.</p>
    <ul>
      <li><strong>The light around it keeps London time.</strong> The halo behind the logo and the gold of the site move from rose-gold dawn to bright day, amber dusk and a slow-breathing night.</li>
      <li><strong>The TAM 108 fall behind every page.</strong> 108 songs drop down the background: their titles, and for songs in the public domain their choruses.</li>
      <li><strong>Every artist, event and film gets its own coloured vinyl.</strong> Its name picks one of 24 rare colourways (Opal Fire, Bioluminescence, Ammolite, Cosmic Latte…) and one of seven pressings, from marble to splatter. It’s the same record every time, until real photography arrives.</li>
    </ul>
  </div>
</section>`;
  return layout(ctx, { title: 'About', description: 'Six years of TAM, and the move from a venue to a live music and media network.', path: '/about', body });
}

const STRAND_OPTIONS = (ctx) => ctx.c.strands.map((s) => [s.slug, s.name]);

export function submit(ctx, { values = {}, errors = {}, done = false } = {}) {
  const err = (k) => (errors[k] ? h`<span class="error" id="err-${k}">${errors[k]}</span>` : '');
  const v = (k) => values[k] ?? '';
  const aria = (k) => raw(errors[k] ? ` aria-invalid="true" aria-describedby="err-${k}"` : '');
  const body = done
    ? h`<header class="page-head narrow"><p class="eyebrow">Play TAM</p><h1>Thank you. We’ve got it.</h1>
      <p class="lede">Every proposal is read by a person. If it’s a fit for TAM Festival we’ll be in touch by email.</p>
      <p><a class="btn" href="/festival">See what’s on</a></p></header>`
    : h`
<header class="page-head narrow">
  <p class="eyebrow">Play TAM</p>
  <h1>Want to play TAM?</h1>
  <p class="lede">Tell us about you and the night you’d put on. Selected artists get a live audience, a filmed performance, an interview and a permanent page on TAM.TV.</p>
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
    <select id="strand" name="strand"><option value="">Not sure yet</option>${STRAND_OPTIONS(ctx).map(([s, n]) => h`<option value="${s}"${v('strand') === s ? raw(' selected') : ''}>${n}</option>`)}</select></div>
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
  return layout(ctx, { title: 'Play TAM', description: 'Propose a night at TAM Festival.', path: '/submit', body });
}

export function signupResult(ctx, { ok, errors = {} }) {
  const body = ok
    ? h`<header class="page-head narrow"><p class="eyebrow">The TAM list</p><h1>You’re on the list.</h1><p class="lede">See you at the next one.</p><p><a class="btn" href="/festival">What’s on</a></p></header>`
    : h`<header class="page-head narrow"><p class="eyebrow">The TAM list</p><h1>Almost.</h1><p class="lede">${Object.values(errors).join(' ')}</p></header>${signupForm(ctx, { compact: false })}`;
  return layout(ctx, { title: 'Newsletter', path: '/signup', body, noindex: true });
}

export function privacy(ctx) {
  const body = h`
<header class="page-head narrow"><p class="eyebrow">Privacy &amp; cookies</p><h1>Plain-English privacy.</h1></header>
<div class="prose narrow">
  <p>TAM.TV is run by ${ctx.c.site.legalName}. We follow UK GDPR and PECR. This page will be replaced by a reviewed privacy notice before launch.</p>
  <h2>Cookies</h2>
  <p><strong>tam_consent</strong> remembers whether you allowed analytics (12 months). It is strictly necessary to respect your choice.</p>
  <p>If you allow analytics we record anonymous page views and which artists, events and stories are viewed, against a random visitor ID stored in the <strong>tam_vid</strong> cookie. We do not use third-party advertising or tracking cookies. If you decline, nothing is recorded. You can change your mind with the button below.</p>
  <p><button class="btn btn-small" data-consent="denied">Withdraw analytics consent</button> <button class="btn btn-small btn-ghost" data-consent="granted">Allow analytics</button></p>
  <h2>Newsletter and submissions</h2>
  <p>If you join the list or send a Play TAM proposal, we keep what you give us to reply to you and, if you ask, to send you TAM news. Email us to see, correct or delete your data.</p>
  <h2>Embedded video</h2>
  <p>Films are embedded with YouTube’s privacy-enhanced mode (youtube-nocookie.com).</p>
</div>`;
  return layout(ctx, { title: 'Privacy', path: '/privacy', body });
}

export function studio(ctx, { aiEnabled }) {
  const body = h`
<header class="page-head narrow">
  <p class="eyebrow">TAM Studio · Production Agent</p>
  <h1>Turn one night into a content package.</h1>
  <p class="lede">Pick an artist and an event, add your notes from the night, and the Production Agent drafts the profile, captions for each platform, SEO metadata, clip ideas, interview questions and story angles. Always edit before publishing.</p>
  ${aiEnabled ? '' : h`<p class="error-summary">AI is off: set <code>ANTHROPIC_API_KEY</code> and <code>ADMIN_TOKEN</code> on the server to enable the Production Agent.</p>`}
</header>
<form class="form narrow" data-studio>
  <div class="field"><label for="token">Studio token</label><input id="token" name="token" type="password" autocomplete="current-password" required></div>
  <div class="field-row">
    <div class="field"><label for="artist">Artist</label><select id="artist" name="artist">${ctx.c.artists.map((a) => h`<option value="${a.slug}">${a.name}</option>`)}</select></div>
    <div class="field"><label for="event">Event</label><select id="event" name="event"><option value="">—</option>${ctx.c.events.map((e) => h`<option value="${e.slug}">${e.title} · ${fmtDate(e.start, { day: 'numeric', month: 'short' })}</option>`)}</select></div>
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
  <p class="lede">That page doesn’t exist (yet). This record was pressed from the address you tried, so at least you got some art.</p>
  <p><a class="btn" href="/">Back to TAM.TV</a></p>
</header>`;
  return layout(ctx, { title: 'Not found', path: ctx.path, body, noindex: true });
}

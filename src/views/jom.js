// JOM Youth Music × TAM (src/domain/jom.js): the evergreen hub and every act's
// permanent page. Served at jom.tam.tv (/, /:slug…) and at www.tam.tv/jom.
// The back office is /jom/manage on www.

import { html, raw } from './html.js';
import { embedHtml } from '../lib/media-posts.js';
import { html as respond, redirect, send } from '../lib/http.js';
import { layout, when } from './layout.js';
import { RELATIONS } from '../domain/jom.js';
import { longDate } from '../lib/content.js';

// links inside the JOM pages: bare on jom.tam.tv, under /jom on www
const L = (req, p = '/') => (req.onJom ? p : `/jom${p === '/' ? '' : p}`);
const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function page(ctx, req, o) {
  // on jom.tam.tv the pages are its own; on www they stay www's (until jom.tam.tv's DNS is in, it's the only address)
  const canonical = req.onJom ? `https://${ctx.cfg.jomHost}${o.sub || '/'}` : null;
  return layout(ctx, { ambient: 'stars', scripts: ['/js/jom.js'], bodyClass: `jom ${o.bodyClass || ''}`, canonical, ...o, path: o.path || `/jom${o.sub === '/' ? '' : o.sub || ''}` });
}

function card(req, a) {
  return html`<a class="jm-card" href="${L(req, `/${a.slug}`)}">
    <div class="jm-pic">${a.photo ? html`<img src="${a.photo}" alt="" loading="lazy" width="300" height="375">` : html`<span>${initials(a.name)}</span>`}</div>
    <div class="jm-card-body"><b>${a.name}</b><small>${a.groupName}</small>${a.pledges ? html`<small class="jm-pl">🎄 ${a.pledges} pledged</small>` : ''}</div></a>`;
}

// The carousel at the top: JOM's banners, then every act with a photo (each to their page).
function carousel(ctx, req, jom) {
  const J = jom.J;
  const href = (h) => (h.startsWith('#') ? h : h.startsWith('/events/') ? `${ctx.cfg.siteUrl}${h}` : h);
  const slides = (J.banners || []).map((b) => ({ ...b, href: href(b.href || '#') }))
    .concat(jom.shown().filter((a) => a.photo).map((a) => ({ src: a.photo, alt: `${a.name}: ${a.groupName}`, href: L(req, `/${a.slug}`) })));
  if (!slides.length) return '';
  return html`<div class="fx-car jm-car" data-carousel tabindex="0" role="region" aria-roledescription="carousel" aria-label="JOM at TAM: banners and acts">
    <div class="fx-stage">${slides.map((s, i) => html`<figure class="fx-slide${s.video ? ' is-video' : ''}${s.fit ? ' fit' : ''}" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}">${s.video
      ? html`<a href="${s.href}" tabindex="-1"><video muted loop playsinline preload="metadata" poster="${s.src}" aria-label="${s.alt}"><source src="${s.video}" type="video/mp4"></video><img class="fx-alt" src="${s.src}" alt="${s.alt}" hidden></a><button type="button" class="fx-sound" aria-pressed="false" aria-label="Sound on">🔇</button>`
      : html`<a href="${s.href}" tabindex="-1"><img src="${s.src}" alt="${s.alt}" ${i > 2 ? html`loading="lazy"` : ''} width="1080" height="1350"></a>`}</figure>`)}</div>
    <div class="fx-ctrl"><button type="button" class="fx-arrow" data-dir="-1" aria-label="Previous">‹</button>
      <div class="fx-dots" role="tablist">${slides.map((s, i) => html`<button type="button" role="tab" data-go="${i}" aria-label="${s.alt}"></button>`)}</div>
      <button type="button" class="fx-arrow" data-dir="1" aria-label="Next">›</button></div>
    <p class="fx-caption" aria-live="polite"></p><p class="fx-credit">Plates and banners by JOM Youth Music</p></div>`;
}

const dayOf = (d) => longDate(d).replace(/ \d{4}$/, '');

function hub(ctx, req, jom) {
  const J = jom.J;
  const acts = jom.shown();
  const next = jom.nextSession();
  const later = (J.upcoming || []).filter((u) => u.date >= ctx.today());
  const f = jom.festival();
  const X = J.christmas;
  const top = acts.filter((a) => a.pledges).sort((x, y) => y.pledges - x.pledges).slice(0, 6);
  const groups = Object.entries(J.groups).map(([k, v]) => [v, acts.filter((a) => a.group === k)]).filter(([, l]) => l.length);
  const nextCard = next
    ? html`<div class="jm-next"><span class="label">Next JOM session at TAM</span><b>${next.title}</b><span>${when(next)} · ${next.doors} to ${next.ends}</span>
        <a class="btn hot" href="${ctx.cfg.siteUrl}/events/${next.slug}#book">Get free tickets</a></div>`
    : later.length ? html`<div class="jm-next"><span class="label">Next JOM dates</span><b>${later.map((u) => u.title).join(' and ')}</b><span>${dayOf(later[0].date)} · ${later[0].venue.split(',')[0]}</span>
        <a class="btn hot" href="#next-dates">See the dates</a></div>`
    : html`<p class="jm-next"><b>The next JOM session is coming soon.</b> <span>Watch this page, or <a href="${ctx.cfg.siteUrl}/club">join the TAM list</a>.</span></p>`;
  return page(ctx, req, {
    title: 'JOM Youth Music × TAM', sub: '/', og: (J.sessions[0] || {}).poster,
    description: 'Young bands and singers on a real stage: JOM Youth Music at TAM. Every act’s own page, their music, the nights they’ve played, the next JOM dates, and how to play The Best Christmas Ever.',
    body: html`<section class="section jm-hero"><div class="wrap jm-hero-grid"><div>
      <div class="label">${J.title}</div><h1 class="chrome gold">JOM at TAM</h1><p class="lede">${J.lede}</p>${nextCard}
      ${X ? html`<p class="small"><a href="#christmas">🎄 ${X.title}: apply now</a></p>` : ''}
      </div>${carousel(ctx, req, jom)}</div></section>
    ${top.length ? html`<section class="section"><div class="wrap"><h2 class="chrome">Most pledged for Christmas</h2>
      <p>Fans are pledging to see these acts at ${f ? f.name : 'The Best Christmas Ever'}. Pledge for your favourite on their page.</p><div class="jm-grid">${top.map((a) => card(req, a))}</div></div></section>` : ''}
    ${groups.map(([name, list]) => html`<section class="section jm-group"><div class="wrap"><h2 class="chrome">${name}</h2><div class="jm-grid">${list.map((a) => card(req, a))}</div></div></section>`)}
    ${X ? html`<section class="section" id="christmas"><div class="wrap narrow"><div class="jm-xmas"><div class="label">🎄 ${f ? f.name : 'The Best Christmas Ever'} · TAM · date to be announced</div>
      <h2 class="chrome gold">${X.title}</h2><p>${X.lede}</p><p class="small muted">${X.note}</p>
      <form id="jm-xmas" novalidate>
        <div class="fields"><label class="field"><span>The act’s name</span><input name="act" maxlength="80" required list="jm-acts"></label>
        <label class="field"><span>Which open mic</span><select name="group" required><option value="">Choose…</option><option value="junior">Junior (ages 4 to 15)</option><option value="youth">Youth (ages 12 to 18)</option></select></label>
        <label class="field"><span>What they play</span><input name="plays" maxlength="160" placeholder="e.g. a four-piece rock band, a singer with ukulele"></label>
        <label class="field"><span>How many in the act</span><input name="members" type="number" min="1" max="12" value="1" inputmode="numeric"></label>
        <label class="field full"><span>Links to their music (optional, one per line)</span><textarea name="links" rows="2" placeholder="YouTube, Spotify, SoundCloud, Instagram…"></textarea></label>
        <label class="field full"><span>JOM sessions they’ve played</span><input name="played" maxlength="300" placeholder="e.g. TAM x JOM Sessions, Nov 2026; Hootananny, Oct 2026"></label>
        <label class="field full"><span>Anything else (dates you can’t do in December, equipment…)</span><textarea name="notes" rows="2" maxlength="1000"></textarea></label>
        <label class="field"><span>Your name</span><input name="name" maxlength="80" required autocomplete="name"></label>
        <label class="field"><span>Your email</span><input name="email" type="email" required autocomplete="email"></label></div>
        <fieldset class="cl-chips"><legend>You are</legend>${Object.entries(RELATIONS).map(([k, v], i) => html`<label class="cl-chip"><input type="radio" name="relation" value="${k}" ${i ? '' : 'checked'}><span>${v}</span></label>`)}</fieldset>
        <label class="check"><input type="checkbox" name="consent" required> I’m the parent or guardian of the under-18s in this act (or I’m in it and 18+), and I’m happy for TAM to contact me about playing the festival.</label>
        <button class="btn hot" type="submit">Apply to play</button><p class="err" role="status" aria-live="polite"></p>
        <datalist id="jm-acts">${acts.map((a) => html`<option value="${a.name}">`)}</datalist></form></div></div></section>` : ''}
    <section class="section"><div class="wrap jm-two"><div><h2 class="chrome">About JOM</h2><p>${J.about}</p>
      ${J.sessions.map((s) => html`<p class="small">Played at TAM: <a href="${ctx.cfg.siteUrl}/events/${s.slug}">${s.title}, ${longDate(s.date)}</a></p>`)}</div>
      <div class="formbox"><h2>Parents and guardians</h2><p>Every act has a page that stays, so they can share it for years. If you’re a parent or guardian of someone in the act, open their page and tap <b>Claim this page</b>. We check every claim, then you can add photos, a short bio and links to their music.</p>
      <p class="small muted">We check every change before it goes on the page. We never show ages, schools or where anyone lives, and you can ask us to take a page down at any time. <a href="${L(req, '/sign-in')}">Already claimed? Sign in</a></p></div></div></section>
    ${later.length ? html`<section class="section" id="next-dates"><div class="wrap"><h2 class="chrome">Come and see JOM next</h2>
      <div class="jm-dates">${later.map((u) => html`<article class="jm-date">${u.poster ? html`<img src="${u.poster}" alt="${u.title}: ${dayOf(u.date)}, ${u.time}, ${u.venue}" loading="lazy" width="640" height="640">` : ''}
        <div><b>${u.title}</b><span>${longDate(u.date)} · ${u.time}</span><span>${u.venue}</span><span>${u.who}</span>${u.note ? html`<span class="jm-full">${u.note}</span>` : ''}</div></article>`)}</div>
      ${J.venues ? html`<p class="small muted">${J.venues} Every JOM night at TAM is on <a href="${ctx.cfg.siteUrl}/whats-on">TAM’s listings</a>.</p>` : ''}</div></section>` : ''}`,
  });
}

function profile(ctx, req, jom, a) {
  const f = jom.festival();
  const url = req.onJom ? `https://${ctx.cfg.jomHost}/${a.slug}` : `${ctx.cfg.siteUrl}/jom/${a.slug}`;
  const played = a.sessions.map((s) => jom.sessionOf(s)).filter(Boolean).sort((x, y) => String(y.date).localeCompare(String(x.date)));
  return page(ctx, req, {
    title: `${a.name} · JOM at TAM`, sub: `/${a.slug}`, og: a.photo || undefined,
    description: `${a.name}: ${a.groupName} at TAM with JOM Youth Music. Pledge to see ${a.name} at ${f ? f.name : 'The Best Christmas Ever'}.`,
    body: html`<section class="section jm-act"><div class="wrap jm-act-grid">
      <div class="jm-photos ${a.photos.length > 1 ? 'many' : ''}">${a.photos.length ? a.photos.map((p, i) => html`<img src="${p}" alt="${i ? '' : `${a.name}`}" width="600" height="750" ${i ? 'loading="lazy"' : ''}>`) : html`<div class="jm-pic big"><span>${initials(a.name)}</span></div>`}</div>
      <div><p class="label"><a href="${L(req, '/')}">JOM at TAM</a> · ${a.groupName}</p><h1 class="chrome gold">${a.name}</h1>
        ${a.bio ? html`<div class="prose">${a.bio.split(/\n\s*\n/).map((p) => html`<p>${p}</p>`)}</div>` : ''}
        ${a.links.length ? html`<p class="jm-links">${a.links.map((l) => html`<a class="btn ghost small" href="${l}" target="_blank" rel="noopener">${(() => { try { return new URL(l).hostname.replace(/^www\.|^open\.|^music\./, '').split('.')[0]; } catch { return 'Link'; } })()} ↗</a>`)}</p>` : ''}
        ${a.posts.length ? html`<h2 class="jm-h">From ${a.name}</h2><div class="aw-grid jm-posts">${a.posts.map((p) => html`<figure class="aw-post">${raw(embedHtml(p))}${p.caption ? html`<figcaption>${p.caption}</figcaption>` : ''}</figure>`)}</div>` : ''}
        ${played.length ? html`<h2 class="jm-h">Played at TAM</h2><ul class="jm-played">${played.map((s) => html`<li><a href="${ctx.cfg.siteUrl}/events/${s.slug}">${s.title}</a> <small>${longDate(s.date)}</small></li>`)}</ul>` : ''}
        <div class="jm-pledge" data-pledge="${a.slug}"><div class="label">🎄 ${f ? f.name : 'The Best Christmas Ever'}${f ? ` · ${new Date(`${f.dates.from}T12:00:00Z`).getUTCDate()}–${new Date(`${f.dates.to}T12:00:00Z`).getUTCDate()} December at TAM` : ''}</div>
          <h2>See ${a.name} at the festival</h2><p>Pledge to come, and help put ${a.name} on TAM’s Christmas stage. TAM’s programmers see every pledge.</p>
          <div class="jm-pledge-row"><label><span class="sr">How many of you</span><select data-n>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => html`<option value="${n}">${n === 1 ? 'Just me' : `${n} of us`}</option>`)}</select></label>
          <button class="btn hot" type="button" data-go>I’ll be there</button><b data-count>${a.pledges}</b><span>pledged</span></div>
          <p class="small muted" data-msg role="status" aria-live="polite">A pledge isn’t a ticket.${f ? html` <a href="${ctx.cfg.siteUrl}${f.path}">Festival tickets</a>.` : ''}</p></div>
        <div class="jm-share" data-share data-url="${url}" data-title="${a.name} · JOM at TAM" data-text="${a.name} at TAM with JOM Youth Music: pledge to see them at The Best Christmas Ever">
          <button class="btn ghost small" type="button" data-native hidden>Share</button><a class="btn ghost small" href="https://wa.me/?text=${encodeURIComponent(`${a.name} at TAM with JOM: pledge to see them at The Best Christmas Ever ${url}`)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn ghost small" type="button" data-copy>Copy link</button></div>
      </div></div></section>
    <section class="section"><div class="wrap narrow">
      ${a.claimed ? html`<p class="small muted">This page is looked after by ${a.name}’s parent or guardian, with TAM. <a href="${L(req, '/sign-in')}">Sign in to update it</a>.</p>` : html`
      <details class="formbox jm-claim"><summary><b>Parent or guardian? Claim this page</b></summary>
        <form data-claim="${a.slug}"><p class="small">Claim ${a.name}’s page to add photos, a short bio and links to their music. We check every claim, and every change, before it goes on the page.</p>
        <div class="fields"><label class="field"><span>Your name</span><input name="name" maxlength="80" required autocomplete="name"></label>
        <label class="field"><span>Your email</span><input name="email" type="email" required autocomplete="email"></label></div>
        <fieldset class="cl-chips"><legend>You are</legend>${Object.entries(RELATIONS).map(([k, v], i) => html`<label class="cl-chip"><input type="radio" name="relation" value="${k}" ${i ? '' : 'checked'}><span>${v}</span></label>`)}</fieldset>
        <label class="field"><span>Anything that helps us check (optional)</span><input name="note" maxlength="600" placeholder="e.g. I booked their JOM slot, or they play guitar in the band"></label>
        <label class="check"><input type="checkbox" name="consent" required> I’m the parent or guardian of the under-18s in this act (or I’m in it and 18+), and I’m happy for TAM to show this page.</label>
        <button class="btn hot" type="submit">Send my claim</button><p class="err" role="status" aria-live="polite"></p></form></details>`}
      <details class="jm-concern"><summary class="small">Report a concern, or ask us to take this page down</summary>
        <form data-concern="${a.slug}"><div class="fields"><label class="field"><span>Your name (optional)</span><input name="name" maxlength="80"></label><label class="field"><span>Email so we can reply (optional)</span><input name="email" type="email"></label></div>
        <label class="field"><span>What’s wrong?</span><textarea name="message" rows="3" maxlength="1500" required></textarea></label><button class="btn ghost small" type="submit">Send to TAM</button><p class="err" role="status" aria-live="polite"></p></form></details>
      <p><a href="${L(req, '/')}">← Every JOM act</a></p></div></section>`,
  });
}

export function routes(r, ctx, jom) {
  r.get('/jom', (req, res) => respond(res, hub(ctx, req, jom)));
  r.get('/jom/sign-in', (req, res) => respond(res, page(ctx, req, { title: 'Sign in: JOM at TAM', sub: '/sign-in', noindex: true,
    body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome gold">Parents and guardians</h1><form class="formbox" id="jm-signin"><p>Type the email you claimed the page with, and we’ll send you a sign-in link.</p>
    <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label><button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form></div></section>` })));
  r.get('/jom/in', (req, res) => respond(res, page(ctx, req, { title: 'JOM at TAM', sub: '/in', noindex: true,
    body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome gold">JOM at TAM</h1><div class="formbox" id="jm-in"><p>Open their page on this device.</p><button class="btn hot" type="button">Open</button><p class="err" role="status" aria-live="polite"></p></div></div></section>` })));
  r.get('/jom/me', (req, res) => respond(res, page(ctx, req, { title: 'Update their page: JOM at TAM', sub: '/me', noindex: true,
    body: html`<section class="section"><div class="wrap"><div id="jm-me"><p class="muted">Loading…</p></div></div></section>` }), 200, { 'Cache-Control': 'no-store' }));
  r.get('/jom/manage', (req, res) => {
    if (req.onJom) return redirect(res, `${ctx.cfg.siteUrl}/jom/manage`);
    respond(res, layout(ctx, { title: 'JOM at TAM: back office', path: '/jom/manage', noindex: true, ambient: null, scripts: ['/js/jom-manage.js'], bodyClass: 'staff',
      body: html`<section class="section"><div class="wrap wide"><div class="shows-top"><div><div class="label">TAM back office</div><h1 class="chrome gold">JOM at TAM</h1></div><div id="jmm-who" class="small muted"></div></div>
      <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Type your work email and we’ll send you a one-tap sign-in link.</p>
      <form id="team-link"><input type="hidden" name="next" value="/jom/manage"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form>
      <details class="small"><summary>Use the admin code instead</summary><form id="team-code"><label class="field"><span>Code</span><input name="token" type="password" autocomplete="current-password" required></label>
      <button class="btn ghost" type="submit">Sign in</button><p class="err" role="status" aria-live="polite"></p></form></details></div>
      <div id="jmm" hidden></div></div></section>` }));
  });
  r.get('/jom/:slug', (req, res, { params }) => {
    const a = jom.act(params.slug);
    if (!a || a.hidden) return respond(res, page(ctx, req, { title: 'Not here', sub: `/${params.slug}`, noindex: true, body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome">That page isn’t here</h1><p><a href="${L(req, '/')}">Every JOM act</a></p></div></section>` }), 404);
    respond(res, profile(ctx, req, jom, a));
  });
}

// jom.tam.tv: the JOM pages at the top level; robots and a sitemap of its own; everything else goes to www.
export function serveJom(ctx, jom, site, req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const p = url.pathname, host = `https://${ctx.cfg.jomHost}`;
  req.onJom = true;
  if (p === '/robots.txt') { send(res, 200, req.indexable ? `User-agent: *\nAllow: /\nSitemap: ${host}/sitemap.xml\n` : 'User-agent: *\nAllow: /\n', { 'Content-Type': 'text/plain; charset=utf-8' }); return true; }
  if (p === '/sitemap.xml') {
    const urls = ['/'].concat(jom.shown().map((a) => `/${a.slug}`)).map((u) => `<url><loc>${host}${u}</loc></url>`).join('');
    send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`, { 'Content-Type': 'application/xml; charset=utf-8' }); return true;
  }
  const inner = p === '/' ? '/jom' : `/jom${p.replace(/\/$/, '')}`;
  const ours = p === '/' || ['/sign-in', '/in', '/me', '/manage'].includes(p) || (/^\/[\w-]+$/.test(p) && jom.act(p.slice(1)));
  const m = ours ? site.match('GET', inner) : null;
  if (m) return { handler: m.handler, params: m.params };
  redirect(res, `${ctx.cfg.siteUrl}${p}${url.search}`, 302);
  return true;
}

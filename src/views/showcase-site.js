// showcase.tam.tv: the Sunday Showcase's own microsite. It promotes the next
// showcase (the line-up, free tickets), shows how to get on one and where it
// can lead, and builds a community around it: the newest notes and posts from
// every act's wall, everyone who has played, and the Showcase Crew to join.
// Everything else on showcase.tam.tv goes to the same page on www.tam.tv.
// Words are in content/showcases.json → microsite.

import { html } from './html.js';
import { html as respond, redirect, send } from '../lib/http.js';
import { layout, when, nightHref } from './layout.js';
import { lineupCarousel, showcaseLockup } from './showcases.js';

const embed = (w) => (w.kind === 'youtube'
  ? html`<div class="aw-embed aw-yt"><iframe src="https://www.youtube-nocookie.com/embed/${w.videoId}" title="YouTube video" loading="lazy" allowfullscreen></iframe></div>`
  : html`<div class="aw-embed aw-ig"><iframe src="https://www.instagram.com/${w.postType || 'p'}/${w.postId}/embed" title="Instagram post" loading="lazy" scrolling="no"></iframe></div>`);

function home(ctx, showcase) {
  const W = ctx.cfg.siteUrl, s = ctx.content.showcases, m = s.microsite;
  const host = `https://${ctx.cfg.showcaseHost}`;
  const l = showcase.next();
  const day = l ? l.when.replace(/ \d{4}$/, '') : '';
  const tickets = l && l.night && l.night.onSale ? `${W}/sunday-showcases#book` : `${W}/sunday-showcases`;
  const wall = showcase.latestWall(12);
  const alumni = showcase.alumni();
  const nextOf = (r) => { const rx = new RegExp(r.match, 'i'); return ctx.content.upcoming(ctx.today()).find((n) => !n.festival && (rx.test(`${n.title} ${n.label || ''}`) || (r.series && n.series === r.series))); };
  return layout(ctx, {
    title: m.title, path: '/', canonical: `${host}/`, description: `${m.tagline} ${m.lede}`, og: '/img/og.jpg', bodyClass: 'ss-site', ambient: null,
    scripts: ['/js/showcase-site.js'],
    jsonLd: { '@context': 'https://schema.org', '@type': 'EventSeries', name: m.title, url: `${host}/`, description: m.lede,
      organizer: { '@type': 'Organization', name: 'TAM, Temple of Art and Music', url: W },
      ...(l && l.night ? { subEvent: [{ '@type': 'MusicEvent', name: `Sunday Showcase: ${day}`, startDate: l.date, url: `${W}/sunday-showcases`, isAccessibleForFree: true,
        performer: l.acts.filter((a) => !a.tba).map((a) => ({ '@type': 'PerformingGroup', name: a.name })) }] } : {}) },
    body: html`<section class="ssx-hero"><div class="wrap">
  <div class="ssx-lock">${showcaseLockup('big')}</div>
  <h1 class="ssx-tag">${m.tagline}</h1>
  <p class="ssx-lede">${m.lede}</p>
  ${l ? html`<p class="ssx-next"><span class="ssx-pill">Next</span> <b>${day}</b> · ${l.count} acts · free entry${l.night && l.night.doors ? html` · doors ${l.night.doors}` : ''}</p>` : ''}
  <div class="ctas">${l ? html`<a class="btn ssx-btn" href="${tickets}">Free tickets</a>` : ''}<a class="btn ghost" href="#how">Get on the showcase</a><a class="btn ghost" href="#crew">Join the crew</a></div>
</div></section>
${l ? lineupCarousel(l, { base: `${W}/sunday-showcases` }) : ''}
<section class="section ssx-how" id="how"><div class="wrap">
  <div class="head"><div class="label">Play a showcase</div><h2>How to get on the line-up</h2></div>
  <ol class="ssx-steps">${s.steps.map((st, i) => html`<li><span class="ssx-n">${i + 1}</span><h3>${st.title}</h3><p>${st.text}</p></li>`)}</ol>
  <div class="ssx-circuit">${s.circuit.map((r) => { const n = nextOf(r); return html`<a class="ssx-night" href="${n ? `${W}${r.link || nightHref(n)}` : `${W}/whats-on`}"><b>${r.name}</b><span>${r.when}</span>${n ? html`<em>Next: ${when(n)}</em>` : ''}</a>`; })}</div>
  <p class="ssx-cta"><a class="btn ssx-btn" href="${W}/sunday-showcases#register">Register your interest</a></p>
</div></section>
<section class="section ssx-leads" id="leads"><div class="wrap">
  <div class="head"><div class="label">Where it can lead</div><h2>From open night to the big nights</h2></div>
  <ol class="ssx-ladder">${m.leads.map((x, i) => html`<li><span class="ssx-step">${String(i + 1).padStart(2, '0')}</span><h3>${x.title}</h3><p>${x.text}</p></li>`)}</ol>
</div></section>
<section class="section ssx-community" id="community"><div class="wrap">
  <div class="head"><div class="label">The community</div><h2>The Showcase Crew</h2><p class="muted">${m.crew}</p></div>
  ${wall.length ? html`<h3 class="ssx-h3">On the walls</h3><div class="aw-grid">${wall.map((w) => (w.kind === 'note'
    ? html`<figure class="aw-note"><blockquote>${w.message}</blockquote><figcaption>${w.name} → <a href="${W}${w.act.href}#wall">${w.act.name}</a></figcaption></figure>`
    : html`<figure class="aw-post">${embed(w)}<span class="aw-by">from <a href="${W}${w.act.href}">${w.act.name}</a></span></figure>`))}</div>` : ''}
  ${alumni.length ? html`<h3 class="ssx-h3">Who's played the showcase</h3><ul class="plain ssx-alumni">${alumni.map((a) => html`<li><a href="${W}${a.href}" class="vibe-${a.vibe}">${a.photo ? html`<img src="${a.photo}" alt="" loading="lazy" width="120" height="120">` : html`<span class="ssx-ph">${a.name.slice(0, 1)}</span>`}<b>${a.name}</b><span>${a.when.replace(/ \d{4}$/, '')}</span></a></li>`)}</ul>` : ''}
  <form class="ssx-join" id="crew" novalidate>
    <h3>Join the crew</h3><p>Hear about each showcase first: who's playing, free tickets, and how to get on the line-up.</p>
    <div class="fields"><label class="field"><span>Your name</span><input name="name" maxlength="60" required autocomplete="given-name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label></div>
    <fieldset class="ssx-role"><legend class="small muted">I'm</legend><label><input type="radio" name="role" value="fan" checked> a fan</label><label><input type="radio" name="role" value="musician"> a musician</label></fieldset>
    <label class="check"><input type="checkbox" name="consent"> Yes, email me about TAM's Sunday Showcases. <a href="${W}/privacy">Privacy</a></label>
    <button class="btn ssx-btn" type="submit">Join the crew</button><p class="small muted" role="status" aria-live="polite" data-crew-msg></p>
  </form>
</div></section>`,
  });
}

// showcase.tam.tv: the microsite at "/", its own robots and sitemap; every other page goes to www.tam.tv.
export function serveMicrosite(ctx, showcase, req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const p = url.pathname, host = `https://${ctx.cfg.showcaseHost}`;
  if (p === '/' && ctx.content.showcases && ctx.content.showcases.microsite) { respond(res, home(ctx, showcase)); return true; }
  if (p === '/robots.txt') {
    send(res, 200, req.indexable ? `User-agent: *\nAllow: /\nSitemap: ${host}/sitemap.xml\n` : 'User-agent: *\nAllow: /\n', { 'Content-Type': 'text/plain; charset=utf-8' }); return true;
  }
  if (p === '/sitemap.xml') {
    send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${host}/</loc></url></urlset>\n`, { 'Content-Type': 'application/xml; charset=utf-8' }); return true;
  }
  redirect(res, `${ctx.cfg.siteUrl}${p}${url.search}`, 302);
  return true;
}

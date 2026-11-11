// The featured show: a futuristic 3D carousel at the top of the home page and
// What's on (where it takes the Friday Night Live tile's place) and on the
// show's own page, until the night has passed. Set in content/site.json →
// featured: { slug, until, kicker, title, when, lede, cta, note, credit, slides[{ src, alt }] }.

import { html } from './html.js';

export function featuredNow(ctx) {
  const f = ctx.content.site.featured;
  if (!f || !f.slug || !(f.slides || []).length || (f.until && f.until < ctx.today())) return null;
  const n = ctx.content.nightBy.get(f.slug);
  return n ? { ...f, night: n } : null;
}

export function featuredHero(ctx, f, { heading = 'h2', compact = false } = {}) {
  if (!f) return '';
  const n = f.night;
  const href = `/events/${n.slug}${n.sale ? '#book' : ''}`;
  const H = heading === 'h1' ? (x) => html`<h1 class="fx-title">${x}</h1>` : (x) => html`<h2 class="fx-title">${x}</h2>`;
  return html`<section class="fx-hero${compact ? ' compact' : ''}" aria-label="${f.title}">
  <div class="fx-grid" aria-hidden="true"></div>
  <div class="wrap fx-in">
    <div class="fx-copy">
      <div class="fx-kicker"><span class="fx-dot"></span>${f.kicker}</div>
      ${H(f.title)}
      <p class="fx-when">${f.when}</p>
      ${f.lede ? html`<p class="fx-lede">${f.lede}</p>` : ''}
      <div class="ctas"><a class="btn fx-btn" href="${href}">${f.cta || 'Tickets'}</a>${compact ? '' : html`<a class="btn ghost" href="/events/${n.slug}#lineup">See the line-up</a>`}</div>
      ${f.note ? html`<p class="fx-note">${f.note}</p>` : ''}
    </div>
    <div class="fx-car" data-carousel tabindex="0" role="region" aria-roledescription="carousel" aria-label="${f.title}: the line-up">
      <div class="fx-stage">${f.slides.map((s, i) => html`<figure class="fx-slide${s.video ? ' is-video' : ''}" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${f.slides.length}">${s.video
        ? html`<a href="${href}" tabindex="-1"><video muted loop playsinline preload="metadata" poster="${s.src}" aria-label="${s.alt}"><source src="${s.video}" type="video/mp4"></video><img class="fx-alt" src="${s.src}" alt="${s.alt}" hidden></a><button type="button" class="fx-sound" aria-pressed="false" aria-label="Sound on">🔇</button>`
        : html`<a href="${href}" tabindex="-1"><img src="${s.src}" alt="${s.alt}" ${i > 2 ? html`loading="lazy"` : ''} width="1080" height="1350"></a>`}</figure>`)}</div>
      <div class="fx-ctrl"><button type="button" class="fx-arrow" data-dir="-1" aria-label="Previous">‹</button>
        <div class="fx-dots" role="tablist">${f.slides.map((s, i) => html`<button type="button" role="tab" data-go="${i}" aria-label="${s.alt}"></button>`)}</div>
        <button type="button" class="fx-arrow" data-dir="1" aria-label="Next">›</button></div>
      <p class="fx-caption" aria-live="polite"></p>
      ${f.credit ? html`<p class="fx-credit">${f.credit}</p>` : ''}
    </div>
  </div>
</section>`;
}

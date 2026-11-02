// Pathways: TAM tailored to who you are. /for lists them, /for/<slug> is one
// visitor's TAM, and the choice is remembered in a preference cookie so the
// home page and Ask TAM can tailor themselves too.

import { html } from './html.js';
import { html as respond, fail } from '../lib/http.js';
import { pounds } from '../../shared/pricing.js';
import { layout, nightCard, chatPanel, askTitle } from './layout.js';
import { visitSection } from './sections.js';
import { KIND_NAMES } from '../domain/enquiries.js';

export const PATH_COOKIE = 'tam_path';
export function pathwayOf(ctx, req) {
  const m = /(?:^|;\s*)tam_path=([a-z0-9-]+)/.exec(req.headers.cookie || '');
  return m ? ctx.content.pathwayBy.get(m[1]) || null : null;
}
const remember = (slug) => `${PATH_COOKIE}=${slug}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;

export function pathwayTiles(ctx, current) {
  return html`<div class="path-tiles">${ctx.content.pathways.map((p) => html`<a class="path-tile${current && current.slug === p.slug ? ' on' : ''}" href="/for/${p.slug}">
    <img class="pt-icon neon-ico" src="/img/neon/${p.icon}.svg" alt="" width="64" height="64"><b>${p.who}</b><small>${p.promise}</small></a>`)}</div>`;
}

function enquiryForm(p) {
  const kind = p.enquiry;
  const hire = kind === 'venue-hire' || kind === 'party';
  return html`<section class="section" id="enquire"><div class="wrap narrow">
  <form class="formbox" id="enquiry-form" data-kind="${kind}" data-pathway="${p.slug}" novalidate>
    <div class="label">${KIND_NAMES[kind]}</div>
    <h2 class="chrome gold">${kind === 'perform' ? 'Pitch a night' : kind === 'sponsor' ? 'Talk to us' : 'Ask for your date'}</h2>
    <p>${kind === 'perform' ? 'Tell us who you are, what you play and where we can hear you.' : 'Tell us what you have in mind. TAM’s team replies by email, usually within two working days.'}</p>
    <div class="fields">
      <label class="field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required maxlength="200" autocomplete="email"></label>
      <label class="field"><span>Phone (optional)</span><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
      <label class="field"><span>${kind === 'perform' ? 'Act or band name' : 'Company (optional)'}</span><input name="company" maxlength="80"></label>
      ${hire || kind === 'perform' ? html`<label class="field"><span>Date or dates</span><input name="date" maxlength="40" placeholder="e.g. Sat 12 Dec, or any Friday in March"></label>` : ''}
      ${hire ? html`<label class="field"><span>Guests</span><input name="guests" maxlength="20" inputmode="numeric" placeholder="e.g. 60"></label>
        <label class="field"><span>Budget (optional)</span><input name="budget" maxlength="40"></label>` : ''}
      <label class="field full"><span>${kind === 'perform' ? 'About your music (and links)' : 'What are you planning?'}</span><textarea name="message" rows="4" maxlength="2000" required></textarea></label>
    </div>
    <button class="btn hot" type="submit">Send</button><p class="err" role="status" aria-live="polite"></p>
    <p class="hint small">We use your details only to reply to you. <a href="/privacy">Privacy notice</a>.</p>
  </form>
</div></section>`;
}

function extras(ctx, p) {
  const c = ctx.content;
  const v = c.venueBy.get(c.site.defaultVenue) || {};
  const g = v.guide || {};
  const f = c.festivals.find((x) => x.dates && x.dates.to >= ctx.today());
  if (p.slug === 'venue-hire' && g.hire) {
    return html`<section class="section"><div class="wrap facts-grid">
      <div class="card"><div class="label">Capacity</div><h3>${g.hire.capacity}</h3><p class="muted">${g.hire.when}</p></div>
      <div class="card"><div class="label">Included</div><ul class="plain">${g.hire.includes.map((x) => html`<li>${x}</li>`)}</ul></div>
      <div class="card"><div class="label">Perfect for</div><ul class="plain">${g.hire.uses.map((x) => html`<li>${x}</li>`)}</ul><p class="muted small">${g.source}</p></div>
    </div></section>`;
  }
  if ((p.slug === 'musician' || p.slug === 'live-music') && (g.regulars || []).length) {
    return html`<section class="section"><div class="wrap"><div class="head"><div><div class="label">Every week at TAM</div><h2 class="chrome">The regulars</h2></div><p class="intro muted small">${g.source}</p></div>
      <div class="grid4">${g.regulars.map(([name, t], i) => html`<article class="card c${(i % 4) + 1}"><h3>${name}</h3><p>${t}</p></article>`)}</div></div></section>`;
  }
  if (p.slug === 'party' && f && f.pricing) {
    const pr = f.pricing;
    return html`<section class="section"><div class="wrap facts-grid">
      ${pr.flat ? html`<div class="card"><div class="label">${f.name}</div><h3>${pounds(pr.flat.price)} a ticket</h3><p>On most festival nights.</p></div>` : ''}
      ${(pr.groupTiers || []).length ? html`<div class="card"><div class="label">Groups save</div><ul class="plain">${pr.groupTiers.map((t) => html`<li>${t.label}: ${Math.round(t.off * 100)}% off</li>`)}</ul><p class="muted small">On standard-priced nights.</p></div>` : ''}
      ${(pr.packs || []).map((x) => html`<div class="card"><div class="label">${x.name}</div><h3>${Math.round(x.off * 100)}% off</h3><p>${x.min}–${x.max} people${x.needsTeam ? ', with a team name' : ''}.</p></div>`)}
      ${f.features.teamTables ? html`<div class="card"><div class="label">Team Tables</div><h3>Share a table of ${f.teamTables.seats}</h3><p>Too small for your own party? Start a table and other teams join.</p></div>` : ''}
    </div></section>`;
  }
  if (p.slug === 'brand' && f && f.features.sponsorship) {
    return html`<section class="section"><div class="wrap"><div class="pkgs">${f.sponsorship.packages.map((x) => html`<article class="pkg"><h3>${x.name}</h3><p class="price">${pounds(x.price)}</p><ul>${x.perks.map((k) => html`<li>${k}</li>`)}</ul></article>`)}</div></div></section>`;
  }
  return '';
}

export function routes(r, ctx, d) {
  const c = ctx.content;

  r.get('/for', (req, res) => {
    const current = pathwayOf(ctx, req);
    respond(res, layout(ctx, {
      title: 'What brings you to TAM?', path: '/for', pathway: current,
      description: 'Live music, playing TAM, hiring the venue, parties and partnerships: find your way in.',
      body: html`<section class="section"><div class="wrap"><div class="label">Temple of Art and Music</div><h1 class="chrome gold">What brings you to TAM?</h1>
        ${pathwayTiles(ctx, current)}</div></section>`,
    }));
  });

  r.get('/for/:slug', (req, res, { params }) => {
    const p = c.pathwayBy.get(params.slug);
    if (!p) throw fail(404, 'We couldn’t find that page.');
    const nights = c.nightsForPathway(p, ctx.today()).slice(0, 6);
    const others = c.pathways.filter((x) => x.slug !== p.slug);
    respond(res, layout(ctx, {
      title: p.title, path: `/for/${p.slug}`, pathway: p, description: p.promise, scripts: ['/js/festival.js'],
      body: html`
<section class="hero path-hero"><div class="wrap path-in">
  <div class="hero-copy">
    <a class="label" href="/for">${p.who}</a>
    <h1 class="chrome gold">${p.title}</h1>
    <p class="lede">${p.promise}</p>
    <div class="ctas">${p.enquiry ? html`<a class="btn hot" href="#enquire">${p.enquiry === 'perform' ? 'Pitch a night' : 'Enquire'}</a>` : html`<a class="btn hot" href="/whats-on">What's on</a>`}
      <a class="btn ghost" href="#steps">How it works</a></div>
  </div>
  <div class="path-ask">${askTitle(p.askLine || 'Your guide to everything at TAM')}${chatPanel(p.questions, p, { id: 'page' })}</div>
</div></section>
<section class="section" id="steps"><div class="wrap"><div class="steps">${p.steps.map((s, i) => html`<a class="step-card" href="${s.link}"><span class="step-n">${i + 1}</span><h3>${s.title}</h3><p>${s.text}</p><span class="more">${s.label} →</span></a>`)}</div></div></section>
${nights.length ? html`<section class="section"><div class="wrap"><div class="head"><h2 class="chrome">${p.slug === 'party' ? 'Nights for your party' : p.slug === 'musician' ? 'Nights for players' : 'Coming up for you'}</h2><a class="more" href="/whats-on">Everything on →</a></div>
  <div class="nights-grid">${nights.map((n) => nightCard(ctx, n, d.tickets.nightAvailability(n)))}</div></div></section>` : ''}
${extras(ctx, p)}
${p.enquiry ? enquiryForm(p) : ''}
<section class="section"><div class="wrap"><div class="head"><h2 class="chrome">Other ways in</h2></div>
  <div class="path-tiles small">${others.map((o) => html`<a class="path-tile" href="/for/${o.slug}"><img class="pt-icon neon-ico" src="/img/neon/${o.icon}.svg" alt="" width="44" height="44"><b>${o.who}</b></a>`)}</div></div></section>
${p.slug === 'venue-hire' || p.slug === 'live-music' ? visitSection(ctx) : ''}`,
    }), 200, { 'Set-Cookie': remember(p.slug) });
  });

  r.post('/for/forget', (req, res) => respond(res, '', 204, { 'Set-Cookie': `${PATH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax` }));
}

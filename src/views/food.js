// The food guide (src/domain/vendors.js): /food, each trader's page, pre-orders
// for TAM nights, the traders' own page (/food/me) and TAM's back office (/food/manage).

import { html } from './html.js';
import { html as respond, redirect } from '../lib/http.js';
import { layout } from './layout.js';
import { DIETARY, CATEGORIES } from '../domain/vendors.js';
import { pounds } from '../../shared/pricing.js';

const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const page = (ctx, o) => layout(ctx, { ambient: 'stars', scripts: ['/js/food.js'], bodyClass: `food ${o.bodyClass || ''}`, ...o });
const badges = (list) => html`<span class="fd-badges">${list.map((d) => html`<span class="fd-badge fd-${d}">${DIETARY[d] || d}</span>`)}</span>`;

function card(v) {
  return html`<a class="fd-card" href="/food/${v.slug}" data-cat="${v.category}" data-diet="${v.dietary.join(' ')}">
    <div class="fd-pic">${v.photos[0] ? html`<img src="${v.photos[0]}" alt="" loading="lazy" width="360" height="270">` : html`<span>${initials(v.name)}</span>`}${v.preorders ? html`<b class="fd-pre">Pre-order</b>` : ''}</div>
    <div class="fd-body"><b>${v.name}</b><small>${v.tagline}</small>${badges(v.dietary)}</div></a>`;
}

const nightLabel = (n) => `${n.weekday} ${n.day} ${n.month}`;

function directory(ctx, food) {
  const m = food.market;
  const vs = food.live();
  const nights = food.nights();
  const cats = Object.entries(CATEGORIES).filter(([k]) => vs.some((v) => v.category === k));
  return page(ctx, {
    title: 'Food at Mercato Metropolitano', path: '/food',
    description: `Every food trader at ${m.name || 'Mercato Metropolitano Elephant & Castle'}, TAM’s home: what they cook, dietary options, menus, and pre-orders for TAM nights.`,
    body: html`<section class="section fd-hero"><div class="wrap"><div class="label">TAM’s neighbours · ${m.name}</div>
      <h1 class="chrome gold">Eat before the show</h1>
      <p class="lede">TAM lives inside Mercato Metropolitano, with kitchens from all over the world a few steps from the stage. Here’s every trader, what they cook and what suits you. Drinks are at TAM’s bar.${nights.length ? ' Coming to a TAM night? Pre-order and pick it up when you arrive: no queue, and nothing goes to waste.' : ''}</p>
      ${nights.length ? html`<p><a class="btn hot" href="/food/preorder">Pre-order for a TAM night</a></p>` : ''}
      <p class="small muted">${m.address}${(m.hours || []).length ? html` · Market hours: ${m.hours.join(' · ')}` : ''}</p></div></section>
    <section class="section"><div class="wrap">
      ${vs.length ? html`<div class="fd-filters" role="group" aria-label="Filter the traders">
        <button type="button" class="chip on" data-f="all" aria-pressed="true">All (${vs.length})</button>
        ${cats.map(([k, label]) => html`<button type="button" class="chip" data-f="cat:${k}" aria-pressed="false">${label}</button>`)}
        ${Object.entries(DIETARY).filter(([k]) => vs.some((v) => v.dietary.includes(k))).map(([k, label]) => html`<button type="button" class="chip" data-f="diet:${k}" aria-pressed="false">${label}</button>`)}
        </div><div class="fd-grid" id="fd-grid">${vs.map((v) => card(food.publicView(v)))}</div>
        <p class="small muted fd-none" hidden>No traders match. Try another filter.</p>`
      : html`<p class="muted">The food guide is coming soon.</p>`}
      <div class="formbox fd-trader-cta"><h2>Run a stall at Mercato Metropolitano?</h2><p>Claim your listing to keep your menu and photos up to date, and take pre-orders from people coming to TAM’s nights and festivals, starting with The Best Christmas Ever. You see each night’s orders and prep list before the cut-off, so you cook what’s needed.</p>
        <p><a class="btn ghost" href="/food/sign-in">Trader sign-in</a></p></div>
      <p class="small muted">Listings start from each trader’s page on Mercato Metropolitano’s site and are updated by the traders themselves. Check allergens with the trader when you order.</p>
    </div></section>`,
  });
}

function menuList(v) {
  if (!v.menu.length) return '';
  const sections = [...new Set(v.menu.map((m) => m.section || ''))];
  return html`<section class="fd-menu"><h2 class="chrome">Menu</h2>${sections.map((s) => html`${s ? html`<h3>${s}</h3>` : ''}<ul>${v.menu.filter((m) => (m.section || '') === s).map((m) => html`<li><div><b>${m.name}</b>${m.description ? html`<small>${m.description}</small>` : ''}${badges(m.dietary)}</div>${m.price !== null ? html`<span>${pounds(m.price)}</span>` : ''}</li>`)}</ul>`)}
    <p class="small muted">Prices and dishes can change: the trader has the final word, and can tell you about allergens.</p></section>`;
}

function profile(ctx, food, v, preview) {
  const p = food.publicView(v, true);
  const nights = food.nightsFor(v.slug);
  return page(ctx, {
    title: `${v.name}: ${v.tagline || 'at Mercato Metropolitano'}`, path: `/food/${v.slug}`, og: p.photo || undefined, noindex: preview,
    description: `${v.name} at Mercato Metropolitano Elephant & Castle${v.tagline ? `: ${v.tagline}` : ''}. ${String(v.description).slice(0, 140)}`,
    jsonLd: preview ? null : { '@context': 'https://schema.org', '@type': 'Restaurant', name: v.name, description: v.description || v.tagline, image: p.photo ? `${ctx.cfg.siteUrl}${p.photo}` : undefined,
      servesCuisine: v.tagline || undefined, address: { '@type': 'PostalAddress', streetAddress: '42 Newington Causeway', addressLocality: 'London', postalCode: 'SE1 6DR', addressCountry: 'GB' },
      sameAs: [v.website, v.instagram ? `https://www.instagram.com/${v.instagram}/` : ''].filter(Boolean), containedInPlace: { '@type': 'Place', name: food.market.name } },
    body: html`${preview ? html`<p class="fd-preview">Preview: this listing is <b>${v.status}</b> and only TAM’s team can see it. <a href="/food/manage">Back office</a></p>` : ''}
    <section class="section fd-profile"><div class="wrap fd-profile-grid">
      <div class="fd-photos">${p.photos.length ? p.photos.map((u, i) => html`<img src="${u}" alt="${i ? '' : v.name}" ${i ? html`loading="lazy"` : ''} width="720" height="540">`) : html`<div class="fd-pic big"><span>${initials(v.name)}</span></div>`}</div>
      <div><div class="label"><a href="/food">Food at MM</a> · ${CATEGORIES[v.category] || 'Food'}</div><h1 class="chrome gold">${v.name}</h1>
        ${v.tagline ? html`<p class="lede">${v.tagline}</p>` : ''}${badges(v.dietary)}
        ${v.description ? v.description.split(/\n{2,}/).map((para) => html`<p>${para}</p>`) : ''}
        <p class="fd-links">${v.instagram ? html`<a class="chip" href="https://www.instagram.com/${v.instagram}/" rel="noopener" target="_blank">Instagram @${v.instagram}</a>` : ''}${v.website ? html`<a class="chip" href="${v.website}" rel="noopener" target="_blank">Website</a>` : ''}${v.menuLinks.map((u, i) => html`<a class="chip" href="${u}" rel="noopener" target="_blank">Menu${v.menuLinks.length > 1 ? ` ${i + 1}` : ''} (PDF)</a>`)}</p>
        <p class="small muted">At ${food.market.name}, ${food.market.address}${v.alsoAt.length ? html`. Also at Mercato Metropolitano ${v.alsoAt.join(' and ')}` : ''}.</p>
        ${nights.length ? html`<div class="formbox fd-pre-box"><h2>Pre-order for a TAM night</h2><p>Order ahead, pick a time, collect it when you arrive and pay ${v.name} then.</p>
          <div class="row-btn">${nights.slice(0, 6).map((n) => html`<a class="btn hot small" href="/food/preorder?night=${n.slug}&amp;vendor=${v.slug}">${n.title} · ${nightLabel(n)}</a>`)}</div></div>` : ''}
      </div></div></section>
    <section class="section"><div class="wrap narrow">${menuList(v)}
      <details class="formbox fd-claim" id="claim"><summary><b>Is this your business?</b> Claim this listing</summary>
        <p>Claim it to update your profile, photos and menu, and take pre-orders from people coming to TAM. We check every claim before you can make changes.</p>
        <form id="fd-claim" data-slug="${v.slug}" novalidate><div class="fields">
          <label class="field"><span>Your name</span><input name="name" maxlength="80" required autocomplete="name"></label>
          <label class="field"><span>Your role</span><input name="role" maxlength="80" required placeholder="Owner, manager…"></label>
          <label class="field"><span>Work email</span><input name="email" type="email" required autocomplete="email"></label>
          <label class="field"><span>Phone (optional, private)</span><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
          <label class="field full"><span>Anything that helps us check (optional)</span><textarea name="note" rows="2" maxlength="600" placeholder="e.g. your Instagram, or who we spoke to"></textarea></label>
          <label class="check full"><input type="checkbox" name="consent"> <span>I run or manage ${v.name}, and I’m happy for TAM to contact me about this listing and partnering with TAM.</span></label></div>
          <button class="btn hot" type="submit">Send my claim</button><p class="err" role="status" aria-live="polite"></p></form></details>
    </div></section>`,
  });
}

const shell = (ctx, title, sub, inner, o = {}) => page(ctx, { title, path: `/food${sub}`, noindex: true, ...o, body: html`<section class="section"><div class="wrap ${o.wide ? 'wide' : 'narrow'}">${inner}</div></section>` });

export function routes(r, ctx, food) {
  r.get('/food', (req, res) => respond(res, directory(ctx, food)));
  r.get('/food/preorder', (req, res) => respond(res, page(ctx, { title: 'Pre-order food for a TAM night', path: '/food/preorder',
    description: 'Order from the traders at Mercato Metropolitano before your TAM night and collect it when you arrive.',
    body: html`<section class="section"><div class="wrap"><div class="label"><a href="/food">Food at MM</a></div><h1 class="chrome gold">Pre-order for a TAM night</h1>
      <p class="lede">Choose your night and a trader, pick your dishes and a collection time. You pay the trader when you collect. Ordering ahead means they cook what’s needed, so less goes to waste.</p>
      <div id="fd-pre"><p class="muted">Loading…</p></div></div></section>` }), 200, { 'Cache-Control': 'no-store' }));
  r.get('/food/order/:id', (req, res) => respond(res, shell(ctx, 'Your pre-order', '/order', html`<h1 class="chrome gold">Your pre-order</h1><div id="fd-order"><p class="muted">Loading…</p></div>`), 200, { 'Cache-Control': 'no-store' }));
  r.get('/food/sign-in', (req, res) => respond(res, shell(ctx, 'Trader sign-in: TAM food guide', '/sign-in', html`<h1 class="chrome gold">Traders</h1>
    <form class="formbox" id="fd-signin"><p>Type the email you manage your listing with, and we’ll send you a sign-in link. Not claimed yet? Open your listing on <a href="/food">the food guide</a> and tap “Claim this listing”.</p>
    <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label><button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form>`)));
  r.get('/food/in', (req, res) => respond(res, shell(ctx, 'TAM food guide', '/in', html`<h1 class="chrome gold">TAM food guide</h1><div class="formbox" id="fd-in"><p>Open your trader page on this device.</p><button class="btn hot" type="button">Open</button><p class="err" role="status" aria-live="polite"></p></div>`)));
  r.get('/food/join', (req, res) => respond(res, shell(ctx, 'Partner with TAM', '/join', html`<div class="label">TAM × Mercato Metropolitano</div><h1 class="chrome gold">Partner with TAM</h1><div id="fd-join"><p class="muted">Loading…</p></div>`), 200, { 'Cache-Control': 'no-store' }));
  r.get('/food/me', (req, res) => respond(res, shell(ctx, 'Your listing: TAM food guide', '/me', html`<div id="fd-me"><p class="muted">Loading…</p></div>`, { wide: true }), 200, { 'Cache-Control': 'no-store' }));
  r.get('/food/manage', (req, res) => respond(res, layout(ctx, { title: 'Food guide: back office', path: '/food/manage', noindex: true, ambient: null, scripts: ['/js/food-manage.js'], bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap wide"><div class="shows-top"><div><div class="label">TAM back office</div><h1 class="chrome gold">Food guide</h1></div><div id="fdm-who" class="small muted"></div></div>
      <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Type your work email and we’ll send you a one-tap sign-in link.</p>
      <form id="team-link"><input type="hidden" name="next" value="/food/manage"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form>
      <details class="small"><summary>Use the admin code instead</summary><form id="team-code"><label class="field"><span>Code</span><input name="token" type="password" autocomplete="current-password" required></label>
      <button class="btn ghost" type="submit">Sign in</button><p class="err" role="status" aria-live="polite"></p></form></details></div>
      <div id="fdm" hidden></div></div></section>` }), 200, { 'Cache-Control': 'no-store' }));
  r.get('/food/:slug', (req, res, { params }) => {
    const v = food.vendor(params.slug);
    const staff = ctx.team.can(req, 'ops');
    if (!v || (v.status !== 'live' && !staff)) return respond(res, shell(ctx, 'Not here', `/${params.slug}`, html`<h1 class="chrome">That listing isn’t here</h1><p><a href="/food">Every trader</a></p>`), 404);
    respond(res, profile(ctx, food, v, v.status !== 'live'), 200, v.status !== 'live' ? { 'Cache-Control': 'no-store' } : {});
  });
  r.get('/food/', (req, res) => redirect(res, '/food', 301));
}
